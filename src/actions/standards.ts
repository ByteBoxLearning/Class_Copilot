"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { standardSchema } from "@/lib/validations";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

export async function createStandard(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const parsed = standardSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  try {
    await assertCanAccessClass(user, d.classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const maxOrder = await prisma.standard.aggregate({ where: { classId: d.classId }, _max: { order: true } });
  const standard = await prisma.standard.create({
    data: {
      classId: d.classId,
      categoryId: d.categoryId || null,
      code: d.code ?? null,
      title: d.title,
      description: d.description ?? null,
      order: (maxOrder._max.order ?? 0) + 1,
      externalUnitSource: d.externalUnitSource || null,
      externalUnitId: d.externalUnitId || null,
      externalQuestionIdsJson: d.externalQuestionIds && d.externalQuestionIds.length > 0 ? JSON.stringify(d.externalQuestionIds) : null,
    },
  });
  await logActivity({ userId: user.id, actionType: "STANDARD_CREATED", description: `Added standard: ${standard.title}` });
  revalidatePath("/classes/standards");
  return { ok: true, id: standard.id };
}

export async function updateStandard(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const existing = await prisma.standard.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Standard not found." };
  try {
    await assertCanAccessClass(user, existing.classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const parsed = standardSchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  await prisma.standard.update({
    where: { id },
    data: {
      categoryId: d.categoryId || null,
      code: d.code ?? null,
      title: d.title,
      description: d.description ?? null,
      externalUnitSource: d.externalUnitSource || null,
      externalUnitId: d.externalUnitId || null,
      externalQuestionIdsJson: d.externalQuestionIds && d.externalQuestionIds.length > 0 ? JSON.stringify(d.externalQuestionIds) : null,
    },
  });
  await logActivity({ userId: user.id, actionType: "STANDARD_UPDATED", description: `Updated standard: ${d.title}` });
  revalidatePath("/classes/standards");
  return { ok: true, id };
}

export async function toggleStandard(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireStaff();
  const existing = await prisma.standard.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Standard not found." };
  try {
    await assertCanAccessClass(user, existing.classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  await prisma.standard.update({ where: { id }, data: { active } });
  revalidatePath("/classes/standards");
  return { ok: true };
}

export async function deleteStandard(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  const existing = await prisma.standard.findUnique({ where: { id } });
  if (!existing) return { ok: false, error: "Standard not found." };
  try {
    await assertCanAccessClass(user, existing.classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  await prisma.standard.delete({ where: { id } });
  await logActivity({ userId: user.id, actionType: "STANDARD_DELETED", description: `Deleted standard: ${existing.title}` });
  revalidatePath("/classes/standards");
  return { ok: true };
}
