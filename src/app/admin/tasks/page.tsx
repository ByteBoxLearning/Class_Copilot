import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { taskScopeWhere, studentIdScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { AdminTaskManager } from "@/components/tasks/admin-task-manager";

export default async function AdminTasksPage() {
  const user = await requireOwner();
  const taskWhere = await taskScopeWhere(user);
  const [tasks, archived, people, students] = await Promise.all([
    prisma.task.findMany({
      where: { ...taskWhere, archived: false },
      orderBy: [{ recurring: "desc" }, { createdAt: "desc" }],
      include: { assignedTo: { select: { name: true } }, student: { select: { displayName: true } } },
    }),
    prisma.task.findMany({
      where: { ...taskWhere, archived: true },
      orderBy: { updatedAt: "desc" },
      include: { assignedTo: { select: { name: true } }, student: { select: { displayName: true } } },
    }),
    prisma.user.findMany({ where: { role: "ASSISTANT", ownerId: user.id }, select: { id: true, name: true } }),
    prisma.student.findMany({ where: await studentIdScopeWhere(user), orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }),
  ]);

  const map = (t: (typeof tasks)[number]) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    recurring: t.recurring,
    completed: t.completed,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    assignedToId: t.assignedToId,
    assignedTo: t.assignedTo?.name ?? null,
    studentId: t.studentId,
    studentName: t.student?.displayName ?? null,
    notes: t.notes,
    evidenceUrl: t.evidenceUrl,
    date: t.date.toISOString(),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Tasks" subtitle="Create and assign tasks — student-specific or general — and monitor completion." />
      <AdminTaskManager tasks={tasks.map(map)} archivedTasks={archived.map(map)} people={people} students={students} />
    </div>
  );
}
