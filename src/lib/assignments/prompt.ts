// Pure prompt-assembly logic — no Prisma, no "server-only". Mirrors
// comments/format.ts's split: src/lib/assignments/generate.ts (server-only)
// gathers the class/standards data; this turns it into prompt text, and is
// directly importable from test scripts.

import { ASSIGNMENT_PROMPT_PLACEHOLDERS } from "./prompt-defaults";

export type AssignmentPromptStandard = { code: string | null; title: string; description?: string | null };

export type AssignmentPromptContext = {
  assignmentType: string; // display label, e.g. "Worksheet"
  standards: AssignmentPromptStandard[];
  className: string;
  subject?: string | null;
  gradeLevel?: string | null;
  teacherNotes?: string;
  sourceMaterial?: string; // only substituted for IMPROVE-mode templates
};

function formatStandards(standards: AssignmentPromptStandard[]): string {
  if (standards.length === 0) return "(none specified)";
  return standards.map((s) => `${s.code ? `[${s.code}] ` : ""}${s.title}${s.description ? ` — ${s.description}` : ""}`).join("\n");
}

function formatClassContext(ctx: AssignmentPromptContext): string {
  const lines = [
    `Class: ${ctx.className}`,
    ctx.subject ? `Subject: ${ctx.subject}` : null,
    ctx.gradeLevel ? `Grade level: ${ctx.gradeLevel}` : null,
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

// Substitutes an admin-editable prompt template's placeholders with real
// assignment-generation context. Works for both the GENERATE and IMPROVE
// templates — {{SOURCE_MATERIAL}} simply has nothing to replace (stays
// literal) if the template doesn't include it, and is a no-op replaceAll if
// ctx.sourceMaterial is omitted.
export function buildAssignmentPrompt(template: string, ctx: AssignmentPromptContext): string {
  return template
    .replaceAll(ASSIGNMENT_PROMPT_PLACEHOLDERS.assignmentType, ctx.assignmentType)
    .replaceAll(ASSIGNMENT_PROMPT_PLACEHOLDERS.standards, formatStandards(ctx.standards))
    .replaceAll(ASSIGNMENT_PROMPT_PLACEHOLDERS.classContext, formatClassContext(ctx))
    .replaceAll(ASSIGNMENT_PROMPT_PLACEHOLDERS.teacherNotes, ctx.teacherNotes?.trim() || "(none)")
    .replaceAll(ASSIGNMENT_PROMPT_PLACEHOLDERS.sourceMaterial, ctx.sourceMaterial?.trim() || "(none provided)");
}
