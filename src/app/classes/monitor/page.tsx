import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { localDayString } from "@/lib/utils";
import { feedbackForDailyChecks } from "@/lib/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { RosterMonitor } from "@/components/monitor/roster-monitor";

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ class?: string; date?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : localDayString();

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Classroom Monitor" subtitle="A daily roster check-in for engagement and understanding." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — once you have a class with enrolled students, check in on them here.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, enrollments, checks, standards, focus] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    prisma.enrollment.findMany({
      where: { classId, status: "ACTIVE" },
      include: { student: { select: { id: true, displayName: true, flag: true } } },
    }),
    prisma.dailyCheck.findMany({ where: { classId, date } }),
    prisma.standard.findMany({
      where: { classId, active: true },
      orderBy: [{ order: "asc" }, { title: "asc" }],
      select: { id: true, code: true, title: true },
    }),
    prisma.dailyStandardFocus.findUnique({ where: { classId_date: { classId, date } }, select: { standardId: true } }),
  ]);

  const students = enrollments.map((e) => e.student);
  const checksByStudent = Object.fromEntries(
    checks.map((c) => [
      c.studentId,
      {
        engagement: c.engagement,
        empathy: c.empathy,
        discipline: c.discipline,
        collaboration: c.collaboration,
        citizenship: c.citizenship,
      },
    ]),
  );
  const understandingByStudent = Object.fromEntries(
    checks.map((c) => [c.studentId, { level: c.understanding, standardId: c.standardId }]),
  );
  const notesByStudent = Object.fromEntries(checks.map((c) => [c.studentId, c.note]));

  const feedbackMap = await feedbackForDailyChecks(checks.map((c) => c.id), true);
  const dailyCheckIdByStudent = Object.fromEntries(checks.map((c) => [c.studentId, c.id]));
  const feedbackByStudent = Object.fromEntries(
    students.map((s) => {
      const checkId = dailyCheckIdByStudent[s.id];
      const items = (checkId ? feedbackMap.get(checkId) : undefined) ?? [];
      return [s.id, items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString(), editedAt: i.editedAt?.toISOString() ?? null }))];
    }),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Classroom Monitor"
        subtitle={`${cls.name} — tap to mark today's quick reads. Use the class switcher above to check in on a different class.`}
      />
      <RosterMonitor
        classId={classId}
        date={date}
        students={students}
        checksByStudent={checksByStudent}
        notesByStudent={notesByStudent}
        feedbackByStudent={feedbackByStudent}
        standards={standards}
        focusStandardId={focus?.standardId ?? null}
        understandingByStudent={understandingByStudent}
      />
    </div>
  );
}
