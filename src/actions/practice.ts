"use server";

// Practice Mode (Milestone K) — student-facing actions. Every action here is
// scoped to the CALLING student's own PracticeAttempt rows (requireClient() +
// a hard studentId equality check — stricter than the staff-oriented
// assertCanAccessStudent, which is designed for a teacher who may legitimately
// act on many students; a student should only ever match themselves). See
// src/actions/practice-review.ts for the staff-side approve/reject queue.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth";
import { canAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { generatePracticeSet } from "@/lib/practice/generate";
import { scoreFrqResponse } from "@/lib/practice/score";
import { sendPracticeChatMessage as callChat } from "@/lib/practice/chat";
import { generateCoachingFeedback } from "@/lib/practice/coaching";
import { computeUnitResults } from "@/lib/practice/mastery-map";
import { getUnit } from "@/lib/practice/bank";
import type { PracticeConfig, MCQAnswer, FRQAnswer, FRQScoreResult, ChatMessage, PracticeSet, MCQItem, FRQItem, UnitResult, CoachingFeedback } from "@/lib/practice/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function loadOwnAttempt(attemptId: string) {
  const user = await requireClient();
  const attempt = await prisma.practiceAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.studentId !== user.studentId) return null;
  return { user, attempt };
}

function parseSet(json: string | null): PracticeSet | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PracticeSet;
  } catch {
    return null;
  }
}

type PriorAttemptData = {
  set: PracticeSet;
  mcqAnswers: Record<string, MCQAnswer>;
  scores: Record<string, FRQScoreResult>;
};

// This student's own past SUBMITTED attempts for the same source — the raw
// material both selectWithRetention (which items has this student already
// seen) and the post-submit retention-growth comparison (below) are built
// from. Malformed/unparseable rows are skipped rather than thrown on; a
// student's practice history should never break starting or scoring a
// session.
async function getPriorAttempts(studentId: string, source: PracticeConfig["source"]): Promise<PriorAttemptData[]> {
  const rows = await prisma.practiceAttempt.findMany({
    where: { studentId, status: "SUBMITTED" },
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

// For each item in the CURRENT session that also appeared in an earlier one,
// a short plain-language note comparing the two outcomes — feeds
// generateCoachingFeedback so genuine growth/regression/consistency on a
// retention re-ask can surface naturally (see coaching.ts's own comment on
// why this stays out of any separate UI section).
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

// Starts a new attempt: generates/pulls the question set immediately and
// persists it as soon as it's ready — the DB row, not a client localStorage
// blob, is what a page refresh hydrates from (the standalone tool's original
// failure mode: a refresh mid-session lost everything).
export async function startPracticeAttempt(classId: string, config: PracticeConfig): Promise<Result<{ attemptId: string; practiceSet: PracticeSet }>> {
  const user = await requireClient();
  if (!(await canAccessClass(user, classId))) return { ok: false, error: "You're not enrolled in this class." };
  if (config.unitIds.length === 0) return { ok: false, error: "Pick at least one unit to practice." };

  const seenItemIds = seenItemIdsFrom(await getPriorAttempts(user.studentId, config.source));
  const practiceSet = await generatePracticeSet(config, seenItemIds);
  const attempt = await prisma.practiceAttempt.create({
    data: {
      studentId: user.studentId,
      classId,
      configJson: JSON.stringify(config),
      practiceSetJson: JSON.stringify(practiceSet),
    },
  });
  revalidatePath("/portal/practice");
  return { ok: true, data: { attemptId: attempt.id, practiceSet } };
}

// Autosaves answers/chat as the student works — debounced client-side, not
// per-keystroke. Silently ignores a stale/foreign attemptId rather than
// throwing, since this fires in the background and shouldn't surface errors
// mid-practice.
export async function savePracticeProgress(
  attemptId: string,
  patch: { mcqAnswers?: Record<string, MCQAnswer>; frqAnswers?: Record<string, FRQAnswer>; endTimestamp?: number | null },
): Promise<Result<{ saved: true }>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found || found.attempt.status !== "IN_PROGRESS") return { ok: false, error: "This attempt can no longer be edited." };

  const current = JSON.parse(found.attempt.answersJson || "{}") as { mcqAnswers?: Record<string, MCQAnswer>; frqAnswers?: Record<string, FRQAnswer> };
  const next = {
    mcqAnswers: patch.mcqAnswers ?? current.mcqAnswers ?? {},
    frqAnswers: patch.frqAnswers ?? current.frqAnswers ?? {},
  };
  await prisma.practiceAttempt.update({
    where: { id: attemptId },
    data: {
      answersJson: JSON.stringify(next),
      ...(patch.endTimestamp !== undefined ? { endTimestamp: patch.endTimestamp ? new Date(patch.endTimestamp) : null } : {}),
    },
  });
  return { ok: true, data: { saved: true } };
}

export async function scorePracticeFrq(attemptId: string, itemId: string, responses: string[]): Promise<Result<FRQScoreResult>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found) return { ok: false, error: "Attempt not found." };
  const set = parseSet(found.attempt.practiceSetJson);
  const item = set?.frqItems.find((f) => f.id === itemId);
  if (!item) return { ok: false, error: "Question not found in this attempt." };

  const score = await scoreFrqResponse(item, responses);
  const scores = JSON.parse(found.attempt.scoresJson || "{}") as Record<string, FRQScoreResult>;
  scores[itemId] = score;
  await prisma.practiceAttempt.update({ where: { id: attemptId }, data: { scoresJson: JSON.stringify(scores) } });
  return { ok: true, data: score };
}

