"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, createSession, hashPassword, verifyPassword, dashboardPathFor, normalizeRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { changePasswordSchema } from "@/lib/validations";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const sessionUser = await requireUser();
  const parsed = changePasswordSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: { studentAccount: { select: { id: true } } },
  });
  if (!user) return { ok: false, error: "Account not found." };

  // If this is a voluntary change (not a forced first-login reset), require the
  // current password. Forced resets skip this — the user just logged in with the
  // temporary password.
  if (!user.mustChangePassword) {
    const current = String(parsed.data.currentPassword ?? "");
    if (!current) return { ok: false, error: "Enter your current password.", fieldErrors: { currentPassword: "Required" } };
    const ok = await verifyPassword(current, user.passwordHash);
    if (!ok) return { ok: false, error: "Current password is incorrect.", fieldErrors: { currentPassword: "Incorrect" } };
  }

  // Don't allow reusing the same password.
  if (await verifyPassword(parsed.data.newPassword, user.passwordHash)) {
    return { ok: false, error: "Choose a password different from your current one.", fieldErrors: { newPassword: "Must be different" } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false },
  });
  await logActivity({ userId: user.id, actionType: "PASSWORD_CHANGED", description: "Changed their password" });

  // Re-issue the session so mustChangePassword=false takes effect immediately.
  await createSession({
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    mustChangePassword: false,
    studentId: user.studentAccount?.id ?? null,
    allClientsAccess: user.allClientsAccess,
    sv: user.sessionVersion,
  });

  redirect(dashboardPathFor(normalizeRole(user.role)));
}
