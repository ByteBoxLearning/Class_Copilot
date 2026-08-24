// Scripted test for the standards bulk-import pipeline (parsing,
// header-mapping, validation, dedupe, and idempotency). Run:
// node --env-file=.env --import tsx scripts/standards-import-test.mts
//
// src/lib/standards-import/prepare.ts imports the `server-only` package
// (which Next.js resolves specially at bundle time but genuinely isn't
// installed for plain Node/tsx to find — same limitation documented in
// scripts/practice-test.mts and scripts/roster-import-test.mts), so
// buildStandardsPreview's logic is re-implemented here rather than
// imported, mirroring it exactly. csv.ts/map.ts have no server-only marker,
// so those ARE imported directly.
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "../src/lib/import/csv";
import { guessMapping } from "../src/lib/standards-import/map";
import type { ImportSheet } from "../src/lib/import/types";
import type { ColumnMapping, StandardsImportPreviewRow } from "../src/lib/standards-import/types";

const prisma = new PrismaClient();

const VALID_SOURCES = new Set(["AP_CHEM", "INTRO_CHEM"]);
// A tiny stand-in for getUnit() (bank.ts) — real units 1-9 (AP_CHEM) / 1-19
// (INTRO_CHEM) exist; anything else should be rejected the same way the real
// buildStandardsPreview rejects an unknown unit/chapter number.
function unitExists(source: string, unitId: string): boolean {
  const n = Number(unitId);
  if (!Number.isInteger(n)) return false;
  return source === "AP_CHEM" ? n >= 1 && n <= 9 : n >= 1 && n <= 19;
}

function cell(row: string[], mapping: ColumnMapping, key: string): string | null {
  for (const [idxStr, fieldKey] of Object.entries(mapping)) {
    if (fieldKey === key) { const v = row[Number(idxStr)]?.trim(); return v || null; }
  }
  return null;
}

