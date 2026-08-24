"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireRole, type SessionUser } from "@/lib/auth";
import { assertCanAccessClass, assertCanAccessStudent, canAccessClass, canAccessStudent } from "@/lib/access";
import { taskSchema } from "@/lib/validations";
import { logActivity } from "@/lib/activity-log";
import { notify } from "@/lib/notifications";
import { localDayString } from "@/lib/utils";
import { DEFAULT_CHECKLIST } from "@/lib/enums";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// True if `assigneeId` is a valid assignee for this OWNER's workspace: either
// themself, or an ASSISTANT they personally created.
async function isOwnWorkspaceAssignee(owner: SessionUser, assigneeId: string): Promise<boolean> {
  if (assigneeId === owner.id) return true;
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true, ownerId: true } });
  return assignee?.role === "ASSISTANT" && assignee.ownerId === owner.id;
}

// True if a task belongs to this OWNER's workspace — created by them,
// assigned to them or one of their own assistants, or tied to a class/
// student they can access. Used by the administrative actions below
// (archive/unarchive/delete), which are OWNER-role-gated only.
async function taskInOwnerWorkspace(
  owner: SessionUser,
  task: { classId: string | null; studentId: string | null; assignedToId: string | null; createdById: string },
): Promise<boolean> {
  if (task.createdById === owner.id) return true;
  if (task.assignedToId && (await isOwnWorkspaceAssignee(owner, task.assignedToId))) return true;
  if (task.classId && (await canAccessClass(owner, task.classId))) return true;
  if (task.studentId && (await canAccessStudent(owner, task.studentId))) return true;
  return false;
}

// --- Admin task management --------------------------------------------------

export async function createTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const raw = formToObject(formData);
  raw.recurring = formData.get("recurring") === "on" || formData.get("recurring") === "true";
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const studentId = parsed.data.studentId || null;
  const classId = parsed.data.classId || null;
  const assignedToId = parsed.data.assignedToId || null;
  if (classId) await assertCanAccessClass(user, classId);
  if (studentId) await assertCanAccessStudent(user, studentId);
  if (assignedToId && !(await isOwnWorkspaceAssignee(user, assignedToId))) {
    return { ok: false, error: "Invalid assignee." };
  }
  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      assignedToId,
      studentId,
      classId,
      createdById: user.id,
      date: parsed.data.date ?? new Date(),
      recurring: parsed.data.recurring,
      priority: parsed.data.priority,
    },
  });
  await logActivity({ userId: user.id, studentId, actionType: "TASK_CREATED", description: `Created task: ${task.title}` });
  // Notify ONLY the specific assignee (not every assistant).
  if (task.assignedToId && task.assignedToId !== user.id) {
    await notify({ userId: task.assignedToId, studentId, title: "New task assigned", message: `You were assigned a task: ${task.title}.` });
  }
  revalidatePath("/admin/tasks");
  revalidatePath("/assistant/tasks");
  return { ok: true, id: task.id };
}

// Edit an existing task (admin-only). Built from FormData so it plugs into the
// same modal form as create.
export async function updateTask(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Task not found." };
  if (!(await taskInOwnerWorkspace(user, existing))) return { ok: false, error: "Task not found." };

  const raw = formToObject(formData);
  raw.recurring = formData.get("recurring") === "on" || formData.get("recurring") === "true";
  const parsed = taskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const newAssignee = parsed.data.assignedToId || null;
  const studentId = parsed.data.studentId || null;
  const classId = parsed.data.classId || null;
  if (classId) await assertCanAccessClass(user, classId);
  if (studentId) await assertCanAccessStudent(user, studentId);
  if (newAssignee && !(await isOwnWorkspaceAssignee(user, newAssignee))) {
    return { ok: false, error: "Invalid assignee." };
  }
  await prisma.task.update({
    where: { id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      assignedToId: newAssignee,
      studentId,
      classId,
      recurring: parsed.data.recurring,
      priority: parsed.data.priority,
      ...(parsed.data.date ? { date: parsed.data.date } : {}),
    },
  });

  await logActivity({ userId: user.id, studentId, actionType: "TASK_EDITED", description: `Edited task: ${parsed.data.title}` });
  // Ping ONLY the specific assignee if this task was (re)assigned to them.
  if (newAssignee && newAssignee !== existing.assignedToId && newAssignee !== user.id) {
    await notify({ userId: newAssignee, studentId, title: "Task assigned", message: `You were assigned a task: ${parsed.data.title}.` });
  }

  revalidatePath("/admin/tasks");
  revalidatePath("/assistant/tasks");
  return { ok: true, id };
}

