import "server-only";
import { prisma } from "./prisma";

export type FeedbackRow = {
  id: string;
  message: string;
  visibility: string;
  authorName: string;
  createdAt: Date;
  editedAt: Date | null;
};

type RawFeedback = { id: string; message: string; visibility: string; user: { name: string }; createdAt: Date; editedAt: Date | null };
function toRow(f: RawFeedback): FeedbackRow {
  return { id: f.id, message: f.message, visibility: f.visibility, authorName: f.user.name, createdAt: f.createdAt, editedAt: f.editedAt };
}

// No auth inside this module — same convention as grading.ts/mastery.ts.
// `includeTeacherOnly` is the caller's job to decide: true for a staff view
// (sees everything), false for a student's own portal view (STUDENT_VISIBLE
// only). Soft-deleted rows are always excluded.

// Bulk — one query for every MasteryEvent on a page, never call per-row.
export async function feedbackForMasteryEvents(eventIds: string[], includeTeacherOnly: boolean): Promise<Map<string, FeedbackRow[]>> {
  if (eventIds.length === 0) return new Map();
  const rows = await prisma.feedback.findMany({
    where: { masteryEventId: { in: eventIds }, deletedAt: null, ...(includeTeacherOnly ? {} : { visibility: "STUDENT_VISIBLE" }) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map<string, FeedbackRow[]>();
  for (const r of rows) {
    const arr = map.get(r.masteryEventId!) ?? [];
    arr.push(toRow(r));
    map.set(r.masteryEventId!, arr);
  }
  return map;
}

// Bulk — one query for every DailyCheck on a page.
export async function feedbackForDailyChecks(checkIds: string[], includeTeacherOnly: boolean): Promise<Map<string, FeedbackRow[]>> {
  if (checkIds.length === 0) return new Map();
  const rows = await prisma.feedback.findMany({
    where: { dailyCheckId: { in: checkIds }, deletedAt: null, ...(includeTeacherOnly ? {} : { visibility: "STUDENT_VISIBLE" }) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map<string, FeedbackRow[]>();
  for (const r of rows) {
    const arr = map.get(r.dailyCheckId!) ?? [];
    arr.push(toRow(r));
    map.set(r.dailyCheckId!, arr);
  }
  return map;
}

// Every piece of feedback for one student (attached or general) — the
// portal dashboard's "recent feedback" feed.
export async function feedbackForStudent(studentId: string, includeTeacherOnly: boolean, take?: number): Promise<FeedbackRow[]> {
  const rows = await prisma.feedback.findMany({
    where: { studentId, deletedAt: null, ...(includeTeacherOnly ? {} : { visibility: "STUDENT_VISIBLE" }) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toRow);
}
