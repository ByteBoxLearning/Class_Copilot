// Practice Mode (Milestone K) — types ported from the standalone AP Chem
// Practice tool's lib/types.ts, generalized to carry a `source` taxonomy
// (AP_CHEM | INTRO_CHEM) instead of assuming AP Chem only. FRQ (free-response,
// rubric-graded) content only ever comes from the AP_CHEM bank — the
// INTRO_CHEM bank is MCQ-only (true/false is modelled as a 2-choice MCQItem,
// not a separate type) and never needs AI generation or scoring.

export type UnitSource = "AP_CHEM" | "INTRO_CHEM";

// Optional content-authoring tags (Milestone: richer Intro Chem content).
// Absent on most existing bank items — never required, never assumed present.
export type Difficulty = "beginner" | "intermediate" | "advanced";

export type Unit = {
  id: number;
  title: string;
  examWeighting?: [number, number]; // AP_CHEM only
};

export type MCQItem = {
  id: string;
  unitId: number;
  stem: string;
  choices: string[]; // 2 (true/false-style, INTRO_CHEM) or 4 (AP_CHEM)
  correctIndex: number;
  workedSolution?: string; // AP_CHEM only
  explanation?: string; // why the correct answer is correct / distractors are wrong
  topicTag: string;
  source: "bank" | "generated" | "original" | "tro-testbank";
  difficulty?: Difficulty;
  hints?: string[]; // ordered — revealed one at a time on request, before the explanation
};

export type FRQPart = {
  label: string;
  prompt: string;
  maxPoints: number;
};

export type RubricPart = {
  partLabel: string;
  criterion: string;
  points: number;
  allowsErrorCarriedForward: boolean;
};

export type FRQItem = {
  id: string;
  unitId: number;
  kind: "long" | "short";
  points: 10 | 4;
  stem: string;
  parts: FRQPart[];
  workedSolution: string;
  rubric: RubricPart[];
  source: "bank" | "generated" | "original"; // "original" = hand-authored INTRO_CHEM content, no AI/test-bank involvement
  difficulty?: Difficulty;
  hints?: string[]; // ordered — revealed one at a time on request, before the worked solution
};

export type PracticeConfig = {
  source: UnitSource;
  unitIds: number[];
  mcqCount: number;
  longFrqCount: number; // both sources have bank FRQ content now; AI shortfall top-up is still AP_CHEM only
  shortFrqCount: number;
  timerEnabled: boolean; // AP-exam-pacing timer — AP_CHEM only, always false for INTRO_CHEM
};

export type MCQAnswer = {
  itemId: string;
  selectedIndex: number | null;
};

export type FRQAnswer = {
  itemId: string;
  responses: string[]; // one per part, aligned by index
};

export type RubricPartScore = {
  partLabel: string;
  pointsAwarded: number;
  maxPoints: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
};

export type FRQScoreResult = {
  itemId: string;
  partScores: RubricPartScore[];
  totalAwarded: number;
  totalPossible: number;
  reviewRecommended: boolean;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PracticeSet = {
  config: PracticeConfig;
  mcqItems: MCQItem[];
  frqItems: FRQItem[];
  generationFallbackNotice: string | null;
};

// Per-unit outcome of a submitted attempt — what the student sees on Review,
// and the source data for the PracticeMasteryProposal rows created on submit.
export type UnitResult = {
  unitId: number;
  unitTitle: string;
  scorePercent: number;
  suggestedLevel: 1 | 2 | 3 | 4;
  standardId: string | null; // null if no Standard maps to this unit yet
  standardTitle: string | null;
  proposalId: string | null; // set once the proposal row exists
};

// AI-generated, session-wide coaching feedback (src/lib/practice/coaching.ts)
// — purely advisory, distinct from the per-unit predicted mastery above.
// Null when generation failed or there was nothing to flag (a perfect score).
export type CoachingFeedback = {
  whatToImprove: string;
  strategies: string[];
};
