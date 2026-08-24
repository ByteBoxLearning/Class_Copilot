"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { assertCanAccessStudent } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { studentSchema } from "@/lib/validations";
import { generateInviteToken } from "@/lib/password";
import { checkStudentEmailAllowed } from "@/lib/allowed-email";
import type { ActionResult } from "./types";

const INVITE_TTL_DAYS = 7;

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// --- Create / edit students (owner-only) ------------------------------------

export async function createStudent(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = studentSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  if (d.email) {
    const emailError = await checkStudentEmailAllowed(d.email);
    if (emailError) return { ok: false, error: emailError, fieldErrors: { email: emailError } };
  }
  const student = await prisma.student.create({
    data: {
      displayName: d.displayName,
      gradeLevel: d.gradeLevel ?? null,
      status: d.status,
      notes: d.notes ?? null,
      email: d.email || null,
      createdByUserId: user.id,
    },
  });
  await logActivity({ userId: user.id, studentId: student.id, actionType: "STUDENT_CREATED", description: `Created student ${student.displayName}` });
  revalidatePath("/admin/students");
  redirect(`/admin/students/${student.id}`);
}

export async function updateStudent(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Student not found." };
  await assertCanAccessStudent(user, id);
  const parsed = studentSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  if (d.email && d.email !== existing.email) {
    const emailError = await checkStudentEmailAllowed(d.email);
    if (emailError) return { ok: false, error: emailError, fieldErrors: { email: emailError } };
  }
  await prisma.student.update({
    where: { id },
    data: {
      displayName: d.displayName,
      gradeLevel: d.gradeLevel ?? null,
      status: d.status,
      notes: d.notes ?? null,
      email: d.email || null,
    },
  });
  await logActivity({ userId: user.id, studentId: id, actionType: "STUDENT_UPDATED", description: `Updated student ${d.displayName}` });
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  return { ok: true, id };
}

export async function setStudentStatus(id: string, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
  const user = await requireOwner();
  await assertCanAccessStudent(user, id);
  await prisma.student.update({ where: { id }, data: { status } });
  await logActivity({ userId: user.id, studentId: id, actionType: "STUDENT_STATUS_CHANGED", newValue: status, description: `Set student status to ${status}` });
  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  return { ok: true };
}

export async function setStudentFlag(id: string, flag: "EXCELLING" | "ON_TRACK" | "NEEDS_SUPPORT") {
  const user = await requireOwner();
  await assertCanAccessStudent(user, id);
  await prisma.student.update({ where: { id }, data: { flag } });
  await logActivity({ userId: user.id, studentId: id, actionType: "STUDENT_FLAG_CHANGED", newValue: flag, description: `Set student flag to ${flag}` });
  revalidatePath("/admin/students");
  revalidatePath(`/admin/students/${id}`);
  return { ok: true };
}

// --- Student portal invite (owner-only): generate a self-service link -------
// The teacher no longer picks the student's email/password — they generate a
// link, share it (copy/paste anywhere: email, Google Classroom, etc. — no
// email transport in v1), and the student sets their own email + password by
// visiting /invite/[token] (see actions/invite.ts::acceptStudentInvite).

export type InviteLinkResult = { ok: true; token: string; expiresAt: string } | { ok: false; error: string };

export async function generateStudentInviteLink(studentId: string): Promise<InviteLinkResult> {
  const user = await requireOwner();
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, displayName: true, linkedUserId: true } });
  if (!student) return { ok: false, error: "Student not found." };
  await assertCanAccessStudent(user, studentId);
  if (student.linkedUserId) return { ok: false, error: "This student already has a portal login." };

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.studentInvite.upsert({
    where: { studentId },
    create: { studentId, token, expiresAt },
    update: { token, expiresAt },
  });
  await logActivity({ userId: user.id, studentId, actionType: "STUDENT_INVITE_LINK_CREATED", description: `Generated a portal invite link for ${student.displayName}` });
  revalidatePath(`/admin/students/${studentId}`);
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}

export async function cancelStudentInvite(studentId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessStudent(user, studentId);
  await prisma.studentInvite.deleteMany({ where: { studentId } });
  await logActivity({ userId: user.id, studentId, actionType: "STUDENT_INVITE_LINK_CANCELLED", description: "Cancelled a pending portal invite link" });
  revalidatePath(`/admin/students/${studentId}`);
  return { ok: true };
}

export async function revokeStudentLogin(studentId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessStudent(user, studentId);
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { linkedUserId: true } });
  if (!student?.linkedUserId) return { ok: false, error: "No portal login to revoke." };
  // Deactivate the login and bump its session version (immediate logout).
  await prisma.user.update({ where: { id: student.linkedUserId }, data: { active: false, sessionVersion: { increment: 1 } } });
  await logActivity({ userId: user.id, studentId, actionType: "STUDENT_LOGIN_REVOKED", description: "Revoked student's portal login" });
  revalidatePath(`/admin/students/${studentId}`);
  return { ok: true };
}
