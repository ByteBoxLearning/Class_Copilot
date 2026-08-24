import "server-only";
import { prisma } from "../prisma";
import { computeMastery } from "../mastery-math";
import { getMasteryConfig } from "../mastery";
import {
  DAILY_ENGAGEMENT, DAILY_EMPATHY, DAILY_DISCIPLINE,
  DAILY_COLLABORATION, DAILY_CITIZENSHIP, MASTERY_LEVELS, labelOf, type Option,
} from "../enums";
import { DIMENSION_KEYS, type DimensionKey, type DimensionTally, type StudentTermSummary } from "./format";

export type { DimensionKey, DimensionTally, StudentTermSummary } from "./format";

// Aggregates one student's DailyCheck + MasteryEvent history for a class,
// within an explicit date range, into a plain summary format.ts's pure
// formatters (and the Comments prompt) are built from. Mastery is computed
// from ONLY the evidence within the range (not the student's all-time
// history) — an end-of-term comment should reflect the term, not everything
// that's ever happened in the class.

// First option in each pair is "positive", second is "negative" — the same
// convention DailyCheck's tap-to-cycle UI (roster-monitor.tsx) relies on.
const DIMENSION_OPTIONS: Record<DimensionKey, Option[]> = {
  engagement: DAILY_ENGAGEMENT,
  empathy: DAILY_EMPATHY,
  discipline: DAILY_DISCIPLINE,
  collaboration: DAILY_COLLABORATION,
  citizenship: DAILY_CITIZENSHIP,
};

export async function buildStudentTermSummary(
  studentId: string,
  classId: string,
  from: string,
  to: string,
): Promise<StudentTermSummary> {
  const [student, cls, dailyChecks, standards] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { displayName: true } }),
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    prisma.dailyCheck.findMany({ where: { studentId, classId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } }),
    prisma.standard.findMany({ where: { classId, active: true }, orderBy: [{ order: "asc" }, { title: "asc" }] }),
  ]);

  const dimensionTallies = {} as Record<DimensionKey, DimensionTally>;
  for (const key of DIMENSION_KEYS) {
    const [posOpt, negOpt] = DIMENSION_OPTIONS[key];
    let positive = 0;
    let negative = 0;
    for (const check of dailyChecks) {
      const value = check[key];
      if (value === posOpt.value) positive++;
      else if (value === negOpt.value) negative++;
    }
    dimensionTallies[key] = { positiveLabel: posOpt.label, negativeLabel: negOpt.label, positive, negative };
  }

  const dailyNotes = dailyChecks
    .filter((c): c is typeof c & { note: string } => !!c.note)
    .map((c) => ({ date: c.date, text: c.note }));

  const standardIds = standards.map((s) => s.id);
  const rangeStart = new Date(`${from}T00:00:00`);
  const rangeEnd = new Date(`${to}T23:59:59.999`);
  const events = standardIds.length
    ? await prisma.masteryEvent.findMany({
        where: { studentId, standardId: { in: standardIds }, recordedAt: { gte: rangeStart, lte: rangeEnd } },
        select: { standardId: true, level: true, recordedAt: true, evidenceType: true },
      })
    : [];
  const eventsByStandard = new Map<string, typeof events>();
  for (const e of events) {
    const arr = eventsByStandard.get(e.standardId) ?? [];
    arr.push(e);
    eventsByStandard.set(e.standardId, arr);
  }

  const masteryConfig = standardIds.length ? await getMasteryConfig(classId) : undefined;
  const standardSummaries = standards
    .map((s) => {
      const result = computeMastery(eventsByStandard.get(s.id) ?? [], masteryConfig);
      return {
        code: s.code,
        title: s.title,
        levelLabel: result.level !== null ? labelOf(MASTERY_LEVELS, String(result.level)) : null,
        sampleSize: result.sampleSize,
      };
    })
    .filter((s) => s.sampleSize > 0); // only report standards with evidence IN this range

  return {
    studentName: student.displayName,
    className: cls.name,
    dateRange: `${from} to ${to}`,
    dimensionTallies,
    dailyNotes,
    standards: standardSummaries,
    totalDailyChecks: dailyChecks.length,
  };
}
