import "server-only";
import { prisma } from "./prisma";
import type { EngagementValueMap } from "./grading-math";

// Feeds the WEIGHTED grading preset's engagement component from the
// already-built DailyCheck.engagement data (see /classes/monitor). Unlogged
// days are EXCLUDED from the average, never counted as a zero — the Monitor
// page is blank-by-default, so silence means "not observed," not
// "misbehaved." A class with zero engagement logs correctly yields
// { percent: null, sampleSize: 0 }, not a punishing 0%.
export async function engagementPercentFor(
  studentId: string,
  classId: string,
  valueMap: EngagementValueMap,
  windowDays: number | null = null,
): Promise<{ percent: number | null; sampleSize: number }> {
  const rows = await prisma.dailyCheck.findMany({
    where: {
      studentId,
      classId,
      engagement: { not: null },
      ...(windowDays ? { date: { gte: windowStart(windowDays) } } : {}),
    },
    select: { engagement: true },
  });
  return summarize(rows.map((r) => r.engagement as "ENGAGED" | "DISTRACTING"), valueMap);
}

// Bulk variant for a roster/class-wide compute — one query for every
// enrolled student rather than N+1.
export async function engagementPercentForStudents(
  studentIds: string[],
  classId: string,
  valueMap: EngagementValueMap,
  windowDays: number | null = null,
): Promise<Map<string, { percent: number | null; sampleSize: number }>> {
  if (studentIds.length === 0) return new Map();
  const rows = await prisma.dailyCheck.findMany({
    where: {
      studentId: { in: studentIds },
      classId,
      engagement: { not: null },
      ...(windowDays ? { date: { gte: windowStart(windowDays) } } : {}),
    },
    select: { studentId: true, engagement: true },
  });
  const byStudent = new Map<string, ("ENGAGED" | "DISTRACTING")[]>();
  for (const r of rows) {
    const arr = byStudent.get(r.studentId) ?? [];
    arr.push(r.engagement as "ENGAGED" | "DISTRACTING");
    byStudent.set(r.studentId, arr);
  }
  const result = new Map<string, { percent: number | null; sampleSize: number }>();
  for (const studentId of studentIds) {
    result.set(studentId, summarize(byStudent.get(studentId) ?? [], valueMap));
  }
  return result;
}

function windowStart(days: number): string {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

function summarize(values: ("ENGAGED" | "DISTRACTING")[], valueMap: EngagementValueMap): { percent: number | null; sampleSize: number } {
  if (values.length === 0) return { percent: null, sampleSize: 0 };
  const sum = values.reduce((a, v) => a + valueMap[v], 0);
  return { percent: sum / values.length, sampleSize: values.length };
}
