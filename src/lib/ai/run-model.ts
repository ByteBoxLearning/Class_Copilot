import "server-only";
import { findAiModel, type LlmResult, type LlmCallOptions } from "./engines";
import { callGemini } from "./gemini-call";
import { callOpenAI } from "./openai-call";
import { callClaude } from "./claude-call";
import { callOpenRouter } from "./openrouter-call";
import { getAiTemperatureFor, getAiDisclosureAck } from "@/lib/settings";

// Route any prompt to the chosen model's provider and return its raw text
// plus the token usage the API reported. Shared by every AI feature in this
// app (End-of-Term Comments now, the Assignment Builder later) so they all
// behave identically — same engine picker, same gating, same error shape.
// Domain-neutral: no feature-specific parsing happens here, that's the
// caller's job (e.g. comments/prompt.ts just trims the text; a future
// Assignment Builder would JSON-parse it).
export async function runModel(prompt: string, modelValue: string, opts: LlmCallOptions = {}): Promise<LlmResult> {
  // Hard gate: no prompt — which may carry real student names/notes/work —
  // reaches a third-party provider until an admin has explicitly
  // acknowledged that data-sharing in Admin -> Settings. Every AI feature
  // funnels through here, so this is the one place this needs enforcing.
  if (!(await getAiDisclosureAck())) {
    throw new Error("AI features aren't enabled yet — an administrator must acknowledge the data-sharing disclosure in Admin → Settings first.");
  }

  const m = findAiModel(modelValue);
  if (!m) throw new Error("Unknown AI model.");

  // Each provider uses its own admin-tunable temperature (Settings) unless
  // the caller passes an explicit override.
  const temperature = opts.temperature ?? (await getAiTemperatureFor(m.provider));
  const callOpts: LlmCallOptions = { ...opts, temperature };

  if (m.provider === "OPENROUTER") return callOpenRouter(prompt, callOpts);
  if (m.provider === "GEMINI") return callGemini(prompt, m.apiModel, callOpts);
  if (m.provider === "OPENAI") return callOpenAI(prompt, m.apiModel, callOpts);
  if (m.provider === "CLAUDE") return callClaude(prompt, m.apiModel, callOpts);
  throw new Error("Unsupported AI provider.");
}
