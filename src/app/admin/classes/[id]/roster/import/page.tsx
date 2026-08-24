import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { canAccessClass } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { ImportWizard } from "@/components/roster/import-wizard";

export default async function RosterImportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  if (!(await canAccessClass(user, id))) notFound();
  const cls = await prisma.class.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!cls) notFound();

  return (
    <div className="space-y-4">
      <PageHeader title="Import roster" subtitle={`Bulk-add students into ${cls.name}.`} />
      <ImportWizard classId={cls.id} className={cls.name} />
    </div>
  );
}
