import Link from "next/link";
import { Contact } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { studentIdScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AddStudentButton } from "@/components/students/student-form";
import { BADGE_COLORS, labelOf, STUDENT_STATUSES, STUDENT_FLAGS } from "@/lib/enums";

export default async function StudentsPage() {
  const user = await requireOwner();

  const students = await prisma.student.findMany({
    where: await studentIdScopeWhere(user),
    orderBy: [{ status: "asc" }, { displayName: "asc" }],
    include: {
      linkedUser: { select: { id: true, active: true } },
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        subtitle={`${students.length} student${students.length === 1 ? "" : "s"}`}
        actions={<AddStudentButton />}
      />

      {students.length === 0 ? (
        <EmptyState
          title="No students yet"
          message="Add your first student, or import a roster once class management lands."
          icon={<Contact className="h-8 w-8" />}
          action={<AddStudentButton />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <Link key={s.id} href={`/admin/students/${s.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{s.displayName}</p>
                      <p className="truncate text-xs text-slate-400">{s.gradeLevel ?? "No grade set"}</p>
                    </div>
                    <Badge color={BADGE_COLORS[s.status]}>{labelOf(STUDENT_STATUSES, s.status)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge color={BADGE_COLORS[s.flag]}>{labelOf(STUDENT_FLAGS, s.flag)}</Badge>
                    {s.linkedUser && (
                      <Badge color={s.linkedUser.active ? "bg-violet-100 text-violet-700 border-violet-200" : "bg-slate-100 text-slate-500 border-slate-200"}>
                        {s.linkedUser.active ? "Portal on" : "Portal off"}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
