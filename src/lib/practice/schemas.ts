// Zod schemas validating AI-generated practice content (AP_CHEM shortfall
// top-up + FRQ scoring) before it's trusted. Ported from the standalone
// tool's lib/schemas.ts, unchanged in shape — only how they're invoked
// differs (runModel + extractJson + .safeParse here, vs. the standalone
// tool's zodOutputFormat structured-output SDK feature — see generate.ts/
// score.ts for why). Deliberately STRICT (safeParse, not the lenient
// shallow-shape check AssignmentDoc parsing uses): an FRQ score becomes a
// PracticeMasteryProposal feeding real (teacher-reviewed) mastery evidence,
// not freely-editable content a human authored — see CONTEXT.md's "who
// authored it" principle.
import { z } from "zod";

export const mcqGenSchema = z.object({
  stem: z.string(),
  choices: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  workedSolution: z.string(),
  explanation: z.string(),
  topicTag: z.string(),
});

export const generateMcqBatchSchema = z.object({
  items: z.array(mcqGenSchema),
});

export const rubricPartGenSchema = z.object({
  partLabel: z.string(),
  criterion: z.string(),
  points: z.number().int().positive(),
  allowsErrorCarriedForward: z.boolean(),
});

export const frqPartGenSchema = z.object({
  label: z.string(),
  prompt: z.string(),
  maxPoints: z.number().int().positive(),
});

export const frqGenSchema = z.object({
  kind: z.enum(["long", "short"]),
  points: z.union([z.literal(10), z.literal(4)]),
  stem: z.string(),
  parts: z.array(frqPartGenSchema),
  workedSolution: z.string(),
  rubric: z.array(rubricPartGenSchema),
});

export const generateFrqBatchSchema = z.object({
  items: z.array(frqGenSchema),
});

export const rubricPartScoreSchema = z.object({
  partLabel: z.string(),
  pointsAwarded: z.number().min(0),
  maxPoints: z.number().positive(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

export const frqScoreGenSchema = z.object({
  partScores: z.array(rubricPartScoreSchema),
});

// Session-wide coaching feedback (src/lib/practice/coaching.ts) — advisory
// only, so validation just needs a sane shape, not the strictness the
// mastery-affecting schemas above have.
export const coachingFeedbackGenSchema = z.object({
  whatToImprove: z.string().min(1),
  strategies: z.array(z.string().min(1)).min(1).max(6),
});
