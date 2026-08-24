import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";

// ---------------------------------------------------------------------------
// The student-scoping security spine.
//
// EVERY student-scoped server action, API route and query calls into here so
// data isolation is enforced in ONE place:
//   - OWNER      (Teacher)     → classes they teach (Class.teacherId) or are
//                                 an explicit ClassCoTeacher on, plus students
//                                 they created or who are enrolled in those
//                                 classes. Each OWNER is an independent
//                                 workspace root — NOT "every class/student in
//                                 the database" (that was a single-teacher-app
//                                 shortcut, removed once signup shipped).
//   - ASSISTANT  (Co-Teacher)  → students enrolled in classes they're assigned
//                                 to (ClassCoTeacher -> Enrollment, a 2-hop
//                                 lookup), OR every class taught by their
//                                 OWNING teacher if `allClientsAccess` is set
//                                 (their workspace, not the whole platform).
//   - CLIENT     (Student)     → only their own linked studentId
//
// The 2-hop assistant lookup is a deliberate departure from the source CRM's
// 1-hop ClientAssistant model — a co-teacher is assigned to a whole Class,
// not to individual students piecemeal (see CONTEXT.md).
// ---------------------------------------------------------------------------

export class AccessError extends Error {
  constructor(message = "You don't have access to this student's data.") {
    super(message);
    this.name = "AccessError";
  }
}

type AccessUser = Pick<SessionUser, "id" | "role" | "studentId" | "allClientsAccess" | "ownerId">;

// The OWNER whose workspace this account belongs to: an OWNER is their own
// workspace root; an ASSISTANT belongs to whoever created them.
function workspaceOwnerId(user: AccessUser): string {
  return user.role === "OWNER" ? user.id : (user.ownerId ?? user.id);
}

// The set of class ids a user may see. No equivalent existed in the source
// CRM — needed here because roster/logging/standards UIs are class-scoped,
// not just student-scoped.
export async function accessibleClassIds(user: AccessUser): Promise<"ALL" | string[]> {
  if (user.role === "OWNER") {
    const rows = await prisma.class.findMany({
      where: { OR: [{ teacherId: user.id }, { coTeachers: { some: { coTeacherUserId: user.id } } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  if (user.role === "CLIENT") {
    if (!user.studentId) return [];
    const rows = await prisma.enrollment.findMany({
      where: { studentId: user.studentId, status: "ACTIVE" },
      select: { classId: true },
    });
    return rows.map((r) => r.classId);
  }
  // ASSISTANT (co-teacher)
  if (user.allClientsAccess) {
    const rows = await prisma.class.findMany({ where: { teacherId: workspaceOwnerId(user) }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.classCoTeacher.findMany({
    where: { coTeacherUserId: user.id },
    select: { classId: true },
  });
  return rows.map((r) => r.classId);
}

// The set of student ids a user may see. An empty list means "no students" —
// callers must treat that as "match nothing", never "match everything".
export async function accessibleStudentIds(user: AccessUser): Promise<"ALL" | string[]> {
  if (user.role === "CLIENT") return user.studentId ? [user.studentId] : [];
  if (user.role === "OWNER" || user.allClientsAccess) {
    const classIds = await accessibleClassIds(user);
    const enrollmentRows =
      classIds === "ALL" || classIds.length === 0
        ? []
        : await prisma.enrollment.findMany({ where: { classId: { in: classIds }, status: "ACTIVE" }, select: { studentId: true } });
    const ids = new Set(enrollmentRows.map((r) => r.studentId));
    if (user.role === "OWNER") {
      const ownRows = await prisma.student.findMany({ where: { createdByUserId: user.id }, select: { id: true } });
      for (const r of ownRows) ids.add(r.id);
    }
    return [...ids];
  }
  // ASSISTANT (co-teacher), no all-access
  const classRows = await prisma.classCoTeacher.findMany({
    where: { coTeacherUserId: user.id },
    select: { classId: true },
  });
  const classIds = classRows.map((r) => r.classId);
  if (classIds.length === 0) return [];
  const enrollmentRows = await prisma.enrollment.findMany({
    where: { classId: { in: classIds }, status: "ACTIVE" },
    select: { studentId: true },
  });
  return [...new Set(enrollmentRows.map((r) => r.studentId))];
}

// A Prisma `where` fragment scoping a studentId column to what the user may see.
// Spread into any query over a student-scoped model:
//   where: { ...(await studentScopeWhere(user)), archived: false }
export async function studentScopeWhere(
  user: AccessUser,
): Promise<{ studentId?: { in: string[] } }> {
  const ids = await accessibleStudentIds(user);
  if (ids === "ALL") return {};
  return { studentId: { in: ids } };
}

// A Prisma `where` fragment scoping a Class's own `id` to what the user may see.
export async function classScopeWhere(user: AccessUser): Promise<{ id?: { in: string[] } }> {
  const ids = await accessibleClassIds(user);
  if (ids === "ALL") return {};
  return { id: { in: ids } };
}

// A Prisma `where` fragment scoping the Student model's own `id` (NOT a
// `studentId` foreign key column on some other model — use studentScopeWhere
// for those instead). For queries against `prisma.student.*` directly.
export async function studentIdScopeWhere(user: AccessUser): Promise<{ id?: { in: string[] } }> {
  const ids = await accessibleStudentIds(user);
  if (ids === "ALL") return {};
  return { id: { in: ids } };
}

// A Prisma `where` fragment scoping Task rows to what this OWNER may see:
// created by them, assigned to them or one of their own assistants, or tied
// to a class/student they can access. Mirrors
// src/actions/tasks.ts::taskInOwnerWorkspace, as a filter instead of a
// per-record check — for listing pages (Task has no single "owner" column of
// its own to filter on directly).
export async function taskScopeWhere(user: AccessUser): Promise<Prisma.TaskWhereInput> {
  const [classIds, studentIds] = await Promise.all([accessibleClassIds(user), accessibleStudentIds(user)]);
  const workspaceOwner = workspaceOwnerId(user);
  return {
    OR: [
      { createdById: user.id },
      { assignedToId: user.id },
      { assignedTo: { ownerId: workspaceOwner } },
      ...(classIds === "ALL" ? [{ classId: { not: null } }] : classIds.length ? [{ classId: { in: classIds } }] : []),
      ...(studentIds === "ALL" ? [{ studentId: { not: null } }] : studentIds.length ? [{ studentId: { in: studentIds } }] : []),
    ],
  };
}

// True if the user may access this specific student.
export async function canAccessStudent(user: AccessUser, studentId: string): Promise<boolean> {
  if (!studentId) return false;
  if (user.role === "CLIENT") return user.studentId === studentId;
  if (user.role === "OWNER") {
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { createdByUserId: true } });
    if (!student) return false;
    if (student.createdByUserId === user.id) return true;
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, status: "ACTIVE", class: { OR: [{ teacherId: user.id }, { coTeachers: { some: { coTeacherUserId: user.id } } }] } },
      select: { id: true },
    });
    return !!enrollment;
  }
  // ASSISTANT (co-teacher)
  if (user.allClientsAccess) {
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, status: "ACTIVE", class: { teacherId: workspaceOwnerId(user) } },
      select: { id: true },
    });
    return !!enrollment;
  }
  const classRows = await prisma.classCoTeacher.findMany({
    where: { coTeacherUserId: user.id },
    select: { classId: true },
  });
  const classIds = classRows.map((r) => r.classId);
  if (classIds.length === 0) return false;
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, classId: { in: classIds }, status: "ACTIVE" },
    select: { id: true },
  });
  return !!enrollment;
}

