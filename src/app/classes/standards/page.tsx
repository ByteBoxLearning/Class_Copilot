import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StandardsManager } from "@/components/standards/standards-manager";
import { CanvasSyncPanel } from "@/components/standards/canvas-sync-panel";

export default async function StandardsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Standards" subtitle="Manage the learning goals you're tracking mastery against." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — once a class exists, its standards will be managed here.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, standards, categories] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true, canvasCourseId: true } }),
    prisma.standard.findMany({ where: { classId }, orderBy: [{ order: "asc" }, { title: "asc" }] }),
    prisma.standardCategory.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Standards" subtitle="Manage the learning goals you're tracking mastery against, per class. Use the class switcher above to pick a different class." />
      <CanvasSyncPanel classId={classId} canvasCourseId={cls.canvasCourseId} />
      <StandardsManager
        classId={classId}
        className={cls.name}
        standards={standards.map((s) => ({
          id: s.id, code: s.code, title: s.title, description: s.description, active: s.active, categoryId: s.categoryId,
          externalUnitSource: s.externalUnitSource, externalUnitId: s.externalUnitId,
          externalQuestionIds: s.externalQuestionIdsJson ? (JSON.parse(s.externalQuestionIdsJson) as string[]) : null,
        }))}
        categories={categories}
      />
    </div>
  );
}
