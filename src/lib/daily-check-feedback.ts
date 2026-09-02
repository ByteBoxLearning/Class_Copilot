import "server-only";
import { runModel } from "@/lib/ai/run-model";
import { DEFAULT_AI_MODEL } from "@/lib/ai/engines";
import { redactStudentName } from "@/lib/comments/anonymize";

export type DailyCheckDimensions = {
  engagement: string | null;
  empathy: string | null;
  discipline: string | null;
  collaboration: string | null;
  citizenship: string | null;
};

// The negative pole of each DailyCheck dimension (src/lib/enums.ts) that
// reads as an actual behavior/discipline concern, as opposed to
// engagement/empathy dipping — a teacher's private note about a distracted
// but otherwise well-behaved day should still land encouraging, not
// assertive.
const DISCIPLINARY_NEGATIVES: Record<string, string> = {
  discipline: "UNDISCIPLINED",
  citizenship: "POOR_CITIZENSHIP",
  collaboration: "UNCOOPERATIVE",
};

export function hasDisciplinaryFlag(dims: DailyCheckDimensions): boolean {
  return Object.entries(DISCIPLINARY_NEGATIVES).some(([key, negative]) => dims[key as keyof DailyCheckDimensions] === negative);
}

// Drafts short, student-facing feedback from a teacher's private Monitor
// note — never persisted here (see generateFeedbackFromNote in
// src/actions/daily-checks.ts, which only returns the draft for a teacher to
// review/edit/save via the existing addFeedback flow, same "AI drafts, human
// decides" posture as the practice-mode coaching feedback and the standards-
// mapping suggestion). Tone is decided by hasDisciplinaryFlag above, not left
// to the model to guess — the note text still grounds the specific content.
// `studentFirstName` is accepted for backward compatibility with existing
// callers but deliberately UNUSED in the prompt below — the output already
// addresses the student in second person ("you"), so the AI never actually
// needs a name to write it, and not sending one is one less piece of
// student-identifying data reaching a third-party provider (see TODO.md's
// security section / src/lib/comments/anonymize.ts for the same principle
// applied to the End-of-Term Comments generator).
export async function generateDailyCheckFeedback(
  studentFirstName: string,
  note: string,
  dims: DailyCheckDimensions,
): Promise<string | null> {
  const assertive = hasDisciplinaryFlag(dims);
  const loggedDims = Object.entries(dims).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  // The note itself may casually mention the student by first name even
  // though nothing else in this prompt does — scrub it before it goes out.
  const redactedNote = redactStudentName(note, studentFirstName);

  const prompt = `A teacher wrote this private note about a student after today's class:
"${redactedNote}"

Other quick reads logged for this student today: ${loggedDims.length > 0 ? loggedDims.join(", ") : "none"}.

Write short feedback (2-4 sentences) for the student to read directly, addressed to them in second person ("you"). ${
    assertive
      ? "Today's record includes a discipline/behavior concern — write in a direct, assertive, and fair tone: name the specific behavior plainly and state the expectation going forward, without being harsh, sarcastic, or shaming."
      : "Write in a warm, encouraging, and supportive tone, even if the note mentions something to work on."
  } Ground the feedback specifically in the note above — never generic filler. Do not just restate the note; write it as a message to the student. Respond with ONLY the feedback text itself — no preamble, no labels, no quotation marks around it.`;

  try {
    const result = await runModel(prompt, DEFAULT_AI_MODEL);
    return result.text?.trim() || null;
  } catch {
    return null;
  }
}
