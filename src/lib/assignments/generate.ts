import "server-only";
import { prisma } from "../prisma";
import { runModel } from "../ai/run-model";
import { extractJson } from "../ai/json";
import { estimateCostUsd, type TokenUsage } from "../ai/engines";
import { getAssignmentGeneratePrompt, getAssignmentImprovePrompt } from "../settings";
import { buildAssignmentPrompt, type AssignmentPromptContext } from "./prompt";
import { parseAssignmentDoc, type AssignmentDoc } from "./types";
import { labelOf, ASSIGNMENT_TYPES } from "../enums";

export type GenerateAssignmentResult =
  | { ok: true; doc: AssignmentDoc; usage: TokenUsage | null; estCostUsd: number | null }
  | { ok: false; error: string };

// No auth inside this module — same convention as src/lib/grading.ts and
// src/lib/queries.ts. Callers (src/actions/assignments.ts) guard with
// assertCanAccessClass first.
//
// Whether this runs the GENERATE or IMPROVE prompt is decided purely by
// whether non-empty sourceMaterial was passed in — no separate "mode" flag
// for the caller to get out of sync with.
export async function generateAssignmentDoc(
  classId: string,
  standardIds: string[],
  assignmentType: string,
  teacherNotes: string,
  sourceMaterial: string | null,
  model: string,
): Promise<GenerateAssignmentResult> {
  const [cls, standards] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true, subject: true } }),
    prisma.standard.findMany({ where: { id: { in: standardIds }, classId }, select: { code: true, title: true, description: true } }),
  ]);
  if (standards.length === 0) return { ok: false, error: "Pick at least one standard for this assignment." };

  const improving = !!sourceMaterial?.trim();
  const template = improving ? await getAssignmentImprovePrompt() : await getAssignmentGeneratePrompt();

  const ctx: AssignmentPromptContext = {
    assignmentType: labelOf(ASSIGNMENT_TYPES, assignmentType),
    standards,
    className: cls.name,
    subject: cls.subject,
    teacherNotes,
    sourceMaterial: improving ? sourceMaterial!.trim() : undefined,
  };
  const prompt = buildAssignmentPrompt(template, ctx);

  const result = await runModel(prompt, model, { json: true });
  if (!result.text) return { ok: false, error: "The AI didn't return anything — try again or switch engine." };

  const doc = parseAssignmentDoc(extractJson(result.text));
  if (!doc.title && doc.sections.length === 0) {
    return { ok: false, error: "The AI's response couldn't be parsed into an assignment — try again or switch engine." };
  }

  return {
    ok: true,
    doc,
    usage: result.usage,
    estCostUsd: result.usage ? estimateCostUsd(model, result.usage) : null,
  };
}
