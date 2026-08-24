// Practice Mode (Milestone K) question bank — source-dispatching version of
// the standalone tool's lib/bank.ts. AP_CHEM keeps the original per-unit
// MCQ+FRQ bank (ported verbatim from the standalone tool, unchanged);
// INTRO_CHEM is a new, originally-authored bank (per-chapter "unit") — MCQ
// content plus short/free-response content added afterward, all
// `source: "original"` — see CONTEXT.md / the practice-mode decision doc for
// why none of it was transcribed from Tro's actual commercial test bank
// (deliberately NOT reproduced; this is fresh content covering the same 19
// standard intro-chem topics).
import type { MCQItem, FRQItem, Unit, UnitSource } from "./types";

import apUnitsData from "./data/ap-units.json";
import introUnitsData from "./data/intro-chem-units.json";

import apU1mcq from "./data/bank/unit-1-mcq.json";
import apU1frq from "./data/bank/unit-1-frq.json";
import apU2mcq from "./data/bank/unit-2-mcq.json";
import apU2frq from "./data/bank/unit-2-frq.json";
import apU3mcq from "./data/bank/unit-3-mcq.json";
import apU3frq from "./data/bank/unit-3-frq.json";
import apU4mcq from "./data/bank/unit-4-mcq.json";
import apU4frq from "./data/bank/unit-4-frq.json";
import apU5mcq from "./data/bank/unit-5-mcq.json";
import apU5frq from "./data/bank/unit-5-frq.json";
import apU6mcq from "./data/bank/unit-6-mcq.json";
import apU6frq from "./data/bank/unit-6-frq.json";
import apU7mcq from "./data/bank/unit-7-mcq.json";
import apU7frq from "./data/bank/unit-7-frq.json";
import apU8mcq from "./data/bank/unit-8-mcq.json";
import apU8frq from "./data/bank/unit-8-frq.json";
import apU9mcq from "./data/bank/unit-9-mcq.json";
import apU9frq from "./data/bank/unit-9-frq.json";

import ic1 from "./data/bank/intro-chem-chapter-1.json";
import ic2 from "./data/bank/intro-chem-chapter-2.json";
import ic3 from "./data/bank/intro-chem-chapter-3.json";
import ic4 from "./data/bank/intro-chem-chapter-4.json";
import ic5 from "./data/bank/intro-chem-chapter-5.json";
import ic6 from "./data/bank/intro-chem-chapter-6.json";
import ic7 from "./data/bank/intro-chem-chapter-7.json";
import ic8 from "./data/bank/intro-chem-chapter-8.json";
import ic9 from "./data/bank/intro-chem-chapter-9.json";
import ic10 from "./data/bank/intro-chem-chapter-10.json";
import ic11 from "./data/bank/intro-chem-chapter-11.json";
import ic12 from "./data/bank/intro-chem-chapter-12.json";
import ic13 from "./data/bank/intro-chem-chapter-13.json";
import ic14 from "./data/bank/intro-chem-chapter-14.json";
import ic15 from "./data/bank/intro-chem-chapter-15.json";
import ic16 from "./data/bank/intro-chem-chapter-16.json";
import ic17 from "./data/bank/intro-chem-chapter-17.json";
import ic18 from "./data/bank/intro-chem-chapter-18.json";
import ic19 from "./data/bank/intro-chem-chapter-19.json";

import ic1frq from "./data/bank/intro-chem-chapter-1-frq.json";
import ic2frq from "./data/bank/intro-chem-chapter-2-frq.json";
import ic3frq from "./data/bank/intro-chem-chapter-3-frq.json";
import ic4frq from "./data/bank/intro-chem-chapter-4-frq.json";
import ic5frq from "./data/bank/intro-chem-chapter-5-frq.json";
import ic6frq from "./data/bank/intro-chem-chapter-6-frq.json";
import ic7frq from "./data/bank/intro-chem-chapter-7-frq.json";
import ic8frq from "./data/bank/intro-chem-chapter-8-frq.json";
import ic9frq from "./data/bank/intro-chem-chapter-9-frq.json";
import ic10frq from "./data/bank/intro-chem-chapter-10-frq.json";
import ic11frq from "./data/bank/intro-chem-chapter-11-frq.json";
import ic12frq from "./data/bank/intro-chem-chapter-12-frq.json";
import ic13frq from "./data/bank/intro-chem-chapter-13-frq.json";
import ic14frq from "./data/bank/intro-chem-chapter-14-frq.json";
import ic15frq from "./data/bank/intro-chem-chapter-15-frq.json";
import ic16frq from "./data/bank/intro-chem-chapter-16-frq.json";
import ic17frq from "./data/bank/intro-chem-chapter-17-frq.json";
import ic18frq from "./data/bank/intro-chem-chapter-18-frq.json";
import ic19frq from "./data/bank/intro-chem-chapter-19-frq.json";

const AP_UNITS: Unit[] = apUnitsData as Unit[];
const INTRO_UNITS: Unit[] = (introUnitsData as { id: number; title: string }[]).map((u) => ({ id: u.id, title: u.title }));

