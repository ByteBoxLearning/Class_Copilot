import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { accessibleStudentIds } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { AssistantTaskList } from "@/components/tasks/assistant-task-list";

export default async function AssistantTasksPage() {
  const user = await requireRole("ASSISTANT");

  // Show: tasks assigned to me, plus general (no-student) tasks. Student-
  // specific tasks only surface if the student is one I can access.
  const ids = await accessibleStudentIds(user);
  const studentCond =
    ids === "ALL"
      ? {}
      : { OR: [{ studentId: null }, { studentId: { in: ids } }] };

  const tasks = await prisma.task.findMany({
    where: {
      archived: false,
      AND: [
        { OR: [{ assignedToId: user.id }, { assignedToId: null }] },
        studentCond,
      ],
    },
    orderBy: [{ recurring: "desc" }, { priority: "asc" }, { createdAt: "desc" }],
    include: { student: { select: { displayName: true } } },
  });

  const mapped = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    recurring: t.recurring,
    completed: t.completed,
    notes: t.notes,
    evidenceUrl: t.evidenceUrl,
    studentName: t.student?.displayName ?? null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="My tasks" subtitle="Tick tasks as you complete them and add notes or evidence." />
      <AssistantTaskList tasks={mapped} />
    </div>
  );
}
