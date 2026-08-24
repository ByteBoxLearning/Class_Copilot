// Scripted test for the recency-weighted mastery calculation. Run:
// node --env-file=.env --import tsx scripts/mastery-test.mts
//
// computeMastery (mastery-math.ts) has no server-only/Prisma imports, so it's
// imported directly. The Prisma-backed wrappers in mastery.ts import
// "server-only" (a Next.js bundler-time guard tsx/plain Node can't resolve —
// see roster-import-test.mts), so their query shape is re-implemented here
// inline, matching isolation-test.mts's established precedent.
import { PrismaClient } from "@prisma/client";
import { computeMastery, type MasteryStrategyConfig } from "../src/lib/mastery-math";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}
function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) < eps;
}

async function main() {
  console.log("Pure weighting formula:");
  check("no events -> null", computeMastery([]).level === null);

  const d = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000);
  // Oldest first: level 2, 2, 4 (most recent). Weights 1,2,3 (oldest->newest).
  // Weighted avg = (2*1 + 2*2 + 4*3) / (1+2+3) = (2+4+12)/6 = 18/6 = 3.0
  const rising = computeMastery([{ level: 2, recordedAt: d(10) }, { level: 2, recordedAt: d(5) }, { level: 4, recordedAt: d(1) }]);
  check("a rising trend (2,2,4) weighs the recent 4 more heavily than a flat average would (avg=2.67)", approx(rising.rawAverage!, 3.0));
  check("rounds to level 3", rising.level === 3);

  // A single early high mark (4) followed by later lower marks (2,2) should
  // pull the current level down — recent events count more — but the early
  // 4 still nudges the average up slightly versus a pure "most-recent-only"
  // read of 2. Weighted avg = (4*1 + 2*2 + 2*3) / 6 = (4+4+6)/6 = 14/6 = 2.33
  const falling = computeMastery([{ level: 4, recordedAt: d(10) }, { level: 2, recordedAt: d(5) }, { level: 2, recordedAt: d(1) }]);
  check("a falling trend (4,2,2) still shows real regression (avg=2.33, not stuck at the old high)", approx(falling.rawAverage!, 2.33));
  check("history still 'helps build' the average vs. a pure most-recent read of 2", falling.rawAverage! > 2);

  check("order in the input array doesn't matter — sorted internally by recordedAt", approx(
    computeMastery([{ level: 4, recordedAt: d(1) }, { level: 2, recordedAt: d(10) }, { level: 2, recordedAt: d(5) }]).rawAverage!,
    rising.rawAverage!,
  ));

  console.log("Alternate mastery strategies:");
  const cfg = (overrides: Partial<MasteryStrategyConfig>): MasteryStrategyConfig => ({
    strategy: "RECENCY_WEIGHTED", decayRate: 0.35, windowSize: 3, evidenceWeights: {}, ...overrides,
  });

  // Oldest->newest: 2, 4, 2. Decay 0.5: start 2; ->*0.5+4*0.5=3; ->*0.5+2*0.5=2.5.
  const decaying = computeMastery(
    [{ level: 2, recordedAt: d(10) }, { level: 4, recordedAt: d(5) }, { level: 2, recordedAt: d(1) }],
    cfg({ strategy: "DECAYING_AVERAGE", decayRate: 0.5 }),
  );
  check("decaying average (rate 0.5) of 2,4,2 -> 2.5", approx(decaying.rawAverage!, 2.5));
  check("decaying average rounds 2.5 up to level 3", decaying.level === 3);

  // Oldest->newest: 2, 3, 4. Window of last 2 (3,4) -> avg 3.5.
  const recentN = computeMastery(
    [{ level: 2, recordedAt: d(10) }, { level: 3, recordedAt: d(5) }, { level: 4, recordedAt: d(1) }],
    cfg({ strategy: "MOST_RECENT_N", windowSize: 2 }),
  );
  check("most-recent-2 average of 2,3,4 ignores the oldest event -> 3.5", approx(recentN.rawAverage!, 3.5));
  check("older-but-higher event (2) doesn't drag down most-recent-N the way it would recency-weighted", recentN.rawAverage! > 3);

  // Same data, highest-of-recent-2 -> best of (3,4) = 4.
  const highestN = computeMastery(
    [{ level: 2, recordedAt: d(10) }, { level: 3, recordedAt: d(5) }, { level: 4, recordedAt: d(1) }],
    cfg({ strategy: "HIGHEST_RECENT_N", windowSize: 2 }),
  );
  check("highest-of-recent-2 picks the best recent level (4), not an average", highestN.rawAverage === 4);

  console.log("Evidence-type weighting (does homework count the same as a quiz?):");
  // Quiz=2 (oldest), Homework=4 (newest). Weighting homework to 0 should
  // fully exclude it -> the average is just the quiz's level, 2 — not the
  // recency-weighted 3.33 it would be if homework counted equally.
  const homeworkExcluded = computeMastery(
    [{ level: 2, recordedAt: d(10), evidenceType: "QUIZ" }, { level: 4, recordedAt: d(1), evidenceType: "HOMEWORK" }],
    cfg({ evidenceWeights: { HOMEWORK: 0 } }),
  );
  check("weighting HOMEWORK to 0 excludes it entirely (avg = quiz-only 2, not 3.33)", homeworkExcluded.rawAverage === 2);

  // Decaying average where a quiz moves the average more than homework does.
  // Quiz=2 (start) -> Homework=4 (weight 0.5, d=0.2): 2*0.8+4*0.2=2.4 ->
  // Quiz=1 (weight 2, d=0.8): 2.4*0.2+1*0.8=1.28.
  const weightedDecay = computeMastery(
    [
      { level: 2, recordedAt: d(10), evidenceType: "QUIZ" },
      { level: 4, recordedAt: d(5), evidenceType: "HOMEWORK" },
      { level: 1, recordedAt: d(1), evidenceType: "QUIZ" },
    ],
    cfg({ strategy: "DECAYING_AVERAGE", decayRate: 0.4, evidenceWeights: { QUIZ: 2, HOMEWORK: 0.5 } }),
  );
  check("a quiz moves the decaying average more than an equally-recent homework check would", approx(weightedDecay.rawAverage!, 1.28));

  console.log("Against real seed data (Ava Thompson, Math — Period 3):");
  const ava = await prisma.student.findFirstOrThrow({ where: { displayName: { startsWith: "Ava" } } });
  const classP3 = await prisma.class.findFirstOrThrow({ where: { name: "Math — Period 3" } });
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });

  const standard = await prisma.standard.upsert({
    where: { id: "test-standard-fixture" },
    update: {},
    create: { id: "test-standard-fixture", classId: classP3.id, code: "TEST.1", title: "[test fixture] Solves linear equations" },
  });
  await prisma.masteryEvent.deleteMany({ where: { studentId: ava.id, standardId: standard.id } });

  await prisma.masteryEvent.create({ data: { studentId: ava.id, standardId: standard.id, level: 2, evidenceType: "QUIZ", recordedById: teacher.id, recordedAt: d(14) } });
  await prisma.masteryEvent.create({ data: { studentId: ava.id, standardId: standard.id, level: 3, evidenceType: "HOMEWORK", recordedById: teacher.id, recordedAt: d(7) } });
  await prisma.masteryEvent.create({ data: { studentId: ava.id, standardId: standard.id, level: 4, evidenceType: "RETAKE", recordedById: teacher.id, recordedAt: d(1) } });

  const events = await prisma.masteryEvent.findMany({ where: { studentId: ava.id, standardId: standard.id }, select: { level: true, recordedAt: true } });
  const result = computeMastery(events);
  check("3 real events retrieved", result.sampleSize === 3);
  // (2*1 + 3*2 + 4*3) / 6 = (2+6+12)/6 = 20/6 = 3.33
  check("weighted average against real DB rows matches hand calculation (3.33)", approx(result.rawAverage!, 3.33));
  check("rounds to Proficient (3)", result.level === 3);

  await prisma.masteryEvent.deleteMany({ where: { standardId: standard.id } });
  await prisma.standard.delete({ where: { id: standard.id } });

  console.log(`\n${failures === 0 ? "✅ All mastery checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
