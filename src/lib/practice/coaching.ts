import "server-only";
import { runModel } from "@/lib/ai/run-model";
import { extractJson } from "@/lib/ai/json";
import { DEFAULT_AI_MODEL } from "@/lib/ai/engines";
import { coachingFeedbackGenSchema } from "./schemas";
import { NOTATION_RULES } from "./notation";
import type { MCQItem, FRQItem, MCQAnswer, FRQScoreResult, CoachingFeedback } from "./types";

// Session-wide "what to improve + strategies" coaching feedback, generated
// once on submit — advisory only, never touches mastery/grading (that's what
// UnitResult/PracticeMasteryProposal are for). A single best-effort call, no
// retry loop: unlike FRQ scoring or the standard-mapping suggestion, a failed
// or skipped call here just means the section doesn't render (see its null
// return) — there's nothing downstream that depends on this succeeding.
export async function generateCoachingFeedback(
  mcqItems: MCQItem[],
  mcqAnswers: Record<string, MCQAnswer>,
  frqItems: FRQItem[],
  frqScores: Record<string, FRQScoreResult>,
  // Plain-language notes on any question in this session the student was
  // ALSO asked before (see bank.ts::selectWithRetention) — e.g. "got it wrong
  // last time, right this time". Optional and usually empty; when present,
  // lets the model naturally acknowledge real growth/consistency/regression
  // instead of treating every session as a first attempt. Seamless to the
  // student during the quiz itself (see selectWithRetention's own comment) —
  // this is the one place the comparison surfaces, woven into the normal
  // coaching narrative rather than a separate callout.
  retentionNotes: string[] = [],
): Promise<CoachingFeedback | null> {
  const missed = mcqItems
    .filter((item) => mcqAnswers[item.id]?.selectedIndex !== item.correctIndex)
    .map((item) => `- [${item.topicTag}] "${item.stem}" — correct answer: "${item.choices[item.correctIndex]}"${item.explanation ? `. Why: ${item.explanation}` : ""}`);

  const weakParts = frqItems.flatMap((item) => {
    const score = frqScores[item.id];
    if (!score) return [];
    return score.partScores
      .filter((p) => p.pointsAwarded < p.maxPoints)
      .map((p) => `- "${item.stem}" part (${p.partLabel}): scored ${p.pointsAwarded}/${p.maxPoints} — ${p.reasoning}`);
  });

  if (missed.length === 0 && weakParts.length === 0 && retentionNotes.length === 0) return null; // a clean session — nothing to flag

  const prompt = `A student just finished a chemistry practice session. Here's what they got wrong or lost points on:

Missed multiple-choice questions:
${missed.join("\n") || "(none)"}

Free-response rubric parts that lost points:
${weakParts.join("\n") || "(none)"}

${retentionNotes.length > 0 ? `This session also re-asked ${retentionNotes.length} question(s) the student had seen in an earlier session, to check retention:\n${retentionNotes.join("\n")}\n\nIf there's a genuine improvement or regression here, it's worth a brief, specific mention — otherwise don't force it.\n` : ""}
Write brief, warm, encouraging coaching feedback DIRECTLY TO THE STUDENT (second person, "you"). Be specific to their actual mistakes above — reference the real topics/concepts, not generic advice. This is a formative practice tool, not an official grade.

${NOTATION_RULES}

Respond with ONLY a single JSON object, no prose, no markdown fences. Shape: { "whatToImprove": string (2-4 sentences, specific to the topics above), "strategies": string[] (2-4 short, concrete, actionable study strategies) }`;

  try {
    const result = await runModel(prompt, DEFAULT_AI_MODEL, { json: true });
    if (!result.text) return null;
    const raw = JSON.parse(extractJson(result.text));
    const parsed = coachingFeedbackGenSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
