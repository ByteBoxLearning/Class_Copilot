import "server-only";
import { prisma } from "./prisma";
import { getMasteryConfig } from "./mastery";
import { computeMastery } from "./mastery-math";
import { accessibleStudentIds } from "./access";
import type { SessionUser } from "./auth";
import type { StatScope } from "./queries";
import {
  masteryDistribution, engagementTrend, computeTrendSuggestion, standardReinforcement,
  type MasteryDistribution, type EngagementDayPoint, type TrendSuggestion, type StandardReinforcement,
} from "./reports-math";

// No auth inside this module — same convention as grading.ts/mastery.ts.
// Callers guard with assertCanAccessClass / scope by accessibleStudentIds.

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// One reading (current level, or null = no evidence yet) per (enrolled
// student, active standard) pair, bucketed into a class-wide histogram.
export async function masteryDistributionForClass(classId: string): Promise<MasteryDistribution> {
  const [standards, enrollments] = await Promise.all([
    prisma.standard.findMany({ where: { classId, active: true }, select: { id: true } }),
    prisma.enrollment.findMany({ where: { classId, status: "ACTIVE" }, select: { studentId: true } }),
  ]);
  const studentIds = enrollments.map((e) => e.studentId);
  if (standards.length === 0 || studentIds.length === 0) return { level1: 0, level2: 0, level3: 0, level4: 0, noEvidence: 0 };

  const config = await getMasteryConfig(classId);
  const events = await prisma.masteryEvent.findMany({
    where: { studentId: { in: studentIds }, standardId: { in: standards.map((s) => s.id) } },
    select: { studentId: true, standardId: true, level: true, recordedAt: true, evidenceType: true },
  });
  const byPair = new Map<string, typeof events>();
  for (const e of events) {
    const key = `${e.studentId}:${e.standardId}`;
    const arr = byPair.get(key) ?? [];
    arr.push(e);
    byPair.set(key, arr);
  }

  const levels: (number | null)[] = [];
  for (const studentId of studentIds) {
    for (const s of standards) {
      const result = computeMastery(byPair.get(`${studentId}:${s.id}`) ?? [], config);
      levels.push(result.level);
    }
  }
  return masteryDistribution(levels, studentIds.length * standards.length);
}

type StandardLite = { id: string; code: string | null; title: string };
type LevelRow = { studentId: string; displayName: string; standardId: string; level: number | null };

// Shared by standardsNeedingReinforcement and studentsNeedingReinforcement
// below — both need the exact same per-(student, standard) current level,
// just grouped a different way afterward. Not reused by
// masteryDistributionForClass above (predates this and works fine as-is) to
// avoid touching already-tested code for this addition.
async function currentLevelRows(classId: string): Promise<{ standards: StandardLite[]; rows: LevelRow[] }> {
  const [standards, enrollments] = await Promise.all([
    prisma.standard.findMany({ where: { classId, active: true }, select: { id: true, code: true, title: true } }),
    prisma.enrollment.findMany({ where: { classId, status: "ACTIVE" }, select: { studentId: true, student: { select: { displayName: true } } } }),
  ]);
  if (standards.length === 0 || enrollments.length === 0) return { standards, rows: [] };

  const studentIds = enrollments.map((e) => e.studentId);
  const config = await getMasteryConfig(classId);
  const events = await prisma.masteryEvent.findMany({
    where: { studentId: { in: studentIds }, standardId: { in: standards.map((s) => s.id) } },
    select: { studentId: true, standardId: true, level: true, recordedAt: true, evidenceType: true },
  });
  const byPair = new Map<string, typeof events>();
  for (const e of events) {
    const key = `${e.studentId}:${e.standardId}`;
    const arr = byPair.get(key) ?? [];
    arr.push(e);
    byPair.set(key, arr);
  }

  const rows: LevelRow[] = [];
  for (const e of enrollments) {
    for (const s of standards) {
      const level = computeMastery(byPair.get(`${e.studentId}:${s.id}`) ?? [], config).level;
      rows.push({ studentId: e.studentId, displayName: e.student.displayName, standardId: s.id, level });
    }
  }
  return { standards, rows };
}

export type StandardReinforcementRow = { standardId: string; code: string | null; title: string; totalStudents: number } & StandardReinforcement;

