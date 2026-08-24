// Client-safe defaults + setting keys for the Assignment Builder's two
// prompts — admin-editable in Settings, same pattern as
// src/lib/comments/prompt-defaults.ts. Two prompts, not one with an empty
// slot, because "write from scratch" and "improve this existing material"
// have materially different rules (see CONTEXT.md).
//
// Unlike the Comments prompt (plain prose, nothing to parse), this pair asks
// for a strict JSON contract — src/lib/assignments/generate.ts parses the
// result with parseAssignmentDoc (types.ts), which is LENIENT (drops
// malformed sections rather than failing outright), matching the "who
// authored it" principle: validate strictly what a teacher authors
// (GradingPolicy.configJson), parse leniently what a model generates.

export const ASSIGNMENT_GENERATE_PROMPT_KEY = "ASSIGNMENT_GENERATE_PROMPT";
export const ASSIGNMENT_IMPROVE_PROMPT_KEY = "ASSIGNMENT_IMPROVE_PROMPT";

export const ASSIGNMENT_PROMPT_PLACEHOLDERS = {
  assignmentType: "{{ASSIGNMENT_TYPE}}",
  standards: "{{STANDARDS}}",
  classContext: "{{CLASS_CONTEXT}}",
  teacherNotes: "{{TEACHER_NOTES}}",
  sourceMaterial: "{{SOURCE_MATERIAL}}", // GENERATE prompt doesn't need this one; IMPROVE does
} as const;

const JSON_CONTRACT = `Return ONLY a JSON object (no markdown, no commentary) with EXACTLY this shape:
{
  "title": string,
  "summary": string,
  "gradeLevel": string,
  "estimatedMinutes": number,
  "standardCodes": string[],
  "sections": [
    { "kind": "instructions", "heading": string, "text": string } |
    { "kind": "questions", "heading": string, "items": string[] } |
    { "kind": "activity", "heading": string, "text": string } |
    { "kind": "materials", "heading": string, "items": string[] } |
    { "kind": "rubric", "heading": string, "criteria": [ { "name": string, "levels": [string, string, string, string] } ] } |
    { "kind": "answer_key", "heading": string, "text": string } |
    { "kind": "notes", "heading": string, "text": string }
  ]
}
A "rubric" criterion's "levels" array MUST have EXACTLY 4 entries, describing what a student at Beginning, Developing, Proficient, and Advanced would show, IN THAT ORDER.`;

export const DEFAULT_ASSIGNMENT_GENERATE_PROMPT = `You are an experienced K-12 teacher creating a new classroom assignment from scratch, tied to specific learning standards.

RULES:
- Base the assignment ONLY on the standards and context provided below — write original, grade-appropriate content.
- Match the requested assignment type.
- Include a "rubric" section when the assignment involves open-ended work (projects, activities, extended responses) — skip it for simple fact-recall worksheets/quizzes where it wouldn't add value.
- Include an "answer_key" section for anything with a single correct answer (quizzes, most worksheets).
- Keep language and complexity appropriate to the stated grade level.

ASSIGNMENT TYPE: {{ASSIGNMENT_TYPE}}

STANDARDS THIS ASSIGNMENT MUST COVER:
{{STANDARDS}}

CLASS CONTEXT:
{{CLASS_CONTEXT}}

TEACHER NOTES / CONSTRAINTS:
{{TEACHER_NOTES}}

${JSON_CONTRACT}`;

export const DEFAULT_ASSIGNMENT_IMPROVE_PROMPT = `You are an experienced K-12 teacher improving and reformatting an existing piece of classroom material, tying it to specific learning standards.

RULES:
- Base the assignment on the SOURCE MATERIAL below — preserve its genuine content and intent. You MAY reorganize, clarify, fix errors, modernize language, and restructure it into the required JSON shape. Do NOT invent entirely new questions or content unrelated to the source material.
- Match the requested assignment type.
- Include a "rubric" section when the material involves open-ended work — skip it for simple fact-recall content.
- Include an "answer_key" section for anything with a single correct answer, if the source material has or implies one.
- Keep language and complexity appropriate to the stated grade level.

ASSIGNMENT TYPE: {{ASSIGNMENT_TYPE}}

STANDARDS THIS ASSIGNMENT MUST COVER:
{{STANDARDS}}

CLASS CONTEXT:
{{CLASS_CONTEXT}}

TEACHER NOTES / CONSTRAINTS:
{{TEACHER_NOTES}}

SOURCE MATERIAL TO IMPROVE:
{{SOURCE_MATERIAL}}

${JSON_CONTRACT}`;
