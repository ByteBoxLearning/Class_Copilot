"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { getGradingPolicy } from "@/lib/grading";
import { percentToLevel } from "@/lib/grading-math";
import { fetchCourseOutcomes } from "@/lib/canvas/outcomes";
import { fetchCourseOutcomeResults, fetchCourseStudentEmails } from "@/lib/canvas/outcome-results";
import { CanvasConfigError, CanvasApiError } from "@/lib/canvas/client";
import type { ActionResult } from "./types";

function friendlyCanvasError(e: unknown): string {
  if (e instanceof CanvasConfigError) return e.message;
  if (e instanceof CanvasApiError) return `Couldn't reach Canvas: ${e.message}`;
  return e instanceof Error ? e.message : "Something went wrong talking to Canvas.";
}

// Strips Canvas's rich-text HTML (outcome descriptions are stored as HTML)
// down to plain text — Standard.description elsewhere in this app is always
// plain text, never rendered as HTML.
function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

export async function saveCanvasCourseId(classId: string, canvasCourseId: string): Promise<ActionResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }
  const trimmed = canvasCourseId.trim();
  const parsed = trimmed ? Number(trimmed) : null;
  if (trimmed && (!Number.isInteger(parsed) || parsed! <= 0)) {
    return { ok: false, error: "Canvas course id must be a whole number — find it in the course's Canvas URL (…/courses/12345)." };
  }
  await prisma.class.update({ where: { id: classId }, data: { canvasCourseId: parsed } });
  revalidatePath("/classes/standards");
  return { ok: true };
}

export type SyncOutcomesResult = { ok: true; created: number; updated: number } | { ok: false; error: string };

// Phase 1: import every outcome linked into the class's Canvas course as a
// Standard, matched (on re-sync) by canvasOutcomeId — never creates a
// duplicate, and never touches a Standard that isn't already Canvas-linked
// (a teacher-authored Standard with no canvasOutcomeId is left alone even if
// its title happens to match).
export async function syncCanvasOutcomes(classId: string): Promise<SyncOutcomesResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const cls = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { canvasCourseId: true } });
  if (!cls.canvasCourseId) return { ok: false, error: "Set this class's Canvas course id first." };

  let outcomes;
  try {
    outcomes = await fetchCourseOutcomes(cls.canvasCourseId);
  } catch (e) {
    return { ok: false, error: friendlyCanvasError(e) };
  }

  let created = 0, updated = 0;
  for (const outcome of outcomes) {
    const existing = await prisma.standard.findUnique({ where: { canvasOutcomeId: outcome.id }, select: { id: true, classId: true } });
    const data = {
      title: outcome.display_name || outcome.title,
      description: stripHtml(outcome.description),
      code: outcome.vendor_guid || null,
    };
    if (existing) {
      if (existing.classId !== classId) continue; // linked to a different class already — don't relink out from under it
      await prisma.standard.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.standard.create({ data: { ...data, classId, canvasOutcomeId: outcome.id } });
      created++;
    }
  }

  await logActivity({
    userId: user.id,
    actionType: "CANVAS_OUTCOMES_SYNCED",
    description: `Synced Canvas outcomes for class (${created} created, ${updated} updated)`,
  });
  revalidatePath("/classes/standards");
  return { ok: true, created, updated };
}

export type SyncResultsResult = { ok: true; imported: number; skippedNoMatch: number } | { ok: false; error: string };

// Phase 2: pull outcome_results for every Canvas-linked Standard in this
// class and record each as a MasteryEvent (evidenceType CANVAS_IMPORT) —
// alongside, never replacing, whatever a teacher logs by hand. Idempotent:
// re-running updates an already-imported result in place (matched by
// canvasResultId) rather than duplicating.
export async function syncCanvasOutcomeResults(classId: string): Promise<SyncResultsResult> {
  const user = await requireStaff();
  try {
    await assertCanAccessClass(user, classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  const cls = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { canvasCourseId: true } });
  if (!cls.canvasCourseId) return { ok: false, error: "Set this class's Canvas course id first." };

  const standards = await prisma.standard.findMany({
    where: { classId, canvasOutcomeId: { not: null } },
    select: { id: true, canvasOutcomeId: true },
  });
  if (standards.length === 0) return { ok: false, error: "No Canvas-linked standards yet — sync outcomes first." };
  const standardByOutcomeId = new Map(standards.map((s) => [String(s.canvasOutcomeId), s.id]));

  const enrollments = await prisma.enrollment.findMany({
    where: { classId, status: "ACTIVE" },
    select: { student: { select: { id: true, email: true } } },
  });
  const studentIdByEmail = new Map(
    enrollments.filter((e) => e.student.email).map((e) => [e.student.email!.toLowerCase(), e.student.id]),
  );

  let results, emailByCanvasUserId;
  try {
    [results, emailByCanvasUserId] = await Promise.all([
      fetchCourseOutcomeResults(cls.canvasCourseId, standards.map((s) => s.canvasOutcomeId!)),
      fetchCourseStudentEmails(cls.canvasCourseId),
    ]);
  } catch (e) {
    return { ok: false, error: friendlyCanvasError(e) };
  }

  const policy = await getGradingPolicy(classId);
  let imported = 0, skippedNoMatch = 0;

  for (const result of results) {
    const standardId = standardByOutcomeId.get(result.links.learning_outcome);
    const email = emailByCanvasUserId.get(result.links.user);
    const studentId = email ? studentIdByEmail.get(email) : undefined;
    if (!standardId || !studentId || result.percent === null) {
      skippedNoMatch++;
      continue;
    }

    const level = percentToLevel(result.percent * 100, policy.levelPercent);
    await prisma.masteryEvent.upsert({
      where: { canvasResultId: result.id },
      update: { level, recordedAt: result.submitted_or_assessed_at ? new Date(result.submitted_or_assessed_at) : undefined },
      create: {
        studentId,
        standardId,
        level,
        evidenceType: "CANVAS_IMPORT",
        recordedById: user.id,
        recordedAt: result.submitted_or_assessed_at ? new Date(result.submitted_or_assessed_at) : new Date(),
        canvasResultId: result.id,
      },
    });
    imported++;
  }

  await logActivity({
    userId: user.id,
    actionType: "CANVAS_RESULTS_SYNCED",
    description: `Synced Canvas outcome results for class (${imported} imported, ${skippedNoMatch} skipped — no match)`,
  });
  revalidatePath("/classes/standards");
  revalidatePath("/classes/mastery");
  return { ok: true, imported, skippedNoMatch };
}
