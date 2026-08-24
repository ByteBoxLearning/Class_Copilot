import "server-only";
import { prisma } from "./prisma";
import { currentMasteryForStudents } from "./mastery";
import { engagementPercentForStudents } from "./engagement";
import {
  levelToPercent, averagePercents, weightedAverage, roundPercent, letterFor,
  type LevelPercentMap, type EngagementValueMap,
} from "./grading-math";
import { DEFAULT_LEVEL_PERCENT, DEFAULT_ENGAGEMENT_VALUE } from "./enums";

// No auth inside this module — same convention as src/lib/queries.ts.
// Callers guard with assertCanAccessClass before calling in here.

export type GradeComponentKey = "MASTERY" | "ENGAGEMENT" | "POINTS";
export type GradeComponent = {
  key: GradeComponentKey;
  label: string;
  weight: number;
  percent: number | null;
  sampleSize: number;
  note?: string;
};
export type GradeResult = {
  percent: number | null;
  letter: string | null;
  policyType: string;
  components: GradeComponent[];
  missing: string[];
  computedAt: Date;
};

export type ResolvedPolicy = {
  type: string;
  levelPercent: LevelPercentMap;
  minEvents: number;
  masteryWeight: number;
  engagementWeight: number;
  engagementValue: EngagementValueMap;
  windowDays: number | null;
};

function defaultPolicy(): ResolvedPolicy {
  return {
    type: "STANDARDS_ONLY",
    levelPercent: DEFAULT_LEVEL_PERCENT,
    minEvents: 1,
    masteryWeight: 70,
    engagementWeight: 30,
    engagementValue: DEFAULT_ENGAGEMENT_VALUE,
    windowDays: null,
  };
}

// A class with no GradingPolicy row falls back to this default — grading
// works with zero setup.
export async function getGradingPolicy(classId: string): Promise<ResolvedPolicy> {
  const row = await prisma.gradingPolicy.findUnique({ where: { classId } });
  if (!row) return defaultPolicy();
  try {
    const config = JSON.parse(row.configJson);
    return { ...defaultPolicy(), ...config, type: row.type };
  } catch {
    return defaultPolicy();
  }
}

// Average mastery percent per student across the class's active standards.
// A standard only counts toward a student's average once it has at least
// `minEvents` MasteryEvents — standards with zero evidence are excluded, not
// zeroed. One query per standard (not per student×standard) via the bulk
// currentMasteryForStudents.
async function masteryComponentForStudents(
  studentIds: string[],
  classId: string,
  policy: ResolvedPolicy,
): Promise<Map<string, { percent: number | null; sampleSize: number }>> {
  const standards = await prisma.standard.findMany({ where: { classId, active: true }, select: { id: true } });
  const accum = new Map<string, { percents: number[]; sampleSize: number }>();
  for (const id of studentIds) accum.set(id, { percents: [], sampleSize: 0 });

  for (const standard of standards) {
    const masteryMap = await currentMasteryForStudents(studentIds, standard.id, classId);
    for (const studentId of studentIds) {
      const m = masteryMap.get(studentId);
      if (!m || m.level === null || m.sampleSize < policy.minEvents) continue;
      const entry = accum.get(studentId)!;
      entry.percents.push(levelToPercent(m.rawAverage!, policy.levelPercent));
      entry.sampleSize += m.sampleSize;
    }
  }

  const result = new Map<string, { percent: number | null; sampleSize: number }>();
  for (const [studentId, entry] of accum) {
    result.set(studentId, { percent: averagePercents(entry.percents), sampleSize: entry.sampleSize });
  }
  return result;
}

// The bulk/roster path — never call computeGrade in a loop over a class
// (N+1); this does a fixed number of queries regardless of roster size.
export async function computeGradesForClass(classId: string): Promise<Map<string, GradeResult>> {
  const policy = await getGradingPolicy(classId);
  const enrollments = await prisma.enrollment.findMany({ where: { classId, status: "ACTIVE" }, select: { studentId: true } });
  const studentIds = enrollments.map((e) => e.studentId);
  const results = new Map<string, GradeResult>();
  if (studentIds.length === 0) return results;

  const masteryMap = await masteryComponentForStudents(studentIds, classId, policy);
  const engagementMap =
    policy.type === "WEIGHTED"
      ? await engagementPercentForStudents(studentIds, classId, policy.engagementValue, policy.windowDays)
      : new Map<string, { percent: number | null; sampleSize: number }>();

  for (const studentId of studentIds) {
    const mastery = masteryMap.get(studentId) ?? { percent: null, sampleSize: 0 };
    const missing: string[] = [];
    const components: GradeComponent[] = [];

    if (policy.type === "WEIGHTED") {
      const engagement = engagementMap.get(studentId) ?? { percent: null, sampleSize: 0 };
      components.push({ key: "MASTERY", label: "Standards mastery", weight: policy.masteryWeight, percent: mastery.percent, sampleSize: mastery.sampleSize });
      components.push({ key: "ENGAGEMENT", label: "Engagement", weight: policy.engagementWeight, percent: engagement.percent, sampleSize: engagement.sampleSize });
      if (mastery.percent === null) missing.push("No mastery evidence recorded yet.");
      if (engagement.percent === null) missing.push("No engagement checks logged yet.");
      const raw = weightedAverage(components);
      const percent = raw !== null ? roundPercent(raw) : null;
      results.set(studentId, { percent, letter: percent !== null ? letterFor(percent) : null, policyType: policy.type, components, missing, computedAt: new Date() });
      continue;
    }

    if (policy.type === "POINTS") {
      results.set(studentId, {
        percent: null,
        letter: null,
        policyType: policy.type,
        components: [{ key: "POINTS", label: "Points-based", weight: 100, percent: null, sampleSize: 0, note: "Points-based grading isn't available yet." }],
        missing: ["Points-based grading isn't available yet."],
        computedAt: new Date(),
      });
      continue;
    }

    // STANDARDS_ONLY (also the fallback for an unrecognized type).
    components.push({ key: "MASTERY", label: "Standards mastery", weight: 100, percent: mastery.percent, sampleSize: mastery.sampleSize });
    if (mastery.percent === null) missing.push("No mastery evidence recorded yet.");
    const percent = mastery.percent !== null ? roundPercent(mastery.percent) : null;
    results.set(studentId, { percent, letter: percent !== null ? letterFor(percent) : null, policyType: policy.type, components, missing, computedAt: new Date() });
  }

  return results;
}

// Single-student convenience wrapper. Computes the whole class (typical
// rosters are small — a few dozen students at most for one teacher), so this
// is fine for a student-detail-page call; avoid calling it in a loop.
export async function computeGrade(studentId: string, classId: string): Promise<GradeResult> {
  const map = await computeGradesForClass(classId);
  return (
    map.get(studentId) ?? {
      percent: null,
      letter: null,
      policyType: "STANDARDS_ONLY",
      components: [],
      missing: ["Student is not actively enrolled in this class."],
      computedAt: new Date(),
    }
  );
}