// Which SPECIFIC standards are weakest class-wide, worst first — the detail
// masteryDistributionForClass's single merged histogram can't show (it
// answers "how many readings are at each level," not "which standard those
// readings belong to").
export async function standardsNeedingReinforcement(classId: string): Promise<StandardReinforcementRow[]> {
  const { standards, rows } = await currentLevelRows(classId);
  const totalStudents = new Set(rows.map((r) => r.studentId)).size;
  return standards
    .map((s) => ({
      standardId: s.id,
      code: s.code,
      title: s.title,
      totalStudents,
      ...standardReinforcement(rows.filter((r) => r.standardId === s.id).map((r) => r.level)),
    }))
    .sort((a, b) => b.strugglingCount - a.strugglingCount || (a.avgLevel ?? 5) - (b.avgLevel ?? 5));
}

export type StudentReinforcementRow = {
  studentId: string;
  displayName: string;
  weakStandards: { standardId: string; code: string | null; title: string; level: number }[];
};

// Which enrolled students currently sit at Beginning/Developing on which
// standards, worst-covered students first — the per-student mirror of
// standardsNeedingReinforcement above. Only includes students with at least
// one weak standard (a student with none simply doesn't need this list).
export async function studentsNeedingReinforcement(classId: string): Promise<StudentReinforcementRow[]> {
  const { standards, rows } = await currentLevelRows(classId);
  const standardById = new Map(standards.map((s) => [s.id, s]));
  const byStudent = new Map<string, { displayName: string; weak: LevelRow[] }>();
  for (const r of rows) {
    if (r.level === null || r.level > 2) continue;
    const bucket = byStudent.get(r.studentId) ?? { displayName: r.displayName, weak: [] };
    bucket.weak.push(r);
    byStudent.set(r.studentId, bucket);
  }
  return [...byStudent.entries()]
    .map(([studentId, { displayName, weak }]) => ({
      studentId,
      displayName,
      weakStandards: weak
        .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
        .map((r) => ({
          standardId: r.standardId,
          code: standardById.get(r.standardId)?.code ?? null,
          title: standardById.get(r.standardId)?.title ?? "—",
          level: r.level as number,
        })),
    }))
    .sort((a, b) => b.weakStandards.length - a.weakStandards.length);
}

// One point per day for the last `days` days — % of logged DailyChecks that
// were ENGAGED that day. Days with zero logs come back as percent: null.
export async function engagementTrendForClass(classId: string, days: number): Promise<EngagementDayPoint[]> {
  const since = daysAgo(days - 1);
  const checks = await prisma.dailyCheck.findMany({
    where: { classId, date: { gte: since }, engagement: { not: null } },
    select: { date: true, engagement: true },
  });
  const rows = checks.map((c) => ({ date: c.date, engaged: c.engagement === "ENGAGED" }));
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) dates.push(daysAgo(i));
  return engagementTrend(rows, dates);
}

function ratioInWindow(rows: { date: string; engaged: boolean }[], minInclusive: string, maxExclusive?: string): number | null {
  const inWindow = rows.filter((r) => r.date >= minInclusive && (maxExclusive === undefined || r.date < maxExclusive));
  if (inWindow.length < 2) return null;
  return inWindow.filter((r) => r.engaged).length / inWindow.length;
}

