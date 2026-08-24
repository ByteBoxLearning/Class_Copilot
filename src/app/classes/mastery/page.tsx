import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import { currentMasteryForStudents } from "@/lib/mastery";
import { feedbackForMasteryEvents } from "@/lib/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MasteryRoster } from "@/components/mastery/mastery-roster";

export default async function MasteryPage({ searchParams }: { searchParams: Promise<{ class?: string; standard?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mastery" subtitle="Record standards-based evidence for your students." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — once you have a class with students and standards, record mastery here.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, standards, enrollments] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    prisma.standard.findMany({ where: { classId, active: true }, orderBy: [{ order: "asc" }, { title: "asc" }], select: { id: true, code: true, title: true } }),
    prisma.enrollment.findMany({ where: { classId, status: "ACTIVE" }, include: { student: { select: { id: true, displayName: true, flag: true } } } }),
  ]);

  if (standards.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mastery" subtitle={`${cls.name} — record standards-based evidence for your students.`} />
        <Card><CardContent className="space-y-3 py-8 text-center text-sm text-slate-400">
          <p>No standards defined for this class yet.</p>
          <Link href="/classes/standards"><Button>Add a standard</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  const standardId = sp.standard && standards.some((s) => s.id === sp.standard) ? sp.standard : standards[0].id;
  const students = enrollments.map((e) => e.student);
  const studentIds = students.map((s) => s.id);
  const currentMap = await currentMasteryForStudents(studentIds, standardId, classId);
  const currentByStudent = Object.fromEntries(
    [...currentMap.entries()].map(([id, r]) => [id, { level: r.level, rawAverage: r.rawAverage, sampleSize: r.sampleSize }]),
  );

  // Latest MasteryEvent per student for this standard — what a piece of
  // feedback attaches to. First hit per student wins since sorted desc.
  const recentEvents = await prisma.masteryEvent.findMany({
    where: { studentId: { in: studentIds }, standardId },
    orderBy: { recordedAt: "desc" },
    select: { id: true, studentId: true },
  });
  const latestEventIdByStudent: Record<string, string> = {};
  for (const e of recentEvents) {
    if (!(e.studentId in latestEventIdByStudent)) latestEventIdByStudent[e.studentId] = e.id;
  }
  const feedbackMap = await feedbackForMasteryEvents(Object.values(latestEventIdByStudent), true);
  const feedbackByEvent = Object.fromEntries(
    [...feedbackMap.entries()].map(([eventId, items]) => [
      eventId,
      items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString(), editedAt: i.editedAt?.toISOString() ?? null })),
    ]),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mastery"
        subtitle={`${cls.name} — record standards-based evidence. Use the class switcher above to check a different class.`}
      />
      <MasteryRoster
        classId={classId}
        standards={standards}
        selectedStandardId={standardId}
        students={students}
        currentByStudent={currentByStudent}
        latestEventIdByStudent={latestEventIdByStudent}
        feedbackByEvent={feedbackByEvent}
      />
    </div>
  );
}
