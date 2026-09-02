"use server";

// AI-assisted question<->standard mapping for the fine-grained Practice Mode
// workaround (multiple Standards sharing one unit/chapter — see
// Standard.externalQuestionIdsJson in schema.prisma). Mirrors
// src/lib/assignments/generate.ts's "ephemeral, review before persistence"
// pattern, NOT src/lib/practice/generate.ts's "validated but shown directly
// to students" pattern — this output needs a human to confirm/adjust it
// before it touches a Standard's real mapping, since a bad AI guess here
// would silently misattribute a student's practice evidence.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { runModel } from "@/lib/ai/run-model";
import { extractJson } from "@/lib/ai/json";
import { DEFAULT_AI_MODEL } from "@/lib/ai/engines";
import { getBankMCQs, getBankFRQs } from "@/lib/practice/bank";
import type { UnitSource } from "@/lib/practice/types";

const JSON_RULES = `Respond with ONLY a single JSON object matching the shape described — no prose, no markdown code fences, no commentary before or after.`;

const suggestionSchema = z.object({
  assignments: z.array(z.object({ questionId: z.string(), standardIds: z.array(z.string()) })),
});
type Suggestion = z.infer<typeof suggestionSchema>;

export type MappingCandidate = { id: string; stem: string; topicTag: string | null };
export type MappingStandard = { id: string; title: string; description: string | null };

async function loadUnitContext(classId: string, unitSource: UnitSource, unitId: number) {
  const standards = await prisma.standard.findMany({
    where: { classId, active: true, externalUnitSource: unitSource, externalUnitId: String(unitId) },
    select: { id: true, title: true, description: true },
    orderBy: { order: "asc" },
  });
  const mcq = getBankMCQs(unitSource, [unitId]);
  const frq = [...getBankFRQs(unitSource, [unitId], "long"), ...getBankFRQs(unitSource, [unitId], "short")];
  const questions: MappingCandidate[] = [
    ...mcq.map((q) => ({ id: q.id, stem: q.stem, topicTag: q.topicTag })),
    ...frq.map((q) => ({ id: q.id, stem: q.stem, topicTag: null })),
  ];
  return { standards, questions };
}

function buildPrompt(standards: MappingStandard[], questions: MappingCandidate[], issues?: string[]): string {
  const standardsList = standards.map((s) => `- id="${s.id}" title="${s.title}"${s.description ? ` description="${s.description}"` : ""}`).join("\n");
  const questionsList = questions.map((q) => `- id="${q.id}"${q.topicTag ? ` topicTag="${q.topicTag}"` : ""} stem="${q.stem.replace(/"/g, "'").slice(0, 300)}"`).join("\n");
  const retryNote = issues?.length ? `\nYour previous attempt had these issues: ${issues.join("; ")}. Fix them.\n` : "";
  return `You are helping a teacher map practice questions to the learning standard(s) each one assesses.
${retryNote}
STANDARDS (a question may match more than one — list every standard id it genuinely covers):
${standardsList}

QUESTIONS:
${questionsList}

For EVERY question id listed above, output exactly one assignment: "standardIds" is the list of every standard id (from the ids above) that question actually assesses — it can be empty if none fit, contain one id, or contain several if the question genuinely covers multiple standards at once. Don't pad the list with weak matches — only include a standard id when the question is real evidence for it. Every question id listed above must appear exactly once in your output.

${JSON_RULES} Shape: { "assignments": [{ "questionId": string, "standardIds": string[] }] }`;
}

function validateSuggestion(raw: Suggestion, questionIds: Set<string>, standardIds: Set<string>): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const a of raw.assignments) {
    if (!questionIds.has(a.questionId)) issues.push(`unknown question id "${a.questionId}"`);
    for (const sid of a.standardIds) {
      if (!standardIds.has(sid)) issues.push(`unknown standard id "${sid}" for question "${a.questionId}"`);
    }
    seen.add(a.questionId);
  }
  const missing = [...questionIds].filter((id) => !seen.has(id));
  if (missing.length > 0) issues.push(`missing an assignment for question id(s): ${missing.join(", ")}`);
  return issues;
}

