// Client-safe default + setting key for the End-of-Term Comments prompt. It's
// admin-editable in Settings (stored plain in the Setting table); this is the
// seed and the "Reset to default" target — same pattern as the source CRM's
// src/lib/cv/prompt-builder-defaults.ts.
//
// Unlike the CV Builder's prompt (which demands a strict JSON contract) or the
// planned Assignment Builder's, this prompt asks for PLAIN PROSE — the output
// is used as-is, not parsed. That's a deliberate simplification: a comment
// generator has nothing to parse, so there's no JSON-contract guard needed on
// save (see saveCommentsPrompt in src/actions/settings.ts, which only checks
// the placeholders survive).

export const COMMENTS_PROMPT_KEY = "COMMENTS_PROMPT";

export const COMMENTS_PROMPT_PLACEHOLDERS = {
  studentName: "{{STUDENT_NAME}}",
  className: "{{CLASS_NAME}}",
  dateRange: "{{DATE_RANGE}}",
  dailyCheckSummary: "{{DAILY_CHECK_SUMMARY}}",
  masterySummary: "{{MASTERY_SUMMARY}}",
} as const;

export const DEFAULT_COMMENTS_PROMPT = `You are an experienced, warm, and honest K-12 teacher writing an end-of-term report card comment for one student. Base the comment ONLY on the data provided below — never invent events, names, grades, or behavior not evidenced in the data.

Write 3-5 sentences in a professional but personal tone, suitable to appear on a report card. Cover, where the data supports it:
1. One or two notable personality/behavior traits (empathy, discipline, collaboration, citizenship) — phrase gently and constructively even when the data trends negative.
2. Engagement and class participation.
3. One or two specific areas of academic strength (standards mastery).
4. One specific, constructive area for growth.

If a category has too little data to say anything meaningful, omit it rather than guessing or padding. Do not use bullet points, headers, or quotation marks — write it as a single flowing comment, ready to paste directly into a report card.

STUDENT: {{STUDENT_NAME}}
CLASS: {{CLASS_NAME}}
PERIOD COVERED: {{DATE_RANGE}}

DAILY CHECK-IN DATA:
{{DAILY_CHECK_SUMMARY}}

STANDARDS MASTERY DATA:
{{MASTERY_SUMMARY}}

Write ONLY the comment text — nothing else.`;
