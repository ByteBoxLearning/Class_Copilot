// Client-safe registry of every AI model this app can call, grouped by
// provider. Kept out of settings.ts (server-only) so both a builder dropdown
// (client) and server actions can share the same list. One provider key
// unlocks all of that provider's models — `apiModel` is what's actually sent
// to the API.
//
// Domain-neutral: adapted from the source CRM's src/lib/cv/engines.ts, but
// with no CV-specific naming or pricing notes — this registry is shared by
// the End-of-Term Comments generator and (later) the Assignment Builder. See
// CONTEXT.md for why this split happened (the source coupled the registry to
// the CV domain; this fork doesn't repeat that).
//
// NOTE: the OpenAI ids are stable; the Claude ids are "latest"/dated aliases
// that occasionally change — if a Claude model 404s, update its `apiModel`
// here (one line) to the current id from docs.anthropic.com.

export type AiProvider = "GEMINI" | "OPENAI" | "CLAUDE" | "OPENROUTER";

export type AiModelOption = {
  value: string;        // stable id used in the dropdown + passed to the server
  label: string;        // shown to the user, e.g. "GPT-4o mini"
  provider: AiProvider;
  apiModel: string;     // the id sent to the provider's API ("" = provider decides)
  free: boolean;
  note?: string;
};

// Per-provider display + which key unlocks it.
export const AI_PROVIDER_META: Record<AiProvider, { label: string; keyName: string }> = {
  GEMINI: { label: "Gemini (Google) — free", keyName: "GEMINI_API_KEY" },
  OPENAI: { label: "OpenAI", keyName: "OPENAI_API_KEY" },
  CLAUDE: { label: "Claude (Anthropic)", keyName: "ANTHROPIC_API_KEY" },
  OPENROUTER: { label: "OpenRouter — free backup", keyName: "OPENROUTER_API_KEY" },
};

export const AI_PROVIDER_ORDER: AiProvider[] = ["GEMINI", "OPENAI", "CLAUDE", "OPENROUTER"];

export const AI_MODELS: AiModelOption[] = [
  // --- Gemini (free) --------------------------------------------------------
  { value: "GEMINI", label: "Gemini Flash-Lite", provider: "GEMINI", apiModel: "gemini-flash-lite-latest", free: true, note: "Fastest (~5s), most reliable. Recommended default." },
  { value: "GEMINI_FLASH", label: "Gemini Flash", provider: "GEMINI", apiModel: "gemini-flash-latest", free: true, note: "Better writing, but often busy — slower." },
  // --- OpenAI (paid) --------------------------------------------------------
  { value: "OPENAI_4O_MINI", label: "GPT-4o mini", provider: "OPENAI", apiModel: "gpt-4o-mini", free: false, note: "Near-free, very reliable — great value." },
  { value: "OPENAI_4O", label: "GPT-4o", provider: "OPENAI", apiModel: "gpt-4o", free: false, note: "Strong all-round quality." },
  { value: "OPENAI_41", label: "GPT-4.1", provider: "OPENAI", apiModel: "gpt-4.1", free: false, note: "Latest full model." },
  { value: "OPENAI_41_MINI", label: "GPT-4.1 mini", provider: "OPENAI", apiModel: "gpt-4.1-mini", free: false, note: "Cheap and capable." },
  // --- Claude (paid) --------------------------------------------------------
  { value: "CLAUDE_HAIKU", label: "Claude Haiku", provider: "CLAUDE", apiModel: "claude-haiku-4-5", free: false, note: "Cheap and fast." },
  { value: "CLAUDE_SONNET", label: "Claude Sonnet", provider: "CLAUDE", apiModel: "claude-sonnet-4-5", free: false, note: "Best at natural, personal-sounding writing. Recommended paid pick." },
  { value: "CLAUDE_OPUS", label: "Claude Opus", provider: "CLAUDE", apiModel: "claude-opus-4-8", free: false, note: "Top quality but pricey — usually overkill." },
  // --- OpenRouter (free backup) --------------------------------------------
  { value: "OPENROUTER", label: "OpenRouter (free models)", provider: "OPENROUTER", apiModel: "", free: true, note: "Free backup; frequently rate-limited." },
];

export const DEFAULT_AI_MODEL = "GEMINI";

export function findAiModel(value: string): AiModelOption | undefined {
  return AI_MODELS.find((m) => m.value === value);
}

// --- Token usage + cost -----------------------------------------------------
export type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number };
export type LlmResult = { text: string | null; usage: TokenUsage | null };
// `json: true` asks the provider for strict JSON output (needed by features
// like a future Assignment Builder); omitted/false returns plain prose (used
// by the End-of-Term Comments generator). See src/lib/ai/*-call.ts.
export type LlmCallOptions = { temperature?: number; json?: boolean };

// Approx USD price per 1,000,000 tokens [input, output]. Free tiers = 0.
// Update if a provider changes pricing.
export const AI_MODEL_PRICES: Record<string, { in: number; out: number }> = {
  GEMINI: { in: 0, out: 0 },
  GEMINI_FLASH: { in: 0, out: 0 },
  OPENAI_4O_MINI: { in: 0.15, out: 0.6 },
  OPENAI_4O: { in: 2.5, out: 10 },
  OPENAI_41: { in: 2, out: 8 },
  OPENAI_41_MINI: { in: 0.4, out: 1.6 },
  CLAUDE_HAIKU: { in: 0.8, out: 4 },
  CLAUDE_SONNET: { in: 3, out: 15 },
  CLAUDE_OPUS: { in: 15, out: 75 },
  OPENROUTER: { in: 0, out: 0 },
};

// Estimated cost in USD for a generation, from its token usage.
export function estimateCostUsd(modelValue: string, usage: TokenUsage): number {
  const p = AI_MODEL_PRICES[modelValue];
  if (!p) return 0;
  return (usage.inputTokens / 1e6) * p.in + (usage.outputTokens / 1e6) * p.out;
}

// "1.9k" / "850" — compact token count for the UI.
export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// "$0.031" / "$0.0004" / "free" — compact cost for the UI.
export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null) return "";
  if (usd === 0) return "free";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

// A model as presented to the UI: with its enabled/key/locked state resolved.
// (Computed server-side by getAiModelChoices; the type lives here so client
// components can import it without touching the server-only settings module.)
export type AiModelChoice = {
  value: string;
  label: string;
  provider: AiProvider;
  providerLabel: string;
  free: boolean;
  note?: string;
  enabled: boolean;
  hasKey: boolean;
  locked: boolean;              // not selectable (off, or no provider key)
  lockReason: "off" | "needs key" | null;
};

// Setting key for which models are enabled (stored as a plain JSON array).
export const AI_MODEL_ENABLED_KEY = "AI_MODELS_ENABLED";

// Generation temperature per PROVIDER (higher = fuller/more expansive; lower
// = terser/more conservative), admin-editable in Settings, stored as one JSON
// map keyed by AiProvider. Shared across every feature that calls runModel()
// — a provider-level knob, not a per-feature one.
export const AI_TEMPS_KEY = "AI_TEMPS";
export const DEFAULT_AI_TEMPS: Record<AiProvider, number> = {
  GEMINI: 0.3,
  OPENAI: 0.5,
  CLAUDE: 0.5,
  OPENROUTER: 0.3,
};

// When no preference is saved, every model is enabled (a model still only
// works once its provider key is set — that's the real gate).
export function defaultEnabledValues(): string[] {
  return AI_MODELS.map((m) => m.value);
}
