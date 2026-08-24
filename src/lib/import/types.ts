// Shared shapes for the roster bulk-import pipeline. Both sources (CSV
// upload/paste and, later, Google Sheets) normalize to `ImportSheet` — the
// mapping/preview/commit path downstream is source-agnostic. Client-safe
// (no server-only imports), so the browser-side CSV parsing step can import
// this file directly.

export type ImportSheet = {
  headers: string[];
  rows: string[][];
  sourceLabel: string; // e.g. "roster.csv" or "Pasted text"
};

export type FieldKey = "displayName" | "firstName" | "lastName" | "email" | "gradeLevel" | "externalId" | "skip";

// Column index -> which Student field it maps to.
export type ColumnMapping = Record<number, FieldKey>;

export type ImportRowStatus = "NEW" | "MATCH_EXISTING" | "ALREADY_ENROLLED" | "ERROR";

export type ImportPreviewRow = {
  rowIndex: number; // index into ImportSheet.rows
  status: ImportRowStatus;
  displayName: string;
  email: string | null;
  gradeLevel: string | null;
  externalId: string | null;
  matchedStudentId: string | null; // set when status is MATCH_EXISTING or ALREADY_ENROLLED
  matchReason: "email" | "externalId" | "name" | null;
  error: string | null;
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  displayName: "Name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  gradeLevel: "Grade level",
  externalId: "Student ID",
  skip: "(skip this column)",
};
