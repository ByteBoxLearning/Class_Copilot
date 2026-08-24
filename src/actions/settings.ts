"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import {
  setApiKey, clearApiKey, MANAGED_KEYS, setAiEnabled, setAiTemps, setCommentsPrompt,
  setAssignmentGeneratePrompt, setAssignmentImprovePrompt,
} from "@/lib/settings";
import { AI_MODELS, AI_PROVIDER_ORDER } from "@/lib/ai/engines";
import { COMMENTS_PROMPT_PLACEHOLDERS } from "@/lib/comments/prompt-defaults";
import { ASSIGNMENT_PROMPT_PLACEHOLDERS } from "@/lib/assignments/prompt-defaults";
import type { ActionResult } from "./types";

const MANAGED = new Set<string>(MANAGED_KEYS.map((k) => k.name));

// Owner-only: store an API key (encrypted) so it's used everywhere with no
// redeploy. The value never leaves the server after this.
export async function saveApiKey(name: string, value: string): Promise<ActionResult> {
  const admin = await requireOwner();
  if (!MANAGED.has(name)) return { ok: false, error: "Unknown setting." };
  const v = value.trim();
  if (v.length < 8) return { ok: false, error: "That key looks too short — paste the full key." };

  await setApiKey(name, v, admin.id);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: `Updated ${name}` });
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removeApiKey(name: string): Promise<ActionResult> {
  const admin = await requireOwner();
  if (!MANAGED.has(name)) return { ok: false, error: "Unknown setting." };

  await clearApiKey(name);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: `Cleared ${name}` });
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Owner-only: choose which AI engines are selectable across the app.
const AI_MODEL_VALUES = new Set<string>(AI_MODELS.map((m) => m.value));
export async function saveAiEnabledModels(values: string[]): Promise<ActionResult> {
  const admin = await requireOwner();
  const clean = (Array.isArray(values) ? values : []).filter((v) => AI_MODEL_VALUES.has(v));
  await setAiEnabled(clean, admin.id);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: `Updated enabled AI engines (${clean.length})` });
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Owner-only: set generation temperature per provider (each 0-1).
export async function saveAiTemperatures(map: Record<string, number>): Promise<ActionResult> {
  const admin = await requireOwner();
  const clean: Record<string, number> = {};
  for (const provider of AI_PROVIDER_ORDER) {
    const n = Number(map?.[provider]);
    if (!Number.isFinite(n) || n < 0 || n > 1) return { ok: false, error: `Each temperature must be between 0 and 1 (check ${provider}).` };
    clean[provider] = n;
  }
  await setAiTemps(clean, admin.id);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: "Updated AI temperatures" });
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Owner-only: edit the End-of-Term Comments prompt. Guards only that the
// placeholders survive — unlike the (future) Assignment Builder prompt, this
// one has no JSON contract to protect, since the output is plain prose used
// as-is (see CONTEXT.md's "who authored it" principle for why AI-output
// parsing stays lenient while this save-time check stays minimal).
export async function saveCommentsPrompt(prompt: string): Promise<ActionResult> {
  const admin = await requireOwner();
  if (!prompt.trim()) return { ok: false, error: "The prompt can't be empty." };
  const required = [COMMENTS_PROMPT_PLACEHOLDERS.studentName, COMMENTS_PROMPT_PLACEHOLDERS.dailyCheckSummary, COMMENTS_PROMPT_PLACEHOLDERS.masterySummary];
  const missing = required.filter((p) => !prompt.includes(p));
  if (missing.length) return { ok: false, error: `Keep these placeholders: ${missing.join(", ")}.` };
  await setCommentsPrompt(prompt, admin.id);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: "Updated End-of-Term Comments prompt" });
  revalidatePath("/admin/settings");
  return { ok: true };
}

const ASSIGNMENT_JSON_MARKER = '"sections"';

// Owner-only: edit the Assignment Builder's "generate from scratch" prompt.
// Guards the pieces the app relies on so a bad edit can't silently break
// generation — same posture as the source CRM's saveCvPrompt.
export async function saveAssignmentGeneratePrompt(prompt: string): Promise<ActionResult> {
  const admin = await requireOwner();
  if (!prompt.trim()) return { ok: false, error: "The prompt can't be empty." };
  const required = [ASSIGNMENT_PROMPT_PLACEHOLDERS.assignmentType, ASSIGNMENT_PROMPT_PLACEHOLDERS.standards, ASSIGNMENT_PROMPT_PLACEHOLDERS.classContext];
  const missing = required.filter((p) => !prompt.includes(p));
  if (missing.length) return { ok: false, error: `Keep these placeholders: ${missing.join(", ")}.` };
  if (!prompt.includes(ASSIGNMENT_JSON_MARKER)) return { ok: false, error: 'The JSON shape must keep the "sections" array — parsing depends on it.' };
  await setAssignmentGeneratePrompt(prompt, admin.id);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: "Updated Assignment Builder generate prompt" });
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Owner-only: edit the Assignment Builder's "improve existing material"
// prompt. Also requires {{SOURCE_MATERIAL}} — this prompt is meaningless
// without it.
export async function saveAssignmentImprovePrompt(prompt: string): Promise<ActionResult> {
  const admin = await requireOwner();
  if (!prompt.trim()) return { ok: false, error: "The prompt can't be empty." };
  const required = [
    ASSIGNMENT_PROMPT_PLACEHOLDERS.assignmentType, ASSIGNMENT_PROMPT_PLACEHOLDERS.standards,
    ASSIGNMENT_PROMPT_PLACEHOLDERS.classContext, ASSIGNMENT_PROMPT_PLACEHOLDERS.sourceMaterial,
  ];
  const missing = required.filter((p) => !prompt.includes(p));
  if (missing.length) return { ok: false, error: `Keep these placeholders: ${missing.join(", ")}.` };
  if (!prompt.includes(ASSIGNMENT_JSON_MARKER)) return { ok: false, error: 'The JSON shape must keep the "sections" array — parsing depends on it.' };
  await setAssignmentImprovePrompt(prompt, admin.id);
  await logActivity({ userId: admin.id, actionType: "SETTING_UPDATED", description: "Updated Assignment Builder improve prompt" });
  revalidatePath("/admin/settings");
  return { ok: true };
}
