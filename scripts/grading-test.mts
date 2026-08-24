// Scripted test for the grading-policy calculation. Run:
// node --env-file=.env --import tsx scripts/grading-test.mts
//
// grading-math.ts has no server-only/Prisma imports, so it's imported
// directly. grading.ts (the server-only data-fetching layer) imports
// "server-only", which tsx/plain Node can't resolve — see
// roster-import-test.mts and mastery-test.mts for the same constraint — so
// its query shape is re-implemented here against a fully self-contained
// fixture (its own class/student/standard, cleaned up after) rather than
// depending on live seed data that may have drifted through real usage.
import { PrismaClient } from "@prisma/client";
import {
  levelToPercent, averagePercents, weightedAverage, roundPercent, letterFor,
  type LevelPercentMap,
} from "../src/lib/grading-math";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}
function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

const LP: LevelPercentMap = { "1": 55, "2": 70, "3": 85, "4": 100 };

async function main() {
  console.log("levelToPercent — interpolation:");
  check("exact level 1 -> 55", levelToPercent(1, LP) === 55);
  check("exact level 4 -> 100", levelToPercent(4, LP) === 100);
  check("level 3.33 interpolates between 85 and 100 (89.95)", approx(levelToPercent(3.33, LP), 89.95));
  check("level 1.5 interpolates between 55 and 70 (62.5)", approx(levelToPercent(1.5, LP), 62.5));
  check("clamps below 1 to level-1 percent", levelToPercent(0.2, LP) === 55);
  check("clamps above 4 to level-4 percent", levelToPercent(4.8, LP) === 100);

  console.log("averagePercents:");
  check("empty list -> null", averagePercents([]) === null);
  check("[80, 90, 100] -> 90", averagePercents([80, 90, 100]) === 90);

  console.log("weightedAverage — excludes missing components, never zeros them:");
  const withBothPresent = weightedAverage([{ percent: 90, weight: 70 }, { percent: 80, weight: 30 }]);
  check("both present: 90*0.7 + 80*0.3 = 87", approx(withBothPresent!, 87));
  const engagementMissing = weightedAverage([{ percent: 90, weight: 70 }, { percent: null, weight: 30 }]);
  check("engagement missing -> falls back to mastery-only (90), NOT 90*0.7 (63)", engagementMissing === 90);
  const allMissing = weightedAverage([{ percent: null, weight: 70 }, { percent: null, weight: 30 }]);
  check("everything missing -> null, not 0", allMissing === null);

  console.log("letterFor bands:");
  check("90 -> A", letterFor(90) === "A");
  check("89 -> B", letterFor(89) === "B");
  check("59 -> F", letterFor(59) === "F");

  console.log("roundPercent:");
  check("87.4 -> 87", roundPercent(87.4) === 87);
  check("87.6 -> 88", roundPercent(87.6) === 88);

  console.log("Integration — self-contained fixture (own class/student/standard):");
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });
  const fixtureClass = await prisma.class.upsert({
    where: { id: "test-grading-class" },
    update: {},
    create: { id: "test-grading-class", name: "[test fixture] Grading", teacherId: teacher.id },
  });
  const fixtureStudent = await prisma.student.upsert({
    where: { id: "test-grading-student" },
    update: {},
    create: { id: "test-grading-student", displayName: "[test fixture] Student", createdByUserId: teacher.id },
  });
  await prisma.enrollment.upsert({
    where: { studentId_classId: { studentId: fixtureStudent.id, classId: fixtureClass.id } },
    update: { status: "ACTIVE" },
    create: { studentId: fixtureStudent.id, classId: fixtureClass.id, status: "ACTIVE" },
  });
  const fixtureStandard = await prisma.standard.upsert({
    where: { id: "test-grading-standard" },
    update: {},
    create: { id: "test-grading-standard", classId: fixtureClass.id, title: "[test fixture] Standard" },
  });
  await prisma.masteryEvent.deleteMany({ where: { standardId: fixtureStandard.id } });
  await prisma.dailyCheck.deleteMany({ where: { classId: fixtureClass.id } });

  // Single mastery event at level 4 -> rawAverage = 4 -> 100%.
  await prisma.masteryEvent.create({ data: { studentId: fixtureStudent.id, standardId: fixtureStandard.id, level: 4, recordedById: teacher.id } });
  // 3 engaged days, 1 distracting day -> (100*3 + 50*1)/4 = 87.5%.
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    await prisma.dailyCheck.create({ data: { studentId: fixtureStudent.id, classId: fixtureClass.id, date: d, engagement: "ENGAGED", loggedById: teacher.id } });
  }
  const distractDate = new Date(today.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  await prisma.dailyCheck.create({ data: { studentId: fixtureStudent.id, classId: fixtureClass.id, date: distractDate, engagement: "DISTRACTING", loggedById: teacher.id } });

  // Re-derive the WEIGHTED computation exactly as grading.ts does, against the real rows just written.
  const masteryEvents = await prisma.masteryEvent.findMany({ where: { studentId: fixtureStudent.id, standardId: fixtureStandard.id }, select: { level: true } });
  const masteryRaw = masteryEvents.reduce((a, e) => a + e.level, 0) / masteryEvents.length; // single event, so just its level
  const masteryPercent = levelToPercent(masteryRaw, LP);

  const checks = await prisma.dailyCheck.findMany({ where: { studentId: fixtureStudent.id, classId: fixtureClass.id, engagement: { not: null } }, select: { engagement: true } });
  const engagementValue = { ENGAGED: 100, DISTRACTING: 50 };
  const engagementSum = checks.reduce((a, c) => a + engagementValue[c.engagement as "ENGAGED" | "DISTRACTING"], 0);
  const engagementPercent = engagementSum / checks.length;

  const raw = weightedAverage([{ percent: masteryPercent, weight: 70 }, { percent: engagementPercent, weight: 30 }]);
  const percent = roundPercent(raw!);

  check("mastery percent from a single level-4 event is 100", masteryPercent === 100);
  check("engagement percent from 3 engaged + 1 distracting day is 87.5", approx(engagementPercent, 87.5));
  // 100*0.7 + 87.5*0.3 = 70 + 26.25 = 96.25 -> rounds to 96
  check("70/30 weighted grade against real DB rows matches hand calculation (96%)", percent === 96);
  check("letter for 96% is A", letterFor(percent) === "A");

  // Cleanup — leave no fixture data behind.
  await prisma.dailyCheck.deleteMany({ where: { classId: fixtureClass.id } });
  await prisma.masteryEvent.deleteMany({ where: { standardId: fixtureStandard.id } });
  await prisma.standard.delete({ where: { id: fixtureStandard.id } });
  await prisma.enrollment.deleteMany({ where: { classId: fixtureClass.id } });
  await prisma.student.delete({ where: { id: fixtureStudent.id } });
  await prisma.class.delete({ where: { id: fixtureClass.id } });

  console.log(`\n${failures === 0 ? "✅ All grading checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
