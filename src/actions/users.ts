"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, hashPassword, type SessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { newUserSchema } from "@/lib/validations";
import { generateTempPassword } from "@/lib/password";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// Every mutating action below acts on a target user id. Each OWNER is an
// independent workspace root now (not a single platform-wide admin), so a
// target must be an ASSISTANT this specific OWNER created — never another
// OWNER's account, and never an ASSISTANT that belongs to someone else's
// workspace. Returns null (caller should report "User not found", not a
// permission error — don't confirm the id exists in someone else's workspace).
async function requireOwnedAssistant(admin: SessionUser, id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "ASSISTANT" || user.ownerId !== admin.id) return null;
  return user;
}

// The temp password is returned ONCE so the admin can copy it. It is never
// stored in plaintext — only its hash is saved.
export type CreateUserResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  tempPassword?: string;
  email?: string;
};

export async function createUser(_prev: CreateUserResult, formData: FormData): Promise<CreateUserResult> {
  const admin = await requireRole("OWNER");
  const parsed = newUserSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const tempPassword = generateTempPassword();
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      role: "ASSISTANT", // OWNER accounts only ever come from /signup now
      ownerId: admin.id,
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true, // forced reset on first login
    },
  });

  await logActivity({ userId: admin.id, actionType: "USER_CREATED", description: `Created assistant account: ${email}` });

  // TODO (Option B): when an email provider is configured, email these
  // credentials to `email` instead of only returning them to the admin.
  revalidatePath("/admin/users");
  return { ok: true, tempPassword, email };
}

// Reset a user's password to a fresh temporary one and force a change on login.
export async function resetUserPassword(id: string): Promise<CreateUserResult> {
  const admin = await requireRole("OWNER");
  const user = id === admin.id ? await prisma.user.findUnique({ where: { id } }) : await requireOwnedAssistant(admin, id);
  if (!user) return { ok: false, error: "User not found." };

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true },
  });
  await logActivity({ userId: admin.id, actionType: "USER_PASSWORD_RESET", description: `Reset password for ${user.email}` });
  revalidatePath("/admin/users");
  return { ok: true, tempPassword, email: user.email };
}

// Promote / demote a user between OWNER and ASSISTANT. Only ever acts on an
// ASSISTANT this OWNER personally created (see requireOwnedAssistant) — never
// another OWNER's account. Promoting to OWNER "graduates" them into their own
// independent workspace (their existing ClassCoTeacher grants, if any, still
// work — those are explicit per-class access, unaffected by workspace).
export async function changeUserRole(id: string, role: "OWNER" | "ASSISTANT") {
  const admin = await requireRole("OWNER");
  if (!["OWNER", "ASSISTANT"].includes(role)) return { ok: false, error: "Invalid role." };

  // Can't change your own role (avoids self-lockout) — checked before the
  // ownership lookup below since admin.id is never a valid target anyway.
  if (id === admin.id) return { ok: false, error: "You cannot change your own role." };

  const user = await requireOwnedAssistant(admin, id);
  if (!user) return { ok: false, error: "User not found." };
  if (user.role === role) return { ok: true }; // no-op

  // Bump sessionVersion so the change takes effect on their next request.
  // Promoting to OWNER also clears ownerId — they're now their own workspace root.
  await prisma.user.update({
    where: { id },
    data: { role, ownerId: role === "OWNER" ? null : admin.id, sessionVersion: { increment: 1 } },
  });
  await logActivity({
    userId: admin.id,
    actionType: "USER_ROLE_CHANGED",
    description: `Changed ${user.email} from ${user.role} to ${role}`,
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/assistants");
  return { ok: true };
}

// Grant/revoke an assistant's access to ALL clients (owner-only). Bumps the
// session version so it applies immediately.
export async function setAllClientsAccess(id: string, value: boolean): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole("OWNER");
  const user = await requireOwnedAssistant(admin, id);
  if (!user) return { ok: false, error: "User not found." };
  await prisma.user.update({ where: { id }, data: { allClientsAccess: value, sessionVersion: { increment: 1 } } });
  await logActivity({ userId: admin.id, actionType: "USER_ACCESS_CHANGED", description: `${value ? "Granted" : "Revoked"} all-client access for ${user.email}` });
  revalidatePath("/admin/assistants");
  return { ok: true };
}

// Edit a user's display name and/or email (admin-only). Email is the login, so
// it must stay valid and unique.
export async function updateUser(id: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole("OWNER");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid email address." };

  const user = id === admin.id ? await prisma.user.findUnique({ where: { id } }) : await requireOwnedAssistant(admin, id);
  if (!user) return { ok: false, error: "User not found." };

  if (email !== user.email) {
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash) return { ok: false, error: "Another user already uses that email." };
  }

  await prisma.user.update({ where: { id }, data: { name, email } });
  await logActivity({
    userId: admin.id,
    actionType: "USER_UPDATED",
    description: `Updated account ${user.email}${email !== user.email ? ` → ${email}` : ""} (${name})`,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

// Permanently delete a user — but ONLY if they have no linked history. If they
// have added jobs, comments, CVs, activity, etc., we refuse and tell the admin to
// deactivate instead (deleting would destroy or orphan that work). Meant for
// clearing empty/test accounts.
export async function deleteUser(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireRole("OWNER");

  // Guardrail: never delete yourself (checked first — admin.id is never a
  // valid requireOwnedAssistant target anyway, but this gives a clearer error).
  if (id === admin.id) return { ok: false, error: "You cannot delete your own account." };

  const user = await requireOwnedAssistant(admin, id);
  if (!user) return { ok: false, error: "User not found." };

  // Block if the user has any real history (required-relation records).
  const [comments, logs, tasks, checks, notifs] = await Promise.all([
    prisma.feedback.count({ where: { userId: id } }),
    prisma.activityLog.count({ where: { userId: id } }),
    prisma.task.count({ where: { createdById: id } }),
    prisma.checklistCompletion.count({ where: { userId: id } }),
    prisma.notification.count({ where: { userId: id } }),
  ]);
  const parts: string[] = [];
  if (comments) parts.push(`${comments} comment${comments === 1 ? "" : "s"}`);
  if (tasks) parts.push(`${tasks} task${tasks === 1 ? "" : "s"} created`);
  if (logs || checks || notifs) parts.push("activity history");
  if (parts.length) {
    return { ok: false, error: `Can't delete ${user.name} — they have ${parts.join(", ")}. Deactivate them instead to keep this history.` };
  }

  // Clear optional back-references so the delete isn't blocked, then delete.
  await prisma.task.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });

  await prisma.user.delete({ where: { id } });
  await logActivity({ userId: admin.id, actionType: "USER_DELETED", description: `Deleted account ${user.email}` });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserActive(id: string, active: boolean) {
  const admin = await requireRole("OWNER");
  // Never let an admin deactivate their own account (avoids locking yourself out).
  if (id === admin.id) return { ok: false, error: "You cannot deactivate your own account." };

  const user = await requireOwnedAssistant(admin, id);
  if (!user) return { ok: false, error: "User not found." };

  // Bump sessionVersion so a deactivation logs them out on their next request.
  await prisma.user.update({ where: { id }, data: { active, sessionVersion: { increment: 1 } } });
  await logActivity({ userId: admin.id, actionType: active ? "USER_ACTIVATED" : "USER_DEACTIVATED", description: `${active ? "Activated" : "Deactivated"} ${user.email}` });
  revalidatePath("/admin/users");
  revalidatePath("/admin/assistants");
  return { ok: true };
}
