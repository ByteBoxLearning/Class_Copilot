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

// Enforces the real invariant behind Standard.externalQuestionIdsJson (see
// its schema.prisma comment): the same bank question can never be claimed by
// two Standards' question-id subsets at once — that would double-count one
// piece of evidence toward two different mastery averages. An UNSCOPED
// standard (questionIds null/empty) never conflicts with anything, by
// design: it's the state a standard is in right after manual creation or
// CSV import, before anyone has decided which specific questions it covers.
// Multiple unscoped standards can freely share a unit — mastery-map.ts's
// computeUnitResults treats a unit's evidence as "not yet attributable to a
// standard" (never as double-counted) until enough scoping narrows it down.
// Not a DB constraint (Prisma/SQLite can't express this portably), so every
// write path that can set/change these fields — createStandard,
// updateStandard, and the AI-assisted saveQuestionMapping
// (src/actions/standards-mapping.ts) — must call this first. Returns an
// error message, or null if the write is safe to proceed.
export async function checkUnitOverlap(
  classId: string,
  externalUnitSource: string | null | undefined,
  externalUnitId: string | null | undefined,
  questionIds: string[] | null | undefined,
  excludeStandardId?: string,
): Promise<string | null> {
  if (!externalUnitSource || !externalUnitId) return null;
  if (!questionIds || questionIds.length === 0) return null;

  const others = await prisma.standard.findMany({
    where: {
      classId,
      externalUnitSource,
      externalUnitId,
      ...(excludeStandardId ? { id: { not: excludeStandardId } } : {}),
    },
    select: { title: true, externalQuestionIdsJson: true },
  });

  const mine = new Set(questionIds);
  for (const other of others) {
    if (!other.externalQuestionIdsJson) continue; // unscoped sibling — never conflicts
    const otherIds: string[] = JSON.parse(other.externalQuestionIdsJson);
    const overlapCount = otherIds.filter((id) => mine.has(id)).length;
    if (overlapCount > 0) {
      return `${overlapCount} question${overlapCount === 1 ? "" : "s"} already assigned to "${other.title}".`;
    }
  }
  return null;
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

  const overlapError = await checkUnitOverlap(d.classId, d.externalUnitSource, d.externalUnitId, d.externalQuestionIds);
  if (overlapError) return { ok: false, error: overlapError, fieldErrors: { externalUnitId: overlapError } };

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
  // Use the record's real classId (existing.classId), not the client-submitted
  // d.classId — this update never actually moves a Standard between classes
  // (see the update data below), so checking overlap against a spoofed
  // classId would both check the wrong class AND leak another class's
  // standard title into the error message.
  const overlapError = await checkUnitOverlap(existing.classId, d.externalUnitSource, d.externalUnitId, d.externalQuestionIds, id);
  if (overlapError) return { ok: false, error: overlapError, fieldErrors: { externalUnitId: overlapError } };

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
