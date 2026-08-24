import "server-only";
import { runModel } from "@/lib/ai/run-model";
import { extractJson } from "@/lib/ai/json";
import { DEFAULT_AI_MODEL } from "@/lib/ai/engines";
import { getBankMCQs, getBankFRQs, selectWithRetention, getUnit } from "./bank";
import { generateMcqBatchSchema, generateFrqBatchSchema } from "./schemas";
import { validateMcqGen, validateFrqGen } from "./validation";
import { NOTATION_RULES } from "./notation";
import type { MCQItem, FRQItem, PracticeConfig, PracticeSet } from "./types";

// AP_CHEM shortfall generation only — INTRO_CHEM sessions never call any of
// this (see generatePracticeSet below): that bank (MCQ and originally-
// authored FRQ alike) gets no AI top-up, ever, by design.
// Ported from the standalone tool's app/api/generate/route.ts, rebuilt on
// this app's runModel/extractJson pipeline instead of the
// @anthropic-ai/sdk's zodOutputFormat structured output — see the Practice
// Mode decision doc for why (staying on the multi-provider dispatcher every
// other AI feature in this app uses, rather than adding a second, Claude-only
// calling convention for one feature).

const JSON_RULES = `Respond with ONLY a single JSON object matching the shape described — no prose, no markdown code fences, no commentary before or after.`;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function callForJson<T>(prompt: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): Promise<T | null> {
  const result = await runModel(prompt, DEFAULT_AI_MODEL, { json: true });
  if (!result.text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(result.text));
  } catch {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data as T) : null;
}

async function generateMcqBatch(count: number, unitTitle: string, seed: MCQItem) {
  const prompt = `You are writing ${count} original AP Chemistry multiple-choice question(s) for the unit "${unitTitle}", styled after real released AP Chemistry exam questions but with entirely new scenarios/numbers (do not reuse or closely paraphrase any real exam question).

${NOTATION_RULES}

Match the style, format, and rigor of this example question from the same unit (mirror phrasing register and distractor quality, but invent different chemistry/numbers):
STEM: ${seed.stem}
CHOICES: ${seed.choices.join(" | ")}
CORRECT INDEX: ${seed.correctIndex}

Requirements per item: exactly 4 choices, correctIndex 0-3, a workedSolution computed BEFORE finalizing the answer/choices so everything is internally consistent, an explanation covering why each distractor is a plausible common mistake, and a topicTag. All chemistry must be factually and numerically correct.

${JSON_RULES} Shape: { "items": [{ "stem": string, "choices": string[4], "correctIndex": 0-3, "workedSolution": string, "explanation": string, "topicTag": string }] }`;

  const parsed = await callForJson<{ items: unknown[] }>(prompt, generateMcqBatchSchema);
  return (parsed?.items ?? []) as Array<{ stem: string; choices: string[]; correctIndex: number; workedSolution: string; explanation: string; topicTag: string }>;
}

async function generateFrqBatch(kind: "long" | "short", unitTitle: string, seed: FRQItem) {
  const points = kind === "long" ? 10 : 4;
  const prompt = `You are writing 1 original AP Chemistry free-response question for the unit "${unitTitle}", styled after real released AP Chemistry exam FRQs but with entirely new scenarios/numbers (do not reuse or closely paraphrase any real exam question).

${NOTATION_RULES}

Match the style and rigor of this example "${kind}" (${points}-point) FRQ from the same unit:
STEM: ${seed.stem}
PARTS: ${JSON.stringify(seed.parts)}

Requirements: kind must be "${kind}" with points exactly ${points}. Include a workedSolution computed BEFORE deriving the rubric, so the rubric is internally consistent with the worked solution. The rubric's point values MUST sum to EXACTLY ${points}. The parts' maxPoints MUST also sum to EXACTLY ${points}. The rubric partLabels must match the parts labels, in the same order. Set allowsErrorCarriedForward: true on any rubric part whose grading should depend on the student's own earlier answer rather than the absolute ground truth.

${JSON_RULES} Shape: { "items": [{ "kind": "${kind}", "points": ${points}, "stem": string, "parts": [{ "label": string, "prompt": string, "maxPoints": number }], "workedSolution": string, "rubric": [{ "partLabel": string, "criterion": string, "points": number, "allowsErrorCarriedForward": boolean }] }] }`;

  const parsed = await callForJson<{ items: unknown[] }>(prompt, generateFrqBatchSchema);
  return (parsed?.items ?? []) as Array<{ kind: "long" | "short"; points: 10 | 4; stem: string; parts: FRQItem["parts"]; workedSolution: string; rubric: FRQItem["rubric"] }>;
}

