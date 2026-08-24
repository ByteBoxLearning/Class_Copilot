// Scripted test for the self-service student invite link (Milestone S) and
// the Google Sign-In account-matching rules. Run:
//   node --env-file=.env --import tsx scripts/invite-and-google-auth-test.mts
//
// src/actions/invite.ts, src/actions/students.ts, and src/lib/auth.ts all
// transitively import "server-only" (tsx/plain Node can't resolve that
// bundler-time guard — see practice-test.mts's precedent), so their logic is
// re-implemented here inline against the same Prisma shapes rather than
// imported directly.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

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

// Mirrors actions/students.ts::generateStudentInviteLink + actions/invite.ts.
function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}
const INVITE_TTL_DAYS = 7;

async function generateInvite(studentId: string) {
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.studentInvite.upsert({
    where: { studentId },
    create: { studentId, token, expiresAt },
    update: { token, expiresAt },
  });
  return { token, expiresAt };
}

async function acceptInvite(token: string, email: string, password: string) {
  const invite = await prisma.studentInvite.findUnique({
    where: { token },
    include: { student: { select: { id: true, displayName: true, linkedUserId: true } } },
  });
  if (!invite || invite.expiresAt < new Date()) return { ok: false as const, error: "invalid_or_expired" };
  if (invite.student.linkedUserId) return { ok: false as const, error: "already_used" };
  const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (clash) return { ok: false as const, error: "email_in_use" };

  const created = await prisma.user.create({
    data: { name: invite.student.displayName, email, passwordHash: await bcrypt.hash(password, 10), role: "CLIENT" },
  });
  await prisma.$transaction([
    prisma.student.update({ where: { id: invite.studentId }, data: { linkedUserId: created.id } }),
    prisma.studentInvite.delete({ where: { token } }),
  ]);
  return { ok: true as const, userId: created.id };
}

// Mirrors auth.ts::sessionUserForEmail + provisionStudentFromGoogle.
async function sessionUserForEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, active: true, role: true } });
  if (!user || !user.active) return null;
  return user;
}
async function provisionStudentFromGoogle(email: string) {
  const student = await prisma.student.findFirst({ where: { email, linkedUserId: null }, select: { id: true, displayName: true } });
  if (!student) return null;
  const created = await prisma.user.create({
    data: { name: student.displayName, email, passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), role: "CLIENT" },
  });
  await prisma.student.update({ where: { id: student.id }, data: { linkedUserId: created.id } });
  return created;
}

async function main() {
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });

  console.log("=== Invite link lifecycle ===");
  const student = await prisma.student.create({ data: { displayName: "Invite Test Student", status: "ACTIVE", createdByUserId: teacher.id } });
  try {
    const invite1 = await generateInvite(student.id);
    check("invite created with a token", invite1.token.length > 20);

    // Regenerate replaces the token (upsert on unique studentId).
    const invite2 = await generateInvite(student.id);
    check("regenerating replaces the token", invite2.token !== invite1.token);
    const stale = await acceptInvite(invite1.token, "stale@example.com", "password123");
    check("the old (replaced) token no longer works", !stale.ok && stale.error === "invalid_or_expired");

    // Expired token rejected.
    await prisma.studentInvite.update({ where: { studentId: student.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await acceptInvite(invite2.token, "expired@example.com", "password123");
    check("an expired token is rejected", !expired.ok && expired.error === "invalid_or_expired");

    const invite3 = await generateInvite(student.id);
    const emailClash = await prisma.user.create({ data: { name: "x", email: "clash@example.com", passwordHash: "x", role: "CLIENT" } });
    const clash = await acceptInvite(invite3.token, "clash@example.com", "password123");
    check("an email already in use is rejected", !clash.ok && clash.error === "email_in_use");
    await prisma.user.delete({ where: { id: emailClash.id } });

    const accepted = await acceptInvite(invite3.token, "newstudent@example.com", "password123");
    check("a valid accept creates the User", accepted.ok);
    const linked = await prisma.student.findUnique({ where: { id: student.id }, select: { linkedUserId: true } });
    check("Student.linkedUserId is set after accept", linked?.linkedUserId === (accepted.ok ? accepted.userId : null));
    const inviteGone = await prisma.studentInvite.findUnique({ where: { studentId: student.id } });
    check("the invite row is deleted after accept", inviteGone === null);

    const reuse = await acceptInvite(invite3.token, "another@example.com", "password123");
    check("the same (consumed) token can't be reused", !reuse.ok);
  } finally {
    await prisma.masteryEvent.deleteMany({ where: { studentId: student.id } });
    const linkedUserId = (await prisma.student.findUnique({ where: { id: student.id }, select: { linkedUserId: true } }))?.linkedUserId;
    await prisma.studentInvite.deleteMany({ where: { studentId: student.id } });
    await prisma.student.delete({ where: { id: student.id } });
    if (linkedUserId) await prisma.user.delete({ where: { id: linkedUserId } });
  }

  console.log("=== Google Sign-In account matching ===");
  const existingUser = await prisma.user.create({
    data: { name: "Existing Staff", email: "existing-staff@example.com", passwordHash: "x", role: "ASSISTANT" },
  });
  const inactiveUser = await prisma.user.create({
    data: { name: "Inactive", email: "inactive@example.com", passwordHash: "x", role: "ASSISTANT", active: false },
  });
  const rosterStudent = await prisma.student.create({
    data: { displayName: "Roster Match Student", status: "ACTIVE", email: "roster-match@example.com", createdByUserId: teacher.id },
  });
  try {
    const matchExisting = await sessionUserForEmail("existing-staff@example.com");
    check("an existing active User matches by email", matchExisting?.id === existingUser.id);

    const matchInactive = await sessionUserForEmail("inactive@example.com");
    check("a deactivated User does NOT match", matchInactive === null);

    const noMatch = await sessionUserForEmail("nobody@example.com");
    check("an email with no account at all does not match", noMatch === null);

    const provisioned = await provisionStudentFromGoogle("roster-match@example.com");
    check("a Student.email match with no login auto-provisions a CLIENT User", provisioned?.role === "CLIENT");
    const rosterAfter = await prisma.student.findUnique({ where: { id: rosterStudent.id }, select: { linkedUserId: true } });
    check("the roster row is linked to the newly provisioned User", rosterAfter?.linkedUserId === provisioned?.id);

    const provisionedAgain = await provisionStudentFromGoogle("roster-match@example.com");
    check("a second attempt does not re-provision (Student already linked)", provisionedAgain === null);
  } finally {
    const rosterAfter = await prisma.student.findUnique({ where: { id: rosterStudent.id }, select: { linkedUserId: true } });
    await prisma.student.delete({ where: { id: rosterStudent.id } });
    if (rosterAfter?.linkedUserId) await prisma.user.delete({ where: { id: rosterAfter.linkedUserId } });
    await prisma.user.delete({ where: { id: existingUser.id } });
    await prisma.user.delete({ where: { id: inactiveUser.id } });
  }

  await prisma.$disconnect();
  if (failures > 0) {
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  }
  console.log("\n✅ All invite/Google-auth checks passed.");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
