"use server";

// Guest practice actions — mirrors src/actions/practice.ts's shape, but
// against GuestPracticeAttempt (no classId/studentId, no Standard-mapping,
// no PracticeMasteryProposal — there's no teacher to review anything for a
// guest, so scores/coaching are returned directly). Deliberately duplicated
// rather than shared with practice.ts: keeping the two fully independent
// means a guest can never accidentally touch a real student's data path, and
// this file can evolve (more subjects, etc.) without risk to the tracked
// classroom side.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireGuest } from "@/lib/guest-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { generatePracticeSet } from "@/lib/practice/generate";
import { scoreFrqResponse } from "@/lib/practice/score";
import { sendPracticeChatMessage as callChat } from "@/lib/practice/chat";
import { generateCoachingFeedback } from "@/lib/practice/coaching";
import type { PracticeConfig, MCQAnswer, FRQAnswer, FRQScoreResult, ChatMessage, PracticeSet, MCQItem, FRQItem, CoachingFeedback } from "@/lib/practice/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const AI_ACTION_MAX = 40;
const AI_ACTION_WINDOW_MS = 5 * 60 * 1000;
function aiRateLimitError(guestId: string): string | null {
  const limit = checkRateLimit(`guest-practice-ai:${guestId}`, AI_ACTION_MAX, AI_ACTION_WINDOW_MS);
  return limit.ok ? null : "You're going a bit fast — please wait a minute and try again.";
}

async function loadOwnAttempt(attemptId: string) {
  const guest = await requireGuest();
  const attempt = await prisma.guestPracticeAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.guestUserId !== guest.id) return null;
  return { guest, attempt };
}

function parseSet(json: string | null): PracticeSet | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PracticeSet;
  } catch {
    return null;
  }
}

type PriorAttemptData = { set: PracticeSet; mcqAnswers: Record<string, MCQAnswer>; scores: Record<string, FRQScoreResult> };

async function getPriorAttempts(guestUserId: string, source: PracticeConfig["source"]): Promise<PriorAttemptData[]> {
  const rows = await prisma.guestPracticeAttempt.findMany({
    where: { guestUserId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
    select: { configJson: true, practiceSetJson: true, answersJson: true, scoresJson: true },
  });
  const result: PriorAttemptData[] = [];
  for (const row of rows) {
    try {
      const config = JSON.parse(row.configJson) as PracticeConfig;
      if (config.source !== source) continue;
      const set = parseSet(row.practiceSetJson);
      if (!set) continue;
      const answers = JSON.parse(row.answersJson || "{}") as { mcqAnswers?: Record<string, MCQAnswer> };
      result.push({ set, mcqAnswers: answers.mcqAnswers ?? {}, scores: JSON.parse(row.scoresJson || "{}") });
    } catch {
      // skip malformed rows
    }
  }
  return result;
}

function seenItemIdsFrom(prior: PriorAttemptData[]): Set<string> {
  const ids = new Set<string>();
  for (const p of prior) {
    for (const item of p.set.mcqItems) ids.add(item.id);
    for (const item of p.set.frqItems) ids.add(item.id);
  }
  return ids;
}

function buildRetentionNotes(
  prior: PriorAttemptData[],
  mcqItems: MCQItem[],
  mcqAnswers: Record<string, MCQAnswer>,
  frqItems: FRQItem[],
  scores: Record<string, FRQScoreResult>,
): string[] {
  const notes: string[] = [];
  for (const item of mcqItems) {
    const priorHit = prior.find((p) => p.set.mcqItems.some((m) => m.id === item.id));
    const priorAnswer = priorHit?.mcqAnswers[item.id];
    if (!priorAnswer) continue;
    const wasCorrect = priorAnswer.selectedIndex === item.correctIndex;
    const isCorrect = mcqAnswers[item.id]?.selectedIndex === item.correctIndex;
    notes.push(`- [${item.topicTag}] "${item.stem}": ${wasCorrect ? "correct" : "incorrect"} last time this was asked, ${isCorrect ? "correct" : "incorrect"} this time.`);
  }
  for (const item of frqItems) {
    const priorHit = prior.find((p) => p.set.frqItems.some((f) => f.id === item.id));
    const priorScore = priorHit?.scores[item.id];
    const currentScore = scores[item.id];
    if (!priorScore || !currentScore) continue;
    notes.push(`- "${item.stem}": scored ${priorScore.totalAwarded}/${priorScore.totalPossible} last time this was asked, ${currentScore.totalAwarded}/${currentScore.totalPossible} this time.`);
  }
  return notes;
}

export async function startGuestPracticeAttempt(config: PracticeConfig): Promise<Result<{ attemptId: string; practiceSet: PracticeSet }>> {
  const guest = await requireGuest();
  if (config.unitIds.length === 0) return { ok: false, error: "Pick at least one unit to practice." };
  const rateError = aiRateLimitError(guest.id);
  if (rateError) return { ok: false, error: rateError };

  const seenItemIds = seenItemIdsFrom(await getPriorAttempts(guest.id, config.source));
  const practiceSet = await generatePracticeSet(config, seenItemIds);
  const attempt = await prisma.guestPracticeAttempt.create({
    data: { guestUserId: guest.id, configJson: JSON.stringify(config), practiceSetJson: JSON.stringify(practiceSet) },
  });
  revalidatePath("/guest/practice");
  return { ok: true, data: { attemptId: attempt.id, practiceSet } };
}

export async function saveGuestPracticeProgress(
  attemptId: string,
  patch: { mcqAnswers?: Record<string, MCQAnswer>; frqAnswers?: Record<string, FRQAnswer>; endTimestamp?: number | null },
): Promise<Result<{ saved: true }>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found || found.attempt.status !== "IN_PROGRESS") return { ok: false, error: "This attempt can no longer be edited." };

  const current = JSON.parse(found.attempt.answersJson || "{}") as { mcqAnswers?: Record<string, MCQAnswer>; frqAnswers?: Record<string, FRQAnswer> };
  const next = { mcqAnswers: patch.mcqAnswers ?? current.mcqAnswers ?? {}, frqAnswers: patch.frqAnswers ?? current.frqAnswers ?? {} };
  await prisma.guestPracticeAttempt.update({
    where: { id: attemptId },
    data: {
      answersJson: JSON.stringify(next),
      ...(patch.endTimestamp !== undefined ? { endTimestamp: patch.endTimestamp ? new Date(patch.endTimestamp) : null } : {}),
    },
  });
  return { ok: true, data: { saved: true } };
}

