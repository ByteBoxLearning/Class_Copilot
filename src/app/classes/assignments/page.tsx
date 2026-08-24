import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignmentList } from "@/components/assignments/assignment-list";

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Assignments" subtitle="AI-assisted worksheets, quizzes, and other classroom materials tied to your standards." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — once you have a class with standards, build assignments here.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, rows] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    prisma.assignment.findMany({
      where: { classId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, assignmentType: true, status: true, updatedAt: true, _count: { select: { standards: true } } },
    }),
  ]);

  const assignments = rows.map((a) => ({
    id: a.id,
    title: a.title,
    assignmentType: a.assignmentType,
    status: a.status,
    standardsCount: a._count.standards,
    updatedAt: a.updatedAt.toISOString().slice(0, 10),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assignments"
        subtitle={`${cls.name} — AI-assisted worksheets, quizzes, and other classroom materials. Use the class switcher above to check a different class.`}
        actions={<Link href="/classes/assignments/new"><Button>New assignment</Button></Link>}
      />
      <AssignmentList assignments={assignments} />
    </div>
  );
}
