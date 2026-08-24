import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { classScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { AssistantManager } from "@/components/users/assistant-manager";

export default async function AssistantsPage() {
  const me = await requireOwner();

  const assistants = await prisma.user.findMany({
    where: { role: "ASSISTANT", ownerId: me.id },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, active: true, allClientsAccess: true, mustChangePassword: true,
      _count: { select: { coTeacherAssignments: true } },
    },
  });

  const classes = await prisma.class.findMany({
    where: await classScopeWhere(me),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Which classes each co-teacher is assigned to (for the per-row chips) —
  // scoped to my own assistants (a cross-workspace grant, if any, still shows
  // as a classId chip even though we don't have that class's name to show).
  const assignments = await prisma.classCoTeacher.findMany({
    where: { coTeacherUserId: { in: assistants.map((a) => a.id) } },
    select: { classId: true, coTeacherUserId: true },
  });
  const byAssistant = new Map<string, string[]>();
  for (const a of assignments) {
    const arr = byAssistant.get(a.coTeacherUserId) ?? [];
    arr.push(a.classId);
    byAssistant.set(a.coTeacherUserId, arr);
  }

  const rows = assistants.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    active: a.active,
    allClientsAccess: a.allClientsAccess,
    pendingReset: a.mustChangePassword,
    classIds: byAssistant.get(a.id) ?? [],
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Co-Teachers"
        subtitle="Staff who help track engagement and mastery. Assign each to one or more classes."
      />
      <AssistantManager assistants={rows} classes={classes} currentUserId={me.id} />
    </div>
  );
}
