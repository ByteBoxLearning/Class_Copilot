// Pure formatting logic — no Prisma, no "server-only". Mirrors the
// mastery-math.ts (pure) vs mastery.ts (server-only) split already used
// elsewhere in this app: src/lib/comments/summary.ts (server-only) does the
// DB aggregation into a StudentTermSummary; everything here turns that into
// prompt text, and is directly importable from test scripts.

import { COMMENTS_PROMPT_PLACEHOLDERS } from "./prompt-defaults";

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
    for (const n of summary.dailyNotes) lines.push(`- ${n.date}: ${n.text}`);
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
export function buildCommentsPrompt(template: string, summary: StudentTermSummary): string {
  return template
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.studentName, summary.studentName)
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.className, summary.className)
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.dateRange, summary.dateRange)
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.dailyCheckSummary, formatDailyCheckSummary(summary))
    .replaceAll(COMMENTS_PROMPT_PLACEHOLDERS.masterySummary, formatMasterySummary(summary));
}
