// Pure mastery-calculation logic — no Prisma, no "server-only", so it's
// importable both from src/lib/mastery.ts (the server-only data-fetching
// layer), the grading-policy settings UI's live preview panel, and directly
// from test scripts (which can't resolve the "server-only" package the way
// Next.js's bundler does — see scripts/mastery-test.mts). Mirrors the
// engines.ts (client-safe) vs settings.ts (server-only) split already used
// elsewhere in this app.

export type MasteryEventLike = { level: number; recordedAt: Date | string; evidenceType?: string };

export type MasteryResult = {
  level: number | null; // rounded 1-4, or null if no events yet
  rawAverage: number | null; // unrounded result of whichever strategy ran
  sampleSize: number;
  lastEventAt: Date | null;
};

// Four models for turning a MasteryEvent history into "current mastery" —
// researched from common standards-based-grading (SBG) practice. All but
// RECENCY_WEIGHTED are opt-in per class (see GradingPolicy.masteryStrategy).
export type MasteryStrategyName = "RECENCY_WEIGHTED" | "DECAYING_AVERAGE" | "MOST_RECENT_N" | "HIGHEST_RECENT_N";

// Per-evidenceType multiplier (e.g. QUIZ vs HOMEWORK). Unlisted types default
// to 1. Setting a type to 0 excludes it from the grade entirely — the
// "purist SBG" stance that homework/observation shouldn't count toward a
// summative grade, made a config choice instead of a hardcoded rule.
export type EvidenceWeightMap = Partial<Record<string, number>>;

export type MasteryStrategyConfig = {
  strategy: MasteryStrategyName;
  decayRate: number; // DECAYING_AVERAGE only — how hard each new event pulls the running average toward itself, 0-1
  windowSize: number; // MOST_RECENT_N / HIGHEST_RECENT_N only — how many of the latest events are considered
  evidenceWeights: EvidenceWeightMap;
};

export const DEFAULT_MASTERY_STRATEGY_CONFIG: MasteryStrategyConfig = {
  strategy: "RECENCY_WEIGHTED",
  decayRate: 0.35,
  windowSize: 3,
  evidenceWeights: {},
};

function weightOf(evidenceType: string | undefined, weights: EvidenceWeightMap): number {
  if (!evidenceType) return 1;
  return weights[evidenceType] ?? 1;
}

// "Current mastery" for a (student, standard) pair, computed from its full
// append-only MasteryEvent history under whichever strategy the class has
// configured (default: RECENCY_WEIGHTED, confirmed with Jordi 2026-08-07).
export function computeMastery(
  events: MasteryEventLike[],
  config: MasteryStrategyConfig = DEFAULT_MASTERY_STRATEGY_CONFIG,
): MasteryResult {
  if (events.length === 0) return { level: null, rawAverage: null, sampleSize: 0, lastEventAt: null };

  const sorted = [...events].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );
  const sampleSize = sorted.length;
  const lastEventAt = new Date(sorted[sorted.length - 1].recordedAt);

  let rawAverage: number;

  switch (config.strategy) {
    case "DECAYING_AVERAGE": {
      // Marzano-style decaying average: new_mastery = old*(1-d) + latest*d.
      // `d` is `decayRate` scaled by the new event's evidence-type weight, so
      // a quiz moves the average more than a hallway conversation does.
      // Starts from the first event as-is (nothing to decay toward yet).
      let running = sorted[0].level;
      for (let i = 1; i < sorted.length; i++) {
        const d = Math.min(1, Math.max(0, config.decayRate * weightOf(sorted[i].evidenceType, config.evidenceWeights)));
        running = running * (1 - d) + sorted[i].level * d;
      }
      rawAverage = running;
      break;
    }
    case "MOST_RECENT_N": {
      // Purist mastery-learning stance: only the last N pieces of evidence
      // count at all — once enough recent evidence exists, older struggles
      // stop counting rather than fading gradually. Evidence-type weight
      // still applies within the window.
      const window = sorted.slice(-Math.max(1, Math.round(config.windowSize)));
      let sum = 0, weightTotal = 0;
      for (const e of window) {
        const w = weightOf(e.evidenceType, config.evidenceWeights);
        sum += e.level * w;
        weightTotal += w;
      }
      rawAverage = weightTotal > 0 ? sum / weightTotal : window.reduce((a, e) => a + e.level, 0) / window.length;
      break;
    }
    case "HIGHEST_RECENT_N": {
      // Retake-friendly: the best level demonstrated within the last N
      // pieces of evidence wins outright. Evidence-type weight doesn't apply
      // here — this strategy asks "did they ever prove it recently," not
      // "how reliable was each proof."
      const window = sorted.slice(-Math.max(1, Math.round(config.windowSize)));
      rawAverage = Math.max(...window.map((e) => e.level));
      break;
    }
    case "RECENCY_WEIGHTED":
    default: {
      // Oldest event gets position-weight 1, each subsequent +1 (most recent
      // = n), further scaled by evidence-type weight — a simple, explainable
      // linear recency lean rather than an opaque exponential decay. The
      // most recent assessment counts for more, but the whole history still
      // "builds" the average rather than being discarded.
      let weightedSum = 0, weightTotal = 0;
      sorted.forEach((e, i) => {
        const weight = (i + 1) * weightOf(e.evidenceType, config.evidenceWeights);
        weightedSum += e.level * weight;
        weightTotal += weight;
      });
      rawAverage = weightTotal > 0 ? weightedSum / weightTotal : sorted.reduce((a, e) => a + e.level, 0) / sorted.length;
      break;
    }
  }

  const level = Math.min(4, Math.max(1, Math.round(rawAverage)));
  return { level, rawAverage, sampleSize, lastEventAt };
}

// Buckets a student's own standards into "areas to improve" vs "areas
// mastered" for the student portal (Milestone P's /portal/mastery, and the
// dashboard's "How can I improve?" summary). "Areas to improve" prefers real
// Beginning/Developing standards; with none, it falls back to the student's
// own lowest-scoring MASTERED standards instead of showing nothing — there's
// always somewhere to focus next, even for a student doing well everywhere.
// Those fallback picks are excluded from "mastered" so the same standard
// never appears twice.
export function pickAreasToImprove<T extends { level: number | null; rawAverage: number | null }>(
  standards: T[],
): { improve: T[]; mastered: T[]; usingFallback: boolean } {
  const struggling = standards
    .filter((s) => s.level !== null && s.level <= 2)
    .sort((a, b) => (a.rawAverage ?? 0) - (b.rawAverage ?? 0));
  const masteredAll = standards
    .filter((s) => s.level !== null && s.level >= 3)
    .sort((a, b) => (b.rawAverage ?? 0) - (a.rawAverage ?? 0));

  const usingFallback = struggling.length === 0 && masteredAll.length > 0;
  const improve = struggling.length > 0 ? struggling : masteredAll.slice(-3).reverse();
  const mastered = usingFallback ? masteredAll.slice(0, Math.max(0, masteredAll.length - 3)) : masteredAll;
  return { improve, mastered, usingFallback };
}
