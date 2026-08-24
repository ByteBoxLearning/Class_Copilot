import Link from "next/link";
import { Users, ListChecks, Activity as ActivityIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { studentIdScopeWhere } from "@/lib/access";
import { activityScopeWhere } from "@/lib/activity-log";
import { dailyChecklistFor, studentsNeedingAttention } from "@/lib/reports";
import { relativeTime, titleCaseFromEnum } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Onboarding } from "@/components/dashboard/onboarding";
import { ClassCheckinList } from "@/components/dashboard/class-checkin-list";
import { AttentionList } from "@/components/dashboard/attention-list";

// Rebuilt in Milestone I with real per-class check-in status and a computed
// "needs attention" list, replacing the Milestone A/B placeholder's static
// checklist and generic student grid (see TODO.md).
export default async function AdminDashboard() {
  const user = await requireOwner();

  const myClasses = await prisma.class.findMany({
    where: { teacherId: user.id, archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const studentWhere = await studentIdScopeWhere(user);
  const activityWhere = await activityScopeWhere(user);
  const [totalStudents, activeStudents, assignmentCount, studentLoginCount, recentActivity, checklist, attention] =
    await Promise.all([
      prisma.student.count({ where: studentWhere }),
      prisma.student.count({ where: { ...studentWhere, status: "ACTIVE" } }),
      prisma.classCoTeacher.count({ where: { class: { teacherId: user.id } } }),
      prisma.student.count({ where: { ...studentWhere, linkedUserId: { not: null } } }),
      prisma.activityLog.findMany({ where: activityWhere, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
      dailyChecklistFor(user.id, myClasses),
      studentsNeedingAttention(user),
    ]);
  const checklistItems = checklist.map((c) => ({ classId: c.classId, label: `Check in — ${c.label}`, completed: c.completed }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Overview across your classes."
        actions={<Link href="/admin/students"><Button>Manage students</Button></Link>}
      />

      <Onboarding
        hasClient={totalStudents > 0}
        hasAssignment={assignmentCount > 0}
        hasClientLogin={studentLoginCount > 0}
      />

      <Card>
        <CardHeader><CardTitle>Today</CardTitle></CardHeader>
        <CardContent><ClassCheckinList items={checklistItems} /></CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Students" value={totalStudents} href="/admin/students" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Active" value={activeStudents} accent="text-green-600" icon={<Users className="h-5 w-5" />} />
        <StatCard label="Co-teacher assignments" value={assignmentCount} icon={<ListChecks className="h-5 w-5" />} />
        <StatCard label="Portal logins" value={studentLoginCount} icon={<Users className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader><CardTitle>Students needing attention</CardTitle></CardHeader>
        <CardContent><AttentionList students={attention} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-400">No activity yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <ActivityIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <span className="text-slate-600">
                    <span className="font-medium text-slate-800">{a.user.name}</span>{" "}
                    {a.description ?? titleCaseFromEnum(a.actionType)}
                    <span className="ml-1 text-xs text-slate-400">{relativeTime(a.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/admin/tasks"><Button variant="outline"><ListChecks className="h-4 w-4" /> Manage tasks</Button></Link>
          <Link href="/admin/activity"><Button variant="outline"><ActivityIcon className="h-4 w-4" /> Activity log</Button></Link>
        </CardContent>
      </Card>
    </div>
  );
}
