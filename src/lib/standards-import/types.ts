// Shared shapes for the standards bulk-import pipeline — mirrors
// src/lib/import/types.ts's roster-import shapes exactly (same ImportSheet
// source, same "map columns then preview" flow), just for Standard rows
// instead of Student rows.

export type FieldKey =
  | "title"
  | "code"
  | "description"
  | "categoryName"
  | "externalUnitSource"
  | "externalUnitId"
  | "skip";

// Column index -> which Standard field it maps to.
export type ColumnMapping = Record<number, FieldKey>;

export type ImportRowStatus = "NEW" | "UPDATE_EXISTING" | "ERROR";

export type StandardsImportPreviewRow = {
  rowIndex: number; // index into ImportSheet.rows
  status: ImportRowStatus;
  title: string;
  code: string | null;
  description: string | null;
  categoryName: string | null;
  externalUnitSource: string | null;
  externalUnitId: string | null;
  matchedStandardId: string | null; // set when status is UPDATE_EXISTING
  error: string | null;
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  title: "Title",
  code: "Code",
  description: "Description",
  categoryName: "Category",
  externalUnitSource: "Practice source (AP_CHEM / INTRO_CHEM)",
  externalUnitId: "Practice unit/chapter number",
  skip: "(skip this column)",
};
