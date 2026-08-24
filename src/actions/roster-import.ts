"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { assertCanAccessClass, accessibleStudentIds } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { buildPreview } from "@/lib/import/prepare";
import type { ImportSheet, ColumnMapping, ImportPreviewRow } from "@/lib/import/types";

const MAX_ROWS = 300;

export async function previewRosterImport(
  classId: string,
  sheet: ImportSheet,
  mapping: ColumnMapping,
): Promise<{ ok: true; rows: ImportPreviewRow[] } | { ok: false; error: string }> {
  const user = await requireOwner();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return { ok: false, error: `This file has ${sheet.rows.length} rows — the import limit is ${MAX_ROWS} at a time.` };
  }
  const rows = await buildPreview(sheet, mapping, classId, await accessibleStudentIds(user));
  return { ok: true, rows };
}

export type ImportRosterResult =
  | { ok: true; enrolled: number; alreadyEnrolled: number; errors: number }
  | { ok: false; error: string };

// Re-derives the preview server-side from the raw sheet+mapping — never
// trusts a client-computed preview, since it could be stale. Idempotent: a
// second import of the same sheet produces zero new students/enrollments,
// everything resolves to ALREADY_ENROLLED.
export async function importRoster(classId: string, sheet: ImportSheet, mapping: ColumnMapping): Promise<ImportRosterResult> {
  const user = await requireOwner();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return { ok: false, error: `This file has ${sheet.rows.length} rows — the import limit is ${MAX_ROWS} at a time.` };
  }

  const rows = await buildPreview(sheet, mapping, classId, await accessibleStudentIds(user));
  const toImport = rows.filter((r) => r.status !== "ERROR");
  const errors = rows.length - toImport.length;
  let enrolled = 0;
  let alreadyEnrolled = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of toImport) {
      if (row.status === "ALREADY_ENROLLED") {
        alreadyEnrolled++;
        continue;
      }
      let studentId = row.matchedStudentId;
      if (!studentId) {
        const student = await tx.student.create({
          data: {
            displayName: row.displayName,
            gradeLevel: row.gradeLevel,
            email: row.email,
            externalId: row.externalId,
            status: "ACTIVE",
            createdByUserId: user.id,
          },
        });
        studentId = student.id;
      }
      await tx.enrollment.upsert({
        where: { studentId_classId: { studentId, classId } },
        update: { status: "ACTIVE" },
        create: { studentId, classId, status: "ACTIVE" },
      });
      enrolled++;
    }
  });

  await logActivity({
    userId: user.id,
    actionType: "ROSTER_IMPORTED",
    description: `Imported ${enrolled + alreadyEnrolled} students from ${sheet.sourceLabel} (${enrolled} new/re-enrolled, ${alreadyEnrolled} already enrolled${errors ? `, ${errors} skipped with errors` : ""})`,
  });
  revalidatePath(`/admin/classes/${classId}`);

  return { ok: true, enrolled, alreadyEnrolled, errors };
}
