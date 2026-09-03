"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner, requireStaff } from "@/lib/auth";
import { assertCanAccessClass, assertCanAccessStudent } from "@/lib/access";
import { setCurrentClassId } from "@/lib/classes";
import { logActivity } from "@/lib/activity-log";
import { classSchema } from "@/lib/validations";
import { generateInviteToken, INVITE_TTL_DAYS } from "@/lib/password";
import { emailSendingConfigured, sendInviteEmail } from "@/lib/email";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// --- Current-class switcher (staff) -----------------------------------------

export async function switchClass(classId: string, returnTo?: string) {
  const user = await requireStaff();
  await assertCanAccessClass(user, classId);
  await setCurrentClassId(user.id, classId);
  revalidatePath("/admin/dashboard");
  revalidatePath("/assistant/dashboard");
  if (returnTo) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}class=${classId}`);
  return { ok: true };
}

// --- Class CRUD (teacher-only) -----------------------------------------------

export async function createClass(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const parsed = classSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  const cls = await prisma.class.create({
    data: { name: d.name, subject: d.subject ?? null, period: d.period ?? null, academicYear: d.academicYear ?? null, teacherId: user.id },
  });
  await logActivity({ userId: user.id, actionType: "CLASS_CREATED", description: `Created class ${cls.name}` });
  revalidatePath("/admin/classes");
  redirect(`/admin/classes/${cls.id}`);
}

export async function updateClass(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  const existing = await prisma.class.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Class not found." };
  // Administrative class actions (rename/archive) are owner-only — a
  // co-teacher grant gives operational access (roster, grading, standards),
  // not the right to edit another teacher's class metadata.
  if (existing.teacherId !== user.id) return { ok: false, error: "Class not found." };
  const parsed = classSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  await prisma.class.update({
    where: { id },
    data: { name: d.name, subject: d.subject ?? null, period: d.period ?? null, academicYear: d.academicYear ?? null },
  });
  await logActivity({ userId: user.id, actionType: "CLASS_UPDATED", description: `Updated class ${d.name}` });
  revalidatePath(`/admin/classes/${id}`);
  revalidatePath("/admin/classes");
  return { ok: true, id };
}

export async function setClassArchived(id: string, archived: boolean): Promise<ActionResult> {
  const user = await requireOwner();
  const existing = await prisma.class.findUnique({ where: { id }, select: { teacherId: true } });
  if (!existing || existing.teacherId !== user.id) return { ok: false, error: "Class not found." };
  await prisma.class.update({ where: { id }, data: { archived } });
  await logActivity({ userId: user.id, actionType: archived ? "CLASS_ARCHIVED" : "CLASS_UNARCHIVED", description: `${archived ? "Archived" : "Restored"} a class` });
  revalidatePath("/admin/classes");
  revalidatePath(`/admin/classes/${id}`);
  return { ok: true };
}

// --- Co-teacher assignment (teacher-only) -----------------------------------

export async function assignCoTeacher(classId: string, coTeacherUserId: string): Promise<ActionResult> {
  const user = await requireOwner();
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } });
  if (!cls || cls.teacherId !== user.id) return { ok: false, error: "Class not found." };
  const coTeacher = await prisma.user.findFirst({ where: { id: coTeacherUserId, role: "ASSISTANT" }, select: { id: true, name: true } });
  if (!coTeacher) return { ok: false, error: "Co-teacher not found." };
  await prisma.classCoTeacher.upsert({
    where: { classId_coTeacherUserId: { classId, coTeacherUserId } },
    update: {},
    create: { classId, coTeacherUserId },
  });
  await logActivity({ userId: user.id, actionType: "CO_TEACHER_ASSIGNED", description: `Assigned ${coTeacher.name} to class` });
  revalidatePath(`/admin/classes/${classId}`);
  return { ok: true };
}

export async function unassignCoTeacher(classId: string, coTeacherUserId: string): Promise<ActionResult> {
  const user = await requireOwner();
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } });
  if (!cls || cls.teacherId !== user.id) return { ok: false, error: "Class not found." };
  await prisma.classCoTeacher.deleteMany({ where: { classId, coTeacherUserId } });
  await logActivity({ userId: user.id, actionType: "CO_TEACHER_UNASSIGNED", description: "Unassigned a co-teacher from class" });
  revalidatePath(`/admin/classes/${classId}`);
  return { ok: true };
}

// --- Roster / enrollment management (teacher-only) --------------------------
// Upsert-on-add / status-flip-on-remove rather than hard delete, so a
// student's DailyCheck/MasteryEvent history from a prior enrollment period
// stays attached to a real Enrollment row rather than an orphaned one.

export async function enrollStudent(classId: string, studentId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessClass(user, classId);
  await assertCanAccessStudent(user, studentId);
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, displayName: true } });
  if (!student) return { ok: false, error: "Student not found." };
  await prisma.enrollment.upsert({
    where: { studentId_classId: { studentId, classId } },
    update: { status: "ACTIVE" },
    create: { studentId, classId, status: "ACTIVE" },
  });
  await logActivity({ userId: user.id, studentId, actionType: "ENROLLED", description: `Enrolled ${student.displayName}` });
  revalidatePath(`/admin/classes/${classId}`);
  return { ok: true };
}

export async function unenrollStudent(classId: string, studentId: string): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessClass(user, classId);
  await assertCanAccessStudent(user, studentId);
  await prisma.enrollment.updateMany({ where: { classId, studentId }, data: { status: "DROPPED" } });
  await logActivity({ userId: user.id, studentId, actionType: "UNENROLLED", description: "Removed a student from class" });
  revalidatePath(`/admin/classes/${classId}`);
  return { ok: true };
}

// --- Bulk student-invite emails (teacher-only) -------------------------------
// One button on the class roster: generate (or reuse) a self-service portal
// invite for every enrolled student who has an email on file and no portal
// login yet, then email each one via Gmail SMTP (see lib/email.ts). Students
// who already have a login, or have no email on file, are skipped and
// counted back rather than silently dropped — the button's toast reports
// exactly what happened.

export type BulkInviteResult =
  | { ok: true; sent: number; skippedNoEmail: number; skippedAlreadyLinked: number; failed: number; firstError: string | null }
  | { ok: false; error: string };

function siteBaseUrl(): string {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function sendClassInvites(classId: string): Promise<BulkInviteResult> {
  const user = await requireOwner();
  await assertCanAccessClass(user, classId);

  if (!(await emailSendingConfigured())) {
    return { ok: false, error: "Email sending isn't set up yet — add a Gmail address and App Password in Settings." };
  }

  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
  if (!cls) return { ok: false, error: "Class not found." };

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE" },
    include: { student: { select: { id: true, displayName: true, email: true, linkedUserId: true } } },
  });

  let sent = 0, skippedNoEmail = 0, skippedAlreadyLinked = 0, failed = 0;
  let firstError: string | null = null;
  let authFailed = false; // an SMTP auth failure fails identically for every remaining student

  for (const { student } of enrollments) {
    if (student.linkedUserId) { skippedAlreadyLinked++; continue; }
    if (!student.email) { skippedNoEmail++; continue; }
    // Once the Gmail credentials themselves are confirmed bad, stop retrying
    // them — every remaining send would fail the same way, and repeated
    // failed SMTP logins risk Gmail temporarily blocking the account.
    if (authFailed) { failed++; continue; }

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.studentInvite.upsert({
      where: { studentId: student.id },
      create: { studentId: student.id, token, expiresAt },
      update: { token, expiresAt },
    });

    try {
      await sendInviteEmail({
        to: student.email,
        studentName: student.displayName,
        teacherName: user.name,
        teacherEmail: user.email,
        className: cls.name,
        inviteUrl: `${siteBaseUrl()}/invite/${token}`,
      });
      sent++;
      await logActivity({
        userId: user.id, studentId: student.id, actionType: "STUDENT_INVITE_EMAIL_SENT",
        description: `Emailed a portal invite link to ${student.displayName}`,
      });
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      firstError ??= message;
      // Nodemailer sets code "EAUTH" for a rejected login (bad address/App
      // Password) — a connection-level failure, not this one student's fault.
      if ((e as { code?: string })?.code === "EAUTH") authFailed = true;
      console.error(`[sendClassInvites] failed to email ${student.email}`, e);
    }
  }

  revalidatePath(`/admin/classes/${classId}`);
  return { ok: true, sent, skippedNoEmail, skippedAlreadyLinked, failed, firstError };
}
