import "server-only";
import { prisma } from "@/lib/prisma";
import { values, EXTERNAL_UNIT_SOURCES } from "@/lib/enums";
import { getUnit } from "@/lib/practice/bank";
import type { UnitSource } from "@/lib/practice/types";
import type { ImportSheet } from "@/lib/import/types";
import type { ColumnMapping, StandardsImportPreviewRow } from "./types";

const VALID_SOURCES = new Set(values(EXTERNAL_UNIT_SOURCES));

function cell(row: string[], mapping: ColumnMapping, key: string): string | null {
  for (const [idxStr, fieldKey] of Object.entries(mapping)) {
    if (fieldKey === key) {
      const v = row[Number(idxStr)]?.trim();
      return v || null;
    }
  }
  return null;
}

// Builds a per-row preview: normalizes each raw row, validates the practice
// unit link (both-or-neither, a recognized source, a real unit/chapter
// number for that source), then dedupes against the database (code ->
// case-insensitive title, scoped to the class) and against earlier rows in
// the same file. No externalQuestionIds handling here — CSV import only
// creates/updates UNSCOPED standards; question-level scoping happens
// afterward via the manual picker or the AI-assisted mapping. ALWAYS re-run
// server-side from the raw sheet+mapping before committing — mirrors
// src/lib/import/prepare.ts's roster-import precedent exactly.
export async function buildStandardsPreview(
  sheet: ImportSheet,
  mapping: ColumnMapping,
  classId: string,
): Promise<StandardsImportPreviewRow[]> {
  const existing = await prisma.standard.findMany({ where: { classId }, select: { id: true, title: true, code: true } });
  const byCode = new Map(existing.filter((s) => s.code).map((s) => [s.code!.toLowerCase(), s.id]));
  const byTitle = new Map(existing.map((s) => [s.title.toLowerCase(), s.id]));

  const seenKeys = new Set<string>();
  const results: StandardsImportPreviewRow[] = [];

  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
    const row = sheet.rows[rowIndex];
    const title = cell(row, mapping, "title");
    const code = cell(row, mapping, "code");
    const description = cell(row, mapping, "description");
    const categoryName = cell(row, mapping, "categoryName");
    const externalUnitSource = cell(row, mapping, "externalUnitSource")?.toUpperCase() ?? null;
    const externalUnitId = cell(row, mapping, "externalUnitId");

    const base = { rowIndex, title: title ?? "", code, description, categoryName, externalUnitSource, externalUnitId, matchedStandardId: null };

    if (!title) {
      results.push({ ...base, status: "ERROR", error: "Missing title" });
      continue;
    }

    const dedupeKey = (code ?? title).toLowerCase();
    if (seenKeys.has(dedupeKey)) {
      results.push({ ...base, status: "ERROR", error: "Duplicate row in this file" });
      continue;
    }
    seenKeys.add(dedupeKey);

    if (Boolean(externalUnitSource) !== Boolean(externalUnitId)) {
      results.push({ ...base, status: "ERROR", error: "Practice source and unit must be given together, or both left blank" });
      continue;
    }
    if (externalUnitSource && !VALID_SOURCES.has(externalUnitSource)) {
      results.push({ ...base, status: "ERROR", error: `Unknown practice source "${externalUnitSource}" (expected AP_CHEM or INTRO_CHEM)` });
      continue;
    }
    if (externalUnitSource && externalUnitId && !getUnit(externalUnitSource as UnitSource, Number(externalUnitId))) {
      results.push({ ...base, status: "ERROR", error: `Unit/chapter "${externalUnitId}" not found for ${externalUnitSource}` });
      continue;
    }

    const matchedStandardId = (code && byCode.get(code.toLowerCase())) || byTitle.get(title.toLowerCase()) || null;
    results.push({
      ...base,
      status: matchedStandardId ? "UPDATE_EXISTING" : "NEW",
      matchedStandardId,
      error: null,
    });
  }

  return results;
}
