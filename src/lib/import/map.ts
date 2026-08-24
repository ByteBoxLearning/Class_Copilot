import type { ColumnMapping, FieldKey } from "./types";

// Case/space/underscore/hyphen-insensitive header matching, so "Student
// Email", "student_email" and "E-Mail" all resolve the same way. A column
// that doesn't match anything defaults to "skip" rather than erroring — the
// mapping UI always lets the teacher fix a wrong guess.
const PATTERNS: [RegExp, FieldKey][] = [
  [/^(full name|student name|name)$/, "displayName"],
  [/^first name$/, "firstName"],
  [/^last name$/, "lastName"],
  [/^(e mail|student email|email address|email)$/, "email"],
  [/^(grade|grade level|year)$/, "gradeLevel"],
  [/^(student id|sis id|id)$/, "externalId"],
];

// Collapses whitespace/underscores/hyphens into single spaces and lowercases,
// so header variants compare equal regardless of separator style.
function normalize(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  headers.forEach((header, i) => {
    const norm = normalize(header);
    const match = PATTERNS.find(([re]) => re.test(norm));
    mapping[i] = match ? match[1] : "skip";
  });
  return mapping;
}