export async function scoreGuestPracticeFrq(attemptId: string, itemId: string, responses: string[]): Promise<Result<FRQScoreResult>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found) return { ok: false, error: "Attempt not found." };
  const rateError = aiRateLimitError(found.guest.id);
  if (rateError) return { ok: false, error: rateError };
  const set = parseSet(found.attempt.practiceSetJson);
  const item = set?.frqItems.find((f) => f.id === itemId);
  if (!item) return { ok: false, error: "Question not found in this attempt." };

  const score = await scoreFrqResponse(item, responses);
  const scores = JSON.parse(found.attempt.scoresJson || "{}") as Record<string, FRQScoreResult>;
  scores[itemId] = score;
  await prisma.guestPracticeAttempt.update({ where: { id: attemptId }, data: { scoresJson: JSON.stringify(scores) } });
  return { ok: true, data: score };
}

export async function sendGuestPracticeChatMessage(
  attemptId: string,
  itemId: string,
  studentContext: string,
  message: string,
): Promise<Result<{ reply: string }>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found) return { ok: false, error: "Attempt not found." };
  const rateError = aiRateLimitError(found.guest.id);
  if (rateError) return { ok: false, error: rateError };
  const set = parseSet(found.attempt.practiceSetJson);
  const mcqItem = set?.mcqItems.find((m) => m.id === itemId);
  const frqItem = set?.frqItems.find((f) => f.id === itemId);
  const item: MCQItem | FRQItem | undefined = mcqItem ?? frqItem;
  if (!item) return { ok: false, error: "Question not found in this attempt." };

  const histories = JSON.parse(found.attempt.chatHistoriesJson || "{}") as Record<string, ChatMessage[]>;
  const history = histories[itemId] ?? [];
  const reply = await callChat(mcqItem ? "mcq" : "frq", item, studentContext, history, message);
  histories[itemId] = [...history, { role: "user", content: message }, { role: "assistant", content: reply }];
  await prisma.guestPracticeAttempt.update({ where: { id: attemptId }, data: { chatHistoriesJson: JSON.stringify(histories) } });
  return { ok: true, data: { reply } };
}

// No unit/Standard results here at all (see file header) — just FRQ scoring
// + coaching feedback, shown directly with no "pending your teacher's
// review" step, since there's no teacher.
export async function submitGuestPracticeAttempt(
  attemptId: string,
): Promise<Result<{ frqScores: Record<string, FRQScoreResult>; coachingFeedback: CoachingFeedback | null }>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found) return { ok: false, error: "Attempt not found." };
  const { guest, attempt } = found;
  if (attempt.status === "SUBMITTED") {
    return {
      ok: true,
      data: {
        frqScores: JSON.parse(attempt.scoresJson || "{}"),
        coachingFeedback: attempt.coachingFeedbackJson ? JSON.parse(attempt.coachingFeedbackJson) : null,
      },
    };
  }
  if (attempt.status !== "IN_PROGRESS") return { ok: false, error: "This attempt has already been closed." };
  const rateError = aiRateLimitError(guest.id);
  if (rateError) return { ok: false, error: rateError };

  const set = parseSet(attempt.practiceSetJson);
  if (!set) return { ok: false, error: "No questions were prepared for this attempt." };
  const config = JSON.parse(attempt.configJson) as PracticeConfig;
  const mcqAnswers = JSON.parse(attempt.answersJson || "{}").mcqAnswers ?? {};
  const frqAnswers: Record<string, FRQAnswer> = JSON.parse(attempt.answersJson || "{}").frqAnswers ?? {};
  const scores = JSON.parse(attempt.scoresJson || "{}") as Record<string, FRQScoreResult>;

  for (const item of set.frqItems) {
    if (scores[item.id]) continue;
    const responses = frqAnswers[item.id]?.responses ?? item.parts.map(() => "");
    try {
      scores[item.id] = await scoreFrqResponse(item, responses);
    } catch {
      // leave unscored
    }
  }

  const priorAttempts = await getPriorAttempts(guest.id, config.source);
  const retentionNotes = buildRetentionNotes(priorAttempts, set.mcqItems, mcqAnswers, set.frqItems, scores);
  const coachingFeedback = await generateCoachingFeedback(set.mcqItems, mcqAnswers, set.frqItems, scores, retentionNotes);

  await prisma.guestPracticeAttempt.update({
    where: { id: attemptId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      scoresJson: JSON.stringify(scores),
      coachingFeedbackJson: coachingFeedback ? JSON.stringify(coachingFeedback) : null,
    },
  });

  revalidatePath("/guest/practice");
  return { ok: true, data: { frqScores: scores, coachingFeedback } };
}
