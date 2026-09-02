// Scripted test for Practice Mode (Milestone K). Run:
// node --env-file=.env --import tsx scripts/practice-test.mts
//
// grading-math.ts (percentToLevel) has no server-only/Prisma imports, so
// it's imported directly. mastery-map.ts and the practice actions all import
// "server-only" (the same Next.js bundler-time guard tsx/plain Node can't
// resolve — see mastery-test.mts's precedent), so their logic/query shapes
// are re-implemented here inline rather than imported.
import { PrismaClient } from "@prisma/client";
import { percentToLevel, type LevelPercentMap } from "../src/lib/grading-math";
import { renderChemText } from "../src/lib/practice/chem-text";
import { selectWithRetention } from "../src/lib/practice/bank";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

const DEFAULT_BANDS: LevelPercentMap = { "1": 55, "2": 70, "3": 85, "4": 100 };

// Mirrors mastery-map.ts's computeUnitScorePercent exactly (pure logic,
// re-implemented here per the "server-only" import limitation above).
type MCQLike = { id: string; correctIndex: number };
type Answer = { selectedIndex: number | null };
function computeUnitScorePercent(mcqItems: MCQLike[], mcqAnswers: Record<string, Answer>): number | null {
  let earned = 0, possible = 0;
  for (const item of mcqItems) {
    possible += 1;
    const answer = mcqAnswers[item.id];
    if (answer && answer.selectedIndex === item.correctIndex) earned += 1;
  }
  if (possible === 0) return null;
  return (earned / possible) * 100;
}

// Mirrors mastery-map.ts's computeUnitResults algorithm (partial standards
// pool only their own question-id subset; a solo unscoped standard gets the
// whole unit; 2+ unscoped standards sharing a unit leave that evidence
// unattributed rather than guessing) — MCQ-only, since that's all this test
// needs to exercise the grouping logic itself.
type InlineMatch = { id: string; questionIds: Set<string> | null };
function computeUnitResultsInlineMCQOnly(
  items: MCQLike[],
  answers: Record<string, Answer>,
  matches: InlineMatch[],
): { standardId: string | null; scorePercent: number }[] {
  const partials = matches.filter((m) => m.questionIds !== null && m.questionIds.size > 0);
  const unscoped = matches.filter((m) => !m.questionIds || m.questionIds.size === 0);
  const wholeUnit = partials.length === 0 && unscoped.length === 1 ? unscoped[0] : null;

  const results: { standardId: string | null; scorePercent: number }[] = [];
  const claimed = new Set<string>();
  for (const m of partials) {
    const subset = items.filter((i) => m.questionIds!.has(i.id));
    if (subset.length === 0) continue;
    for (const i of subset) claimed.add(i.id);
    const percent = computeUnitScorePercent(subset, answers);
    if (percent !== null) results.push({ standardId: m.id, scorePercent: percent });
  }
  const leftover = items.filter((i) => !claimed.has(i.id));
  const leftoverPercent = computeUnitScorePercent(leftover, answers);
  if (leftoverPercent !== null) results.push({ standardId: wholeUnit?.id ?? null, scorePercent: leftoverPercent });
  return results;
}

// Flattens renderChemText's ReactNode[] into a plain structure (type + text)
// for assertions, without needing a React renderer.
function chemStructure(text: string): Array<string | { type: string; text: string }> {
  return renderChemText(text).map((n) =>
    typeof n === "string" ? n : { type: (n as { type: string }).type, text: (n as { props: { children: string } }).props.children },
  );
}

