import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { getGradingPolicy } from "@/lib/grading";
import { getMasteryConfig } from "@/lib/mastery";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { GradingPolicyForm } from "@/components/grading/grading-policy-form";

const PREVIEW_COUNT = 3;

export default async function GradingPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Grading" subtitle="Decide how mastery and engagement combine into a grade." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — set a grading policy once you have a class with students and standards.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, policy, masteryConfig, standards, previewEnrollments] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    getGradingPolicy(classId),
    getMasteryConfig(classId),
    prisma.standard.findMany({ where: { classId, active: true }, select: { id: true } }),
    prisma.enrollment.findMany({
      where: { classId, status: "ACTIVE" },
      take: PREVIEW_COUNT,
      include: { student: { select: { id: true, displayName: true } } },
    }),
  ]);

  const previewIds = previewEnrollments.map((e) => e.studentId);
  const standardIds = standards.map((s) => s.id);

  // Raw MasteryEvent rows for the preview students, across this class's
  // standards — sent to the client so the live preview can recompute
  // computeMastery() itself as the teacher tweaks the strategy/weights,
  // instead of only reflecting whatever's already saved. Mirrors the
  // grading-math.ts pattern: same pure function, client and server.
  const previewMasteryEvents =
    previewIds.length && standardIds.length
      ? await prisma.masteryEvent.findMany({
          where: { studentId: { in: previewIds }, standardId: { in: standardIds } },
          select: { studentId: true, standardId: true, level: true, recordedAt: true, evidenceType: true },
        })
      : [];

  const dailyChecks = previewIds.length
    ? await prisma.dailyCheck.findMany({
        where: { classId, studentId: { in: previewIds }, engagement: { not: null } },
        select: { studentId: true, engagement: true },
      })
    : [];
  const engagementByStudent = new Map<string, { engaged: number; distracting: number }>();
  for (const dc of dailyChecks) {
    const e = engagementByStudent.get(dc.studentId) ?? { engaged: 0, distracting: 0 };
    if (dc.engagement === "ENGAGED") e.engaged++; else e.distracting++;
    engagementByStudent.set(dc.studentId, e);
  }

  const previewStudents = previewEnrollments.map((e) => {
    const eng = engagementByStudent.get(e.studentId) ?? { engaged: 0, distracting: 0 };
    return {
      id: e.studentId,
      name: e.student.displayName,
      engagedCount: eng.engaged,
      distractingCount: eng.distracting,
    };
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Grading"
        subtitle={`${cls.name} — decide how mastery and engagement combine into a grade. Use the class switcher above to check a different class.`}
      />
      <GradingPolicyForm
        classId={classId}
        currentType={policy.type}
        currentConfig={{
          levelPercent: policy.levelPercent,
          minEvents: policy.minEvents,
          masteryWeight: policy.masteryWeight,
          engagementWeight: policy.engagementWeight,
          engagementValue: policy.engagementValue,
          masteryStrategy: masteryConfig.strategy,
          decayRate: masteryConfig.decayRate,
          windowSize: masteryConfig.windowSize,
          evidenceWeights: masteryConfig.evidenceWeights,
        }}
        canEdit={user.role === "OWNER"}
        previewStudents={previewStudents}
        previewMasteryEvents={previewMasteryEvents.map((e) => ({
          studentId: e.studentId,
          standardId: e.standardId,
          level: e.level,
          recordedAt: e.recordedAt.toISOString(),
          evidenceType: e.evidenceType,
        }))}
      />
    </div>
  );
}
