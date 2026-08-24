import "server-only";
import { getApiKey } from "@/lib/settings";
import type { LlmResult, LlmCallOptions, TokenUsage } from "./engines";

// AI generation via OpenRouter (free tier). OpenRouter's free models are a
// shared pool and are frequently rate-limited (HTTP 429 "rate-limited
// upstream") or renamed, so we try a prioritised list of capable free chat
// models and use the first that responds. Set OPENROUTER_MODEL to put a
// specific model at the front of the queue. Adapted from the source CRM's
// src/lib/cv/openrouter-cv.ts, minus its CV-specific doc-parsing wrapper —
// this always returns raw text; JSON parsing (if a future feature needs it)
// is the caller's job, same as the other three providers.

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

// Ordered by quality/reliability for this task (verified available on the
// free tier). If they all 429, the caller surfaces a "try again" message.
const DEFAULT_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
];

function modelQueue(): string[] {
  const pinned = process.env.OPENROUTER_MODEL?.trim();
  if (!pinned) return DEFAULT_MODELS;
  return [pinned, ...DEFAULT_MODELS.filter((m) => m !== pinned)];
}

export async function callOpenRouter(prompt: string, opts: LlmCallOptions = {}): Promise<LlmResult> {
  const key = await getApiKey("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY is not set.");

  let lastStatus = 0;

  // Overall time budget so we finish before a serverless function's 60s
  // limit, even while skipping rate-limited models. Per attempt we use
  // whatever time is left (capped), and stop starting new attempts once too
  // little remains.
  const OVERALL_MS = 52000;
  const started = Date.now();

  for (const model of modelQueue()) {
    const remaining = OVERALL_MS - (Date.now() - started);
    if (remaining < 9000) break; // not enough time for another attempt
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(45000, remaining));
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://class-copilot.local",
          "X-Title": "Class Copilot",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: opts.temperature ?? 0.3,
        }),
      }).finally(() => clearTimeout(timeout));

      if (res.status === 429 || res.status === 404 || res.status >= 500) {
        lastStatus = res.status;
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`OpenRouter API ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = await res.json();
      const text: string | undefined = json?.choices?.[0]?.message?.content;
      if (!text) {
        lastStatus = res.status;
        continue;
      }
      const u = json?.usage;
      const usage: TokenUsage | null = u
        ? { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)) }
        : null;
      return { text, usage };
    } catch (e) {
      if (e instanceof Error && /OpenRouter API 4\d\d/.test(e.message)) throw e;
      lastStatus = 0;
    }
  }

  throw new Error(`OpenRouter API 429: all free models were rate-limited (last status ${lastStatus}).`);
}
