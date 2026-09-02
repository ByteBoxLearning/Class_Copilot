// Pure formatting logic — no Prisma, no "server-only". Mirrors the
// mastery-math.ts (pure) vs mastery.ts (server-only) split already used
// elsewhere in this app: src/lib/comments/summary.ts (server-only) does the
// DB aggregation into a StudentTermSummary; everything here turns that into
// prompt text, and is directly importable from test scripts.

import { COMMENTS_PROMPT_PLACEHOLDERS } from "./prompt-defaults";
import { STUDENT_PLACEHOLDER, redactStudentName } from "./anonymize";

export type DimensionKey = "engagement" | "empathy" | "discipline" | "collaboration" | "citizenship";
export type DimensionTally = { positiveLabel: string; negativeLabel: string; positive: number; negative: number };

export type StudentTermSummary = {
  studentName: string;
  className: string;
  dateRange: string;
  dimensionTallies: Record<DimensionKey, DimensionTally>;
  dailyNotes: { date: string; text: string }[];
  standards: { code: string | null; title: string; levelLabel: string | null; sampleSize: number }[];
  totalDailyChecks: number;
};

export const DIMENSION_KEYS: DimensionKey[] = ["engagement", "empathy", "discipline", "collaboration", "citizenship"];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  engagement: "Engagement",
  empathy: "Empathy",
  discipline: "Discipline",
  collaboration: "Collaboration",
  citizenship: "Citizenship",
};

function formatDailyCheckSummary(summary: StudentTermSummary): string {
  const lines: string[] = [];
  for (const key of DIMENSION_KEYS) {
    const t = summary.dimensionTallies[key];
    if (t.positive === 0 && t.negative === 0) continue;
    lines.push(`${DIMENSION_LABELS[key]}: ${t.positive}x "${t.positiveLabel}", ${t.negative}x "${t.negativeLabel}"`);
  }
  if (lines.length === 0) lines.push("No daily check-ins were logged for this student in this period.");

  if (summary.dailyNotes.length > 0) {
    lines.push("", "Teacher notes from specific days:");
    // Scrub the student's own name out of free-text notes too — a teacher
    // may well have typed it ("Ava was distracted today") even though the
    // rest of this prompt never uses it.
    for (const n of summary.dailyNotes) lines.push(`- ${n.date}: ${redactStudentName(n.text, summary.studentName)}`);
  }
  return lines.join("\n");
}

function formatMasterySummary(summary: StudentTermSummary): string {
  if (summary.standards.length === 0) return "No standards-mastery evidence was recorded for this student in this period.";
  return summary.standards
    .map((s) => `${s.code ? `[${s.code}] ` : ""}${s.title}: ${s.levelLabel} (${s.sampleSize} piece${s.sampleSize === 1 ? "" : "s"} of evidence)`)
    .join("\n");
}

// Substitutes an admin-editable prompt template's placeholders with a
// student's aggregated term data. No JSON involved anywhere in this pipeline
// — the model's raw output IS the comment (see prompt-defaults.ts for why
// that's deliberate).
//
// The student's real name is deliberately NEVER substituted in here — only
// STUDENT_PLACEHOLDER ("the student") goes out to the AI provider. The real
// name is substituted back into the AI's response afterward, locally (see
// restoreStudentName in ./anonymize.ts, used by src/actions/comments.ts) —
// it never needs to leave this server for the comment to come out right.
export function buildCommentsPrompt(template: string, summary: StudentTermSummary): string {
  return template
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.studentName, STUDENT_PLACEHOLDER)
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.className, summary.className)
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.dateRange, summary.dateRange)
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.dailyCheckSummary, formatDailyCheckSummary(summary))
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.masterySummary, formatMasterySummary(summary));
}
