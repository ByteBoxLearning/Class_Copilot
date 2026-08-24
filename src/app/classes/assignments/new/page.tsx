import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { getAiModelChoices } from "@/lib/settings";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssignmentBuilderForm } from "@/components/assignments/assignment-builder-form";

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="New assignment" />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — create a class first.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, standards, aiModels] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    prisma.standard.findMany({ where: { classId, active: true }, orderBy: [{ order: "asc" }, { title: "asc" }], select: { id: true, code: true, title: true } }),
    getAiModelChoices(),
  ]);

  if (standards.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="New assignment" subtitle={cls.name} />
        <Card><CardContent className="space-y-3 py-8 text-center text-sm text-slate-400">
          <p>No standards defined for this class yet — an assignment needs at least one.</p>
          <Link href="/classes/standards"><Button>Add a standard</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="New assignment" subtitle={`${cls.name} — generate a draft or write one manually, then save.`} />
      <AssignmentBuilderForm classId={classId} standards={standards} aiModels={aiModels} />
    </div>
  );
}
