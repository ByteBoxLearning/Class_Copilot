import "server-only";
import { prisma } from "./prisma";

// School-domain + preloaded-roster gating for account creation. Two
// independent knobs, both optional so local dev / a school that hasn't
// configured either keeps working exactly as before:
//
// 1. ALLOWED_EMAIL_DOMAIN (env, e.g. "peddie.org") — when set, any email
//    used to sign up, or auto-provisioned via Google, must end in @domain.
// 2. The AllowedEmail roster table (see prisma/schema.prisma) — when at
//    least one row of a given role (STAFF/STUDENT) exists, an email being
//    used for that role must ALSO match a preloaded row. This is
//    bootstrap-friendly: with zero rows preloaded, only the domain check
//    (if any) applies, so the very first admin can still sign up before
//    they've had a chance to preload the roster from /admin/settings.
export function allowedEmailDomain(): string | null {
  const raw = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  return raw ? raw.replace(/^@/, "") : null;
}

export function isAllowedDomain(email: string): boolean {
  const domain = allowedEmailDomain();
  if (!domain) return true; // no restriction configured
  return email.toLowerCase().trim().endsWith(`@${domain}`);
}

async function rosterHasAnyRow(role: "STAFF" | "STUDENT"): Promise<boolean> {
  const count = await prisma.allowedEmail.count({ where: { role } });
  return count > 0;
}

async function isOnRoster(email: string, role: "STAFF" | "STUDENT"): Promise<boolean> {
  const row = await prisma.allowedEmail.findUnique({ where: { email: email.toLowerCase().trim() } });
  return !!row && row.role === role;
}

// Returns a user-facing error string if this email may NOT sign up as a new
// teacher (OWNER) workspace, or null if it's allowed.
export async function checkStaffSignupAllowed(email: string): Promise<string | null> {
  if (!isAllowedDomain(email)) {
    return `Sign-up is restricted to ${allowedEmailDomain()} email addresses.`;
  }
  if (await rosterHasAnyRow("STAFF")) {
    if (!(await isOnRoster(email, "STAFF"))) {
      return "This email isn't on the approved staff list. Contact your IT administrator to be added.";
    }
  }
  return null;
}

// Returns a user-facing error string if this email may NOT be attached to a
// Student record (manual create/edit, or roster import), or null if allowed.
export async function checkStudentEmailAllowed(email: string): Promise<string | null> {
  if (!isAllowedDomain(email)) {
    return `Student emails must be a ${allowedEmailDomain()} address.`;
  }
  if (await rosterHasAnyRow("STUDENT")) {
    if (!(await isOnRoster(email, "STUDENT"))) {
      return "This email isn't on the preloaded student roster. Contact your IT administrator to be added.";
    }
  }
  return null;
}

// Google Sign-In, student-provisioning side only (src/lib/auth.ts). Staff
// Google logins are never gated here since sessionUserForEmail only ever
// looks up an ALREADY-EXISTING account — nothing is minted there, so there's
// no new-account risk to gate. Student.email is already roster-gated at the
// point it's attached to a Student row (checkStudentEmailAllowed, above);
// this is a defense-in-depth re-check at the moment an identity is minted.
export async function isGoogleStudentProvisioningAllowed(email: string): Promise<boolean> {
  if (!isAllowedDomain(email)) return false;
  if (await rosterHasAnyRow("STUDENT")) return isOnRoster(email, "STUDENT");
  return true;
}

export async function markAllowedEmailClaimed(email: string, userId: string): Promise<void> {
  await prisma.allowedEmail.updateMany({
    where: { email: email.toLowerCase().trim() },
    data: { claimedByUserId: userId },
  });
}
