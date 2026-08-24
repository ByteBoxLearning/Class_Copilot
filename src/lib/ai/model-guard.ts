import "server-only";
import { findAiModel, AI_PROVIDER_META } from "./engines";
import { getApiKey, getAiEnabledSet } from "@/lib/settings";

// Validate a chosen AI model: it must exist, be enabled by the admin, and
// have its provider key configured. Returns a user-facing error, or null
// when OK. Adapted from src/lib/cv/model-guard.ts.
export async function validateAiModel(model: string): Promise<string | null> {
  const m = findAiModel(model);
  if (!m) return "Unknown AI model. Please pick another engine.";
  const enabled = await getAiEnabledSet();
  if (!enabled.has(model)) return "That AI engine is turned off. Enable it (or pick another) in Admin → Settings.";
  const provider = AI_PROVIDER_META[m.provider];
  if (!(await getApiKey(provider.keyName))) {
    const name = provider.label.replace(/\s*—.*$/, "");
    return `${name} isn't configured. Add its key in Admin → Settings, or pick another engine.`;
  }
  return null;
}

// Friendly message for a provider being busy / rate-limited / erroring. The
// `${Provider} API {status}: ...` convention every *-call.ts throws is
// load-bearing for this regex — preserve it in any new provider caller.
const AI_BUSY_RE = /(Gemini|OpenRouter|OpenAI|Claude) API (4|5)\d\d/;
export function aiErrorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && AI_BUSY_RE.test(e.message)
    ? "The AI engine is busy or rate-limited right now. Please wait ~30 seconds and try again — or switch engine."
    : fallback;
}
