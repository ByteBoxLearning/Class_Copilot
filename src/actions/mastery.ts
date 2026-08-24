"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass, assertCanAccessStudent } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { values, MASTERY_EVIDENCE_TYPES } from "@/lib/enums";

const recordSchema = z.object({
  studentId: z.string().min(1),
  standardId: z.string().min(1),
  classId: z.string().min(1),
  level: z.coerce.number().int().min(1).max(4),
  evidenceType: z.enum(values(MASTERY_EVIDENCE_TYPES)).default("OBSERVATION"),
  evidenceNote: z.string().optional(),
});

export type RecordMasteryResult = { ok: true } | { ok: false; error: string };

// Records a new append-only MasteryEvent — never edits/overwrites a prior
// one, so the full evidence history is preserved (see schema.prisma comment
// and src/lib/mastery.ts for how "current mastery" is computed from these).
export async function recordMasteryEvent(input: {
  studentId: string;
  standardId: string;
  classId: string;
  level: number;
  evidenceType?: string;
  evidenceNote?: string;
}): Promise<RecordMasteryResult> {
  const user = await requireStaff();
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    await assertCanAccessClass(user, d.classId);
    await assertCanAccessStudent(user, d.studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student/class." };
  }

  const standard = await prisma.standard.findUnique({ where: { id: d.standardId }, select: { classId: true, title: true } });
  if (!standard || standard.classId !== d.classId) return { ok: false, error: "Standard not found in this class." };

  await prisma.masteryEvent.create({
    data: {
      studentId: d.studentId,
      standardId: d.standardId,
      level: d.level,
      evidenceType: d.evidenceType,
      evidenceNote: d.evidenceNote || null,
      recordedById: user.id,
    },
  });
  await logActivity({
    userId: user.id,
    studentId: d.studentId,
    actionType: "MASTERY_EVENT_RECORDED",
    description: `Recorded level ${d.level} on "${standard.title}"`,
  });

  revalidatePath("/classes/mastery");
  revalidatePath(`/admin/students/${d.studentId}`);
  return { ok: true };
}