async function fillMcqShortfall(shortfall: number, unitIds: number[], fallbackNotices: string[]): Promise<MCQItem[]> {
  const results: MCQItem[] = [];
  let remaining = shortfall;
  let unitIndex = 0;
  const maxIterations = Math.ceil(shortfall / 1) * 2;
  while (remaining > 0 && unitIndex < maxIterations) {
    const unitId = unitIds[unitIndex % unitIds.length];
    unitIndex++;
    const seedPool = getBankMCQs("AP_CHEM", [unitId]);
    if (seedPool.length === 0) continue;
    const seed = seedPool[Math.floor(Math.random() * seedPool.length)];
    const unitTitle = getUnit("AP_CHEM", unitId)?.title ?? `Unit ${unitId}`;

    let raw: Awaited<ReturnType<typeof generateMcqBatch>>;
    try {
      raw = await generateMcqBatch(1, unitTitle, seed);
    } catch (err) {
      fallbackNotices.push(`Question generation is unavailable right now (${errorMessage(err)}). Reduce your question count to fit the pre-built bank.`);
      break;
    }
    let issues = raw.flatMap((it, i) => validateMcqGen(it).map((iss) => `item ${i}: ${iss}`));

    if (issues.length > 0 || raw.length === 0) {
      const retryPrompt = `Your previous attempt had these issues: ${issues.join("; ") || "no valid items were returned"}. Regenerate exactly 1 MCQ item for AP Chemistry unit "${unitTitle}", fixing these issues. ${JSON_RULES} Shape: { "items": [{ "stem": string, "choices": string[4], "correctIndex": 0-3, "workedSolution": string, "explanation": string, "topicTag": string }] }`;
      try {
        const retryRaw = ((await callForJson<{ items: unknown[] }>(retryPrompt, generateMcqBatchSchema))?.items ?? []) as typeof raw;
        const retryIssues = retryRaw.flatMap((it, i) => validateMcqGen(it).map((iss) => `item ${i}: ${iss}`));
        if (retryIssues.length === 0 && retryRaw.length > 0) {
          raw = retryRaw;
          issues = [];
        }
      } catch (err) {
        fallbackNotices.push(`Question generation retry failed (${errorMessage(err)}).`);
        break;
      }
    }

    if (issues.length > 0 || raw.length === 0) {
      fallbackNotices.push(`Generation for a MCQ in unit ${unitId} failed validation twice; that slot was skipped.`);
      continue;
    }

    for (const item of raw) {
      results.push({
        id: `gen-mcq-u${unitId}-${results.length}-${Math.floor(Math.random() * 1e6)}`,
        unitId,
        stem: item.stem,
        choices: item.choices,
        correctIndex: item.correctIndex,
        workedSolution: item.workedSolution,
        explanation: item.explanation,
        topicTag: item.topicTag,
        source: "generated",
      });
      remaining -= 1;
      if (remaining <= 0) break;
    }
  }
  return results;
}

