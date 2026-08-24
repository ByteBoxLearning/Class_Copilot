import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { getAiModelChoices } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CommentGenerator } from "@/components/comments/comment-generator";

export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="End-of-Term Comments" subtitle="Draft a report-card comment from a student's real classroom data." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — once you have a class with enrolled students, draft comments here.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, enrollments, aiModels] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    prisma.enrollment.findMany({
      where: { classId, status: "ACTIVE" },
      include: { student: { select: { id: true, displayName: true } } },
      orderBy: { student: { displayName: "asc" } },
    }),
    getAiModelChoices(),
  ]);

  const students = enrollments.map((e) => e.student);

  return (
    <div className="space-y-4">
      <PageHeader
        title="End-of-Term Comments"
        subtitle={`${cls.name} — draft a report-card comment from this student's real daily-check and mastery data. Use the class switcher above to check a different class.`}
      />
      <CommentGenerator classId={classId} students={students} aiModels={aiModels} />
    </div>
  );
}
