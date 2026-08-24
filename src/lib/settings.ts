import "server-only";
import { prisma } from "./prisma";
import { encryptSecret, decryptSecret } from "./crypto";
import {
  AI_MODELS, AI_PROVIDER_META, AI_PROVIDER_ORDER, AI_MODEL_ENABLED_KEY, AI_TEMPS_KEY,
  DEFAULT_AI_TEMPS, defaultEnabledValues, type AiProvider, type AiModelChoice,
} from "./ai/engines";
import { COMMENTS_PROMPT_KEY, DEFAULT_COMMENTS_PROMPT } from "./comments/prompt-defaults";
import {
  ASSIGNMENT_GENERATE_PROMPT_KEY, DEFAULT_ASSIGNMENT_GENERATE_PROMPT,
  ASSIGNMENT_IMPROVE_PROMPT_KEY, DEFAULT_ASSIGNMENT_IMPROVE_PROMPT,
} from "./assignments/prompt-defaults";

// Centralised API-key + app-setting access. Revived from the source CRM's
// src/lib/settings.ts (Milestone A stripped it; brought back for Milestone G
// — see CONTEXT.md's "What came back" section), trimmed to what THIS domain
// needs: 4 AI provider keys (Comments generator now, Assignment Builder
// later) + 2 Google OAuth keys (unused today, reserved for the still-blocked
// Google Sheets roster import — same `getApiKey` DB-first/env-fallback path
// will pick them up at zero extra cost once that ships). Everything
// CV/job-board/billing/branding-specific from the source was dropped.
//
// A key set on the admin Settings page (stored encrypted in the DB) takes
// precedence; otherwise falls back to the env var of the same name. This lets
// the teacher rotate keys from the website with no redeploy, while env vars
// still work as a safety net (e.g. for local dev).
//
// GOOGLE_CLIENT_ID/SECRET are shared by two features: Google Sign-In
// (Milestone S, live — see src/lib/google-oauth.ts) and the still-unbuilt
// Google Sheets roster import (Milestone C.3). One Google Cloud OAuth client
// can request both features' scopes (openid/email/profile for sign-in,
// spreadsheets.readonly for Sheets), so there's no need for a second pair.
export const MANAGED_KEYS = [
  { name: "GEMINI_API_KEY", label: "Google Gemini", hint: "Free tier. Get a key at aistudio.google.com/apikey" },
  { name: "OPENAI_API_KEY", label: "OpenAI (GPT)", hint: "Paid — one key unlocks all GPT models. platform.openai.com/api-keys" },
  { name: "ANTHROPIC_API_KEY", label: "Claude (Anthropic)", hint: "Paid — one key unlocks all Claude models. console.anthropic.com" },
  { name: "OPENROUTER_API_KEY", label: "OpenRouter", hint: "Optional free backup engine. openrouter.ai" },
  { name: "GOOGLE_CLIENT_ID", label: "Google OAuth — Client ID", hint: "Powers 'Continue with Google' on the login page. Also reserved for the still-unbuilt Google Sheets roster import." },
  { name: "GOOGLE_CLIENT_SECRET", label: "Google OAuth — Client Secret", hint: "Powers 'Continue with Google' on the login page. Also reserved for the still-unbuilt Google Sheets roster import." },
] as const;

export type ManagedKeyName = (typeof MANAGED_KEYS)[number]["name"];

// --- Generic plain-text setting storage --------------------------------------
async function getPlainSetting(key: string, fallback: string): Promise<string> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row?.value) return row.value;
  } catch {
    /* DB unreachable — use default */
  }
  return fallback;
}

async function setPlainSetting(key: string, value: string, userId?: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value, updatedById: userId ?? null },
    update: { value, updatedById: userId ?? null },
  });
}

// --- End-of-Term Comments prompt (admin-editable, stored plain) -------------
export const getCommentsPrompt = () => getPlainSetting(COMMENTS_PROMPT_KEY, DEFAULT_COMMENTS_PROMPT);
export const setCommentsPrompt = (v: string, userId?: string) => setPlainSetting(COMMENTS_PROMPT_KEY, v, userId);

// --- Assignment Builder prompts (admin-editable, stored plain) --------------
// Two prompts, not one — generate-from-scratch and improve-existing-material
// have materially different rules (see assignments/prompt-defaults.ts).
export const getAssignmentGeneratePrompt = () => getPlainSetting(ASSIGNMENT_GENERATE_PROMPT_KEY, DEFAULT_ASSIGNMENT_GENERATE_PROMPT);
export const setAssignmentGeneratePrompt = (v: string, userId?: string) => setPlainSetting(ASSIGNMENT_GENERATE_PROMPT_KEY, v, userId);
export const getAssignmentImprovePrompt = () => getPlainSetting(ASSIGNMENT_IMPROVE_PROMPT_KEY, DEFAULT_ASSIGNMENT_IMPROVE_PROMPT);
export const setAssignmentImprovePrompt = (v: string, userId?: string) => setPlainSetting(ASSIGNMENT_IMPROVE_PROMPT_KEY, v, userId);

