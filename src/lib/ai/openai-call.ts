import "server-only";
import { getApiKey } from "@/lib/settings";
import type { LlmResult, LlmCallOptions, TokenUsage } from "./engines";

// Single place that calls OpenAI's Chat Completions API. One OPENAI_API_KEY
// unlocks every GPT model; the model id is passed per call. `opts.json`
// requests JSON mode (`response_format: json_object`); omitted/false returns
// plain prose. Adapted from src/lib/cv/openai-call.ts.

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const BUDGET_MS = 52000;

export async function callOpenAI(prompt: string, model: string, opts: LlmCallOptions = {}): Promise<LlmResult> {
  const key = await getApiKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BUDGET_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature ?? 0.5,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    }).finally(() => clearTimeout(timeout));
  } catch {
    throw new Error("OpenAI API 503: the request timed out — please try again.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  const u = json?.usage;
  const usage: TokenUsage | null = u
    ? { inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)) }
    : null;
  return { text: text ?? null, usage };
}
