"use server";

// Lets a teacher browse OTHER classes' standards (including any Practice
// Mode unit link and question-id mapping) and copy one into their own
// class, instead of recreating or CSV-re-importing an identical standard
// from scratch. Standards stay class-scoped (each class needs its own row
// so MasteryEvents attach per-class) — this is a COPY, not a live share; the
// two rows are independent from the moment of copy onward.
//
// DELIBERATELY cross-workspace (not scoped through accessibleClassIds):
// every teacher's standard titles/descriptions are browsable to every other
// teacher, confirmed explicitly with Jordi when workspaces went private
// (Milestone — multi-tenant workspaces) — none of that is student data, and
// reusing a colleague's already-scoped standard is the entire point of this
// feature. The real security boundary is copyStandardIntoClass's check on
// the TARGET class below (you can only WRITE into a class you can access) —
// reading someone else's standard to browse/copy FROM needs no such check.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import type { ActionResult } from "./types";

export type LibraryStandard = {
  id: string;
  classId: string;
  className: string;
  classSubject: string | null;
  code: string | null;
  title: string;
  description: string | null;
  externalUnitSource: string | null;
  externalUnitId: string | null;
  hasQuestionMapping: boolean;
};

const MAX_RESULTS = 200;

export async function listLibraryStandards(
  excludeClassId: string,
  search?: string,
): Promise<{ ok: true; standards: LibraryStandard[] } | { ok: false; error: string }> {
  await requireStaff();

  const trimmed = search?.trim();
  const rows = await prisma.standard.findMany({
    where: {
      active: true,
      classId: { not: excludeClassId },
      ...(trimmed ? { OR: [{ title: { contains: trimmed } }, { code: { contains: trimmed } }] } : {}),
    },
    select: {
      id: true, classId: true, code: true, title: true, description: true,
      externalUnitSource: true, externalUnitId: true, externalQuestionIdsJson: true,
      class: { select: { name: true, subject: true } },
    },
    orderBy: [{ class: { subject: "asc" } }, { class: { name: "asc" } }, { title: "asc" }],
    take: MAX_RESULTS,
  });

  return {
    ok: true,
    standards: rows.map((r) => ({
      id: r.id,
      classId: r.classId,
      className: r.class.name,
      classSubject: r.class.subject,
      code: r.code,
      title: r.title,
      description: r.description,
      externalUnitSource: r.externalUnitSource,
      externalUnitId: r.externalUnitId,
      hasQuestionMapping: !!r.externalQuestionIdsJson,
    })),
  };
}

// Creates an independent copy of `sourceStandardId` in `targetClassId` —
// title/code/description and any Practice Mode unit link + question-id
// mapping all carry over verbatim, so a teacher reusing another class's
// already-scoped standard doesn't have to redo the AI-assisted mapping work.
export async function copyStandardIntoClass(sourceStandardId: string, targetClassId: string): Promise<ActionResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, targetClassId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const source = await prisma.standard.findUnique({ where: { id: sourceStandardId } });
  if (!source) return { ok: false, error: "Standard not found." };
  // No access check on the SOURCE class — copying FROM any teacher's class is
  // the whole point of the library (see the file header comment). Writing
  // INTO targetClassId (checked above) is the actual security boundary.

  const maxOrder = await prisma.standard.aggregate({ where: { classId: targetClassId }, _max: { order: true } });
  const created = await prisma.standard.create({
    data: {
      classId: targetClassId,
      categoryId: source.categoryId,
      code: source.code,
      title: source.title,
      description: source.description,
      order: (maxOrder._max.order ?? 0) + 1,
      externalUnitSource: source.externalUnitSource,
      externalUnitId: source.externalUnitId,
      externalQuestionIdsJson: source.externalQuestionIdsJson,
    },
  });
  await logActivity({ userId: user.id, actionType: "STANDARD_CREATED", description: `Copied standard "${created.title}" from the standards library` });
  revalidatePath("/classes/standards");
  return { ok: true, id: created.id };
}