// Computed, non-authoritative trend hints for every enrolled student in a
// class — see reports-math.ts::computeTrendSuggestion for the formula.
export async function trendSuggestionsForClass(classId: string): Promise<Map<string, TrendSuggestion>> {
  const [standards, enrollments] = await Promise.all([
    prisma.standard.findMany({ where: { classId, active: true }, select: { id: true } }),
    prisma.enrollment.findMany({ where: { classId, status: "ACTIVE" }, select: { studentId: true } }),
  ]);
  const studentIds = enrollments.map((e) => e.studentId);
  const standardIds = standards.map((s) => s.id);
  if (studentIds.length === 0) return new Map();

  const [events, checks] = await Promise.all([
    standardIds.length
      ? prisma.masteryEvent.findMany({
          where: { studentId: { in: studentIds }, standardId: { in: standardIds } },
          select: { studentId: true, level: true, recordedAt: true },
          orderBy: { recordedAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.dailyCheck.findMany({
      where: { classId, studentId: { in: studentIds }, engagement: { not: null } },
      select: { studentId: true, date: true, engagement: true },
    }),
  ]);

  const levelsByStudent = new Map<string, number[]>();
  for (const e of events) {
    const arr = levelsByStudent.get(e.studentId) ?? [];
    arr.push(e.level);
    levelsByStudent.set(e.studentId, arr);
  }
  const checksByStudent = new Map<string, { date: string; engaged: boolean }[]>();
  for (const c of checks) {
    const arr = checksByStudent.get(c.studentId) ?? [];
    arr.push({ date: c.date, engaged: c.engagement === "ENGAGED" });
    checksByStudent.set(c.studentId, arr);
  }

  const recentStart = daysAgo(6); // last 7 days, inclusive of today
  const priorStart = daysAgo(13); // the 7 days before that

  const result = new Map<string, TrendSuggestion>();
  for (const studentId of studentIds) {
    const levels = levelsByStudent.get(studentId) ?? [];
    const rows = checksByStudent.get(studentId) ?? [];
    const recentRatio = ratioInWindow(rows, recentStart);
    const priorRatio = ratioInWindow(rows, priorStart, recentStart);
    result.set(studentId, computeTrendSuggestion(levels, recentRatio, priorRatio));
  }
  return result;
}

export type AttentionStudent = { id: string; displayName: string; classId: string; className: string; reason: string };

// Combines three signals into one "who should I check on" list: a manually
// flagged NEEDS_SUPPORT student always wins (a teacher's explicit call
// beats any computed one); otherwise a computed trend suggestion of
// NEEDS_SUPPORT; otherwise a student with no mastery/engagement signal at
// all in the last two weeks — not struggling, just unobserved, which is its
// own kind of "needs attention."
export async function studentsNeedingAttention(user: SessionUser): Promise<AttentionStudent[]> {
  const ids: StatScope = await accessibleStudentIds(user);
  const students = await prisma.student.findMany({
    where: { status: "ACTIVE", ...(ids === "ALL" ? {} : { id: { in: ids } }) },
    select: {
      id: true, displayName: true, flag: true,
      enrollments: { where: { status: "ACTIVE" }, select: { classId: true, class: { select: { name: true } } } },
    },
  });

  const classIds = [...new Set(students.flatMap((s) => s.enrollments.map((e) => e.classId)))];
  const suggestionsByClass = new Map<string, Map<string, TrendSuggestion>>();
  for (const classId of classIds) {
    suggestionsByClass.set(classId, await trendSuggestionsForClass(classId));
  }

  const results: AttentionStudent[] = [];
  for (const s of students) {
    const first = s.enrollments[0];
    if (s.flag === "NEEDS_SUPPORT") {
      results.push({ id: s.id, displayName: s.displayName, classId: first?.classId ?? "", className: first?.class.name ?? "—", reason: "Flagged as needing support" });
      continue;
    }
    let matched = false;
    let anySignal = false;
    for (const e of s.enrollments) {
      const suggestion = suggestionsByClass.get(e.classId)?.get(s.id);
      if (suggestion) anySignal = true;
      if (suggestion?.suggested === "NEEDS_SUPPORT") {
        results.push({ id: s.id, displayName: s.displayName, classId: e.classId, className: e.class.name, reason: `Trend suggests support — ${suggestion.reason}` });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (!anySignal && s.enrollments.length > 0) {
      results.push({ id: s.id, displayName: s.displayName, classId: first.classId, className: first.class.name, reason: "No mastery or engagement evidence logged in the last two weeks" });
    }
  }
  return results;
}

// Per-class "did I check in on [Class] today?" checklist — replaces the
// static DEFAULT_CHECKLIST placeholder (see src/lib/queries.ts), generated
// from the user's actual active classes and read from the same
// ChecklistCompletion rows setDailyCheck/setDailyCheckNote already
// auto-derive (keyed `monitor_${classId}`). Landed in Milestone I instead of
// D as originally sketched — no functional difference, just later.
export async function dailyChecklistFor(userId: string, classes: { id: string; name: string }[]): Promise<{ classId: string; label: string; completed: boolean }[]> {
  if (classes.length === 0) return [];
  const date = daysAgo(0);
  const itemKeys = classes.map((c) => `monitor_${c.id}`);
  const rows = await prisma.checklistCompletion.findMany({
    where: { userId, date, itemKey: { in: itemKeys }, completed: true },
    select: { itemKey: true },
  });
  const doneSet = new Set(rows.map((r) => r.itemKey));
  return classes.map((c) => ({ classId: c.id, label: c.name, completed: doneSet.has(`monitor_${c.id}`) }));
}
