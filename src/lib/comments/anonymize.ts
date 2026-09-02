// FERPA data-minimization for the End-of-Term Comments generator: the real
// student name never needs to leave the server to get a usable comment back
// — "the student"/"The student" reads perfectly naturally in report-card
// prose. buildCommentsPrompt (format.ts) sends the placeholder instead of
// the real name, and also scrubs it out of any free-text teacher notes (in
// case a teacher happened to write the student's name into their own note);
// restoreStudentName (used by src/actions/comments.ts, after the AI
// responds) substitutes the real name back into the returned text, which
// never left this server.

export const STUDENT_PLACEHOLDER = "the student";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replaces any occurrence of the student's full name or first name (as a
// whole word) with the placeholder, before that text is sent to an AI
// provider.
export function redactStudentName(text: string, fullName: string): string {
  const firstName = fullName.trim().split(/\s+/)[0];
  const names = [...new Set([fullName, firstName])].filter((n) => n.length > 1);
  let out = text;
  for (const n of names) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(n)}\\b`, "gi"), STUDENT_PLACEHOLDER);
  }
  return out;
}

// Substitutes the placeholder back into AI-returned text with the real name
// — this text stays local to the teacher's own browser/DB, never sent
// anywhere else.
export function restoreStudentName(text: string, fullName: string): string {
  return text.replace(/\bThe student\b/g, fullName).replace(/\bthe student\b/g, fullName);
}