async function callForSuggestion(prompt: string): Promise<Suggestion | null> {
  const result = await runModel(prompt, DEFAULT_AI_MODEL, { json: true });
  if (!result.text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(result.text));
  } catch {
    return null;
  }
  const parsed = suggestionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type SuggestMappingResult =
  | { ok: true; standards: MappingStandard[]; questions: MappingCandidate[]; assignments: { questionId: string; standardIds: string[] }[] }
  // standards/questions are populated only when context loaded successfully
  // but the AI call itself failed — lets the caller still render a manual,
  // all-unassigned fallback table instead of a dead end. Omitted for the
  // precondition failures below (nothing to map either way).
  | { ok: false; error: string; standards?: MappingStandard[]; questions?: MappingCandidate[] };

// Never persists anything — returns a suggestion for the teacher to review,
// adjust, and explicitly confirm via saveQuestionMapping below.
export async function suggestQuestionMapping(classId: string, unitSource: UnitSource, unitId: number): Promise<SuggestMappingResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const { standards, questions } = await loadUnitContext(classId, unitSource, unitId);
  if (standards.length < 2) {
    return { ok: false, error: "Link at least two standards to this unit first — with only one, the whole unit already applies to it." };
  }
  if (questions.length === 0) {
    return { ok: false, error: "No bank questions found for this unit." };
  }

  const questionIds = new Set(questions.map((q) => q.id));
  const standardIds = new Set(standards.map((s) => s.id));

  let suggestion: Suggestion | null;
  try {
    suggestion = await callForSuggestion(buildPrompt(standards, questions));
  } catch (err) {
    return { ok: false, error: `AI mapping is unavailable right now (${err instanceof Error ? err.message : String(err)}).`, standards, questions };
  }
  let issues = suggestion ? validateSuggestion(suggestion, questionIds, standardIds) : ["no valid response was returned"];

  if (issues.length > 0) {
    try {
      const retry = await callForSuggestion(buildPrompt(standards, questions, issues));
      const retryIssues = retry ? validateSuggestion(retry, questionIds, standardIds) : ["no valid response was returned"];
      if (retryIssues.length === 0 && retry) {
        suggestion = retry;
        issues = [];
      }
    } catch (err) {
      return { ok: false, error: `AI mapping retry failed (${err instanceof Error ? err.message : String(err)}).`, standards, questions };
    }
  }

  if (issues.length > 0 || !suggestion) {
    return { ok: false, error: `Couldn't produce a valid mapping (${issues.join("; ")}).`, standards, questions };
  }

  return { ok: true, standards, questions, assignments: suggestion.assignments };
}

export type SaveMappingResult = { ok: true } | { ok: false; error: string };

// Applies a reviewed mapping: every standard linked to this unit gets its
// externalQuestionIdsJson replaced with whatever this save says it covers
// (including cleared to unscoped if it covers none) — the confirm screen the
// teacher approved is treated as the complete picture, not a delta. A
// question can legitimately appear under more than one standard here — see
// Standard.externalQuestionIdsJson's comment in schema.prisma — so this only
// rejects an unknown standard id, never an overlap.
export async function saveQuestionMapping(
  classId: string,
  unitSource: UnitSource,
  unitId: number,
  assignments: { questionId: string; standardIds: string[] }[],
): Promise<SaveMappingResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const standards = await prisma.standard.findMany({
    where: { classId, active: true, externalUnitSource: unitSource, externalUnitId: String(unitId) },
    select: { id: true },
  });
  const validStandardIds = new Set(standards.map((s) => s.id));

  const byStandard = new Map<string, Set<string>>();
  for (const a of assignments) {
    for (const sid of a.standardIds) {
      if (!validStandardIds.has(sid)) return { ok: false, error: "That mapping references a standard no longer linked to this unit — reload and try again." };
      if (!byStandard.has(sid)) byStandard.set(sid, new Set());
      byStandard.get(sid)!.add(a.questionId);
    }
  }

  await prisma.$transaction(
    standards.map((s) => {
      const ids = [...(byStandard.get(s.id) ?? [])];
      return prisma.standard.update({
        where: { id: s.id },
        data: { externalQuestionIdsJson: ids.length > 0 ? JSON.stringify(ids) : null },
      });
    }),
  );

  revalidatePath("/classes/standards");
  return { ok: true };
}