export async function sendPracticeChatMessage(
  attemptId: string,
  itemId: string,
  studentContext: string,
  message: string,
): Promise<Result<{ reply: string }>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found) return { ok: false, error: "Attempt not found." };
  const set = parseSet(found.attempt.practiceSetJson);
  const mcqItem = set?.mcqItems.find((m) => m.id === itemId);
  const frqItem = set?.frqItems.find((f) => f.id === itemId);
  const item: MCQItem | FRQItem | undefined = mcqItem ?? frqItem;
  if (!item) return { ok: false, error: "Question not found in this attempt." };

  const histories = JSON.parse(found.attempt.chatHistoriesJson || "{}") as Record<string, ChatMessage[]>;
  const history = histories[itemId] ?? [];
  const reply = await callChat(mcqItem ? "mcq" : "frq", item, studentContext, history, message);
  histories[itemId] = [...history, { role: "user", content: message }, { role: "assistant", content: reply }];
  await prisma.practiceAttempt.update({ where: { id: attemptId }, data: { chatHistoriesJson: JSON.stringify(histories) } });
  return { ok: true, data: { reply } };
}

// Scores any un-scored FRQs, computes per-unit results, and creates one
// PENDING PracticeMasteryProposal per unit — never a MasteryEvent directly
// (see src/actions/practice-review.ts; every MasteryEvent ever recorded in
// this app has a staff recordedById, and this doesn't break that). Also
// generates advisory coachingFeedback (src/lib/practice/coaching.ts) — the
// per-unit suggestedLevel already returned here IS the "predicted mastery"
// shown to the student; coachingFeedback is the separate "what to improve
// and what strategies to use" layer on top. Neither one is the student's
// official grade — that only happens if a teacher approves the resulting
// PracticeMasteryProposal.
export async function submitPracticeAttempt(
  attemptId: string,
): Promise<Result<{ unitResults: UnitResult[]; frqScores: Record<string, FRQScoreResult>; coachingFeedback: CoachingFeedback | null }>> {
  const found = await loadOwnAttempt(attemptId);
  if (!found) return { ok: false, error: "Attempt not found." };
  const { user, attempt } = found;
  if (attempt.status === "SUBMITTED") {
    // Idempotent re-submit: return the already-computed proposals instead of duplicating them.
    const existing = await prisma.practiceMasteryProposal.findMany({ where: { attemptId }, orderBy: { createdAt: "asc" } });
    const config = JSON.parse(attempt.configJson) as PracticeConfig;
    const standards = await prisma.standard.findMany({ where: { id: { in: existing.map((p) => p.standardId).filter((id): id is string => !!id) } }, select: { id: true, title: true } });
    const unitResults: UnitResult[] = existing.map((p) => ({
      unitId: Number(p.unitId),
      unitTitle: getUnit(config.source, Number(p.unitId))?.title ?? `Unit ${p.unitId}`,
      scorePercent: p.scorePercent,
      suggestedLevel: p.suggestedLevel as 1 | 2 | 3 | 4,
      standardId: p.standardId,
      standardTitle: standards.find((s) => s.id === p.standardId)?.title ?? null,
      proposalId: p.id,
    }));
    const coachingFeedback: CoachingFeedback | null = attempt.coachingFeedbackJson ? JSON.parse(attempt.coachingFeedbackJson) : null;
    return { ok: true, data: { unitResults, frqScores: JSON.parse(attempt.scoresJson || "{}"), coachingFeedback } };
  }
  if (attempt.status !== "IN_PROGRESS") return { ok: false, error: "This attempt has already been closed." };

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
      // leave unscored — computeUnitScorePercent treats it as 0 earned for that item, never throws
    }
  }

  const unitResults = await computeUnitResults(attempt.classId, config.source, set.mcqItems, mcqAnswers, set.frqItems, scores);
  const priorAttempts = await getPriorAttempts(user.studentId, config.source);
  const retentionNotes = buildRetentionNotes(priorAttempts, set.mcqItems, mcqAnswers, set.frqItems, scores);
  const coachingFeedback = await generateCoachingFeedback(set.mcqItems, mcqAnswers, set.frqItems, scores, retentionNotes);

  await prisma.$transaction(async (tx) => {
    await tx.practiceAttempt.update({
      where: { id: attemptId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        scoresJson: JSON.stringify(scores),
        coachingFeedbackJson: coachingFeedback ? JSON.stringify(coachingFeedback) : null,
      },
    });
    for (const r of unitResults) {
      const proposal = await tx.practiceMasteryProposal.create({
        data: {
          attemptId,
          studentId: user.studentId,
          classId: attempt.classId,
          standardId: r.standardId,
          unitSource: config.source,
          unitId: String(r.unitId),
          scorePercent: r.scorePercent,
          suggestedLevel: r.suggestedLevel,
        },
      });
      r.proposalId = proposal.id;
    }
  });

  await logActivity({
    userId: user.id,
    studentId: user.studentId,
    actionType: "PRACTICE_ATTEMPT_SUBMITTED",
    description: `Submitted a practice session (${config.source}, ${unitResults.length} unit${unitResults.length === 1 ? "" : "s"})`,
  });

  revalidatePath("/portal/practice");
  revalidatePath("/classes/practice-review");
  return { ok: true, data: { unitResults, frqScores: scores, coachingFeedback } };
}
