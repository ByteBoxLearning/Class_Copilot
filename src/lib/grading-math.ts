// Pure grade-calculation arithmetic — no Prisma, no "server-only". Imported
// by both src/lib/grading.ts (the server-only data-fetching layer) and the
// grading-policy settings UI's live preview panel, so the preview and the
// real computed grade always use the exact same formula. Mirrors the
// mastery-math.ts (pure) vs mastery.ts (server-only) split.

export type LevelPercentMap = Record<"1" | "2" | "3" | "4", number>;
export type EngagementValueMap = Record<"ENGAGED" | "DISTRACTING", number>;

// Maps a (possibly fractional) recency-weighted mastery level — e.g. 3.33 —
// onto a percent, by linearly interpolating between the two nearest integer
// levels' configured percentages. With the default 55/70/85/100 mapping
// (uniform 15-point gaps), this is equivalent to simple linear scaling; with
// a custom non-uniform mapping it stays a reasonable piecewise-linear
// approximation rather than crudely rounding to the nearest level first.
export function levelToPercent(rawLevel: number, levelPercent: LevelPercentMap): number {
  const clamped = Math.min(4, Math.max(1, rawLevel));
  const floor = Math.floor(clamped) as 1 | 2 | 3 | 4;
  const ceil = Math.ceil(clamped) as 1 | 2 | 3 | 4;
  const floorPct = levelPercent[String(floor) as "1" | "2" | "3" | "4"];
  if (floor === ceil) return floorPct;
  const ceilPct = levelPercent[String(ceil) as "1" | "2" | "3" | "4"];
  const frac = clamped - floor;
  return floorPct + (ceilPct - floorPct) * frac;
}

// Inverse of levelToPercent — used by Practice Mode (Milestone K) to turn an
// auto-graded practice score percent into a suggested 1-4 mastery level, via
// the SAME per-class level1..4 bands a teacher already configures for real
// grading, rather than a second, possibly-inconsistent threshold system.
export function percentToLevel(percent: number, levelPercent: LevelPercentMap): 1 | 2 | 3 | 4 {
  if (percent >= levelPercent["4"]) return 4;
  if (percent >= levelPercent["3"]) return 3;
  if (percent >= levelPercent["2"]) return 2;
  return 1;
}

export function averagePercents(percents: number[]): number | null {
  if (percents.length === 0) return null;
  return percents.reduce((a, b) => a + b, 0) / percents.length;
}

// Weighted average across components that have data (percent !== null).
// Components with no data are excluded from both the numerator and the
// weight total, rather than treated as 0 — so a class with only mastery
// evidence and zero engagement logs still gets a fair mastery-only grade
// instead of being dragged down by a phantom 0% engagement score.
export function weightedAverage(components: { percent: number | null; weight: number }[]): number | null {
  const usable = components.filter((c): c is { percent: number; weight: number } => c.percent !== null && c.weight > 0);
  const totalWeight = usable.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return null;
  return usable.reduce((a, c) => a + c.percent * c.weight, 0) / totalWeight;
}

export function roundPercent(percent: number): number {
  return Math.round(percent);
}

export function letterFor(percent: number): string {
  if (percent >= 90) return "A";
  if (percent >= 80) return "B";
  if (percent >= 70) return "C";
  if (percent >= 60) return "D";
  return "F";
}