async function fillFrqShortfall(shortfall: number, kind: "long" | "short", unitIds: number[], fallbackNotices: string[]): Promise<FRQItem[]> {
  const results: FRQItem[] = [];
  let remaining = shortfall;
  let unitIndex = 0;
  const points = kind === "long" ? 10 : 4;
  const maxIterations = shortfall * 2;

  while (remaining > 0 && unitIndex < maxIterations) {
    const unitId = unitIds[unitIndex % unitIds.length];
    unitIndex++;
    const seedPool = getBankFRQs("AP_CHEM", [unitId], kind);
    if (seedPool.length === 0) continue;
    const seed = seedPool[Math.floor(Math.random() * seedPool.length)];
    const unitTitle = getUnit("AP_CHEM", unitId)?.title ?? `Unit ${unitId}`;

    let raw: Awaited<ReturnType<typeof generateFrqBatch>>;
    try {
      raw = await generateFrqBatch(kind, unitTitle, seed);
    } catch (err) {
      fallbackNotices.push(`Question generation is unavailable right now (${errorMessage(err)}). Reduce your question counts to fit the pre-built bank.`);
      break;
    }
    let issues = raw.flatMap((it, i) => validateFrqGen(it).map((iss) => `item ${i}: ${iss}`));

    if (issues.length > 0 || raw.length === 0) {
      const retryPrompt = `Your previous FRQ had these issues: ${issues.join("; ") || "no valid item was returned"}. Regenerate it, fixing these issues. It must still be kind "${kind}" with points exactly ${points}, rubric points summing to exactly ${points}. ${JSON_RULES} Shape: { "items": [{ "kind": "${kind}", "points": ${points}, "stem": string, "parts": [{ "label": string, "prompt": string, "maxPoints": number }], "workedSolution": string, "rubric": [{ "partLabel": string, "criterion": string, "points": number, "allowsErrorCarriedForward": boolean }] }] }`;
      try {
        const retryRaw = ((await callForJson<{ items: unknown[] }>(retryPrompt, generateFrqBatchSchema))?.items ?? []) as typeof raw;
        const retryIssues = retryRaw.flatMap((it, i) => validateFrqGen(it).map((iss) => `item ${i}: ${iss}`));
        if (retryIssues.length === 0 && retryRaw.length > 0) {
          raw = retryRaw;
          issues = [];
        }
      } catch (err) {
        fallbackNotices.push(`Question generation retry failed (${errorMessage(err)}).`);
        break;
      }
    }

    if (issues.length > 0 || raw.length === 0) {
      fallbackNotices.push(`Generation for a ${kind} FRQ in unit ${unitId} failed validation twice; that slot was skipped.`);
      continue;
    }

    for (const item of raw) {
      results.push({
        id: `gen-frq-${kind}-u${unitId}-${results.length}-${Math.floor(Math.random() * 1e6)}`,
        unitId,
        kind: item.kind,
        points: item.points,
        stem: item.stem,
        parts: item.parts,
        workedSolution: item.workedSolution,
        rubric: item.rubric,
        source: "generated",
      });
      remaining -= 1;
      if (remaining <= 0) break;
    }
  }
  return results;
}

// The only entry point callers need. INTRO_CHEM never calls the AI shortfall
// top-up (no AI call, no generation cost/latency) for MCQ OR FRQ content —
// its bank (MCQ + the originally-authored short/long FRQs) is large enough
// relative to realistic practice-set sizes that a shortfall is rare, and
// unlike AP_CHEM there's no seed workedSolution/rubric to style-match a
// generated item against. A genuine INTRO_CHEM shortfall just means fewer
// items than requested, surfaced via generationFallbackNotice, never an AI
// call.
export async function generatePracticeSet(config: PracticeConfig, seenItemIds: Set<string> = new Set()): Promise<PracticeSet> {
  const { source, unitIds, mcqCount, longFrqCount, shortFrqCount } = config;
  const fallbackNotices: string[] = [];

  const bankMcqs = selectWithRetention(getBankMCQs(source, unitIds), mcqCount, seenItemIds);
  const mcqShortfall = mcqCount - bankMcqs.length;
  const generatedMcqs = source === "AP_CHEM" && mcqShortfall > 0 ? await fillMcqShortfall(mcqShortfall, unitIds, fallbackNotices) : [];
  const mcqItems = [...bankMcqs, ...generatedMcqs];
  if (mcqItems.length < mcqCount) {
    fallbackNotices.push(`Only ${mcqItems.length} of ${mcqCount} requested questions were available${source === "INTRO_CHEM" ? " in the bank for the selected chapters" : ""}.`);
  }

  let frqItems: FRQItem[] = [];
  if (longFrqCount > 0 || shortFrqCount > 0) {
    const bankLong = selectWithRetention(getBankFRQs(source, unitIds, "long"), longFrqCount, seenItemIds);
    const longShortfall = longFrqCount - bankLong.length;
    const genLong = source === "AP_CHEM" && longShortfall > 0 ? await fillFrqShortfall(longShortfall, "long", unitIds, fallbackNotices) : [];

    const bankShort = selectWithRetention(getBankFRQs(source, unitIds, "short"), shortFrqCount, seenItemIds);
    const shortShortfall = shortFrqCount - bankShort.length;
    const genShort = source === "AP_CHEM" && shortShortfall > 0 ? await fillFrqShortfall(shortShortfall, "short", unitIds, fallbackNotices) : [];

    frqItems = [...bankLong, ...genLong, ...bankShort, ...genShort];
    if (frqItems.length < longFrqCount + shortFrqCount) {
      fallbackNotices.push(`Only ${frqItems.length} of ${longFrqCount + shortFrqCount} requested free-response questions could be prepared${source === "INTRO_CHEM" ? " from the bank for the selected chapters" : ""}.`);
    }
  }

  return {
    config,
    mcqItems,
    frqItems,
    generationFallbackNotice: fallbackNotices.length > 0 ? fallbackNotices.join(" ") : null,
  };
}
