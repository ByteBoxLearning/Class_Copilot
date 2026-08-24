import "server-only";
import { getApiKey } from "@/lib/settings";
import type { LlmResult, LlmCallOptions, TokenUsage } from "./engines";

// Single place that calls Anthropic's Messages API. One ANTHROPIC_API_KEY
// unlocks every Claude model. Claude has no "JSON mode" flag — a JSON-output
// prompt must ask for it explicitly and the caller extracts it — so
// `opts.json` is accepted for API parity with the other callers but doesn't
// change the request. Adapted from src/lib/cv/claude-call.ts.

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const BUDGET_MS = 52000;

export async function callClaude(prompt: string, model: string, opts: LlmCallOptions = {}): Promise<LlmResult> {
  const key = await getApiKey("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BUDGET_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: opts.temperature ?? 0.5,
        messages: [{ role: "user", content: prompt }],
      }),
    }).finally(() => clearTimeout(timeout));
  } catch {
    throw new Error("Claude API 503: the request timed out — please try again.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const text: string | undefined = Array.isArray(json?.content)
    ? json.content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("")
    : undefined;
  const u = json?.usage;
  const usage: TokenUsage | null = u
    ? { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) }
    : null;
  return { text: text || null, usage };
}
