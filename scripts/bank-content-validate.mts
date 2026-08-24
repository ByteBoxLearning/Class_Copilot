// Structural validation for the Intro Chem question bank (all 19 chapters),
// run after the richer-content authoring pass (new MCQs with difficulty/
// hints/explanation, doubled FRQ pools, retrofitted difficulty/hints on
// existing FRQs). Checks structure/consistency only — not chemistry
// correctness, which was verified by the authoring agents themselves.
// Run: node --import tsx scripts/bank-content-validate.mts
import fs from "node:fs";
import path from "node:path";

const BANK_DIR = path.join(process.cwd(), "src/lib/practice/data/bank");
const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);

let failures = 0;
function check(label: string, ok: boolean) {
  if (ok) {
    console.log(`  ok - ${label}`);
  } else {
    failures++;
    console.log(`  FAIL - ${label}`);
  }
}

const allMcqIds = new Set<string>();
const allFrqIds = new Set<string>();
let mcqTotal = 0, frqTotal = 0, mcqWithHints = 0, frqWithHints = 0;

for (let chapter = 1; chapter <= 19; chapter++) {
  console.log(`\nChapter ${chapter}:`);

  const mcqPath = path.join(BANK_DIR, `intro-chem-chapter-${chapter}.json`);
  const mcqs = JSON.parse(fs.readFileSync(mcqPath, "utf8")) as Array<{
    id: string; unitId: number; stem: string; choices: string[]; correctIndex: number;
    topicTag: string; source: string; explanation?: string; difficulty?: string; hints?: string[];
  }>;
  mcqTotal += mcqs.length;

  for (const m of mcqs) {
    check(`${m.id}: unique id`, !allMcqIds.has(m.id));
    allMcqIds.add(m.id);
    check(`${m.id}: unitId matches chapter (${m.unitId} === ${chapter})`, m.unitId === chapter);
    check(`${m.id}: correctIndex in range [0, ${m.choices.length}) `, m.correctIndex >= 0 && m.correctIndex < m.choices.length);
    if (m.difficulty !== undefined) {
      check(`${m.id}: difficulty is a valid tier ("${m.difficulty}")`, DIFFICULTIES.has(m.difficulty));
    }
    if (m.hints !== undefined) {
      mcqWithHints++;
      check(`${m.id}: hints is a non-empty array of non-empty strings`, Array.isArray(m.hints) && m.hints.length > 0 && m.hints.every((h) => typeof h === "string" && h.trim().length > 0));
    }
  }

  const frqPath = path.join(BANK_DIR, `intro-chem-chapter-${chapter}-frq.json`);
  const frqs = JSON.parse(fs.readFileSync(frqPath, "utf8")) as Array<{
    id: string; unitId: number; kind: "short" | "long"; points: number;
    parts: { label: string; prompt: string; maxPoints: number }[];
    rubric: { partLabel: string; criterion: string; points: number }[];
    source: string; difficulty?: string; hints?: string[];
  }>;
  frqTotal += frqs.length;
  check(`chapter ${chapter}: FRQ pool doubled to 8`, frqs.length === 8);

  for (const f of frqs) {
    check(`${f.id}: unique id`, !allFrqIds.has(f.id));
    allFrqIds.add(f.id);
    check(`${f.id}: unitId matches chapter (${f.unitId} === ${chapter})`, f.unitId === chapter);
    check(`${f.id}: points is 4 (short) or 10 (long) matching kind`, (f.kind === "short" && f.points === 4) || (f.kind === "long" && f.points === 10));
    const partsSum = f.parts.reduce((s, p) => s + p.maxPoints, 0);
    check(`${f.id}: parts' maxPoints sum to points (${partsSum} === ${f.points})`, partsSum === f.points);
    const rubricSum = f.rubric.reduce((s, r) => s + r.points, 0);
    check(`${f.id}: rubric points sum to points (${rubricSum} === ${f.points})`, rubricSum === f.points);
    const partLabels = f.parts.map((p) => p.label);
    const rubricLabels = f.rubric.map((r) => r.partLabel);
    check(`${f.id}: rubric partLabels match parts labels, same order`, JSON.stringify(partLabels) === JSON.stringify(rubricLabels));
    check(`${f.id}: has difficulty and non-empty hints (every FRQ, new or retrofitted)`, !!f.difficulty && DIFFICULTIES.has(f.difficulty) && Array.isArray(f.hints) && (f.hints?.length ?? 0) > 0);
    if (f.hints?.length) frqWithHints++;
  }
}

check("no MCQ id collides across different chapters", allMcqIds.size === mcqTotal);
check("no FRQ id collides across different chapters", allFrqIds.size === frqTotal);

console.log(`\nTotals: ${mcqTotal} MCQs (${mcqWithHints} with hints), ${frqTotal} FRQs (${frqWithHints} with hints), across 19 chapters.`);

if (failures > 0) {
  console.log(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("\n✅ All bank content structural checks passed.");