async function buildStandardsPreview(sheet: ImportSheet, mapping: ColumnMapping, classId: string): Promise<StandardsImportPreviewRow[]> {
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

    if (!title) { results.push({ ...base, status: "ERROR", error: "Missing title" }); continue; }

    const dedupeKey = (code ?? title).toLowerCase();
    if (seenKeys.has(dedupeKey)) { results.push({ ...base, status: "ERROR", error: "Duplicate row in this file" }); continue; }
    seenKeys.add(dedupeKey);

    if (Boolean(externalUnitSource) !== Boolean(externalUnitId)) {
      results.push({ ...base, status: "ERROR", error: "Practice source and unit must be given together, or both left blank" });
      continue;
    }
    if (externalUnitSource && !VALID_SOURCES.has(externalUnitSource)) {
      results.push({ ...base, status: "ERROR", error: `Unknown practice source "${externalUnitSource}"` });
      continue;
    }
    if (externalUnitSource && externalUnitId && !unitExists(externalUnitSource, externalUnitId)) {
      results.push({ ...base, status: "ERROR", error: `Unit/chapter "${externalUnitId}" not found for ${externalUnitSource}` });
      continue;
    }

    const matchedStandardId = (code && byCode.get(code.toLowerCase())) || byTitle.get(title.toLowerCase()) || null;
    results.push({ ...base, status: matchedStandardId ? "UPDATE_EXISTING" : "NEW", matchedStandardId, error: null });
  }
  return results;
}

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  console.log("Header mapping:");
  const mapping = guessMapping(["Title", "Code", "Practice Source", "Practice Unit", "Instructor"]);
  check('"Title" -> title', mapping[0] === "title");
  check('"Code" -> code', mapping[1] === "code");
  check('"Practice Source" -> externalUnitSource', mapping[2] === "externalUnitSource");
  check('"Practice Unit" -> externalUnitId', mapping[3] === "externalUnitId");
  check('unrecognized "Instructor" -> skip (never an error)', mapping[4] === "skip");
  check('"Notes" -> description (a reasonable synonym, not left unmapped)', guessMapping(["Notes"])[0] === "description");

  console.log("Against real DB fixtures (self-contained — created and cleaned up here, not the seed data):");
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });
  const cls = await prisma.class.create({ data: { name: "[test fixture] Standards Import class", teacherId: teacher.id } });
  const preexisting = await prisma.standard.create({ data: { classId: cls.id, title: "Existing Standard", code: "EX.1" } });

  const csv = [
    "title,code,practice source,practice unit",
    "Brand New Standard,,,", // NEW, no unit
    "Existing Standard,,,", // matches by title -> UPDATE_EXISTING
    ",EX.1,,", // matches by code, missing title -> ERROR "Missing title" (title wins as the required field)
    "Scoped Chapter,,,2", // source blank, unit given -> ERROR (both-or-neither)
    "Bad Source,,FOO,2", // unknown source -> ERROR
    "Bad Unit,,AP_CHEM,99", // valid source, unit doesn't exist -> ERROR
    "Good Mapping,,INTRO_CHEM,2", // NEW, valid mapping
    "Brand New Standard,,,", // duplicate title within this same file -> ERROR
  ].join("\n");
  const sheet = parseCsv(csv, "standards-test.csv");
  const sheetMapping = guessMapping(sheet.headers);
  const preview = await buildStandardsPreview(sheet, sheetMapping, cls.id);

  check("brand new title, no unit -> NEW", preview[0].status === "NEW");
  check("title matches an existing standard -> UPDATE_EXISTING, matchedStandardId set", preview[1].status === "UPDATE_EXISTING" && preview[1].matchedStandardId === preexisting.id);
  check("missing title -> ERROR, even though code matches something", preview[2].status === "ERROR" && preview[2].error === "Missing title");
  check("unit given without a source -> ERROR (both-or-neither rule)", preview[3].status === "ERROR");
  check("unrecognized practice source -> ERROR", preview[4].status === "ERROR");
  check("a source's unit number that doesn't exist -> ERROR", preview[5].status === "ERROR");
  check("a valid source+unit -> NEW, no error", preview[6].status === "NEW" && preview[6].externalUnitSource === "INTRO_CHEM" && preview[6].externalUnitId === "2");
  check("a duplicate title within the same file -> ERROR on the second occurrence", preview[7].status === "ERROR" && preview[7].error === "Duplicate row in this file");

  // Checked against its own isolated, never-committed sheet — combining this
  // with the idempotency sheet below would have both rows race to update the
  // SAME preexisting standard (title then immediately overwritten by code
  // match), which confounds the idempotency assertion, not a real bug.
  const codeMatchSheet = parseCsv("title,code\nAlso Existing,EX.1", "code-match-test.csv");
  const codeMatchPreview = await buildStandardsPreview(codeMatchSheet, guessMapping(codeMatchSheet.headers), cls.id);
  check("code match wins even when the title differs from the existing row", codeMatchPreview[0].status === "UPDATE_EXISTING" && codeMatchPreview[0].matchedStandardId === preexisting.id);

  console.log("Idempotency (commit once, re-preview the same sheet):");
  // Mirrors importStandards' commit logic with plain prisma calls, since that
  // action transitively imports server-only via requireOwner (src/lib/auth.ts).
  const toImport = preview.filter((r) => r.status !== "ERROR");
  for (const row of toImport) {
    if (row.status === "UPDATE_EXISTING" && row.matchedStandardId) {
      await prisma.standard.update({ where: { id: row.matchedStandardId }, data: { title: row.title, externalUnitSource: row.externalUnitSource, externalUnitId: row.externalUnitId } });
    } else {
      await prisma.standard.create({ data: { classId: cls.id, title: row.title, externalUnitSource: row.externalUnitSource, externalUnitId: row.externalUnitId, order: 0 } });
    }
  }
  const preview2 = await buildStandardsPreview(sheet, sheetMapping, cls.id);
  check(
    "re-importing the identical sheet resolves every previously-NEW row to UPDATE_EXISTING (idempotent, zero duplicate rows)",
    preview2.filter((r) => r.status === "NEW").length === 0 && preview2.filter((r) => r.status === "UPDATE_EXISTING").length === preview.filter((r) => r.status !== "ERROR").length,
  );
  const totalStandardsNow = await prisma.standard.count({ where: { classId: cls.id } });
  check("no duplicate rows were created by the commit (1 pre-existing + exactly the imported NEW rows)", totalStandardsNow === 1 + preview.filter((r) => r.status === "NEW").length);

  // Cleanup — self-contained fixture, per this repo's established test-script convention.
  await prisma.standard.deleteMany({ where: { classId: cls.id } });
  await prisma.class.delete({ where: { id: cls.id } });

  console.log(`\n${failures === 0 ? "✅ All standards-import checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
