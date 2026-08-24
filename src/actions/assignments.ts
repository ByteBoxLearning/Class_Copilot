"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { removeObject } from "@/lib/storage";
import { generateAssignmentDoc, type GenerateAssignmentResult } from "@/lib/assignments/generate";
import { type AssignmentDoc } from "@/lib/assignments/types";
import { values, ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES, ASSIGNMENT_SOURCES } from "@/lib/enums";
import type { TokenUsage } from "@/lib/ai/engines";
import type { ActionResult } from "./types";

const TYPE_VALUES = new Set(values(ASSIGNMENT_TYPES));
const STATUS_VALUES = new Set(values(ASSIGNMENT_STATUSES));
const SOURCE_VALUES = new Set(values(ASSIGNMENT_SOURCES));

export type AssignmentSource = { text: string | null; materialId: string | null };

// Ephemeral — does not persist anything (besides an activity-log entry). The
// caller shows the returned doc in the editor for review before a separate
// saveAssignment call writes it. Mirrors generateStudentComment's "generate,
// then the teacher decides" shape. `source.materialId`, when set, resolves
// server-side to an already-uploaded AssignmentMaterial's extracted text —
// the client never handles that text directly, only an id.
export async function generateAssignment(
  classId: string,
  standardIds: string[],
  assignmentType: string,
  teacherNotes: string,
  source: AssignmentSource,
  model: string,
): Promise<GenerateAssignmentResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  if (!TYPE_VALUES.has(assignmentType)) return { ok: false, error: "Unknown assignment type." };

  let sourceMaterial = source.text;
  if (source.materialId) {
    const material = await prisma.assignmentMaterial.findUnique({
      where: { id: source.materialId },
      select: { classId: true, extractedText: true, fileName: true },
    });
    if (!material || material.classId !== classId) return { ok: false, error: "Selected file not found." };
    if (!material.extractedText) return { ok: false, error: `"${material.fileName}" has no extracted text — paste the text instead.` };
    sourceMaterial = material.extractedText;
  }

  const result = await generateAssignmentDoc(classId, standardIds, assignmentType, teacherNotes, sourceMaterial, model);
  if (result.ok) {
    await logActivity({
      userId: user.id,
      actionType: "ASSIGNMENT_GENERATED",
      description: `Generated an assignment draft (${sourceMaterial ? "improved from material" : "from scratch"})`,
    });
  }
  return result;
}

export type SaveAssignmentInput = {
  id?: string; // present => update, absent => create
  classId: string;
  title: string;
  assignmentType: string;
  summary: string;
  status: string;
  standardIds: string[];
  doc: AssignmentDoc;
  source: string;
  engine?: string | null;
  usage?: TokenUsage | null;
  estCostUsd?: number | null;
};

// Handles both create and update — the section editor always submits the
// FULL current doc, so there's no partial-update path to keep in sync.
export async function saveAssignment(input: SaveAssignmentInput): Promise<ActionResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, input.classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the assignment a title." };
  if (!TYPE_VALUES.has(input.assignmentType)) return { ok: false, error: "Unknown assignment type." };
  if (!STATUS_VALUES.has(input.status)) return { ok: false, error: "Unknown status." };
  if (!SOURCE_VALUES.has(input.source)) return { ok: false, error: "Unknown source." };
  const standardIds = [...new Set(input.standardIds)];
  if (standardIds.length === 0) return { ok: false, error: "Pick at least one standard for this assignment." };

  // Safety: every standard must actually belong to this class — a stale
  // client-side selection (e.g. switched class mid-edit) shouldn't silently
  // link an assignment to another class's standard.
  const validStandards = await prisma.standard.count({ where: { id: { in: standardIds }, classId: input.classId } });
  if (validStandards !== standardIds.length) return { ok: false, error: "One or more selected standards no longer belong to this class." };

  const contentJson = JSON.stringify(input.doc);
  const usageFields = {
    engine: input.engine ?? null,
    inputTokens: input.usage?.inputTokens ?? null,
    outputTokens: input.usage?.outputTokens ?? null,
    totalTokens: input.usage?.totalTokens ?? null,
    estCostUsd: input.estCostUsd ?? null,
  };

  let assignmentId = input.id;

  if (assignmentId) {
    const existing = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { classId: true } });
    if (!existing) return { ok: false, error: "Assignment not found." };
    if (existing.classId !== input.classId) return { ok: false, error: "Assignment does not belong to this class." };

    await prisma.$transaction([
      prisma.assignment.update({
        where: { id: assignmentId },
        data: { title, assignmentType: input.assignmentType, summary: input.summary || null, contentJson, status: input.status, source: input.source, ...usageFields },
      }),
      prisma.assignmentStandard.deleteMany({ where: { assignmentId } }),
      prisma.assignmentStandard.createMany({ data: standardIds.map((standardId) => ({ assignmentId: assignmentId!, standardId })) }),
    ]);
    await logActivity({ userId: user.id, actionType: "ASSIGNMENT_UPDATED", description: `Updated assignment "${title}"` });
  } else {
    const created = await prisma.assignment.create({
      data: {
        classId: input.classId,
        title,
        assignmentType: input.assignmentType,
        summary: input.summary || null,
        contentJson,
        status: input.status,
        source: input.source,
        createdById: user.id,
        ...usageFields,
        standards: { create: standardIds.map((standardId) => ({ standardId })) },
      },
    });
    assignmentId = created.id;
    await logActivity({ userId: user.id, actionType: "ASSIGNMENT_CREATED", description: `Created assignment "${title}"` });
  }

  revalidatePath("/classes/assignments");
  revalidatePath(`/classes/assignments/${assignmentId}`);
  return { ok: true, id: assignmentId };
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  const user = await requireStaff();
  const assignment = await prisma.assignment.findUnique({
    where: { id },
    select: { classId: true, title: true, materials: { select: { filePath: true } } },
  });
  if (!assignment) return { ok: false, error: "Assignment not found." };
  try {
    await assertCanAccessClass(user, assignment.classId);
  } catch {
    return { ok: false, error: "You don't have access to that assignment." };
  }

  // Clean up files on disk — cascading the DB rows away doesn't touch storage.
  for (const m of assignment.materials) {
    try { await removeObject(m.filePath); } catch { /* ignore missing object */ }
  }

  await prisma.assignment.delete({ where: { id } });
  await logActivity({ userId: user.id, actionType: "ASSIGNMENT_DELETED", description: `Deleted assignment "${assignment.title}"` });
  revalidatePath("/classes/assignments");
  return { ok: true };
}
