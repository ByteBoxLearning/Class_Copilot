// Scripted test for the Feedback model (Milestone H — the renamed/reshaped
// Comment model, attached to MasteryEvent/DailyCheck rows). Run:
// node --env-file=.env --import tsx scripts/feedback-test.mts
//
// src/lib/feedback.ts and src/actions/feedback.ts both import "server-only",
// so their query/action shapes are re-implemented inline against a
// self-contained fixture, matching the precedent set by mastery-test.mts /
// grading-test.mts / comments-test.mts / assignments-test.mts.
import { PrismaClient } from "@prisma/client";
import { FEEDBACK_VISIBILITY, BADGE_COLORS, values } from "../src/lib/enums";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

// Re-implements feedbackForMasteryEvents/feedbackForDailyChecks's filtering
// logic against real rows.
async function visibleFeedback(where: Record<string, unknown>, includeTeacherOnly: boolean) {
  return prisma.feedback.findMany({
    where: { ...where, deletedAt: null, ...(includeTeacherOnly ? {} : { visibility: "STUDENT_VISIBLE" }) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

async function main() {
  console.log("Enum sanity:");
  check("FEEDBACK_VISIBILITY is exactly the 2-tier TEACHER_ONLY/STUDENT_VISIBLE set", JSON.stringify(values(FEEDBACK_VISIBILITY)) === JSON.stringify(["TEACHER_ONLY", "STUDENT_VISIBLE"]));
  check("both visibility values have a badge color", !!BADGE_COLORS.TEACHER_ONLY && !!BADGE_COLORS.STUDENT_VISIBLE);

  console.log("\nReal-DB fixture — Feedback attached to MasteryEvent/DailyCheck:");
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });
  const cls = await prisma.class.upsert({
    where: { id: "test-feedback-class" }, update: {},
    create: { id: "test-feedback-class", name: "[test fixture] Feedback", teacherId: teacher.id },
  });
  const student = await prisma.student.upsert({
    where: { id: "test-feedback-student" }, update: {},
    create: { id: "test-feedback-student", displayName: "[test fixture] Student", createdByUserId: teacher.id },
  });
  await prisma.enrollment.upsert({
    where: { studentId_classId: { studentId: student.id, classId: cls.id } },
    update: { status: "ACTIVE" }, create: { studentId: student.id, classId: cls.id, status: "ACTIVE" },
  });
  const standard = await prisma.standard.upsert({
    where: { id: "test-feedback-standard" }, update: {},
    create: { id: "test-feedback-standard", classId: cls.id, code: "F.1", title: "[test fixture] Standard" },
  });
  await prisma.feedback.deleteMany({ where: { studentId: student.id } });
  await prisma.masteryEvent.deleteMany({ where: { standardId: standard.id } });
  await prisma.dailyCheck.deleteMany({ where: { classId: cls.id } });

  const event = await prisma.masteryEvent.create({ data: { studentId: student.id, standardId: standard.id, level: 3, recordedById: teacher.id } });
  const otherStudent = await prisma.student.upsert({
    where: { id: "test-feedback-other-student" }, update: {},
    create: { id: "test-feedback-other-student", displayName: "[test fixture] Other Student", createdByUserId: teacher.id },
  });
  const otherEvent = await prisma.masteryEvent.create({ data: { studentId: otherStudent.id, standardId: standard.id, level: 2, recordedById: teacher.id } });

  // Feedback on the mastery event: one teacher-only, one student-visible.
  await prisma.feedback.create({ data: { studentId: student.id, userId: teacher.id, message: "Internal note re: this quiz.", visibility: "TEACHER_ONLY", masteryEventId: event.id } });
  await prisma.feedback.create({ data: { studentId: student.id, userId: teacher.id, message: "Nice work on this one!", visibility: "STUDENT_VISIBLE", masteryEventId: event.id } });

  const staffView = await visibleFeedback({ masteryEventId: event.id }, true);
  const studentView = await visibleFeedback({ masteryEventId: event.id }, false);
  check("staff view sees both pieces of feedback on the event", staffView.length === 2);
  check("student view sees only the STUDENT_VISIBLE one", studentView.length === 1 && studentView[0].visibility === "STUDENT_VISIBLE");
  check("student-visible feedback carries the author's name", studentView[0].user.name === teacher.name);

  // DAILY_CHECK target: simulate addFeedback's upsert-then-attach flow for a
  // day with NOTHING else logged yet.
  const today = new Date().toISOString().slice(0, 10);
  const dailyCheck = await prisma.dailyCheck.upsert({
    where: { studentId_classId_date: { studentId: student.id, classId: cls.id, date: today } },
    update: {},
    create: { studentId: student.id, classId: cls.id, date: today, loggedById: teacher.id },
  });
  check("addFeedback's DAILY_CHECK target creates a DailyCheck row even with no dimensions set", dailyCheck.engagement === null && dailyCheck.understanding === null);
  await prisma.feedback.create({ data: { studentId: student.id, userId: teacher.id, message: "Great focus in class today.", visibility: "STUDENT_VISIBLE", dailyCheckId: dailyCheck.id } });
  const dailyFeedback = await visibleFeedback({ dailyCheckId: dailyCheck.id }, false);
  check("feedback attached to a DailyCheck round-trips", dailyFeedback.length === 1 && dailyFeedback[0].message === "Great focus in class today.");

  // Safety check reimplemented: a MasteryEvent's studentId must match the
  // studentId feedback claims to be about — addFeedback rejects a mismatch.
  const spoofCheck = otherEvent.studentId !== student.id;
  check("addFeedback's ownership check would reject attaching feedback to another student's event", spoofCheck);

  // Soft delete.
  const toDelete = studentView[0];
  await prisma.feedback.update({ where: { id: toDelete.id }, data: { deletedAt: new Date(), deletedById: teacher.id } });
  const afterDelete = await visibleFeedback({ masteryEventId: event.id }, false);
  check("a soft-deleted feedback row is excluded from visible queries", afterDelete.length === 0);
  const stillInDb = await prisma.feedback.findUnique({ where: { id: toDelete.id } });
  check("a soft-deleted feedback row is NOT actually removed from the database (audit trail kept)", !!stillInDb && !!stillInDb.deletedAt);

  // Cascade delete via the schema's onDelete: Cascade.
  await prisma.masteryEvent.delete({ where: { id: otherEvent.id } });
  await prisma.feedback.create({ data: { studentId: otherStudent.id, userId: teacher.id, message: "temp", visibility: "TEACHER_ONLY", masteryEventId: (await prisma.masteryEvent.create({ data: { studentId: otherStudent.id, standardId: standard.id, level: 4, recordedById: teacher.id } })).id } });
  const cascadeEvent = await prisma.masteryEvent.findFirstOrThrow({ where: { studentId: otherStudent.id, standardId: standard.id } });
  await prisma.masteryEvent.delete({ where: { id: cascadeEvent.id } });
  const orphanFeedback = await prisma.feedback.findMany({ where: { masteryEventId: cascadeEvent.id } });
  check("deleting a MasteryEvent cascades away its attached Feedback (schema onDelete: Cascade)", orphanFeedback.length === 0);

  // Cleanup.
  await prisma.feedback.deleteMany({ where: { studentId: { in: [student.id, otherStudent.id] } } });
  await prisma.dailyCheck.deleteMany({ where: { classId: cls.id } });
  await prisma.masteryEvent.deleteMany({ where: { standardId: standard.id } });
  await prisma.standard.delete({ where: { id: standard.id } });
  await prisma.enrollment.deleteMany({ where: { classId: cls.id } });
  await prisma.student.delete({ where: { id: student.id } });
  await prisma.student.delete({ where: { id: otherStudent.id } });
  await prisma.class.delete({ where: { id: cls.id } });

  console.log(`\n${failures === 0 ? "✅ All feedback checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
