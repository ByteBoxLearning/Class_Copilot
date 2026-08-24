// Pure reporting/aggregation logic — no Prisma, no "server-only". Mirrors
// the mastery-math.ts / grading-math.ts split already used elsewhere: this
// is the formula, src/lib/reports.ts is the data-fetching layer that feeds
// it real rows and is what src/actions/*/pages actually call.

export type MasteryDistribution = { level1: number; level2: number; level3: number; level4: number; noEvidence: number };

// Buckets a flat list of "current level per (student, standard) pair"
// readings into a class-wide histogram. `totalPairs` is
// enrolledStudents × activeStandards — the denominator for "no evidence"
// (pairs with no MasteryEvent at all yet, never zeroed into a level).
export function masteryDistribution(levels: (number | null)[], totalPairs: number): MasteryDistribution {
  const dist: MasteryDistribution = { level1: 0, level2: 0, level3: 0, level4: 0, noEvidence: 0 };
  let withEvidence = 0;
  for (const l of levels) {
    if (l === 1) dist.level1++;
    else if (l === 2) dist.level2++;
    else if (l === 3) dist.level3++;
    else if (l === 4) dist.level4++;
    else continue;
    withEvidence++;
  }
  dist.noEvidence = Math.max(0, totalPairs - withEvidence);
  return dist;
}

export type StandardReinforcement = {
  strugglingCount: number; // level 1 or 2
  masteredCount: number; // level 3 or 4
  noEvidenceCount: number;
  avgLevel: number | null; // mean of students WITH evidence only, null if none
};

// Buckets one standard's list of student levels (nullable) into a
// reinforcement summary — the per-standard breakdown masteryDistribution
// (above) intentionally throws away when it merges every standard into one
// class-wide histogram. Called once per standard by
// reports.ts::standardsNeedingReinforcement.
export function standardReinforcement(levels: (number | null)[]): StandardReinforcement {
  const present = levels.filter((l): l is number => l !== null);
  return {
    strugglingCount: present.filter((l) => l <= 2).length,
    masteredCount: present.filter((l) => l >= 3).length,
    noEvidenceCount: levels.length - present.length,
    avgLevel: present.length > 0 ? present.reduce((s, l) => s + l, 0) / present.length : null,
  };
}

export type EngagementDayPoint = { date: string; percent: number | null; sampleSize: number };

// Turns a flat list of (date, engaged: boolean) rows for a class into one
// point per day. Days with zero logs get percent: null (excluded from any
// trend line, not plotted as 0%) — the same "exclude, don't zero"
// convention used everywhere else engagement feeds a computed number.
export function engagementTrend(rows: { date: string; engaged: boolean }[], dates: string[]): EngagementDayPoint[] {
  const byDate = new Map<string, { engaged: number; total: number }>();
  for (const r of rows) {
    const d = byDate.get(r.date) ?? { engaged: 0, total: 0 };
    d.total++;
    if (r.engaged) d.engaged++;
    byDate.set(r.date, d);
  }
  return dates.map((date) => {
    const d = byDate.get(date);
    if (!d || d.total === 0) return { date, percent: null, sampleSize: 0 };
    return { date, percent: Math.round((d.engaged / d.total) * 100), sampleSize: d.total };
  });
}

export type TrendSuggestion = { suggested: "EXCELLING" | "ON_TRACK" | "NEEDS_SUPPORT"; reason: string } | null;

// A computed, NON-AUTHORITATIVE hint — never auto-applied to Student.flag,
// only ever shown as a chip the teacher can accept or ignore (see
// RosterManager). Two independent signals, each optional (a student with
// only mastery evidence or only engagement logs still gets a suggestion):
//
// Mastery signal: split a student's MasteryEvent levels (oldest to newest,
// across the class's active standards) into an "earlier" and "recent" half
// and compare their averages. Needs >= 3 events to say anything — with
// fewer, a "trend" is just noise.
// Engagement signal: % of days logged ENGAGED in the last 7 days vs the
// 7 days before that. Needs >= 2 logged days in the recent window.
//
// NEEDS_SUPPORT wins if either signal is bad; EXCELLING requires both
// signals (where present) to be good; anything else is ON_TRACK. A student
// with no usable signal at all gets `null` (handled separately as "no
// recent evidence" — see reports.ts::studentsNeedingAttention).
export function computeTrendSuggestion(
  masteryLevelsOldToNew: number[],
  recentEngagedRatio: number | null, // last 7 days, null if < 2 logged days
  priorEngagedRatio: number | null, // the 7 days before that, null if < 2 logged days
): TrendSuggestion {
  let masteryDelta: number | null = null;
  if (masteryLevelsOldToNew.length >= 3) {
    const mid = Math.floor(masteryLevelsOldToNew.length / 2);
    const earlier = masteryLevelsOldToNew.slice(0, mid);
    const recent = masteryLevelsOldToNew.slice(mid);
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    masteryDelta = avg(recent) - avg(earlier);
  }

  const engagementDelta = recentEngagedRatio !== null && priorEngagedRatio !== null ? recentEngagedRatio - priorEngagedRatio : null;

  if (masteryDelta === null && recentEngagedRatio === null) return null;

  const reasons: string[] = [];
  let bad = false;
  let good = true;

  if (masteryDelta !== null) {
    if (masteryDelta <= -0.75) { bad = true; reasons.push("recent mastery evidence is trending down"); }
    else if (masteryDelta < 0.5) good = false;
  } else {
    good = false; // no mastery signal at all — can't call it "excelling" on engagement alone
  }

  if (recentEngagedRatio !== null) {
    if (recentEngagedRatio <= 0.34) { bad = true; reasons.push("mostly distracting in the last week"); }
    else if (recentEngagedRatio < 0.66) good = false;
  } else {
    good = false;
  }

  if (bad) return { suggested: "NEEDS_SUPPORT", reason: reasons.join("; ") };
  if (good) return { suggested: "EXCELLING", reason: "recent mastery and engagement are both trending well" };
  return { suggested: "ON_TRACK", reason: "no strong signal either way recently" };
}
