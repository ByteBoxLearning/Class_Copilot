import "server-only";
import { prisma } from "@/lib/prisma";
import { getGradingPolicy } from "@/lib/grading";
import { percentToLevel } from "@/lib/grading-math";
import type { MCQItem, FRQItem, MCQAnswer, FRQAnswer, FRQScoreResult, UnitSource, UnitResult } from "./types";
import { getUnit } from "./bank";

// A Standard mapped to a unit — either the WHOLE unit (questionIds: null,
// the original Milestone K shape) or a specific SUBSET of its bank questions
// (questionIds: a Set of ids), letting several Standards share one chapter
// without double-counting evidence. See Standard.externalQuestionIdsJson's
// comment in schema.prisma and checkUnitOverlap in src/actions/standards.ts
// for the invariant this relies on (never both a whole-unit AND a partial
// standard on the same unit, never overlapping partials).
export type UnitStandardMatch = { id: string; title: string; questionIds: Set<string> | null };

// Resolves every Standard (0, 1, or many) a practiced unit maps to, scoped to
// the attempt's own class — never throws, never guesses across classes. A
// student practicing a unit with no mapped Standard yet still gets a full
// score/level for it, just with standardId: null (shown, not silently
// dropped) — see computeUnitResults' leftover bucket below.
export async function resolveStandardsForUnit(
  classId: string,
  unitSource: UnitSource,
  unitId: number,
): Promise<UnitStandardMatch[]> {
  const standards = await prisma.standard.findMany({
    where: { classId, active: true, externalUnitSource: unitSource, externalUnitId: String(unitId) },
    select: { id: true, title: true, externalQuestionIdsJson: true },
  });
  return standards.map((s) => ({
    id: s.id,
    title: s.title,
    questionIds: s.externalQuestionIdsJson ? new Set(JSON.parse(s.externalQuestionIdsJson) as string[]) : null,
  }));
}

// Pools MCQ correctness and FRQ points at the point level (not two separate
// percentages averaged) — mirrors how AP's own composite score treats MCQ
// and FRQ points as one pool, and avoids inventing a separate weighting
// scheme between question types.
export function computeUnitScorePercent(
  mcqItems: MCQItem[],
  mcqAnswers: Record<string, MCQAnswer>,
  frqItems: FRQItem[],
  frqScores: Record<string, FRQScoreResult>,
): number | null {
  let earned = 0;
  let possible = 0;
  for (const item of mcqItems) {
    possible += 1;
    const answer = mcqAnswers[item.id];
    if (answer && answer.selectedIndex === item.correctIndex) earned += 1;
  }
  for (const item of frqItems) {
    const score = frqScores[item.id];
    possible += item.points;
    if (score) earned += Math.max(0, Math.min(score.totalAwarded, item.points));
  }
  if (possible === 0) return null;
  return (earned / possible) * 100;
}

// Groups a practice set's items+answers+scores by unit and computes each
// unit's score/suggested-level/mapped-standard(s) — the per-unit summary
// shown on Review and persisted as PracticeMasteryProposal rows on submit.
//
// A unit can now resolve to MORE than one result: one per partial (scoped)
// Standard whose questions were actually practiced this session, plus (if
// anything's left over) exactly one leftover result. The leftover result is
// only attributed to a Standard when the unit resolves to EXACTLY one
// Standard total and it's unscoped — today's original single-whole-unit
// behavior, preserved as the common case. If a unit has an unscoped Standard
// alongside others (e.g. freshly CSV-imported, not yet AI/manually mapped to
// specific questions), that evidence stays unattributed (standardId: null)
// rather than guessing which sibling it belongs to — it becomes real
// evidence for that standard once someone scopes it (see checkUnitOverlap in
// src/actions/standards.ts and the AI-assisted mapping in
// src/actions/standards-mapping.ts).
export async function computeUnitResults(
  classId: string,
  unitSource: UnitSource,
  mcqItems: MCQItem[],
  mcqAnswers: Record<string, MCQAnswer>,
  frqItems: FRQItem[],
  frqScores: Record<string, FRQScoreResult>,
): Promise<UnitResult[]> {
  const unitIds = [...new Set([...mcqItems.map((i) => i.unitId), ...frqItems.map((i) => i.unitId)])];
  const policy = await getGradingPolicy(classId);

  const results: UnitResult[] = [];
  for (const unitId of unitIds) {
    const unitMcq = mcqItems.filter((i) => i.unitId === unitId);
    const unitFrq = frqItems.filter((i) => i.unitId === unitId);
    const unit = getUnit(unitSource, unitId);
    const matches = await resolveStandardsForUnit(classId, unitSource, unitId);
    const partials = matches.filter((m) => m.questionIds !== null && m.questionIds.size > 0);
    const unscoped = matches.filter((m) => !m.questionIds || m.questionIds.size === 0);
    const wholeUnit = partials.length === 0 && unscoped.length === 1 ? unscoped[0] : null;

    const claimed = new Set<string>();
    for (const m of partials) {
      const qids = m.questionIds!;
      const mcq = unitMcq.filter((i) => qids.has(i.id));
      const frq = unitFrq.filter((i) => qids.has(i.id));
      if (mcq.length === 0 && frq.length === 0) continue; // none of this standard's questions were practiced
      for (const i of mcq) claimed.add(i.id);
      for (const i of frq) claimed.add(i.id);
      const percent = computeUnitScorePercent(mcq, mcqAnswers, frq, frqScores);
      if (percent === null) continue;
      results.push({
        unitId,
        unitTitle: unit?.title ?? `Unit ${unitId}`,
        scorePercent: Math.round(percent * 10) / 10,
        suggestedLevel: percentToLevel(percent, policy.levelPercent),
        standardId: m.id,
        standardTitle: m.title,
        proposalId: null,
      });
    }

    const leftoverMcq = unitMcq.filter((i) => !claimed.has(i.id));
    const leftoverFrq = unitFrq.filter((i) => !claimed.has(i.id));
    const leftoverPercent = computeUnitScorePercent(leftoverMcq, mcqAnswers, leftoverFrq, frqScores);
    if (leftoverPercent !== null) {
      results.push({
        unitId,
        unitTitle: unit?.title ?? `Unit ${unitId}`,
        scorePercent: Math.round(leftoverPercent * 10) / 10,
        suggestedLevel: percentToLevel(leftoverPercent, policy.levelPercent),
        standardId: wholeUnit?.id ?? null,
        standardTitle: wholeUnit?.title ?? null,
        proposalId: null,
      });
    }
  }
  return results;
}
