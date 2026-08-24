"use server";

// Public, unauthenticated actions behind /invite/[token] — a student
// accepting a self-service portal invite link a teacher generated (see
// actions/students.ts::generateStudentInviteLink). No requireUser/requireOwner
// here: the token itself is the credential.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { acceptStudentInviteSchema } from "@/lib/validations";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

export type InviteInfo = { valid: true; studentName: string } | { valid: false; reason: string };

// Looked up by the invite page before rendering the form, so an expired/used
// link shows a clear message instead of a broken form.
export async function getInviteInfo(token: string): Promise<InviteInfo> {
  const invite = await prisma.studentInvite.findUnique({
    where: { token },
    include: { student: { select: { displayName: true, linkedUserId: true } } },
  });
  if (!invite) return { valid: false, reason: "This invite link isn't valid. Ask your teacher for a new one." };
  if (invite.student.linkedUserId) return { valid: false, reason: "This invite has already been used." };
  if (invite.expiresAt < new Date()) return { valid: false, reason: "This invite link has expired. Ask your teacher for a new one." };
  return { valid: true, studentName: invite.student.displayName };
}

export async function acceptStudentInvite(token: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const invite = await prisma.studentInvite.findUnique({
    where: { token },
    include: { student: { select: { id: true, displayName: true, linkedUserId: true } } },
  });
  if (!invite || invite.expiresAt < new Date()) {
    return { ok: false, error: "This invite link is invalid or has expired. Ask your teacher for a new one." };
  }
  if (invite.student.linkedUserId) return { ok: false, error: "This invite has already been used." };

  const parsed = acceptStudentInviteSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) return { ok: false, error: "That email is already in use." };

  const created = await prisma.user.create({
    data: {
      name: invite.student.displayName,
      email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "CLIENT",
    },
  });
  await prisma.$transaction([
    prisma.student.update({ where: { id: invite.studentId }, data: { linkedUserId: created.id } }),
    prisma.studentInvite.delete({ where: { token } }),
  ]);
  await logActivity({
    userId: created.id,
    studentId: invite.studentId,
    actionType: "STUDENT_INVITE_ACCEPTED",
    description: `${invite.student.displayName} created their own portal login`,
  });

  await createSession({
    id: created.id,
    name: created.name,
    email: created.email,
    role: "CLIENT",
    studentId: invite.studentId,
    allClientsAccess: false,
    sv: created.sessionVersion,
  });
  redirect("/portal/dashboard");
}
