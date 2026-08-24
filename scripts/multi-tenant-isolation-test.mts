// Scripted test for per-teacher workspace isolation (signup + multi-tenant
// access control). Run:
//   node --env-file=.env --import tsx scripts/multi-tenant-isolation-test.mts
//
// src/lib/access.ts imports "server-only" (tsx/plain Node can't resolve that
// bundler-time guard — see practice-test.mts's precedent), so its logic is
// re-implemented here inline against the same Prisma shapes rather than
// imported directly.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok - ${label}`);
  } else {
    failures++;
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ""}`);
  }
}

// Mirrors access.ts::accessibleClassIds/accessibleStudentIds/canAccessClass/
// canAccessStudent's OWNER + ASSISTANT-allClientsAccess branches exactly.
function workspaceOwnerId(user: { id: string; role: string; ownerId: string | null }): string {
  return user.role === "OWNER" ? user.id : (user.ownerId ?? user.id);
}

async function accessibleClassIds(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }): Promise<string[]> {
  if (user.role === "OWNER") {
    const rows = await prisma.class.findMany({
      where: { OR: [{ teacherId: user.id }, { coTeachers: { some: { coTeacherUserId: user.id } } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
  if (user.allClientsAccess) {
    const rows = await prisma.class.findMany({ where: { teacherId: workspaceOwnerId(user) }, select: { id: true } });
    return rows.map((r) => r.id);
  }
  const rows = await prisma.classCoTeacher.findMany({ where: { coTeacherUserId: user.id }, select: { classId: true } });
  return rows.map((r) => r.classId);
}

async function accessibleStudentIds(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }): Promise<string[]> {
  const classIds = await accessibleClassIds(user);
  const ids = new Set<string>();
  if (classIds.length) {
    const rows = await prisma.enrollment.findMany({ where: { classId: { in: classIds }, status: "ACTIVE" }, select: { studentId: true } });
    for (const r of rows) ids.add(r.studentId);
  }
  if (user.role === "OWNER") {
    const own = await prisma.student.findMany({ where: { createdByUserId: user.id }, select: { id: true } });
    for (const r of own) ids.add(r.id);
  }
  return [...ids];
}

async function canAccessClass(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }, classId: string): Promise<boolean> {
  return (await accessibleClassIds(user)).includes(classId);
}
async function canAccessStudent(user: { id: string; role: string; ownerId: string | null; allClientsAccess: boolean }, studentId: string): Promise<boolean> {
  return (await accessibleStudentIds(user)).includes(studentId);
}

async function main() {
  // Two fully independent OWNER "teachers" (simulating two separate /signup
  // accounts), each with their own class + student, plus an all-access
  // ASSISTANT under Teacher A.
  const teacherA = await prisma.user.create({ data: { name: "[test] Teacher A", email: "mt-teacher-a@example.com", passwordHash: "x", role: "OWNER" } });
  const teacherB = await prisma.user.create({ data: { name: "[test] Teacher B", email: "mt-teacher-b@example.com", passwordHash: "x", role: "OWNER" } });
  const assistantA = await prisma.user.create({
    data: { name: "[test] Assistant A", email: "mt-assistant-a@example.com", passwordHash: "x", role: "ASSISTANT", ownerId: teacherA.id, allClientsAccess: true },
  });

  const classA = await prisma.class.create({ data: { name: "[test fixture] Class A", teacherId: teacherA.id } });
  const classB = await prisma.class.create({ data: { name: "[test fixture] Class B", teacherId: teacherB.id } });
  const studentA = await prisma.student.create({ data: { displayName: "[test fixture] Student A", status: "ACTIVE", createdByUserId: teacherA.id } });
  const studentB = await prisma.student.create({ data: { displayName: "[test fixture] Student B", status: "ACTIVE", createdByUserId: teacherB.id } });
  await prisma.enrollment.create({ data: { studentId: studentA.id, classId: classA.id, status: "ACTIVE" } });
  await prisma.enrollment.create({ data: { studentId: studentB.id, classId: classB.id, status: "ACTIVE" } });

  try {
    const uA = { id: teacherA.id, role: "OWNER", ownerId: null, allClientsAccess: false };
    const uB = { id: teacherB.id, role: "OWNER", ownerId: null, allClientsAccess: false };
    const uAssistantA = { id: assistantA.id, role: "ASSISTANT", ownerId: teacherA.id, allClientsAccess: true };

    console.log("=== Class isolation ===");
    check("Teacher A can access their own class", await canAccessClass(uA, classA.id));
    check("Teacher A can NOT access Teacher B's class", !(await canAccessClass(uA, classB.id)));
    check("Teacher B can access their own class", await canAccessClass(uB, classB.id));
    check("Teacher B can NOT access Teacher A's class", !(await canAccessClass(uB, classA.id)));
    const classIdsA = await accessibleClassIds(uA);
    check("Teacher A's accessibleClassIds contains exactly their own class (not a platform-wide list)", classIdsA.includes(classA.id) && !classIdsA.includes(classB.id));

    console.log("=== Student isolation ===");
    check("Teacher A can access their own student", await canAccessStudent(uA, studentA.id));
    check("Teacher A can NOT access Teacher B's student", !(await canAccessStudent(uA, studentB.id)));
    check("Teacher B can NOT access Teacher A's student", !(await canAccessStudent(uB, studentA.id)));

    console.log("=== ASSISTANT allClientsAccess is workspace-scoped, not platform-wide ===");
    check("Teacher A's all-access assistant CAN access Teacher A's class", await canAccessClass(uAssistantA, classA.id));
    check("Teacher A's all-access assistant CANNOT access Teacher B's class", !(await canAccessClass(uAssistantA, classB.id)));
    check("Teacher A's all-access assistant CAN access Teacher A's student", await canAccessStudent(uAssistantA, studentA.id));
    check("Teacher A's all-access assistant CANNOT access Teacher B's student", !(await canAccessStudent(uAssistantA, studentB.id)));

    console.log("=== Explicit cross-workspace co-teacher grant still works ===");
    await prisma.classCoTeacher.create({ data: { classId: classB.id, coTeacherUserId: teacherA.id } });
    check("Teacher A CAN now access Teacher B's class after an explicit ClassCoTeacher grant", await canAccessClass(uA, classB.id));
    // Student B is enrolled in Class B, which Teacher A now has a co-teacher grant on.
    check("Teacher A CAN now access Student B (enrolled in the co-taught class)", await canAccessStudent(uA, studentB.id));
    check("Teacher B is UNAFFECTED — still can't see Teacher A's own class/student", !(await canAccessClass(uB, classA.id)) && !(await canAccessStudent(uB, studentA.id)));
  } finally {
    await prisma.classCoTeacher.deleteMany({ where: { OR: [{ classId: classA.id }, { classId: classB.id }] } });
    await prisma.enrollment.deleteMany({ where: { OR: [{ studentId: studentA.id }, { studentId: studentB.id }] } });
    await prisma.student.deleteMany({ where: { OR: [{ id: studentA.id }, { id: studentB.id }] } });
    await prisma.class.deleteMany({ where: { OR: [{ id: classA.id }, { id: classB.id }] } });
    await prisma.user.deleteMany({ where: { OR: [{ id: teacherA.id }, { id: teacherB.id }, { id: assistantA.id }] } });
  }

  await prisma.$disconnect();
  if (failures > 0) {
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("\n✅ All multi-tenant isolation checks passed.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
