import "server-only";
import { prisma } from "./prisma";
import {
  computeMastery,
  DEFAULT_MASTERY_STRATEGY_CONFIG,
  type MasteryResult,
  type MasteryStrategyConfig,
  type MasteryStrategyName,
} from "./mastery-math";

export type { MasteryResult, MasteryStrategyConfig } from "./mastery-math";

type PolicyStrategyRow = { masteryStrategy: string; masteryConfigJson: string | null } | null;

function resolveMasteryConfig(row: PolicyStrategyRow): MasteryStrategyConfig {
  if (!row) return DEFAULT_MASTERY_STRATEGY_CONFIG;
  let parsed: Partial<MasteryStrategyConfig> = {};
  if (row.masteryConfigJson) {
    try {
      parsed = JSON.parse(row.masteryConfigJson);
    } catch {
      // Fall through to defaults — same "bad JSON -> default" posture as getGradingPolicy().
    }
  }
  return {
    ...DEFAULT_MASTERY_STRATEGY_CONFIG,
    ...parsed,
    strategy: (row.masteryStrategy as MasteryStrategyName) || DEFAULT_MASTERY_STRATEGY_CONFIG.strategy,
  };
}

// A class with no GradingPolicy row falls back to RECENCY_WEIGHTED with no
// evidence-type weighting — mastery works with zero setup, same convention
// as getGradingPolicy() in grading.ts.
export async function getMasteryConfig(classId: string): Promise<MasteryStrategyConfig> {
  const row = await prisma.gradingPolicy.findUnique({
    where: { classId },
    select: { masteryStrategy: true, masteryConfigJson: true },
  });
  return resolveMasteryConfig(row);
}

// Current mastery for one (student, standard) pair, under the given class's
// configured strategy. See mastery-math.ts for the four formulas.
export async function currentMasteryFor(studentId: string, standardId: string, classId: string): Promise<MasteryResult> {
  const [events, config] = await Promise.all([
    prisma.masteryEvent.findMany({
      where: { studentId, standardId },
      select: { level: true, recordedAt: true, evidenceType: true },
    }),
    getMasteryConfig(classId),
  ]);
  return computeMastery(events, config);
}

// Bulk variant for a roster-style page: one query for every student against
// a single standard, computed in memory — never call currentMasteryFor in a
// loop over a roster (N+1).
export async function currentMasteryForStudents(
  studentIds: string[],
  standardId: string,
  classId: string,
): Promise<Map<string, MasteryResult>> {
  if (studentIds.length === 0) return new Map();
  const [events, config] = await Promise.all([
    prisma.masteryEvent.findMany({
      where: { studentId: { in: studentIds }, standardId },
      select: { studentId: true, level: true, recordedAt: true, evidenceType: true },
    }),
    getMasteryConfig(classId),
  ]);
  const byStudent = new Map<string, { level: number; recordedAt: Date; evidenceType: string }[]>();
  for (const e of events) {
    const arr = byStudent.get(e.studentId) ?? [];
    arr.push({ level: e.level, recordedAt: e.recordedAt, evidenceType: e.evidenceType });
    byStudent.set(e.studentId, arr);
  }
  const result = new Map<string, MasteryResult>();
  for (const studentId of studentIds) {
    result.set(studentId, computeMastery(byStudent.get(studentId) ?? [], config));
  }
  return result;
}

// Every standard's current mastery for one student — the per-student
// timeline view's summary strip. A student can be enrolled in multiple
// classes with different mastery strategies, so this resolves each event's
// class-specific config rather than assuming one strategy for everything.
export async function currentMasteryForAllStandards(studentId: string): Promise<Map<string, MasteryResult>> {
  const events = await prisma.masteryEvent.findMany({
    where: { studentId },
    select: {
      standardId: true,
      level: true,
      recordedAt: true,
      evidenceType: true,
      standard: { select: { classId: true } },
    },
  });
  if (events.length === 0) return new Map();

  const classIds = [...new Set(events.map((e) => e.standard.classId))];
  const policyRows = await prisma.gradingPolicy.findMany({
    where: { classId: { in: classIds } },
    select: { classId: true, masteryStrategy: true, masteryConfigJson: true },
  });
  const configByClass = new Map<string, MasteryStrategyConfig>();
  for (const classId of classIds) {
    configByClass.set(classId, resolveMasteryConfig(policyRows.find((p) => p.classId === classId) ?? null));
  }

  const byStandard = new Map<string, { events: { level: number; recordedAt: Date; evidenceType: string }[]; classId: string }>();
  for (const e of events) {
    const entry = byStandard.get(e.standardId) ?? { events: [], classId: e.standard.classId };
    entry.events.push({ level: e.level, recordedAt: e.recordedAt, evidenceType: e.evidenceType });
    byStandard.set(e.standardId, entry);
  }

  const result = new Map<string, MasteryResult>();
  for (const [standardId, entry] of byStandard) {
    result.set(standardId, computeMastery(entry.events, configByClass.get(entry.classId)));
  }
  return result;
}
