import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StandardsImportWizard } from "@/components/standards/standards-import-wizard";

export default async function StandardsImportPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireOwner();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Import standards" subtitle="Bulk-add standards from a CSV file." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — once a class exists, you can import standards into it here.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);
  const cls = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } });

  return (
    <div className="space-y-4">
      <PageHeader title="Import standards" subtitle={`Bulk-add standards into ${cls.name}.`} />
      <StandardsImportWizard classId={classId} className={cls.name} />
    </div>
  );
}