export async function archiveTask(id: string) {
  const user = await requireRole("OWNER");
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || !(await taskInOwnerWorkspace(user, task))) return { ok: false, error: "Task not found." };
  await prisma.task.update({ where: { id }, data: { archived: true } });
  await logActivity({ userId: user.id, actionType: "TASK_ARCHIVED", description: "Archived a task" });
  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function unarchiveTask(id: string) {
  const user = await requireRole("OWNER");
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || !(await taskInOwnerWorkspace(user, task))) return { ok: false, error: "Task not found." };
  await prisma.task.update({ where: { id }, data: { archived: false } });
  await logActivity({ userId: user.id, actionType: "TASK_UNARCHIVED", description: "Restored a task from archive" });
  revalidatePath("/admin/tasks");
  return { ok: true };
}

// Permanent delete (admin-only).
export async function deleteTask(id: string) {
  const user = await requireRole("OWNER");
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { ok: false, error: "Task not found." };
  if (!(await taskInOwnerWorkspace(user, task))) return { ok: false, error: "Task not found." };
  await prisma.task.delete({ where: { id } });
  await logActivity({ userId: user.id, actionType: "TASK_DELETED", description: `Deleted task: ${task.title}` });
  revalidatePath("/admin/tasks");
  return { ok: true };
}

// --- Assistant task completion ----------------------------------------------

// Only the assignee, the creator, or (for OWNER) anyone whose workspace the
// task belongs to may complete/uncomplete a task — an assistant can't touch
// another assistant's task, and an OWNER can't touch another OWNER's task
// just by role (that was a pre-multi-tenant shortcut).
async function canEditTask(
  user: SessionUser,
  task: { classId: string | null; studentId: string | null; assignedToId: string | null; createdById: string },
): Promise<boolean> {
  if (task.assignedToId === user.id || task.createdById === user.id) return true;
  if (user.role === "OWNER") return taskInOwnerWorkspace(user, task);
  return false;
}

export async function toggleTask(id: string, completed: boolean) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { ok: false, error: "Task not found." };
  if (!(await canEditTask(user, task))) return { ok: false, error: "You can only update your own tasks." };

  await prisma.task.update({
    where: { id },
    data: { completed, completedAt: completed ? new Date() : null },
  });
  if (completed) {
    await logActivity({ userId: user.id, studentId: task.studentId, actionType: "TASK_COMPLETED", description: `Completed task: ${task.title}` });
  }
  revalidatePath("/assistant/tasks");
  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function updateTaskNotes(id: string, notes: string, evidenceUrl: string) {
  const user = await requireUser();
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { ok: false, error: "Task not found." };
  if (!(await canEditTask(user, task))) return { ok: false, error: "You can only update your own tasks." };
  await prisma.task.update({ where: { id }, data: { notes: notes || null, evidenceUrl: evidenceUrl || null } });
  revalidatePath("/assistant/tasks");
  return { ok: true };
}

// --- Daily checklist (per-user, per-day) ------------------------------------

export async function toggleChecklistItem(itemKey: string, completed: boolean) {
  const user = await requireUser();
  const item = DEFAULT_CHECKLIST.find((c) => c.key === itemKey);
  if (!item) return { ok: false, error: "Unknown checklist item." };
  const date = localDayString();

  await prisma.checklistCompletion.upsert({
    where: { userId_itemKey_date: { userId: user.id, itemKey, date } },
    create: {
      userId: user.id,
      itemKey,
      itemLabel: item.label,
      date,
      completed,
      completedAt: completed ? new Date() : null,
    },
    update: { completed, completedAt: completed ? new Date() : null },
  });

  if (completed) {
    await logActivity({ userId: user.id, actionType: "CHECKLIST_ITEM_COMPLETED", description: `Checklist: ${item.label}` });
  }
  revalidatePath("/assistant/dashboard");
  return { ok: true };
}
