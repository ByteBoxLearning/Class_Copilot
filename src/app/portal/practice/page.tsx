import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PracticeApp } from "@/components/practice/practice-app";
import type { PracticeSet, MCQAnswer, FRQAnswer } from "@/lib/practice/types";

// Which classes offer Practice Mode is fully implicit: a class only shows up
// here once the teacher has linked >=1 active Standard to an external unit
// (see /classes/standards) — no separate "enable practice" toggle to manage.
export default async function PortalPracticePage() {
  const user = await requireClient();

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: user.studentId, status: "ACTIVE" },
    include: {
      class: {
        select: {
          id: true, name: true, subject: true,
          standards: { where: { active: true, externalUnitSource: { not: null } }, select: { externalUnitSource: true } },
        },
      },
    },
    orderBy: { class: { name: "asc" } },
  });

  const eligibleClasses = enrollments
    .map((e) => ({
      id: e.class.id,
      name: e.class.name,
      sources: [...new Set(e.class.standards.map((s) => s.externalUnitSource!))],
    }))
    .filter((c) => c.sources.length > 0);

  const inProgress = await prisma.practiceAttempt.findFirst({
    where: { studentId: user.studentId, status: "IN_PROGRESS" },
    orderBy: { createdAt: "desc" },
  });

  const resumable = inProgress
    ? {
        attemptId: inProgress.id,
        classId: inProgress.classId,
        practiceSet: inProgress.practiceSetJson ? (JSON.parse(inProgress.practiceSetJson) as PracticeSet) : null,
        mcqAnswers: (JSON.parse(inProgress.answersJson || "{}").mcqAnswers ?? {}) as Record<string, MCQAnswer>,
        frqAnswers: (JSON.parse(inProgress.answersJson || "{}").frqAnswers ?? {}) as Record<string, FRQAnswer>,
        endTimestamp: inProgress.endTimestamp ? inProgress.endTimestamp.getTime() : null,
      }
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Practice"
        subtitle="Practice against your standards. Results are AI-scored, then reviewed by your teacher before they count toward mastery."
      />
      {eligibleClasses.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          Practice Mode isn&apos;t set up for any of your classes yet — your teacher hasn&apos;t linked a standard to a practice unit.
        </CardContent></Card>
      ) : (
        <PracticeApp classes={eligibleClasses} resumable={resumable} />
      )}
    </div>
  );
}
