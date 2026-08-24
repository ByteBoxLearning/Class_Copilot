"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { putObject, removeObject } from "@/lib/storage";
import { extractTextFromUpload } from "@/lib/assignments/extract-upload";
import { values, ASSIGNMENT_MATERIAL_KINDS } from "@/lib/enums";
import type { ActionResult } from "./types";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "application/octet-stream", // some browsers send this for .md/.docx
]);
const KIND_VALUES = new Set(values(ASSIGNMENT_MATERIAL_KINDS));

// Staff-only: attach a file to an Assignment. Text is extracted from
// .txt/.md/.docx (via mammoth) so it can seed an "Improve with AI"
// generation later; PDFs and anything else are stored but not extracted —
// not an error, extractedText just stays null (see extract-upload.ts).
export async function uploadAssignmentMaterial(assignmentId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireStaff();
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, select: { classId: true } });
  if (!assignment) return { ok: false, error: "Assignment not found." };
  try {
    await assertCanAccessClass(user, assignment.classId);
  } catch {
    return { ok: false, error: "You don't have access to that assignment's class." };
  }

  const file = formData.get("file") as File | null;
  const kindRaw = String(formData.get("kind") ?? "ORIGINAL");
  const kind = KIND_VALUES.has(kindRaw) ? kindRaw : "ORIGINAL";
  const versionNotes = (formData.get("versionNotes") as string) || null;

  if (!file || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File is too large (max 10 MB)." };
  if (file.type && !ALLOWED.has(file.type)) {
    return { ok: false, error: `File type not allowed (${file.type}). Use PDF, Word (.docx), text, or an image.` };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const objectPath = `${assignment.classId}/${assignmentId}/${randomUUID()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let extractedText: string | null = null;
  try {
    extractedText = await extractTextFromUpload(file);
  } catch {
    extractedText = null; // extraction failing (e.g. a corrupt .docx) shouldn't block the upload itself
  }

  try {
    await putObject(objectPath, buffer, file.type || undefined);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }

  await prisma.assignmentMaterial.create({
    data: {
      assignmentId,
      classId: assignment.classId,
      kind,
      fileName: file.name,
      filePath: objectPath,
      mimeType: file.type || null,
      sizeBytes: file.size,
      extractedText,
      uploadedById: user.id,
      versionNotes,
    },
  });

  await logActivity({ userId: user.id, actionType: "ASSIGNMENT_MATERIAL_UPLOADED", description: `Uploaded ${file.name}` });
  revalidatePath(`/classes/assignments/${assignmentId}`);
  return { ok: true };
}

export async function deleteAssignmentMaterial(materialId: string): Promise<ActionResult> {
  const user = await requireStaff();
  const material = await prisma.assignmentMaterial.findUnique({ where: { id: materialId } });
  if (!material) return { ok: false, error: "File not found." };
  try {
    await assertCanAccessClass(user, material.classId);
  } catch {
    return { ok: false, error: "You don't have access to that file." };
  }

  try {
    await removeObject(material.filePath);
  } catch {
    /* ignore missing object */
  }
  await prisma.assignmentMaterial.delete({ where: { id: materialId } });
  await logActivity({ userId: user.id, actionType: "ASSIGNMENT_MATERIAL_DELETED", description: `Deleted ${material.fileName}` });
  revalidatePath(`/classes/assignments/${material.assignmentId}`);
  return { ok: true };
}
