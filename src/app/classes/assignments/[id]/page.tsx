import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { getAiModelChoices } from "@/lib/settings";
import { parseAssignmentDoc } from "@/lib/assignments/types";
import { PageHeader } from "@/components/layout/page-header";
import { AssignmentBuilderForm } from "@/components/assignments/assignment-builder-form";

export default async function EditAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      standards: { select: { standardId: true } },
      materials: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!assignment) notFound();

  await assertCanAccessClass(user, assignment.classId);

  const [cls, standards, aiModels] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: assignment.classId }, select: { name: true } }),
    prisma.standard.findMany({ where: { classId: assignment.classId, active: true }, orderBy: [{ order: "asc" }, { title: "asc" }], select: { id: true, code: true, title: true } }),
    getAiModelChoices(),
  ]);

  const doc = parseAssignmentDoc(assignment.contentJson);
  const materials = assignment.materials.map((m) => ({
    id: m.id,
    fileName: m.fileName,
    kind: m.kind,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    hasExtractedText: !!m.extractedText,
    createdAt: m.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PageHeader title={assignment.title} subtitle={`${cls.name} — edit, regenerate, or attach files.`} />
      <AssignmentBuilderForm
        classId={assignment.classId}
        standards={standards}
        aiModels={aiModels}
        existing={{
          id: assignment.id,
          title: assignment.title,
          assignmentType: assignment.assignmentType,
          summary: assignment.summary ?? "",
          status: assignment.status,
          standardIds: assignment.standards.map((s) => s.standardId),
          doc,
          source: assignment.source,
          materials,
        }}
      />
    </div>
  );
}