const AP_MCQ_BY_UNIT: Record<number, MCQItem[]> = {
  1: apU1mcq as MCQItem[], 2: apU2mcq as MCQItem[], 3: apU3mcq as MCQItem[],
  4: apU4mcq as MCQItem[], 5: apU5mcq as MCQItem[], 6: apU6mcq as MCQItem[],
  7: apU7mcq as MCQItem[], 8: apU8mcq as MCQItem[], 9: apU9mcq as MCQItem[],
};

const AP_FRQ_BY_UNIT: Record<number, FRQItem[]> = {
  1: apU1frq as FRQItem[], 2: apU2frq as FRQItem[], 3: apU3frq as FRQItem[],
  4: apU4frq as FRQItem[], 5: apU5frq as FRQItem[], 6: apU6frq as FRQItem[],
  7: apU7frq as FRQItem[], 8: apU8frq as FRQItem[], 9: apU9frq as FRQItem[],
};

const INTRO_MCQ_BY_UNIT: Record<number, MCQItem[]> = {
  1: ic1 as MCQItem[], 2: ic2 as MCQItem[], 3: ic3 as MCQItem[], 4: ic4 as MCQItem[], 5: ic5 as MCQItem[],
  6: ic6 as MCQItem[], 7: ic7 as MCQItem[], 8: ic8 as MCQItem[], 9: ic9 as MCQItem[], 10: ic10 as MCQItem[],
  11: ic11 as MCQItem[], 12: ic12 as MCQItem[], 13: ic13 as MCQItem[], 14: ic14 as MCQItem[], 15: ic15 as MCQItem[],
  16: ic16 as MCQItem[], 17: ic17 as MCQItem[], 18: ic18 as MCQItem[], 19: ic19 as MCQItem[],
};

// Originally-authored short/free-response content (source: "original") —
// unlike AP_CHEM's FRQ bank, these were never AI-generated and never get an
// AI top-up on a shortfall (see generate.ts's generatePracticeSet).
const INTRO_FRQ_BY_UNIT: Record<number, FRQItem[]> = {
  1: ic1frq as FRQItem[], 2: ic2frq as FRQItem[], 3: ic3frq as FRQItem[], 4: ic4frq as FRQItem[], 5: ic5frq as FRQItem[],
  6: ic6frq as FRQItem[], 7: ic7frq as FRQItem[], 8: ic8frq as FRQItem[], 9: ic9frq as FRQItem[], 10: ic10frq as FRQItem[],
  11: ic11frq as FRQItem[], 12: ic12frq as FRQItem[], 13: ic13frq as FRQItem[], 14: ic14frq as FRQItem[], 15: ic15frq as FRQItem[],
  16: ic16frq as FRQItem[], 17: ic17frq as FRQItem[], 18: ic18frq as FRQItem[], 19: ic19frq as FRQItem[],
};

export function getUnits(source: UnitSource): Unit[] {
  return source === "AP_CHEM" ? AP_UNITS : INTRO_UNITS;
}

export function getUnit(source: UnitSource, unitId: number): Unit | undefined {
  return getUnits(source).find((u) => u.id === unitId);
}

export function getBankMCQs(source: UnitSource, unitIds: number[]): MCQItem[] {
  const byUnit = source === "AP_CHEM" ? AP_MCQ_BY_UNIT : INTRO_MCQ_BY_UNIT;
  return unitIds.flatMap((id) => byUnit[id] ?? []);
}

export function getBankFRQs(source: UnitSource, unitIds: number[], kind: "long" | "short"): FRQItem[] {
  const byUnit = source === "AP_CHEM" ? AP_FRQ_BY_UNIT : INTRO_FRQ_BY_UNIT;
  return unitIds.flatMap((id) => (byUnit[id] ?? []).filter((f) => f.kind === kind));
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickRandom<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, Math.max(0, count));
}

// Chance of deliberately swapping in one already-seen item, when one is
// available — a retention/growth check, seamless to the student (no "you've
// seen this before" label; see generate.ts/coaching.ts for how the RESULT of
// a repeat surfaces afterward, in the coaching narrative).
const RETENTION_SWAP_CHANCE = 0.2;

// Like pickRandom, but prefers items NOT in `seenIds` (so redoing a chapter
// doesn't keep showing the same small set), while occasionally reintroducing
// one seen item on purpose. A pool with no seen candidates behaves exactly
// like pickRandom.
export function selectWithRetention<T extends { id: string }>(items: T[], count: number, seenIds: Set<string>): T[] {
  if (count <= 0) return [];
  const unseen = items.filter((i) => !seenIds.has(i.id));
  const seen = items.filter((i) => seenIds.has(i.id));

  // Not enough unseen items to fill the request on their own — fill the gap
  // with seen ones out of necessity. No ADDITIONAL deliberate swap here: one
  // is pointless (seen items are already present) and risky (it could bump
  // out the only unseen item this pool had to offer).
  if (unseen.length < count) return [...shuffle(unseen), ...pickRandom(seen, count - unseen.length)];

  const selected = pickRandom(unseen, count);
  if (count > 1 && seen.length > 0 && Math.random() < RETENTION_SWAP_CHANCE) {
    const replaceIndex = Math.floor(Math.random() * selected.length);
    selected[replaceIndex] = pickRandom(seen, 1)[0];
  }
  return selected;
}
