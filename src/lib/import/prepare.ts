import "server-only";
import { prisma } from "@/lib/prisma";
import type { ImportSheet, ColumnMapping, ImportPreviewRow } from "./types";

function cell(row: string[], mapping: ColumnMapping, key: string): string | null {
  for (const [idxStr, fieldKey] of Object.entries(mapping)) {
    if (fieldKey === key) {
      const v = row[Number(idxStr)]?.trim();
      return v || null;
    }
  }
  return null;
}

function resolveDisplayName(row: string[], mapping: ColumnMapping): string | null {
  const direct = cell(row, mapping, "displayName");
  if (direct) return direct;
  const first = cell(row, mapping, "firstName");
  const last = cell(row, mapping, "lastName");
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

// Builds a per-row preview: normalizes each raw row, then dedupes against
// the database (email -> externalId -> case-insensitive name-within-class)
// and against earlier rows in the same file. ALWAYS re-run server-side from
// the raw sheet+mapping before committing — never trust a client-computed
// preview, since the browser's dedupe verdict could be stale by the time the
// import actually runs.
//
// `accessibleStudentIds` (the caller's own accessibleStudentIds(user) result)
// bounds the email/externalId dedupe match to students in the CALLER's own
// workspace. Without this, importing a CSV whose email happens to match some
// unrelated teacher's existing student would silently enroll that other
// teacher's private student record into this class — a real record found by
// email, in someone else's workspace, that this caller has no access to.
export async function buildPreview(
  sheet: ImportSheet,
  mapping: ColumnMapping,
  classId: string,
  accessibleStudentIds: "ALL" | string[],
): Promise<ImportPreviewRow[]> {
  const isAccessible = (studentId: string) => accessibleStudentIds === "ALL" || accessibleStudentIds.includes(studentId);

  const classStudents = await prisma.student.findMany({
    where: { enrollments: { some: { classId, status: "ACTIVE" } } },
    select: { id: true, displayName: true },
  });
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

    if (!displayName) {
      results.push({ rowIndex, status: "ERROR", displayName: "", email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: "Missing name" });
      continue;
    }
    if ((email && seenEmails.has(email)) || (externalId && seenExternalIds.has(externalId))) {
      results.push({ rowIndex, status: "ERROR", displayName, email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: "Duplicate row in this file" });
      continue;
    }
    if (email) seenEmails.add(email);
    if (externalId) seenExternalIds.add(externalId);

    // Dedupe ladder: email -> externalId -> case-insensitive name-within-class.
    let matchedStudentId: string | null = null;
    let matchReason: ImportPreviewRow["matchReason"] = null;

    if (email) {
      const byEmail = await prisma.student.findUnique({ where: { email }, select: { id: true } });
      if (byEmail && !isAccessible(byEmail.id)) {
        results.push({ rowIndex, status: "ERROR", displayName, email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: "That email belongs to a student you don't have access to." });
        continue;
      }
      if (byEmail) { matchedStudentId = byEmail.id; matchReason = "email"; }
    }
    if (!matchedStudentId && externalId) {
      const byExternalId = await prisma.student.findFirst({ where: { externalId }, select: { id: true } });
      if (byExternalId && !isAccessible(byExternalId.id)) {
        results.push({ rowIndex, status: "ERROR", displayName, email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: "That student ID belongs to a student you don't have access to." });
        continue;
      }
      if (byExternalId) { matchedStudentId = byExternalId.id; matchReason = "externalId"; }
    }
    if (!matchedStudentId) {
      const byName = classNameIndex.get(displayName.toLowerCase());
      if (byName) { matchedStudentId = byName; matchReason = "name"; }
    }

    if (matchedStudentId && classStudentIds.has(matchedStudentId)) {
      results.push({ rowIndex, status: "ALREADY_ENROLLED", displayName, email, gradeLevel, externalId, matchedStudentId, matchReason, error: null });
    } else if (matchedStudentId) {
      results.push({ rowIndex, status: "MATCH_EXISTING", displayName, email, gradeLevel, externalId, matchedStudentId, matchReason, error: null });
    } else {
      results.push({ rowIndex, status: "NEW", displayName, email, gradeLevel, externalId, matchedStudentId: null, matchReason: null, error: null });
    }
  }

  return results;
}