async function main() {
  console.log("renderChemText — chemistry notation -> real sub/superscripts:");
  check("subscript after a letter: H2O -> H, sub(2), O", JSON.stringify(chemStructure("H2O")) === JSON.stringify(["H", { type: "sub", text: "2" }, "O"]));
  check("subscript after a closing paren: Ca(OH)2", JSON.stringify(chemStructure("Ca(OH)2")) === JSON.stringify(["Ca(OH)", { type: "sub", text: "2" }]));
  check("multiple subscripts: Al2(SO4)3", JSON.stringify(chemStructure("Al2(SO4)3")) === JSON.stringify(["Al", { type: "sub", text: "2" }, "(SO", { type: "sub", text: "4" }, ")", { type: "sub", text: "3" }]));
  check("a leading stoichiometric coefficient is NOT subscripted: 2H2O", JSON.stringify(chemStructure("2H2O")) === JSON.stringify(["2H", { type: "sub", text: "2" }, "O"]));
  check("a plain number preceded by a space is NOT subscripted: 10^-3", JSON.stringify(chemStructure("10^-3")) === JSON.stringify(["10", { type: "sup", text: "-3" }]));
  check("charge superscript: Fe^3+", JSON.stringify(chemStructure("Fe^3+")) === JSON.stringify(["Fe", { type: "sup", text: "3+" }]));
  check("isotope mass number superscript: ^235U", JSON.stringify(chemStructure("^235U")) === JSON.stringify([{ type: "sup", text: "235" }, "U"]));
  check("variable rate-law exponent: k^n", JSON.stringify(chemStructure("k^n")) === JSON.stringify(["k", { type: "sup", text: "n" }]));
  check("electron configuration: trailing digit is superscript, not subscript: 2p6", JSON.stringify(chemStructure("2p6")) === JSON.stringify(["2p", { type: "sup", text: "6" }]));
  check("electron configuration: 3d10 (two-digit electron count)", JSON.stringify(chemStructure("3d10")) === JSON.stringify(["3d", { type: "sup", text: "10" }]));
  check("reaction arrow: ->", JSON.stringify(chemStructure("A -> B")) === JSON.stringify(["A → B"]));
  check("equilibrium arrow: <->", JSON.stringify(chemStructure("A <-> B")) === JSON.stringify(["A ⇌ B"]));
  check("scientific notation x with a space becomes ×: 7.20 x 10^-3", JSON.stringify(chemStructure("7.20 x 10^-3")) === JSON.stringify(["7.20 × 10", { type: "sup", text: "-3" }]));
  check("scientific notation x with no space becomes ×: 2x10^22", JSON.stringify(chemStructure("2x10^22")) === JSON.stringify(["2×10", { type: "sup", text: "22" }]));
  check("a stray 'x' NOT before scientific notation is left alone", JSON.stringify(chemStructure("the value of x is 5")) === JSON.stringify(["the value of x is 5"]));
  check("a chapter/question number with a space is NOT subscripted: Chapter 2", JSON.stringify(chemStructure("Chapter 2")) === JSON.stringify(["Chapter 2"]));

  console.log("\nselectWithRetention — prefers unseen, occasionally reintroduces a seen item:");
  type Item = { id: string };
  const pool: Item[] = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}` }));
  const noneSeen = new Set<string>();
  const allUnseenPicks = Array.from({ length: 30 }, () => selectWithRetention(pool, 3, noneSeen));
  check(
    "with no seen ids at all, every pick is drawn entirely from the pool (behaves like pickRandom)",
    allUnseenPicks.every((picked) => picked.length === 3 && picked.every((p) => pool.some((q) => q.id === p.id))),
  );

  const mostlySeen = new Set(pool.slice(0, 9).map((p) => p.id)); // only q9 is unseen
  const picksWithOneUnseen = Array.from({ length: 30 }, () => selectWithRetention(pool, 3, mostlySeen));
  check(
    "the one unseen item is always included when the pool is mostly seen and count < unseen+seen",
    picksWithOneUnseen.every((picked) => picked.some((p) => p.id === "q9")),
  );

  const smallPoolAllSeen = new Set(["a", "b"]);
  const smallPool: Item[] = [{ id: "a" }, { id: "b" }];
  const picksFromFullySeenPool = Array.from({ length: 20 }, () => selectWithRetention(smallPool, 2, smallPoolAllSeen));
  check(
    "a pool that's entirely seen still returns the full requested count (falls back to seen items)",
    picksFromFullySeenPool.every((picked) => picked.length === 2),
  );

  const halfSeen = new Set(["q0", "q1", "q2", "q3", "q4"]);
  let sawASeenItemAtLeastOnce = false;
  for (let i = 0; i < 200; i++) {
    const picked = selectWithRetention(pool, 4, halfSeen);
    if (picked.some((p) => halfSeen.has(p.id))) sawASeenItemAtLeastOnce = true;
  }
  check("across many draws, the ~20% retention-swap chance eventually reintroduces a seen item even when unseen items are plentiful", sawASeenItemAtLeastOnce);

  // Each band value is the MINIMUM percent needed to REACH that level — the
  // same convention grading-math.ts's letterFor() already uses (>=90 A, >=80
  // B, ... with no explicit floor check either). band["1"] is therefore never
  // itself consulted; "below band['2']" is implicitly level 1.
  console.log("percentToLevel banding (default 55/70/85/100):");
  check("0% -> Beginning (1)", percentToLevel(0, DEFAULT_BANDS) === 1);
  check("54% -> Beginning (1)", percentToLevel(54, DEFAULT_BANDS) === 1);
  check("69% -> still Beginning (1) — below the level-2 threshold of 70", percentToLevel(69, DEFAULT_BANDS) === 1);
  check("70% -> Developing (2)", percentToLevel(70, DEFAULT_BANDS) === 2);
  check("84.9% -> still Developing (2)", percentToLevel(84.9, DEFAULT_BANDS) === 2);
  check("85% -> Proficient (3)", percentToLevel(85, DEFAULT_BANDS) === 3);
  check("99.9% -> still Proficient (3)", percentToLevel(99.9, DEFAULT_BANDS) === 3);
  check("100% -> Advanced (4)", percentToLevel(100, DEFAULT_BANDS) === 4);

  const customBands: LevelPercentMap = { "1": 0, "2": 60, "3": 75, "4": 90 };
  check("respects a custom per-class band, not just the default", percentToLevel(65, customBands) === 2);

  console.log("computeUnitScorePercent (MCQ correctness pooling):");
  check("no items -> null (never 0 or NaN)", computeUnitScorePercent([], {}) === null);
  const items = [{ id: "a", correctIndex: 0 }, { id: "b", correctIndex: 1 }, { id: "c", correctIndex: 2 }, { id: "d", correctIndex: 3 }];
  check(
    "2 of 4 correct -> 50%",
    computeUnitScorePercent(items, { a: { selectedIndex: 0 }, b: { selectedIndex: 0 }, c: { selectedIndex: 2 }, d: { selectedIndex: 1 } }) === 50,
  );
  check("an unanswered item counts as wrong, not excluded", computeUnitScorePercent(items, { a: { selectedIndex: 0 } }) === 25);

  console.log("Against real DB fixtures (self-contained — created and cleaned up here, not the seed data):");
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });
  const student = await prisma.student.findFirstOrThrow({ where: { linkedUserId: { not: null } } });
  const otherStudent = await prisma.student.findFirstOrThrow({ where: { id: { not: student.id }, linkedUserId: { not: null } } });

  const cls = await prisma.class.create({ data: { name: "[test fixture] Practice Mode class", teacherId: teacher.id } });
  const mappedStandard = await prisma.standard.create({
    data: { classId: cls.id, title: "[test fixture] mapped standard", externalUnitSource: "AP_CHEM", externalUnitId: "1" },
  });
  // A second class claiming the SAME (source, unitId) must be allowed — the
  // there's no DB-level uniqueness on (classId, source, unitId) at all
  // anymore (removed to allow the fine-grained mapping fix below) — a second
  // class linking to the same unit was always fine, and is still fine.
  const otherClass = await prisma.class.create({ data: { name: "[test fixture] other class", teacherId: teacher.id } });
  let otherClassSameUnitOk = true;
  try {
    await prisma.standard.create({ data: { classId: otherClass.id, title: "[test fixture] other class same unit", externalUnitSource: "AP_CHEM", externalUnitId: "1" } });
  } catch {
    otherClassSameUnitOk = false;
  }
  check("a second class can independently link a standard to the same external unit", otherClassSameUnitOk);

  // The actual fix this milestone adds: two standards in the SAME class CAN
  // now both claim the same unit (unscoped by default) — this DB write must
  // succeed, not throw. A shared bank QUESTION across two standards' scoped
  // subsets is likewise allowed on purpose (tested further below) — one
  // question can be real evidence for more than one standard at once.
  const duplicateMapping = await prisma.standard.create({
    data: { classId: cls.id, title: "[test fixture] duplicate mapping", externalUnitSource: "AP_CHEM", externalUnitId: "1" },
  });
  check("two standards in the SAME class CAN both link to the same unit (unscoped) — the fine-grained mapping fix", !!duplicateMapping.id);
  await prisma.standard.delete({ where: { id: duplicateMapping.id } });

  // resolveStandardForUnit's exact query shape (mastery-map.ts).
  async function resolveStandardForUnit(classId: string, unitSource: string, unitId: number) {
    return prisma.standard.findFirst({ where: { classId, active: true, externalUnitSource: unitSource, externalUnitId: String(unitId) }, select: { id: true, title: true } });
  }
  check("resolves the mapped standard for its own class", (await resolveStandardForUnit(cls.id, "AP_CHEM", 1))?.id === mappedStandard.id);
  check("an unmapped unit resolves to null, not a throw", (await resolveStandardForUnit(cls.id, "AP_CHEM", 9)) === null);
  check("a standard mapped in class A is invisible when resolving for class B", (await resolveStandardForUnit(otherClass.id, "AP_CHEM", 1))?.id !== mappedStandard.id);

  const attempt = await prisma.practiceAttempt.create({
    data: { studentId: student.id, classId: cls.id, configJson: JSON.stringify({ source: "AP_CHEM", unitIds: [1] }), status: "SUBMITTED" },
  });

  // The ownership check every practice action does: hard studentId equality,
  // stricter than the staff-oriented canAccessStudent (see src/actions/practice.ts).
  function isOwnAttempt(callerStudentId: string, attemptStudentId: string) {
    return callerStudentId === attemptStudentId;
  }
  check("the enrolled student owns their own attempt", isOwnAttempt(student.id, attempt.studentId));
  check("a different student is rejected, even one with real portal access elsewhere", !isOwnAttempt(otherStudent.id, attempt.studentId));

  const scorePercent = 82;
  const suggestedLevel = percentToLevel(scorePercent, DEFAULT_BANDS);
  const proposal = await prisma.practiceMasteryProposal.create({
    data: {
      attemptId: attempt.id, studentId: student.id, classId: cls.id, standardId: mappedStandard.id,
      unitSource: "AP_CHEM", unitId: "1", scorePercent, suggestedLevel,
    },
  });
  check("a mapped unit's proposal carries a real standardId (not null)", proposal.standardId === mappedStandard.id);

  const unmappedProposal = await prisma.practiceMasteryProposal.create({
    data: { attemptId: attempt.id, studentId: student.id, classId: cls.id, standardId: null, unitSource: "AP_CHEM", unitId: "9", scorePercent: 40, suggestedLevel: 1 },
  });
  check("an unmapped unit's proposal is still created (standardId null), never dropped", unmappedProposal.id !== undefined);

  // approvePracticeProposal's exact write (src/actions/practice-review.ts):
  // recordedById is the APPROVING STAFF member, never the student — this is
  // the core invariant this whole milestone is built to preserve.
  const event = await prisma.masteryEvent.create({
    data: { studentId: proposal.studentId, standardId: proposal.standardId!, level: suggestedLevel, evidenceType: "PRACTICE", recordedById: teacher.id },
  });
  await prisma.practiceMasteryProposal.update({ where: { id: proposal.id }, data: { status: "APPROVED", reviewedById: teacher.id, reviewedAt: new Date(), resultingMasteryEventId: event.id } });

  const recorded = await prisma.masteryEvent.findUniqueOrThrow({ where: { id: event.id } });
  check("the resulting MasteryEvent's recordedById is the staff reviewer, never the student", recorded.recordedById === teacher.id && recorded.recordedById !== student.id);
  check("evidenceType is PRACTICE, distinguishable from teacher-administered QUIZ", recorded.evidenceType === "PRACTICE");

  const reApproved = await prisma.practiceMasteryProposal.findUniqueOrThrow({ where: { id: proposal.id } });
  check("an already-APPROVED proposal is no longer PENDING — the approve action's idempotency guard has something to check against", reApproved.status !== "PENDING");

  console.log("computeUnitResults with multiple partial standards sharing one unit (the fine-grained mapping fix):");
  const items4 = [{ id: "q1", correctIndex: 0 }, { id: "q2", correctIndex: 0 }, { id: "q3", correctIndex: 0 }, { id: "q4", correctIndex: 0 }];
  const allCorrect = { q1: { selectedIndex: 0 }, q2: { selectedIndex: 0 }, q3: { selectedIndex: 0 }, q4: { selectedIndex: 0 } };
  const partialA: InlineMatch = { id: "standardA", questionIds: new Set(["q1", "q2"]) };
  const partialB: InlineMatch = { id: "standardB", questionIds: new Set(["q3"]) };
  const twoPartialResults = computeUnitResultsInlineMCQOnly(items4, allCorrect, [partialA, partialB]);
  check("two partial standards produce 2 results plus 1 unattributed leftover result", twoPartialResults.length === 3);
  check("standardA's result only pools its own 2 questions", twoPartialResults.find((r) => r.standardId === "standardA")?.scorePercent === 100);
  check("standardB's result only pools its own 1 question", twoPartialResults.find((r) => r.standardId === "standardB")?.scorePercent === 100);
  check("q4 (unclaimed by any partial) becomes a standardId:null leftover result, not silently dropped", twoPartialResults.some((r) => r.standardId === null));

  const soloUnscoped: InlineMatch = { id: "standardC", questionIds: null };
  const singleResult = computeUnitResultsInlineMCQOnly(items4, allCorrect, [soloUnscoped]);
  check("a single unscoped standard still gets the WHOLE unit's evidence (today's original behavior, unchanged)", singleResult.length === 1 && singleResult[0].standardId === "standardC");

  const twoUnscoped: InlineMatch[] = [{ id: "standardD", questionIds: null }, { id: "standardE", questionIds: null }];
  const ambiguousResult = computeUnitResultsInlineMCQOnly(items4, allCorrect, twoUnscoped);
  check("two unscoped standards on the same unit: evidence stays unattributed (standardId null) rather than guessing which one it belongs to", ambiguousResult.length === 1 && ambiguousResult[0].standardId === null);

  console.log("Overlapping standard<->question links (one question can cover multiple standards):");
  const partialF: InlineMatch = { id: "standardF", questionIds: new Set(["q1", "q2"]) };
  const partialGSharingQ2: InlineMatch = { id: "standardG", questionIds: new Set(["q2", "q3"]) };
  const overlappingResults = computeUnitResultsInlineMCQOnly(items4, allCorrect, [partialF, partialGSharingQ2]);
  check(
    "a shared question (q2) produces a result for BOTH standards that claim it, not just one",
    overlappingResults.some((r) => r.standardId === "standardF") && overlappingResults.some((r) => r.standardId === "standardG"),
  );
  check(
    "q2 counts fully toward BOTH standards' scores (100% each), not split or diluted between them",
    overlappingResults.find((r) => r.standardId === "standardF")?.scorePercent === 100 &&
      overlappingResults.find((r) => r.standardId === "standardG")?.scorePercent === 100,
  );
  check(
    "q4 (claimed by neither standardF nor standardG) still becomes its own unattributed leftover result",
    overlappingResults.length === 3 && overlappingResults.some((r) => r.standardId === null),
  );

  // Real DB write: two standards on the SAME unit whose externalQuestionIdsJson
  // both list q2 — this must succeed. There is no server-side guard rejecting
  // it (removed on purpose — see Standard.externalQuestionIdsJson's comment
  // in schema.prisma), unlike the old checkUnitOverlap this replaces.
  const standardF = await prisma.standard.create({
    data: { classId: cls.id, title: "[test fixture] standard F", externalUnitSource: "AP_CHEM", externalUnitId: "2", externalQuestionIdsJson: JSON.stringify(["q1", "q2"]) },
  });
  let overlappingWriteOk = true;
  let standardG: { id: string } | null = null;
  try {
    standardG = await prisma.standard.create({
      data: { classId: cls.id, title: "[test fixture] standard G", externalUnitSource: "AP_CHEM", externalUnitId: "2", externalQuestionIdsJson: JSON.stringify(["q2", "q3"]) },
    });
  } catch {
    overlappingWriteOk = false;
  }
  check("a standard can claim a question another standard on the same unit already claims", overlappingWriteOk);
  await prisma.standard.deleteMany({ where: { id: { in: [standardF.id, ...(standardG ? [standardG.id] : [])] } } });

  // Cleanup — self-contained fixture, per this repo's established test-script convention.
  await prisma.masteryEvent.delete({ where: { id: event.id } });
  await prisma.practiceMasteryProposal.deleteMany({ where: { attemptId: attempt.id } });
  await prisma.practiceAttempt.delete({ where: { id: attempt.id } });
  await prisma.standard.deleteMany({ where: { classId: { in: [cls.id, otherClass.id] } } });
  await prisma.class.deleteMany({ where: { id: { in: [cls.id, otherClass.id] } } });

  console.log(`\n${failures === 0 ? "✅ All Practice Mode checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
