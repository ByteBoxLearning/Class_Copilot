"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { buildStandardsPreview } from "@/lib/standards-import/prepare";
import type { ImportSheet } from "@/lib/import/types";
import type { ColumnMapping, StandardsImportPreviewRow } from "@/lib/standards-import/types";

const MAX_ROWS = 300;

export async function previewStandardsImport(
  classId: string,
  sheet: ImportSheet,
  mapping: ColumnMapping,
): Promise<{ ok: true; rows: StandardsImportPreviewRow[] } | { ok: false; error: string }> {
  const user = await requireOwner();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return { ok: false, error: `This file has ${sheet.rows.length} rows — the import limit is ${MAX_ROWS} at a time.` };
  }
  const rows = await buildStandardsPreview(sheet, mapping, classId);
  return { ok: true, rows };
}

export type ImportStandardsResult =
  | { ok: true; created: number; updated: number; errors: number }
  | { ok: false; error: string };

// Re-derives the preview server-side from the raw sheet+mapping — never
// trusts a client-computed preview, mirrors src/actions/roster-import.ts's
// importRoster exactly. Idempotent: re-importing the same sheet updates the
// same matched standards rather than duplicating them. Every created/updated
// row lands UNSCOPED (externalQuestionIdsJson untouched/null) — this is
// deliberately just "here are my standards and roughly which chapter each
// belongs to"; narrowing to specific questions happens afterward via the
// manual picker or AI-assisted mapping (src/actions/standards-mapping.ts).
export async function importStandards(classId: string, sheet: ImportSheet, mapping: ColumnMapping): Promise<ImportStandardsResult> {
  const user = await requireOwner();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  if (sheet.rows.length > MAX_ROWS) {
    return { ok: false, error: `This file has ${sheet.rows.length} rows — the import limit is ${MAX_ROWS} at a time.` };
  }

  const rows = await buildStandardsPreview(sheet, mapping, classId);
  const toImport = rows.filter((r) => r.status !== "ERROR");
  const errors = rows.length - toImport.length;
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    const maxOrder = await tx.standard.aggregate({ where: { classId }, _max: { order: true } });
    let nextOrder = (maxOrder._max.order ?? 0) + 1;

    for (const row of toImport) {
      let categoryId: string | null = null;
      if (row.categoryName) {
        const category = await tx.standardCategory.upsert({
          where: { name: row.categoryName },
          update: {},
          create: { name: row.categoryName },
        });
        categoryId = category.id;
      }

      if (row.status === "UPDATE_EXISTING" && row.matchedStandardId) {
        await tx.standard.update({
          where: { id: row.matchedStandardId },
          data: {
            title: row.title,
            code: row.code,
            description: row.description,
            categoryId,
            externalUnitSource: row.externalUnitSource,
            externalUnitId: row.externalUnitId,
          },
        });
        updated++;
      } else {
        await tx.standard.create({
          data: {
            classId,
            title: row.title,
            code: row.code,
            description: row.description,
            categoryId,
            order: nextOrder++,
            externalUnitSource: row.externalUnitSource,
            externalUnitId: row.externalUnitId,
          },
        });
        created++;
      }
    }
  });

  await logActivity({
    userId: user.id,
    actionType: "STANDARDS_IMPORTED",
    description: `Imported ${created + updated} standards from ${sheet.sourceLabel} (${created} new, ${updated} updated${errors ? `, ${errors} skipped with errors` : ""})`,
  });
  revalidatePath("/classes/standards");

  return { ok: true, created, updated, errors };
}