// True if the user may access this specific class.
export async function canAccessClass(user: AccessUser, classId: string): Promise<boolean> {
  if (!classId) return false;
  if (user.role === "OWNER") {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { teacherId: true, coTeachers: { where: { coTeacherUserId: user.id }, select: { id: true } } },
    });
    if (!cls) return false;
    return cls.teacherId === user.id || cls.coTeachers.length > 0;
  }
  if (user.role === "CLIENT") {
    if (!user.studentId) return false;
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId: user.studentId, classId, status: "ACTIVE" },
      select: { id: true },
    });
    return !!enrollment;
  }
  // ASSISTANT (co-teacher)
  if (user.allClientsAccess) {
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } });
    return cls?.teacherId === workspaceOwnerId(user);
  }
  const row = await prisma.classCoTeacher.findUnique({
    where: { classId_coTeacherUserId: { classId, coTeacherUserId: user.id } },
    select: { id: true },
  });
  return !!row;
}

// Throw AccessError unless the user may access this student. Use in every
// student-scoped write/read of a specific record.
export async function assertCanAccessStudent(user: AccessUser, studentId: string): Promise<void> {
  if (!(await canAccessStudent(user, studentId))) throw new AccessError();
}

// Throw AccessError unless the user may access this class. Use in every
// class-scoped write/read of a specific record.
export async function assertCanAccessClass(user: AccessUser, classId: string): Promise<void> {
  if (!(await canAccessClass(user, classId))) {
    throw new AccessError("You don't have access to this class's data.");
  }
}

// Whether a user may WRITE (add/edit students, manage classes, give
// feedback). CLIENT portal users are read-only — they can see
// STUDENT_VISIBLE feedback on their own record but never write anything.
// Staff can write.
export function canWriteForStudents(user: Pick<SessionUser, "role">): boolean {
  return user.role === "OWNER" || user.role === "ASSISTANT";
}
