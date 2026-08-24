import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { canAccessStudent, accessibleClassIds } from "@/lib/access";
import { currentMasteryForAllStandards } from "@/lib/mastery";
import { computeGrade } from "@/lib/grading";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentFields } from "@/components/students/student-form";
import { StudentInvite } from "@/components/students/student-invite";
import { MasteryTimeline } from "@/components/mastery/mastery-timeline";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  if (!(await canAccessStudent(user, id))) notFound();

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      linkedUser: { select: { id: true, name: true, email: true, active: true } },
      invite: { select: { token: true, expiresAt: true } },
    },
  });
  if (!student) notFound();

  // A shared (co-taught) student can be enrolled in classes outside THIS
  // viewer's own workspace — only show the classes/grades/standards this
  // viewer can actually access, not every class the student happens to be in.
  const myClassIds = await accessibleClassIds(user);
  const enrolledClasses = await prisma.enrollment.findMany({
    where: { studentId: id, status: "ACTIVE", ...(myClassIds === "ALL" ? {} : { classId: { in: myClassIds } }) },
    include: { class: { select: { id: true, name: true } } },
  });
  const enrolledClassIds = enrolledClasses.map((e) => e.classId);
  const grades = await Promise.all(
    enrolledClasses.map(async (e) => ({ classId: e.classId, className: e.class.name, grade: await computeGrade(id, e.classId) })),
  );

  const [standards, events, currentMap] = await Promise.all([
    prisma.standard.findMany({ where: { classId: { in: enrolledClassIds }, active: true }, orderBy: [{ order: "asc" }, { title: "asc" }] }),
    prisma.masteryEvent.findMany({ where: { studentId: id }, include: { recordedBy: { select: { name: true } } }, orderBy: { recordedAt: "desc" } }),
    currentMasteryForAllStandards(id),
  ]);
  const eventsByStandard = new Map<string, typeof events>();
  for (const e of events) {
    const arr = eventsByStandard.get(e.standardId) ?? [];
    arr.push(e);
    eventsByStandard.set(e.standardId, arr);
  }
  const masteryGroups = standards.map((s) => ({
    standardId: s.id,
    code: s.code,
    title: s.title,
    current: currentMap.get(s.id) ?? { level: null, rawAverage: null, sampleSize: 0 },
    events: (eventsByStandard.get(s.id) ?? []).map((e) => ({
      id: e.id,
      level: e.level,
      evidenceType: e.evidenceType,
      evidenceNote: e.evidenceNote,
      recordedAt: e.recordedAt,
      recordedByName: e.recordedBy.name,
    })),
  }));

  const initial = {
    displayName: student.displayName,
    gradeLevel: student.gradeLevel,
    status: student.status,
    notes: student.notes,
    email: student.email,
  };

  return (
    <div className="space-y-5">
      <PageHeader title={student.displayName} subtitle={student.gradeLevel ?? "No grade set"} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Student details</CardTitle></CardHeader>
            <CardContent>
              <StudentFields mode="edit" studentId={student.id} initial={initial} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Mastery</CardTitle></CardHeader>
            <CardContent>
              <MasteryTimeline groups={masteryGroups} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Grades</CardTitle></CardHeader>
            <CardContent>
              {grades.length === 0 ? (
                <p className="text-sm text-slate-400">Not enrolled in any class yet.</p>
              ) : (
                <ul className="space-y-2">
                  {grades.map((g) => (
                    <li key={g.classId} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
                      <span className="truncate text-sm text-slate-700">{g.className}</span>
                      {g.grade.percent !== null ? (
                        <span className="flex items-center gap-1.5">
                          <Badge color="bg-slate-100 text-slate-700 border-slate-200">{g.grade.letter}</Badge>
                          <span className="text-xs text-slate-500">{g.grade.percent}%</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">Not enough data</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Student portal login</CardTitle></CardHeader>
            <CardContent>
              <StudentInvite
                studentId={student.id}
                linkedUser={student.linkedUser}
                pendingInvite={student.invite ? { token: student.invite.token, expiresAt: student.invite.expiresAt.toISOString() } : null}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
