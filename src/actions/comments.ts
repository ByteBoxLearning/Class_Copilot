"use server";

import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass, assertCanAccessStudent } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { getCommentsPrompt } from "@/lib/settings";
import { buildStudentTermSummary } from "@/lib/comments/summary";
import { buildCommentsPrompt } from "@/lib/comments/format";
import { restoreStudentName } from "@/lib/comments/anonymize";
import { runModel } from "@/lib/ai/run-model";
import { validateAiModel, aiErrorMessage } from "@/lib/ai/model-guard";
import { estimateCostUsd, type TokenUsage } from "@/lib/ai/engines";

export type GenerateCommentResult =
  | { ok: true; text: string; usage: TokenUsage | null; estCostUsd: number | null }
  | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Drafts an end-of-term comment for one student in one class, from their
// DailyCheck + MasteryEvent history within [from, to]. Nothing is persisted —
// the caller shows the draft for the teacher to edit/copy themselves (a
// deliberate scope decision: this generator has no storage of its own).
export async function generateStudentComment(
  studentId: string,
  classId: string,
  from: string,
  to: string,
  model: string,
): Promise<GenerateCommentResult> {
  const user = await requireStaff();

  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return { ok: false, error: "Invalid date range." };
  if (from > to) return { ok: false, error: "The start date must be before the end date." };

  try {
    await assertCanAccessClass(user, classId);
    await assertCanAccessStudent(user, studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student/class." };
  }

  const modelError = await validateAiModel(model);
  if (modelError) return { ok: false, error: modelError };

  const summary = await buildStudentTermSummary(studentId, classId, from, to);
  const template = await getCommentsPrompt();
  const prompt = buildCommentsPrompt(template, summary);

  let result;
  try {
    result = await runModel(prompt, model);
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e, "Couldn't generate a comment right now. Please try again.") };
  }

  if (!result.text) return { ok: false, error: "The AI didn't return anything — try again or switch engine." };

  await logActivity({
    userId: user.id,
    studentId,
    actionType: "COMMENT_GENERATED",
    description: `Generated an end-of-term comment draft (${from} to ${to})`,
  });

  // The prompt sent the AI "the student" (see buildCommentsPrompt) — restore
  // the real name locally now that the draft is back, never round-tripping
  // it through the provider.
  const restored = restoreStudentName(result.text.trim(), summary.studentName);

  return {
    ok: true,
    text: restored,
    usage: result.usage,
    estCostUsd: result.usage ? estimateCostUsd(model, result.usage) : null,
  };
}