// --- AI generation temperature, per provider ---------------------------------
export async function getAiTemps(): Promise<Record<AiProvider, number>> {
  const raw = await getPlainSetting(AI_TEMPS_KEY, "");
  let saved: Record<string, unknown> = {};
  if (raw) { try { saved = JSON.parse(raw); } catch { /* bad JSON — ignore */ } }
  const out = { ...DEFAULT_AI_TEMPS };
  for (const p of AI_PROVIDER_ORDER) {
    const n = parseFloat(String(saved[p]));
    if (Number.isFinite(n)) out[p] = Math.max(0, Math.min(1, n));
  }
  return out;
}

export async function getAiTemperatureFor(provider: AiProvider): Promise<number> {
  const temps = await getAiTemps();
  return temps[provider] ?? DEFAULT_AI_TEMPS[provider];
}

export const setAiTemps = (map: Record<string, number>, userId?: string) =>
  setPlainSetting(AI_TEMPS_KEY, JSON.stringify(map), userId);

// --- AI model enable/disable (admin toggles which engines are selectable) ---
export async function getAiEnabledSet(): Promise<Set<string>> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: AI_MODEL_ENABLED_KEY } });
    if (row?.value) {
      const arr = JSON.parse(row.value) as string[];
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {
    /* DB unreachable / bad JSON — fall back to all-enabled */
  }
  return new Set(defaultEnabledValues());
}

export async function setAiEnabled(values: string[], userId?: string): Promise<void> {
  const clean = values.filter((v) => AI_MODELS.some((m) => m.value === v));
  await prisma.setting.upsert({
    where: { key: AI_MODEL_ENABLED_KEY },
    create: { key: AI_MODEL_ENABLED_KEY, value: JSON.stringify(clean), updatedById: userId ?? null },
    update: { value: JSON.stringify(clean), updatedById: userId ?? null },
  });
}

// The full picture an engine picker needs: every model with its enabled flag,
// whether its provider key is present, and a locked flag.
export async function getAiModelChoices(): Promise<AiModelChoice[]> {
  const enabled = await getAiEnabledSet();

  const keyByProvider = new Map<AiProvider, boolean>();
  await Promise.all(
    AI_PROVIDER_ORDER.map(async (p) => {
      keyByProvider.set(p, !!(await getApiKey(AI_PROVIDER_META[p].keyName)));
    }),
  );

  return AI_MODELS.map((m) => {
    const isEnabled = enabled.has(m.value);
    const hasKey = keyByProvider.get(m.provider) ?? false;
    const locked = !isEnabled || !hasKey;
    const lockReason = !hasKey ? "needs key" : !isEnabled ? "off" : null;
    return {
      value: m.value,
      label: m.label,
      provider: m.provider,
      providerLabel: AI_PROVIDER_META[m.provider].label,
      free: m.free,
      note: m.note,
      enabled: isEnabled,
      hasKey,
      locked,
      lockReason: lockReason as AiModelChoice["lockReason"],
    };
  });
}

// --- Managed secrets (API keys) ----------------------------------------------

// The value the app should actually use: DB (decrypted) first, then env var.
export async function getApiKey(name: string): Promise<string | undefined> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: name } });
    if (row?.value) {
      try {
        return decryptSecret(row.value);
      } catch {
        /* corrupt/rotated AUTH_SECRET — fall back to env */
      }
    }
  } catch {
    /* DB unreachable — fall back to env */
  }
  return process.env[name] || undefined;
}

export async function setApiKey(name: string, value: string, userId?: string): Promise<void> {
  const enc = encryptSecret(value);
  await prisma.setting.upsert({
    where: { key: name },
    create: { key: name, value: enc, updatedById: userId ?? null },
    update: { value: enc, updatedById: userId ?? null },
  });
}

export async function clearApiKey(name: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: name } });
}

export type KeyStatus = {
  name: string;
  label: string;
  hint: string;
  source: "website" | "env" | "none";
  masked: string | null;
  updatedAt: string | null;
};

function mask(v: string): string {
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

// Status for the admin UI — masked previews only; the full key never leaves
// the server.
export async function getKeyStatuses(): Promise<KeyStatus[]> {
  const rows = await prisma.setting.findMany({ where: { key: { in: MANAGED_KEYS.map((k) => k.name) } } });
  const byName = new Map(rows.map((r) => [r.key, r]));

  return MANAGED_KEYS.map((k) => {
    const row = byName.get(k.name);
    if (row?.value) {
      let masked: string | null = null;
      try {
        masked = mask(decryptSecret(row.value));
      } catch {
        masked = null;
      }
      return { name: k.name, label: k.label, hint: k.hint, source: "website", masked, updatedAt: row.updatedAt.toISOString() };
    }
    if (process.env[k.name]) {
      return { name: k.name, label: k.label, hint: k.hint, source: "env", masked: mask(process.env[k.name] as string), updatedAt: null };
    }
    return { name: k.name, label: k.label, hint: k.hint, source: "none", masked: null, updatedAt: null };
  });
}
