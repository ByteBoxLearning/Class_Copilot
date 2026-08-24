"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessStudent, assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { feedbackSchema, feedbackEditSchema } from "@/lib/validations";
import type { ActionResult } from "./types";

// What a piece of feedback is attached to. DAILY_CHECK upserts the
// underlying DailyCheck row (blank dimensions) if it doesn't exist yet —
// a teacher can leave feedback on a day with nothing else logged, mirroring
// setDailyCheckNote's "note-only write still counts as a check-in" pattern.
export type AddFeedbackTarget =
  | { kind: "GENERAL" }
  | { kind: "MASTERY_EVENT"; masteryEventId: string }
  | { kind: "DAILY_CHECK"; classId: string; date: string };

export async function addFeedback(
  studentId: string,
  target: AddFeedbackTarget,
  message: string,
  visibility: string,
): Promise<ActionResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessStudent(user, studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student." };
  }
  const parsed = feedbackSchema.safeParse({ message, visibility });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  let masteryEventId: string | null = null;
  let dailyCheckId: string | null = null;

  if (target.kind === "MASTERY_EVENT") {
    // Verify the event actually belongs to this student — a spoofed
    // studentId the caller DOES have access to shouldn't be able to attach
    // feedback to someone else's evidence.
    const event = await prisma.masteryEvent.findUnique({ where: { id: target.masteryEventId }, select: { studentId: true } });
    if (!event || event.studentId !== studentId) return { ok: false, error: "That evidence entry wasn't found." };
    masteryEventId = target.masteryEventId;
  } else if (target.kind === "DAILY_CHECK") {
    try {
      await assertCanAccessClass(user, target.classId);
    } catch {
      return { ok: false, error: "You don't have access to that class." };
    }
    const check = await prisma.dailyCheck.upsert({
      where: { studentId_classId_date: { studentId, classId: target.classId, date: target.date } },
      update: {},
      create: { studentId, classId: target.classId, date: target.date, loggedById: user.id },
    });
    dailyCheckId = check.id;
  }

  await prisma.feedback.create({
    data: { studentId, userId: user.id, message: parsed.data.message, visibility: parsed.data.visibility, masteryEventId, dailyCheckId },
  });
  await logActivity({ userId: user.id, studentId, actionType: "FEEDBACK_ADDED", description: `Added feedback (${parsed.data.visibility})` });

  revalidatePath("/classes/mastery");
  revalidatePath("/classes/monitor");
  revalidatePath(`/admin/students/${studentId}`);
  return { ok: true };
}

export async function editFeedback(id: string, message: string): Promise<ActionResult> {
  const user = await requireStaff();
  const row = await prisma.feedback.findUnique({ where: { id }, select: { studentId: true, deletedAt: true } });
  if (!row || row.deletedAt) return { ok: false, error: "Feedback not found." };
  try {
    await assertCanAccessStudent(user, row.studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student." };
  }
  const parsed = feedbackEditSchema.safeParse({ message });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  await prisma.feedback.update({ where: { id }, data: { message: parsed.data.message, editedAt: new Date() } });
  revalidatePath("/classes/mastery");
  revalidatePath("/classes/monitor");
  return { ok: true };
}

// Soft-delete — kept (not removed) so staff retain visibility of what was
// said and by whom, same posture as Comment's audit trail before the rename.
export async function deleteFeedback(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  const row = await prisma.feedback.findUnique({ where: { id }, select: { studentId: true } });
  if (!row) return { ok: false, error: "Feedback not found." };
  try {
    await assertCanAccessStudent(user, row.studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student." };
  }
  await prisma.feedback.update({ where: { id }, data: { deletedAt: new Date(), deletedById: user.id } });
  revalidatePath("/classes/mastery");
  revalidatePath("/classes/monitor");
  return { ok: true };
}
