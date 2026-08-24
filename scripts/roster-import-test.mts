// Scripted test for the roster CSV-import pipeline (parsing, header-mapping,
// dedupe, and idempotency). Run: node --env-file=.env --import tsx scripts/roster-import-test.mts
//
// csv.ts/map.ts are pure functions with no server-only marker, so they're
// imported directly (relative paths, matching prisma/seed.ts's own import
// style). `src/lib/import/prepare.ts` imports the `server-only` package,
// which Next.js resolves specially at bundle time but genuinely isn't
// installed in node_modules for plain Node/tsx to find — so, matching
// isolation-test.mts's precedent, `buildPreview`'s dedupe logic is
// re-implemented here rather than imported, mirroring it exactly.
import { PrismaClient } from "@prisma/client";
import { parseCsv } from "../src/lib/import/csv";
import { guessMapping } from "../src/lib/import/map";
import type { ImportSheet, ColumnMapping, ImportPreviewRow } from "../src/lib/import/types";

const prisma = new PrismaClient();

function cell(row: string[], mapping: ColumnMapping, key: string): string | null {
  for (const [idxStr, fieldKey] of Object.entries(mapping)) {
    if (fieldKey === key) { const v = row[Number(idxStr)]?.trim(); return v || null; }
  }
  return null;
}
function resolveDisplayName(row: string[], mapping: ColumnMapping): string | null {
  const direct = cell(row, mapping, "displayName");
  if (direct) return direct;
  const joined = [cell(row, mapping, "firstName"), cell(row, mapping, "lastName")].filter(Boolean).join(" ").trim();
  return joined || null;
}
async function buildPreview(sheet: ImportSheet, mapping: ColumnMapping, classId: string): Promise<ImportPreviewRow[]> {
  const classStudents = await prisma.student.findMany({ where: { enrollments: { some: { classId, status: "ACTIVE" } } }, select: { id: true, displayName: true } });
  const classNameIndex = new Map(classStudents.map((s) => [s.displayName.toLowerCase(), s.id]));
  const classStudentIds = new Set(classStudents.map((s) => s.id));
  const seenEmails = new Set<string>();
  const seenExternalIds = new Set<string>();
  const results: ImportPreviewRow[] = [];
  for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
    const row = sheet.rows[rowIndex];
    const displayName = resolveDisplayName(row, mapping);
    const email = cell(row, mapping, "email")?.toLowerCase() ?? null;
    const gradeLevel = cell(row, mapping, "gradeLevel");
    const externalId = cell(row, mapping, "externalId");
    if (!displayName) { results.push({ rowIndex, status: "ERROR", displayName: "", email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: "Missing name" }); continue; }
    if ((email && seenEmails.has(email)) || (externalId && seenExternalIds.has(externalId))) { results.push({ rowIndex, status: "ERROR", displayName, email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: "Duplicate row in this file" }); continue; }
    if (email) seenEmails.add(email);
    if (externalId) seenExternalIds.add(externalId);
    let matchedStudentId: string | null = null;
    let matchReason: ImportPreviewRow["matchReason"] = null;
    if (email) { const byEmail = await prisma.student.findUnique({ where: { email }, select: { id: true } }); if (byEmail) { matchedStudentId = byEmail.id; matchReason = "email"; } }
    if (!matchedStudentId && externalId) { const byExt = await prisma.student.findFirst({ where: { externalId }, select: { id: true } }); if (byExt) { matchedStudentId = byExt.id; matchReason = "externalId"; } }
    if (!matchedStudentId) { const byName = classNameIndex.get(displayName.toLowerCase()); if (byName) { matchedStudentId = byName; matchReason = "name"; } }
    if (matchedStudentId && classStudentIds.has(matchedStudentId)) results.push({ rowIndex, status: "ALREADY_ENROLLED", displayName, email, gradeLevel, externalId, matchedStudentId, matchReason, error: null });
    else if (matchedStudentId) results.push({ rowIndex, status: "MATCH_EXISTING", displayName, email, gradeLevel, externalId, matchedStudentId, matchReason, error: null });
    else results.push({ rowIndex, status: "NEW", displayName, email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: null });
  }
  return results;
}

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  console.log("CSV parsing:");
  const csv = 'name,email,grade_level\n"Lovelace, Ada",ada@school.example,9\nGrace Hopper,"grace@school.example",Grade 9\n';
  const sheet = parseCsv(csv, "test.csv");
  check("parses 2 data rows", sheet.rows.length === 2);
  check("handles a quoted field containing a comma", sheet.rows[0][0] === "Lovelace, Ada");
  check("handles a quoted field without extra quotes leaking in", sheet.rows[1][1] === "grace@school.example");
  check("headers parsed correctly", JSON.stringify(sheet.headers) === JSON.stringify(["name", "email", "grade_level"]));

  const tsv = "Student Name\tE-Mail\tGrade\nAva Thompson\tava2@school.example\t6";
  const tsvSheet = parseCsv(tsv, "pasted.tsv");
  check("sniffs tab delimiter for pasted spreadsheet data", tsvSheet.rows.length === 1 && tsvSheet.rows[0][0] === "Ava Thompson");

  console.log("Header mapping:");
  const mapping = guessMapping(["Student Name", "E-Mail", "Grade Level", "Student ID", "Homeroom"]);
  check('"Student Name" -> displayName', mapping[0] === "displayName");
  check('"E-Mail" -> email', mapping[1] === "email");
  check('"Grade Level" -> gradeLevel', mapping[2] === "gradeLevel");
  check('"Student ID" -> externalId', mapping[3] === "externalId");
  check('unrecognized "Homeroom" -> skip (never an error)', mapping[4] === "skip");

  console.log("Dedupe against real seed data:");
  const classP3 = await prisma.class.findFirstOrThrow({ where: { name: "Math — Period 3" } });
  const classP5 = await prisma.class.findFirstOrThrow({ where: { name: "Math — Period 5" } });
  const ava = await prisma.student.findFirstOrThrow({ where: { displayName: { startsWith: "Ava" } } });
  const ethan = await prisma.student.findFirstOrThrow({ where: { displayName: { startsWith: "Ethan" } } });

  const dedupeCsv = [
    "name,email",
    `Ava Thompson,${ava.email}`, // already enrolled in P3 -> ALREADY_ENROLLED
    `Ethan Brooks,${ethan.email}`, // exists, but NOT enrolled in P3 (only P5) -> MATCH_EXISTING
    "Priya Patel,priya.new@school.example", // brand new -> NEW
    ",missing-name@school.example", // no name -> ERROR
  ].join("\n");
  const dedupeSheet = parseCsv(dedupeCsv, "dedupe-test.csv");
  const dedupeMapping = guessMapping(dedupeSheet.headers);
  const preview = await buildPreview(dedupeSheet, dedupeMapping, classP3.id);

  check("Ava (already enrolled in P3) -> ALREADY_ENROLLED", preview[0].status === "ALREADY_ENROLLED");
  check("Ethan (exists, enrolled in P5 not P3) -> MATCH_EXISTING", preview[1].status === "MATCH_EXISTING" && preview[1].matchedStudentId === ethan.id);
  check("Priya (never seen) -> NEW", preview[2].status === "NEW");
  check("missing name -> ERROR", preview[3].status === "ERROR");

  console.log("Idempotency (same class, same dedupe check re-run):");
  const preview2 = await buildPreview(dedupeSheet, dedupeMapping, classP3.id);
  check("re-running the identical preview yields the identical verdicts (no drift)", JSON.stringify(preview.map((r) => r.status)) === JSON.stringify(preview2.map((r) => r.status)));

  console.log("Cross-class isolation of the dedupe:");
  const previewP5 = await buildPreview(dedupeSheet, dedupeMapping, classP5.id);
  check("Ethan against HIS OWN class (P5) -> ALREADY_ENROLLED, not MATCH_EXISTING", previewP5[1].status === "ALREADY_ENROLLED");

  console.log(`\n${failures === 0 ? "✅ All roster-import checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
