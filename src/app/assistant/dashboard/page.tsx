import { Contact, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { accessibleStudentIds, accessibleClassIds } from "@/lib/access";
import { dailyChecklistFor, studentsNeedingAttention } from "@/lib/reports";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassCheckinList } from "@/components/dashboard/class-checkin-list";
import { AttentionList } from "@/components/dashboard/attention-list";

// Rebuilt in Milestone I — see the note in admin/dashboard/page.tsx.
export default async function AssistantDashboard() {
  const user = await requireRole("ASSISTANT");

  const [studentIds, classIds] = await Promise.all([accessibleStudentIds(user), accessibleClassIds(user)]);
  const myClasses = await prisma.class.findMany({
    where: { archived: false, ...(classIds === "ALL" ? {} : { id: { in: classIds } }) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const [myStudents, checklist, attention, openTasks, doneTasks] = await Promise.all([
    prisma.student.findMany({
      where: studentIds === "ALL" ? {} : { id: { in: studentIds } },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      select: { id: true, displayName: true, gradeLevel: true },
    }),
    dailyChecklistFor(user.id, myClasses),
    studentsNeedingAttention(user),
    prisma.task.count({ where: { assignedToId: user.id, archived: false, completed: false } }),
    prisma.task.count({ where: { assignedToId: user.id, archived: false, completed: true } }),
  ]);
  const checklistItems = checklist.map((c) => ({ classId: c.classId, label: `Check in — ${c.label}`, completed: c.completed }));

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle={formatDate(new Date())} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tasks remaining" value={openTasks} accent={openTasks ? "text-amber-600" : ""} href="/assistant/tasks" />
        <StatCard label="Tasks completed" value={doneTasks} accent="text-green-600" />
        <StatCard label="Students" value={myStudents.length} />
      </div>

      <Card>
        <CardHeader><CardTitle>Today&apos;s check-ins</CardTitle></CardHeader>
        <CardContent><ClassCheckinList items={checklistItems} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Students needing attention</CardTitle></CardHeader>
        <CardContent><AttentionList students={attention} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Contact className="h-4 w-4" /> Your students</CardTitle></CardHeader>
        <CardContent>
          {myStudents.length === 0 ? (
            <p className="text-sm text-slate-400">You have no assigned students yet — ask the teacher to assign you to a class.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {myStudents.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{s.displayName}</p>
                    <p className="truncate text-xs text-slate-400">{s.gradeLevel ?? "—"}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
