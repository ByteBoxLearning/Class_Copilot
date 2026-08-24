import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { canAccessClass, studentIdScopeWhere } from "@/lib/access";
import { computeGradesForClass } from "@/lib/grading";
import { trendSuggestionsForClass } from "@/lib/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClassFields } from "@/components/classes/class-form";
import { RosterManager } from "@/components/classes/roster-manager";
import { CoTeacherAssigner } from "@/components/classes/co-teacher-assigner";
import { setClassArchived } from "@/actions/classes";

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOwner();
  const { id } = await params;
  if (!(await canAccessClass(user, id))) notFound();

  const cls = await prisma.class.findUnique({
    where: { id },
    include: {
      enrollments: { where: { status: "ACTIVE" }, include: { student: { select: { id: true, displayName: true, flag: true } } } },
      coTeachers: { include: { coTeacher: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!cls) notFound();

  // The picker offers my own assistants (the common case), plus — so an
  // already-assigned cross-workspace co-teacher (an explicit grant to a
  // colleague's account) still shows up as assigned rather than silently
  // vanishing from this list — anyone already on this class's ClassCoTeacher.
  const alreadyAssignedIds = cls.coTeachers.map((c) => c.coTeacherUserId);
  const [allCoTeachers, allStudents, grades, trendSuggestions] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ASSISTANT", active: true, OR: [{ ownerId: user.id }, { id: { in: alreadyAssignedIds } }] },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.student.findMany({ where: { ...(await studentIdScopeWhere(user)), status: "ACTIVE" }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    computeGradesForClass(id),
    trendSuggestionsForClass(id),
  ]);
  const gradesByStudent = Object.fromEntries(
    [...grades.entries()].map(([sid, g]) => [sid, { percent: g.percent, letter: g.letter }]),
  );
  const trendByStudent = Object.fromEntries(
    [...trendSuggestions.entries()].filter(([, s]) => s !== null).map(([sid, s]) => [sid, s!]),
  );

  const enrolledIds = new Set(cls.enrollments.map((e) => e.studentId));
  const assignedCoTeacherIds = new Set(cls.coTeachers.map((c) => c.coTeacherUserId));
  const unenrolledStudents = allStudents.filter((s) => !enrolledIds.has(s.id));

  const initial = { name: cls.name, subject: cls.subject, period: cls.period, academicYear: cls.academicYear };

  async function toggleArchive() {
    "use server";
    await setClassArchived(id, !cls!.archived);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={cls.name}
        subtitle={[cls.subject, cls.period, cls.academicYear].filter(Boolean).join(" · ") || "No details set"}
        actions={
          <>
            <Link href={`/classes/grading?class=${cls.id}`}><Button variant="outline">Grading policy</Button></Link>
            <form action={toggleArchive}>
              <Button type="submit" variant="outline">{cls.archived ? "Restore" : "Archive"}</Button>
            </form>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Class details</CardTitle></CardHeader>
            <CardContent>
              <ClassFields mode="edit" classId={cls.id} initial={initial} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Roster</CardTitle></CardHeader>
            <CardContent>
              <RosterManager
                classId={cls.id}
                enrolled={cls.enrollments.map((e) => e.student)}
                unenrolledStudents={unenrolledStudents}
                grades={gradesByStudent}
                trendSuggestions={trendByStudent}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Co-teachers</CardTitle></CardHeader>
            <CardContent>
              <CoTeacherAssigner
                classId={cls.id}
                allCoTeachers={allCoTeachers}
                assignedIds={[...assignedCoTeacherIds]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
