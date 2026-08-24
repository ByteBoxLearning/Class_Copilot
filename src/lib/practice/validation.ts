// Structural checks zod's shape validation can't express (sums, cross-field
// consistency) — ported verbatim from the standalone tool's lib/validation.ts.
import type { z } from "zod";
import type { mcqGenSchema, frqGenSchema } from "./schemas";

type MCQGen = z.infer<typeof mcqGenSchema>;
type FRQGen = z.infer<typeof frqGenSchema>;

export function validateMcqGen(item: MCQGen): string[] {
  const issues: string[] = [];
  if (item.choices.length !== 4) issues.push(`choices must have exactly 4 entries, got ${item.choices.length}`);
  if (item.correctIndex < 0 || item.correctIndex > 3) issues.push(`correctIndex must be 0-3, got ${item.correctIndex}`);
  return issues;
}

export function validateFrqGen(item: FRQGen): string[] {
  const issues: string[] = [];
  const expectedPoints = item.kind === "long" ? 10 : 4;
  if (item.points !== expectedPoints) issues.push(`kind "${item.kind}" must have points ${expectedPoints}, got ${item.points}`);
  const rubricSum = item.rubric.reduce((sum, r) => sum + r.points, 0);
  if (rubricSum !== item.points) issues.push(`rubric points sum to ${rubricSum}, must sum to exactly ${item.points}`);
  const partsSum = item.parts.reduce((sum, p) => sum + p.maxPoints, 0);
  if (partsSum !== item.points) issues.push(`parts maxPoints sum to ${partsSum}, must sum to exactly ${item.points}`);
  const partLabels = item.parts.map((p) => p.label);
  const rubricLabels = item.rubric.map((r) => r.partLabel);
  if (JSON.stringify(partLabels) !== JSON.stringify(rubricLabels)) {
    issues.push(`parts labels [${partLabels.join(", ")}] must match rubric partLabels [${rubricLabels.join(", ")}] in the same order`);
  }
  return issues;
}
