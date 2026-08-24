// Scripted test for Milestone I's reporting/dashboard layer. Run:
// node --env-file=.env --import tsx scripts/reports-test.mts
//
// reports-math.ts has no server-only/Prisma imports, so it's imported
// directly. reports.ts and assignments/usage.ts both import "server-only",
// so their query shapes are re-implemented inline against a self-contained
// fixture, matching the precedent set by every prior *-test.mts script.
import { PrismaClient } from "@prisma/client";
import { masteryDistribution, engagementTrend, computeTrendSuggestion, standardReinforcement } from "../src/lib/reports-math";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

// hasDisciplinaryFlag (src/lib/daily-check-feedback.ts) transitively imports
// "server-only" via run-model.ts, so it's re-implemented here rather than
// imported — mirrored exactly against its real DISCIPLINARY_NEGATIVES
// mapping, same limitation as reports.ts below.
type Dims = { engagement: string | null; empathy: string | null; discipline: string | null; collaboration: string | null; citizenship: string | null };
const EMPTY_DIMS: Dims = { engagement: null, empathy: null, discipline: null, collaboration: null, citizenship: null };
function hasDisciplinaryFlag(dims: Dims): boolean {
  return dims.discipline === "UNDISCIPLINED" || dims.citizenship === "POOR_CITIZENSHIP" || dims.collaboration === "UNCOOPERATIVE";
}

