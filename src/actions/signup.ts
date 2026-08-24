"use server";

// Public, unauthenticated action behind /signup — a brand-new teacher
// creating their own independent workspace (OWNER account, ownerId: null).
// Distinct from actions/users.ts::createUser, which only ever creates
// ASSISTANT accounts inside an EXISTING owner's workspace.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { signupSchema } from "@/lib/validations";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

export async function signupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: "An account with that email already exists." };

  const created = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "OWNER",
    },
  });
  await logActivity({ userId: created.id, actionType: "WORKSPACE_CREATED", description: `${created.name} created a new workspace via signup` });

  await createSession({
    id: created.id,
    name: created.name,
    email: created.email,
    role: "OWNER",
    allClientsAccess: false,
    ownerId: null,
    sv: created.sessionVersion,
  });
  redirect("/admin/dashboard");
}
