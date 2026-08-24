import "server-only";
import { prisma } from "./prisma";

type NotifyArgs = {
  userId: string;
  title: string;
  message: string;
  studentId?: string | null;
};

export async function notify(args: NotifyArgs): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: args.userId,
        title: args.title,
        message: args.message,
        studentId: args.studentId ?? null,
      },
    });
  } catch (e) {
    console.error("[notifications] failed to create", e);
  }
}

// Notify only the co-teachers who can see a given student: those assigned
// (via ClassCoTeacher) to a class the student is actively enrolled in, plus
// any with all-access WITHIN THE OWNING TEACHER'S WORKSPACE (not every
// all-access assistant platform-wide — that was a pre-multi-tenant bug: two
// unrelated teachers' all-access assistants would otherwise both get pinged
// about a student neither of them teaches). Never fans out to every
// co-teacher. This is the 2-hop lookup — see src/lib/access.ts's
// accessibleStudentIds for the same logic used for read-scoping.
export async function notifyCoTeachersForStudent(
  studentId: string,
  args: Omit<NotifyArgs, "userId" | "studentId">,
): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    select: { classId: true, class: { select: { teacherId: true } } },
  });
  const classIds = enrollments.map((e) => e.classId);
  const teacherIds = [...new Set(enrollments.map((e) => e.class.teacherId))];

  const assistants = await prisma.user.findMany({
    where: {
      role: "ASSISTANT",
      active: true,
      OR: [
        ...(teacherIds.length ? [{ allClientsAccess: true, ownerId: { in: teacherIds } }] : []),
        ...(classIds.length ? [{ coTeacherAssignments: { some: { classId: { in: classIds } } } }] : []),
      ],
    },
    select: { id: true },
  });
  await Promise.all(assistants.map((a) => notify({ ...args, userId: a.id, studentId })));
}

// Notify the student's own portal user (if they have one and it's active).
export async function notifyStudentUser(
  studentId: string,
  args: Omit<NotifyArgs, "userId" | "studentId">,
): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { linkedUser: { select: { id: true, active: true } } },
  });
  const u = student?.linkedUser;
  if (u && u.active) await notify({ ...args, userId: u.id, studentId });
}
