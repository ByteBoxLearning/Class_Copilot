"use server";

// Practice Mode (Milestone K) — staff-facing review queue. A practice result
// never becomes a MasteryEvent on its own; a teacher/co-teacher reviews the
// suggested level here first. Approving does exactly what
// src/actions/mastery.ts's recordMasteryEvent does (recordedById = the
// reviewing staff member) — the "every MasteryEvent has a staff recordedById"
// invariant is fully preserved, not an exception for practice-sourced evidence.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { accessibleClassIds, assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { getUnit } from "@/lib/practice/bank";
import type { UnitSource } from "@/lib/practice/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type PendingProposalRow = {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  unitSource: UnitSource;
  unitId: string;
  unitTitle: string;
  scorePercent: number;
  suggestedLevel: number;
  standardId: string | null;
  standardTitle: string | null;
  createdAt: Date;
};

// Staff-only listing, scoped to classes the caller can access. `classId`
// narrows to one class (e.g. a class detail page); omitted = every pending
// proposal across the caller's classes.
export async function listPendingPracticeProposals(classId?: string): Promise<PendingProposalRow[]> {
  const user = await requireStaff();
  const ids = await accessibleClassIds(user);
  if (ids !== "ALL" && ids.length === 0) return [];
  if (classId) await assertCanAccessClass(user, classId);

  const rows = await prisma.practiceMasteryProposal.findMany({
    where: {
      status: "PENDING",
      ...(classId ? { classId } : ids === "ALL" ? {} : { classId: { in: ids } }),
    },
    include: {
      student: { select: { displayName: true } },
      class: { select: { name: true } },
      standard: { select: { title: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    studentName: r.student.displayName,
    classId: r.classId,
    className: r.class.name,
    unitSource: r.unitSource as UnitSource,
    unitId: r.unitId,
    unitTitle: getUnit(r.unitSource as UnitSource, Number(r.unitId))?.title ?? `Unit ${r.unitId}`,
    scorePercent: r.scorePercent,
    suggestedLevel: r.suggestedLevel,
    standardId: r.standardId,
    standardTitle: r.standard?.title ?? null,
    createdAt: r.createdAt,
  }));
}

async function loadPendingProposal(proposalId: string) {
  const user = await requireStaff();
  const proposal = await prisma.practiceMasteryProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) return { user, proposal: null };
  await assertCanAccessClass(user, proposal.classId);
  return { user, proposal };
}

// Approves a proposal, optionally overriding the AI-suggested level, and
// records a real MasteryEvent — recordedById is the APPROVING staff member,
// never the student (see module comment).
export async function approvePracticeProposal(
  proposalId: string,
  input?: { level?: number; evidenceNote?: string },
): Promise<Result<{ masteryEventId: string }>> {
  const { user, proposal } = await loadPendingProposal(proposalId);
  if (!proposal) return { ok: false, error: "Proposal not found." };
  if (proposal.status !== "PENDING") return { ok: false, error: "This proposal has already been reviewed." };
  if (!proposal.standardId) return { ok: false, error: "Link a Standard to this unit before approving (Classes → Standards)." };

  const level = input?.level && input.level >= 1 && input.level <= 4 ? input.level : proposal.suggestedLevel;
  const unitTitle = getUnit(proposal.unitSource as UnitSource, Number(proposal.unitId))?.title ?? `unit ${proposal.unitId}`;

  const masteryEvent = await prisma.$transaction(async (tx) => {
    const event = await tx.masteryEvent.create({
      data: {
        studentId: proposal.studentId,
        standardId: proposal.standardId!,
        level,
        evidenceType: "PRACTICE",
        evidenceNote: input?.evidenceNote || `AI-scored practice — ${unitTitle}: ${proposal.scorePercent}%`,
        recordedById: user.id,
      },
    });
    await tx.practiceMasteryProposal.update({
      where: { id: proposalId },
      data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), resultingMasteryEventId: event.id },
    });
    return event;
  });

  await logActivity({
    userId: user.id,
    studentId: proposal.studentId,
    actionType: "PRACTICE_PROPOSAL_APPROVED",
    description: `Approved practice result for "${unitTitle}" — level ${level}`,
  });

  revalidatePath("/classes/practice-review");
  revalidatePath("/classes/mastery");
  revalidatePath("/portal/mastery");
  return { ok: true, data: { masteryEventId: masteryEvent.id } };
}

export async function rejectPracticeProposal(proposalId: string, reason?: string): Promise<Result<{ rejected: true }>> {
  const { user, proposal } = await loadPendingProposal(proposalId);
  if (!proposal) return { ok: false, error: "Proposal not found." };
  if (proposal.status !== "PENDING") return { ok: false, error: "This proposal has already been reviewed." };

  await prisma.practiceMasteryProposal.update({
    where: { id: proposalId },
    data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: reason || null },
  });
  await logActivity({
    userId: user.id,
    studentId: proposal.studentId,
    actionType: "PRACTICE_PROPOSAL_REJECTED",
    description: `Rejected a practice result${reason ? `: ${reason}` : ""}`,
  });

  revalidatePath("/classes/practice-review");
  return { ok: true, data: { rejected: true } };
}
