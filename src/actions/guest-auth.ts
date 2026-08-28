"use server";

// Public, unauthenticated actions for the self-service guest practice
// accounts (see src/lib/guest-auth.ts) — completely separate from
// actions/signup.ts and actions/auth.ts, which are for real teacher/student
// accounts. No roster/domain gate applies here on purpose.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createGuestSession, destroyGuestSession, getGuestSessionUser, authenticateGuest, hashPassword } from "@/lib/guest-auth";
import { guestSignupSchema, loginSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

const SIGNUP_MAX = 30;
const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

export async function guestSignupAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = guestSignupSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  if (!checkRateLimit("guest-signup:global", SIGNUP_MAX, SIGNUP_WINDOW_MS).ok) {
    return { ok: false, error: "Too many sign-up attempts right now. Please try again in a few minutes." };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.guestUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: "An account with that email already exists." };

  const created = await prisma.guestUser.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  await createGuestSession({ id: created.id, name: created.name, email: created.email, sv: created.sessionVersion });
  redirect("/guest/practice");
}

export type GuestLoginState = { error?: string };

export async function guestLoginAction(_prev: GuestLoginState, formData: FormData): Promise<GuestLoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? "Invalid input" };

  const limit = checkRateLimit(`guest-login:${parsed.data.email.toLowerCase().trim()}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);
  if (!limit.ok) return { error: "Too many login attempts for this account. Try again in a few minutes." };

  const result = await authenticateGuest(parsed.data.email, parsed.data.password);
  if (!result) return { error: "Invalid email or password" };
  if ("error" in result) return { error: result.error };

  await createGuestSession(result.user);
  redirect("/guest/practice");
}

export async function guestLogoutAction() {
  await getGuestSessionUser();
  await destroyGuestSession();
  redirect("/guest/login");
}
