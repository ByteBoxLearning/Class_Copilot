"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession, getSessionUser, dashboardPathFor } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { loginSchema } from "@/lib/validations";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const result = await authenticate(parsed.data.email, parsed.data.password);
  if (!result) return { error: "Invalid email or password" };
  if ("error" in result) return { error: result.error };

  const user = result.user;
  await createSession(user);
  await logActivity({ userId: user.id, actionType: "USER_LOGIN", description: "User logged in" });

  // First-time / reset accounts must set a new password before continuing.
  if (user.mustChangePassword) redirect("/change-password");
  redirect(dashboardPathFor(user.role));
}

export async function logoutAction() {
  const user = await getSessionUser();
  if (user) {
    await logActivity({ userId: user.id, actionType: "USER_LOGOUT", description: "User logged out" });
  }
  await destroySession();
  redirect("/login");
}
