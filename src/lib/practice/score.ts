import "server-only";
import { runModel } from "@/lib/ai/run-model";
import { extractJson } from "@/lib/ai/json";
import { DEFAULT_AI_MODEL } from "@/lib/ai/engines";
import { frqScoreGenSchema } from "./schemas";
import type { FRQItem, FRQScoreResult } from "./types";

// Grades one FRQ response against its rubric — ported from the standalone
// tool's app/api/score/route.ts, rebuilt on runModel/extractJson (see
// generate.ts for why). Source-agnostic: works identically for AP_CHEM's
// bank/AI-generated FRQs and INTRO_CHEM's originally-authored ones.
export async function scoreFrqResponse(item: FRQItem, responses: string[]): Promise<FRQScoreResult> {
  const partsWithResponses = item.parts.map((part, i) => ({
    label: part.label,
    prompt: part.prompt,
    maxPoints: part.maxPoints,
    studentResponse: responses[i] ?? "",
  }));

  const prompt = `You are grading a student's AP Chemistry free-response answer against a rubric, producing a detailed, part-by-part walkthrough. This is a formative practice tool, not an official grade — be rigorous but fair.

QUESTION STEM:
${item.stem}

REFERENCE WORKED SOLUTION (ground truth):
${item.workedSolution}

RUBRIC:
${JSON.stringify(item.rubric)}

STUDENT'S RESPONSE PER PART:
${JSON.stringify(partsWithResponses)}

Grade each rubric part independently. Important rules:
- Error-carried-forward: for any rubric part marked allowsErrorCarriedForward: true, grade the student's work against THEIR OWN earlier answer (even if wrong), not the absolute ground truth, as long as their method/reasoning is sound given their own prior value. Do not double-penalize one earlier mistake across multiple parts.
- For each part, award pointsAwarded between 0 and maxPoints (partial credit where the rubric criterion allows it), and give reasoning that explains, in the style of an AP reader, what was expected and what the student did (or didn't) demonstrate.
- Set confidence to "low" whenever the student's response is ambiguous, borderline, unusually short/blank, off-topic, or where reasonable graders could disagree; use "high" only when the grading is clear-cut.
- Never fabricate credit for a blank or nonsensical response.

Respond with ONLY a single JSON object, no prose, no markdown fences. Shape: { "partScores": [{ "partLabel": string, "pointsAwarded": number, "maxPoints": number, "confidence": "high"|"medium"|"low", "reasoning": string }] }`;

  const result = await runModel(prompt, DEFAULT_AI_MODEL, { json: true });
  let partScoresRaw: unknown[] = [];
  if (result.text) {
    try {
      const raw = JSON.parse(extractJson(result.text));
      const parsed = frqScoreGenSchema.safeParse(raw);
      if (parsed.success) partScoresRaw = parsed.data.partScores;
    } catch {
      // fall through — empty partScores below reads as "could not be scored"
    }
  }

  const partScores = partScoresRaw.map((p) => {
    const s = p as { partLabel: string; pointsAwarded: number; maxPoints: number; confidence: "high" | "medium" | "low"; reasoning: string };
    return { ...s, pointsAwarded: Math.max(0, Math.min(s.pointsAwarded, s.maxPoints)) };
  });

  const totalAwarded = partScores.reduce((sum, p) => sum + p.pointsAwarded, 0);
  const reviewRecommended = partScores.length === 0 || partScores.some((p) => p.confidence === "low");

  return {
    itemId: item.id,
    partScores,
    totalAwarded,
    totalPossible: item.points,
    reviewRecommended,
  };
}