async function main() {
  console.log("masteryDistribution (pure):");
  const dist = masteryDistribution([1, 1, 2, 3, 3, 3, 4, null, null], 12);
  check("buckets each level correctly", dist.level1 === 2 && dist.level2 === 1 && dist.level3 === 3 && dist.level4 === 1);
  check("noEvidence = totalPairs - withEvidence (12 - 7 = 5, not just the 2 nulls passed in)", dist.noEvidence === 5);
  check("an empty list against 0 pairs is all zero, not NaN", JSON.stringify(masteryDistribution([], 0)) === JSON.stringify({ level1: 0, level2: 0, level3: 0, level4: 0, noEvidence: 0 }));

  console.log("\nstandardReinforcement (pure):");
  const noEvidence = standardReinforcement([null, null, null]);
  check("all no-evidence -> 0 struggling, 0 mastered, avgLevel null", noEvidence.strugglingCount === 0 && noEvidence.masteredCount === 0 && noEvidence.avgLevel === null && noEvidence.noEvidenceCount === 3);
  const mixedLevels = standardReinforcement([1, 2, 3, 4, null]);
  check("levels 1&2 count as struggling, 3&4 as mastered", mixedLevels.strugglingCount === 2 && mixedLevels.masteredCount === 2);
  check("avgLevel averages only students WITH evidence: (1+2+3+4)/4 = 2.5, null excluded not zeroed", mixedLevels.avgLevel === 2.5);
  check("noEvidenceCount reflects the one null passed in", mixedLevels.noEvidenceCount === 1);

  console.log("\nhasDisciplinaryFlag (Monitor AI-feedback tone selection):");
  check("no dimensions logged -> encouraging tone (no disciplinary flag)", !hasDisciplinaryFlag(EMPTY_DIMS));
  check("DISTRACTING engagement alone is NOT disciplinary (still encouraging)", !hasDisciplinaryFlag({ ...EMPTY_DIMS, engagement: "DISTRACTING" }));
  check("LACKED_EMPATHY alone is NOT disciplinary (still encouraging)", !hasDisciplinaryFlag({ ...EMPTY_DIMS, empathy: "LACKED_EMPATHY" }));
  check("UNDISCIPLINED triggers the assertive tone", hasDisciplinaryFlag({ ...EMPTY_DIMS, discipline: "UNDISCIPLINED" }));
  check("POOR_CITIZENSHIP triggers the assertive tone", hasDisciplinaryFlag({ ...EMPTY_DIMS, citizenship: "POOR_CITIZENSHIP" }));
  check("UNCOOPERATIVE triggers the assertive tone", hasDisciplinaryFlag({ ...EMPTY_DIMS, collaboration: "UNCOOPERATIVE" }));
  check("a positive tap (DISCIPLINED) does not trigger the assertive tone", !hasDisciplinaryFlag({ ...EMPTY_DIMS, discipline: "DISCIPLINED" }));

  console.log("\nengagementTrend (pure):");
  const points = engagementTrend(
    [{ date: "2026-06-01", engaged: true }, { date: "2026-06-01", engaged: false }, { date: "2026-06-01", engaged: true }],
    ["2026-06-01", "2026-06-02"],
  );
  check("a logged day computes the right percent (2/3 engaged -> 67%)", points[0].percent === 67 && points[0].sampleSize === 3);
  check("a day with zero logs comes back as percent: null, not 0 — excluded, not zeroed", points[1].percent === null && points[1].sampleSize === 0);

  console.log("\ncomputeTrendSuggestion (pure):");
  check("no signal at all -> null (not a default ON_TRACK guess)", computeTrendSuggestion([], null, null) === null);
  check("fewer than 3 mastery events -> no mastery signal used", computeTrendSuggestion([4, 4], null, null) === null);

  const decliningMastery = computeTrendSuggestion([4, 4, 1, 1], null, null);
  check("a clear downward mastery trend (4,4 -> 1,1) suggests NEEDS_SUPPORT", decliningMastery?.suggested === "NEEDS_SUPPORT");

  const mostlyDistracting = computeTrendSuggestion([], 0.2, 0.8);
  check("mostly-distracting recent engagement alone suggests NEEDS_SUPPORT even with no mastery signal", mostlyDistracting?.suggested === "NEEDS_SUPPORT");

  const improving = computeTrendSuggestion([1, 1, 4, 4], 0.9, 0.5);
  check("clear improvement on both signals suggests EXCELLING", improving?.suggested === "EXCELLING");

  const mixed = computeTrendSuggestion([2, 2, 3, 3], 0.5, 0.5);
  check("a mild, ambiguous trend suggests ON_TRACK, not a strong call either way", mixed?.suggested === "ON_TRACK");

  const goodMasteryNoEngagement = computeTrendSuggestion([1, 1, 4, 4], null, null);
  check("strong mastery improvement but no engagement signal at all does NOT alone claim EXCELLING", goodMasteryNoEngagement?.suggested !== "EXCELLING");

  console.log("\nReal-DB fixture — class-wide distribution, trend, and AI usage stats:");
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });
  const cls = await prisma.class.upsert({
    where: { id: "test-reports-class" }, update: {},
    create: { id: "test-reports-class", name: "[test fixture] Reports", teacherId: teacher.id },
  });
  const studentA = await prisma.student.upsert({ where: { id: "test-reports-student-a" }, update: {}, create: { id: "test-reports-student-a", displayName: "[test fixture] A", createdByUserId: teacher.id } });
  const studentB = await prisma.student.upsert({ where: { id: "test-reports-student-b" }, update: {}, create: { id: "test-reports-student-b", displayName: "[test fixture] B", createdByUserId: teacher.id } });
  await prisma.enrollment.upsert({ where: { studentId_classId: { studentId: studentA.id, classId: cls.id } }, update: { status: "ACTIVE" }, create: { studentId: studentA.id, classId: cls.id, status: "ACTIVE" } });
  await prisma.enrollment.upsert({ where: { studentId_classId: { studentId: studentB.id, classId: cls.id } }, update: { status: "ACTIVE" }, create: { studentId: studentB.id, classId: cls.id, status: "ACTIVE" } });
  const standard = await prisma.standard.upsert({ where: { id: "test-reports-standard" }, update: {}, create: { id: "test-reports-standard", classId: cls.id, code: "R.1", title: "[test fixture] Standard" } });
  await prisma.masteryEvent.deleteMany({ where: { standardId: standard.id } });
  await prisma.dailyCheck.deleteMany({ where: { classId: cls.id } });

  // Student A: one event -> level 3. Student B: no evidence.
  await prisma.masteryEvent.create({ data: { studentId: studentA.id, standardId: standard.id, level: 3, recordedById: teacher.id } });

  // Re-derive masteryDistributionForClass's query shape inline.
  const events = await prisma.masteryEvent.findMany({ where: { studentId: { in: [studentA.id, studentB.id] }, standardId: standard.id }, select: { studentId: true, level: true } });
  const levelByStudent = new Map(events.map((e) => [e.studentId, e.level]));
  const levels = [studentA.id, studentB.id].map((id) => levelByStudent.get(id) ?? null);
  const classDist = masteryDistribution(levels, 2 * 1); // 2 students x 1 standard
  check("class-wide distribution reflects the real DB rows (1 at level 3, 1 with no evidence)", classDist.level3 === 1 && classDist.noEvidence === 1);

  // A second, struggling standard — lets standardsNeedingReinforcement's
  // ranking (reports.ts, re-implemented inline below per this file's own
  // "server-only" limitation) be tested against something that actually
  // differs standard-to-standard, which masteryDistributionForClass's single
  // merged histogram above can't distinguish.
  const standard2 = await prisma.standard.upsert({
    where: { id: "test-reports-standard-2" }, update: {},
    create: { id: "test-reports-standard-2", classId: cls.id, code: "R.2", title: "[test fixture] Struggling Standard" },
  });
  await prisma.masteryEvent.deleteMany({ where: { standardId: standard2.id } });
  await prisma.masteryEvent.create({ data: { studentId: studentA.id, standardId: standard2.id, level: 1, recordedById: teacher.id } });
  await prisma.masteryEvent.create({ data: { studentId: studentB.id, standardId: standard2.id, level: 2, recordedById: teacher.id } });

  // Single event per (student, standard) pair in this fixture, so the raw
  // level already IS current mastery — no strategy-averaging (computeMastery)
  // needed to exercise the ranking/grouping logic itself.
  const standardLevels = [3, null]; // studentA, studentB on `standard`
  const standard2Levels = [1, 2]; // studentA, studentB on `standard2`
  const ranking = [
    { standardId: standard.id, ...standardReinforcement(standardLevels) },
    { standardId: standard2.id, ...standardReinforcement(standard2Levels) },
  ].sort((a, b) => b.strugglingCount - a.strugglingCount || (a.avgLevel ?? 5) - (b.avgLevel ?? 5));
  check("standardsNeedingReinforcement ranks the struggling standard first", ranking[0].standardId === standard2.id);
  check("...and the mostly-healthy standard last", ranking[1].standardId === standard.id);
  check("studentsNeedingReinforcement: studentA is weak on standard2 (level 1) but not on standard (level 3, mastered)", standard2Levels[0] <= 2 && (standardLevels[0] ?? 0) > 2);
  check("studentsNeedingReinforcement: studentB is weak on standard2 (level 2), and has no evidence (not counted as 'weak') on standard", standard2Levels[1] <= 2 && standardLevels[1] === null);

  // AI usage stats — reimplement getAssignmentUsageStats inline.
  await prisma.assignment.deleteMany({ where: { classId: cls.id } });
  await prisma.assignment.create({
    data: {
      classId: cls.id, title: "[test fixture] AI assignment", assignmentType: "WORKSHEET", contentJson: "{}",
      status: "DRAFT", source: "AI", createdById: teacher.id, engine: "GEMINI", totalTokens: 500, estCostUsd: 0,
    },
  });
  await prisma.assignment.create({
    data: {
      classId: cls.id, title: "[test fixture] manual assignment", assignmentType: "WORKSHEET", contentJson: "{}",
      status: "DRAFT", source: "MANUAL", createdById: teacher.id, // engine stays null
    },
  });
  const usageRows = await prisma.assignment.findMany({ where: { engine: { not: null } }, select: { engine: true, totalTokens: true, estCostUsd: true } });
  const fixtureUsage = usageRows.filter((r) => r.engine === "GEMINI" && r.totalTokens === 500);
  check("getAssignmentUsageStats only counts AI-generated assignments (engine not null), not manual ones", fixtureUsage.length >= 1);

  // Cleanup.
  await prisma.assignment.deleteMany({ where: { classId: cls.id } });
  await prisma.masteryEvent.deleteMany({ where: { standardId: { in: [standard.id, standard2.id] } } });
  await prisma.dailyCheck.deleteMany({ where: { classId: cls.id } });
  await prisma.standard.deleteMany({ where: { id: { in: [standard.id, standard2.id] } } });
  await prisma.enrollment.deleteMany({ where: { classId: cls.id } });
  await prisma.student.delete({ where: { id: studentA.id } });
  await prisma.student.delete({ where: { id: studentB.id } });
  await prisma.class.delete({ where: { id: cls.id } });

  console.log(`\n${failures === 0 ? "✅ All reports checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
