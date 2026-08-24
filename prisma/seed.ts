import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_CHECKLIST } from "../src/lib/enums";

const prisma = new PrismaClient();

// Milestone B seed: reinterprets the Milestone A content on the renamed
// schema (Student/Class/Enrollment/ClassCoTeacher/StandardCategory).
async function main() {
  console.log("Seeding classroom-tracker demo data...");

  const pw = (s: string) => bcrypt.hash(s, 10);

  // --- People ------------------------------------------------------------------
  const teacher = await prisma.user.upsert({
    where: { email: "teacher@classroom.test" },
    update: { role: "OWNER" },
    create: { name: "Ms. Rivera", email: "teacher@classroom.test", passwordHash: await pw("ChangeMe123!"), role: "OWNER" },
  });

  const coTeacher1 = await prisma.user.upsert({
    where: { email: "co-teacher1@classroom.test" },
    update: { role: "ASSISTANT", ownerId: teacher.id },
    create: { name: "Mr. Chen", email: "co-teacher1@classroom.test", passwordHash: await pw("ChangeMe123!"), role: "ASSISTANT", ownerId: teacher.id },
  });
  const coTeacher2 = await prisma.user.upsert({
    where: { email: "co-teacher2@classroom.test" },
    update: { role: "ASSISTANT", ownerId: teacher.id },
    create: { name: "Ms. Patel", email: "co-teacher2@classroom.test", passwordHash: await pw("ChangeMe123!"), role: "ASSISTANT", ownerId: teacher.id },
  });
  console.log("  - Teacher + 2 co-teachers");

  // --- Classes -------------------------------------------------------------
  const classDefs = [
    { name: "Math — Period 3", subject: "Math", period: "P3", coTeacher: coTeacher1 },
    { name: "Math — Period 5", subject: "Math", period: "P5", coTeacher: coTeacher2 },
  ];
  const classes: Record<string, Awaited<ReturnType<typeof prisma.class.create>>> = {};
  for (const def of classDefs) {
    let cls = await prisma.class.findFirst({ where: { name: def.name, teacherId: teacher.id } });
    if (!cls) {
      cls = await prisma.class.create({
        data: { name: def.name, subject: def.subject, period: def.period, academicYear: "2026-2027", teacherId: teacher.id },
      });
    }
    await prisma.classCoTeacher.upsert({
      where: { classId_coTeacherUserId: { classId: cls.id, coTeacherUserId: def.coTeacher.id } },
      update: {},
      create: { classId: cls.id, coTeacherUserId: def.coTeacher.id },
    });
    classes[def.name] = cls;
  }
  console.log(`  - ${classDefs.length} classes, each with a co-teacher assigned`);

  // --- Standard categories (placeholder strands; teacher-defined later) ----
  const demoCategories = ["Number Sense", "Reading Comprehension", "Collaboration Skills"];
  for (const name of demoCategories) {
    await prisma.standardCategory.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`  - ${demoCategories.length} placeholder standard categories`);

  // --- Students, enrolled into one or both classes --------------------------
  // Noor is enrolled in BOTH classes so the 2-hop co-teacher access model has
  // a real overlap case to exercise (see scripts/isolation-test.mts).
  const studentDefs = [
    { displayName: "Ava Thompson", gradeLevel: "Grade 6", login: { name: "Ava Thompson", email: "ava@student.test" }, classes: ["Math — Period 3"] },
    { displayName: "Liam Garcia", gradeLevel: "Grade 6", login: { name: "Liam Garcia", email: "liam@student.test" }, classes: ["Math — Period 3"] },
    { displayName: "Noor Ahmed", gradeLevel: "Grade 6", login: { name: "Noor Ahmed", email: "noor@student.test" }, classes: ["Math — Period 3", "Math — Period 5"] },
    { displayName: "Ethan Brooks", gradeLevel: "Grade 6", login: { name: "Ethan Brooks", email: "ethan@student.test" }, classes: ["Math — Period 5"] },
    { displayName: "Maya Chen", gradeLevel: "Grade 6", login: { name: "Maya Chen", email: "maya@student.test" }, classes: ["Math — Period 5"] },
    // One student intentionally left without a portal login, to demo the
    // "student can exist before being invited" state.
    { displayName: "Jordan Lee", gradeLevel: "Grade 6", login: null, classes: ["Math — Period 3"] },
  ];

  for (const def of studentDefs) {
    let linkedUserId: string | null = null;
    if (def.login) {
      const su = await prisma.user.upsert({
        where: { email: def.login.email },
        update: { role: "CLIENT" },
        create: { name: def.login.name, email: def.login.email, passwordHash: await pw("ChangeMe123!"), role: "CLIENT" },
      });
      linkedUserId = su.id;
    }

    let student = await prisma.student.findFirst({ where: { displayName: def.displayName } });
    if (!student) {
      student = await prisma.student.create({
        data: {
          displayName: def.displayName,
          gradeLevel: def.gradeLevel,
          status: "ACTIVE",
          linkedUserId,
          email: def.login?.email ?? null,
          createdByUserId: teacher.id,
        },
      });
    }

    for (const className of def.classes) {
      const cls = classes[className];
      await prisma.enrollment.upsert({
        where: { studentId_classId: { studentId: student.id, classId: cls.id } },
        update: {},
        create: { studentId: student.id, classId: cls.id },
      });
    }

    console.log(`  - Student "${def.displayName}" in ${def.classes.join(", ")}${linkedUserId ? " (portal login)" : ""}`);
  }

  // --- A couple of general recurring tasks ------------------------------------
  const taskCount = await prisma.task.count();
  if (taskCount === 0) {
    for (const c of DEFAULT_CHECKLIST) {
      await prisma.task.create({ data: { title: c.label, recurring: true, assignedToId: coTeacher1.id, createdById: teacher.id } });
    }
    console.log("  - Seeded a few recurring tasks");
  }

  console.log("\nSeed complete. Logins (all password: ChangeMe123!):");
  console.log("   Teacher     -> teacher@classroom.test");
  console.log("   Co-teacher  -> co-teacher1@classroom.test (Period 3) / co-teacher2@classroom.test (Period 5)");
  console.log("   Student     -> ava@student.test / liam@student.test / noor@student.test / ethan@student.test / maya@student.test");
  console.log("   Change these before real use.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
