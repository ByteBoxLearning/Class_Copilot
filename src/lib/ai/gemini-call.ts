import "server-only";
import { getApiKey } from "@/lib/settings";
import type { LlmResult, LlmCallOptions, TokenUsage } from "./engines";

// Single place that calls Gemini, with automatic retry on the free tier's
// rate limit (HTTP 429). Gemini tells us how long to wait ("retryDelay"); we
// wait that long and retry once, as long as it still fits inside the overall
// time budget (so we never blow a serverless function's 60s limit).
//
// Adapted from the source CRM's src/lib/cv/gemini-call.ts — generalized with
// an opts.json flag so it can return either strict JSON (opts.json: true) or
// plain prose (default), rather than always forcing JSON mode.

const BUDGET_MS = 55000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pull the server-suggested wait (seconds) out of a 429 body, else 0.
function retryDelayMs(body: string): number {
  const m = body.match(/"retryDelay":\s*"([\d.]+)s"/) || body.match(/retry in ([\d.]+)s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : 0;
}

export async function callGemini(prompt: string, modelOverride: string, opts: LlmCallOptions = {}): Promise<LlmResult> {
  const key = await getApiKey("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  const model = modelOverride || "gemini-flash-lite-latest";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  });

  const start = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = BUDGET_MS - (Date.now() - start);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(8000, remaining));

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        signal: controller.signal,
        body,
      }).finally(() => clearTimeout(timeout));
    } catch {
      if (attempt === 0 && BUDGET_MS - (Date.now() - start) > 12000) {
        await sleep(1000);
        continue;
      }
      throw new Error("Gemini API 503: the model is busy right now — please try again shortly.");
    }

    if ((res.status === 429 || res.status === 503) && attempt === 0) {
      const errBody = await res.text().catch(() => "");
      const wait = res.status === 429 ? retryDelayMs(errBody) || 12000 : 4000;
      const budgetLeft = BUDGET_MS - (Date.now() - start);
      if (wait + 10000 <= budgetLeft) {
        await sleep(wait + 500);
        continue;
      }
      throw new Error(`Gemini API ${res.status}: temporarily unavailable (retry in ~${Math.round(wait / 1000)}s).`);
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Gemini API ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const um = json?.usageMetadata;
    const usage: TokenUsage | null = um
      ? { inputTokens: um.promptTokenCount ?? 0, outputTokens: um.candidatesTokenCount ?? 0, totalTokens: um.totalTokenCount ?? 0 }
      : null;
    if (!text && attempt === 0 && BUDGET_MS - (Date.now() - start) > 12000) {
      await sleep(1500);
      continue;
    }
    return { text: text ?? null, usage };
  }
  return { text: null, usage: null };
}
