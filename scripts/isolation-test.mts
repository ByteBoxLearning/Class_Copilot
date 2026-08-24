// Scripted isolation test for the student-scoping access spine.
// Run: node --env-file=.env --import tsx scripts/isolation-test.mts
//
// Verifies, against the seeded demo data, that:
//   - a co-teacher only sees students enrolled in classes they're assigned to
//     (the 2-hop ClassCoTeacher -> Enrollment lookup)
//   - a co-teacher assigned to Class 1 CANNOT access a student who is only
//     enrolled in Class 2 (the IDOR surface)
//   - a student sees only their own studentId
//   - the teacher sees everything
//   - accessibleStudentIds / canAccessStudent agree, same for classes
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Re-implement the access rules here (the lib is "server-only" and can't be
// imported into a plain script). This mirrors src/lib/access.ts exactly.
type U = { id: string; role: string; studentId?: string | null; allClientsAccess?: boolean };

async function accessibleStudentIds(u: U): Promise<"ALL" | string[]> {
  if (u.role === "OWNER") return "ALL";
  if (u.role === "CLIENT") return u.studentId ? [u.studentId] : [];
  if (u.allClientsAccess) return "ALL";
  const classRows = await prisma.classCoTeacher.findMany({ where: { coTeacherUserId: u.id }, select: { classId: true } });
  const classIds = classRows.map((r) => r.classId);
  if (classIds.length === 0) return [];
  const enrollmentRows = await prisma.enrollment.findMany({
    where: { classId: { in: classIds }, status: "ACTIVE" },
    select: { studentId: true },
  });
  return [...new Set(enrollmentRows.map((r) => r.studentId))];
}
async function canAccessStudent(u: U, studentId: string): Promise<boolean> {
  const ids = await accessibleStudentIds(u);
  return ids === "ALL" || ids.includes(studentId);
}
async function accessibleClassIds(u: U): Promise<"ALL" | string[]> {
  if (u.role === "OWNER") return "ALL";
  if (u.role === "CLIENT") {
    if (!u.studentId) return [];
    const rows = await prisma.enrollment.findMany({ where: { studentId: u.studentId, status: "ACTIVE" }, select: { classId: true } });
    return rows.map((r) => r.classId);
  }
  if (u.allClientsAccess) return "ALL";
  const rows = await prisma.classCoTeacher.findMany({ where: { coTeacherUserId: u.id }, select: { classId: true } });
  return rows.map((r) => r.classId);
}
async function canAccessClass(u: U, classId: string): Promise<boolean> {
  const ids = await accessibleClassIds(u);
  return ids === "ALL" || ids.includes(classId);
}

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  const teacher = await prisma.user.findUniqueOrThrow({ where: { email: "teacher@classroom.test" } });
  const coTeacher1 = await prisma.user.findUniqueOrThrow({ where: { email: "co-teacher1@classroom.test" } }); // Period 3
  const coTeacher2 = await prisma.user.findUniqueOrThrow({ where: { email: "co-teacher2@classroom.test" } }); // Period 5

  const classP3 = await prisma.class.findFirstOrThrow({ where: { name: "Math — Period 3" } });
  const classP5 = await prisma.class.findFirstOrThrow({ where: { name: "Math — Period 5" } });

  const students = await prisma.student.findMany({ include: { linkedUser: true } });
  const byName = (n: string) => students.find((s) => s.displayName.startsWith(n))!;
  const ava = byName("Ava"), liam = byName("Liam"), noor = byName("Noor"), ethan = byName("Ethan"), maya = byName("Maya"), jordan = byName("Jordan");

  const teacherU: U = { id: teacher.id, role: "OWNER" };
  const coT1U: U = { id: coTeacher1.id, role: "ASSISTANT", allClientsAccess: coTeacher1.allClientsAccess };
  const coT2U: U = { id: coTeacher2.id, role: "ASSISTANT", allClientsAccess: coTeacher2.allClientsAccess };

  console.log("Teacher (owner):");
  check("teacher sees ALL students", (await accessibleStudentIds(teacherU)) === "ALL");
  check("teacher sees ALL classes", (await accessibleClassIds(teacherU)) === "ALL");
  check("teacher can access Ethan", await canAccessStudent(teacherU, ethan.id));

  console.log("Co-teacher 1 (assigned: Period 3 only):");
  const coT1Ids = (await accessibleStudentIds(coT1U)) as string[];
  check("co-teacher 1 sees exactly 4 students (Ava, Liam, Noor, Jordan)", coT1Ids.length === 4);
  check("co-teacher 1 CAN access Ava (enrolled in P3)", await canAccessStudent(coT1U, ava.id));
  check("co-teacher 1 CAN access Noor (enrolled in P3 + P5)", await canAccessStudent(coT1U, noor.id));
  check("co-teacher 1 CANNOT access Ethan (P5 only — the 2-hop IDOR surface)", !(await canAccessStudent(coT1U, ethan.id)));
  check("co-teacher 1 CANNOT access Maya (P5 only)", !(await canAccessStudent(coT1U, maya.id)));
  check("co-teacher 1 CAN access class P3", await canAccessClass(coT1U, classP3.id));
  check("co-teacher 1 CANNOT access class P5", !(await canAccessClass(coT1U, classP5.id)));

  console.log("Co-teacher 2 (assigned: Period 5 only):");
  check("co-teacher 2 CAN access Ethan", await canAccessStudent(coT2U, ethan.id));
  check("co-teacher 2 CAN access Noor (overlap student)", await canAccessStudent(coT2U, noor.id));
  check("co-teacher 2 CANNOT access Ava (P3 only)", !(await canAccessStudent(coT2U, ava.id)));
  check("co-teacher 2 CANNOT access Jordan (P3 only)", !(await canAccessStudent(coT2U, jordan.id)));

  console.log("Student portal users:");
  const avaLogin = ava.linkedUser!;
  const avaU: U = { id: avaLogin.id, role: "CLIENT", studentId: ava.id };
  check("Ava's login sees ONLY Ava", JSON.stringify(await accessibleStudentIds(avaU)) === JSON.stringify([ava.id]));
  check("Ava's login CANNOT access Liam", !(await canAccessStudent(avaU, liam.id)));
  check("Ava's login CAN access class P3 (her own enrollment)", await canAccessClass(avaU, classP3.id));
  check("Ava's login CANNOT access class P5 (not enrolled)", !(await canAccessClass(avaU, classP5.id)));

  console.log(`\n${failures === 0 ? "✅ All isolation checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
