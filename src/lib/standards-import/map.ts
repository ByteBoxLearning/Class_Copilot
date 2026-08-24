import type { ColumnMapping, FieldKey } from "./types";

// Case/space/underscore/hyphen-insensitive header matching, mirrors
// src/lib/import/map.ts's guessMapping for roster rows. A column that
// doesn't match anything defaults to "skip" — the mapping UI always lets
// the teacher fix a wrong guess.
const PATTERNS: [RegExp, FieldKey][] = [
  [/^(title|standard|standard title|learning objective|name)$/, "title"],
  [/^(code|standard code)$/, "code"],
  [/^(description|details|notes)$/, "description"],
  [/^(category|strand|category name)$/, "categoryName"],
  [/^(practice source|external unit source|source)$/, "externalUnitSource"],
  [/^(practice unit|external unit id|unit|chapter|unit id|chapter number)$/, "externalUnitId"],
];

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
