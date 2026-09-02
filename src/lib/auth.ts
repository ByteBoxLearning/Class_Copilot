import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { dashboardPathFor } from "./auth-paths";
import { generateOpaqueSecret } from "./password";
import { isGoogleStudentProvisioningAllowed } from "./allowed-email";

const COOKIE_NAME = "crm_session";
// Short TTL so role/deactivation changes take effect quickly. Combined with a
// per-user sessionVersion check (below), this gives practical revocation without
// a server-side session store.
const MAX_AGE = 60 * 60 * 8; // 8 hours

// AUTH_SECRET is REQUIRED — no dev fallback. A missing secret is a hard error so
// sessions are never signed with a predictable key.
function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set. Copy .env.example to .env.");
  return new TextEncoder().encode(secret);
}

export type Role = "OWNER" | "ASSISTANT" | "CLIENT";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword?: boolean;
  // For CLIENT (Student) accounts, the Student record they can see. For
  // ASSISTANT (Co-Teacher), whether they have all-class access. Carried in
  // the JWT so access checks are cheap.
  studentId?: string | null;
  allClientsAccess?: boolean;
  // Workspace this account belongs to (see prisma/schema.prisma::User.ownerId
  // and src/lib/access.ts). Null/undefined for OWNER — they're their own
  // workspace root, keyed by `id` instead.
  ownerId?: string | null;
  // Session-invalidation counter — must match the DB user's current value.
  sv?: number;
};

// Normalise a stored role string, treating the legacy "ADMIN" as "OWNER".
export function normalizeRole(role: string): Role {
  if (role === "ADMIN" || role === "OWNER") return "OWNER";
  if (role === "CLIENT") return "CLIENT";
  return "ASSISTANT";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

// Returns the current session user or null. Does not redirect.
// Beyond verifying the JWT signature, this re-checks the DB user is still active
// and that the token's sessionVersion matches — so a deactivated user or one
// whose access changed is logged out on their next request (revocation).
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = payload.id as string;
    const tokenSv = typeof payload.sv === "number" ? payload.sv : 0;

    // Revocation check: the account must still exist, be active, and carry the
    // same sessionVersion the token was issued with.
    const dbUser = await prisma.user.findUnique({
      where: { id },
      select: { active: true, sessionVersion: true, role: true, allClientsAccess: true, ownerId: true },
    });
    if (!dbUser || !dbUser.active || dbUser.sessionVersion !== tokenSv) return null;

    return {
      id,
      name: payload.name as string,
      email: payload.email as string,
      role: normalizeRole(dbUser.role),
      mustChangePassword: Boolean(payload.mustChangePassword),
      studentId: (payload.studentId as string | null | undefined) ?? null,
      allClientsAccess: Boolean(dbUser.allClientsAccess),
      ownerId: dbUser.ownerId,
      sv: tokenSv,
    };
  } catch {
    return null;
  }
}

// Require any authenticated user (redirects to /login if missing).
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// Require a specific role; anyone else is bounced to their own dashboard.
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== role) redirect(dashboardPathFor(user.role));
  return user;
}

// Convenience: require the agency owner (super-admin).
export async function requireOwner(): Promise<SessionUser> {
  return requireRole("OWNER");
}

// Require a CLIENT (Student) portal user and return their linked studentId
// (never null).
export async function requireClient(): Promise<SessionUser & { studentId: string }> {
  const user = await requireUser();
  if (user.role !== "CLIENT") redirect(dashboardPathFor(user.role));
  if (!user.studentId) redirect("/login"); // student account with no student record
  return user as SessionUser & { studentId: string };
}

// Require staff (owner or assistant) — used by shared workspace routes that a
// CLIENT portal user must never reach.
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "CLIENT") redirect(dashboardPathFor(user.role));
  return user;
}

// Authenticate an email/password pair. Returns the session user, or a reason
// string for a friendly error, or null for bad credentials.
export async function authenticate(
  email: string,
  password: string,
): Promise<{ user: SessionUser } | { error: string } | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { studentAccount: { select: { id: true } } },
  });
  if (!user) return null;
  if (!user.active) return { error: "This account has been deactivated. Contact your administrator." };
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { user: toSessionUser(user) };
}

type UserWithStudentAccount = {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  allClientsAccess: boolean;
  sessionVersion: number;
  ownerId: string | null;
  studentAccount: { id: string } | null;
};

function toSessionUser(user: UserWithStudentAccount): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    mustChangePassword: user.mustChangePassword,
    studentId: user.studentAccount?.id ?? null,
    allClientsAccess: user.allClientsAccess,
    ownerId: user.ownerId,
    sv: user.sessionVersion,
  };
}

// Look up an ALREADY-EXISTING active account by email with no password check
// — used by Google Sign-In, which proves the email via an OAuth id token
// instead of a password. Never creates an account.
export async function sessionUserForEmail(email: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { studentAccount: { select: { id: true } } },
  });
  if (!user || !user.active) return null;
  return toSessionUser(user);
}

// Google Sign-In, CLIENT (student) side: if there's no existing User account
// for this email but the roster already has a Student row with a matching
// `email` and no portal login yet, that Student.email itself is the
// teacher's authorization — provision the login on the spot instead of
// requiring a separate invite-link step.
//
// Student.email is globally unique (see prisma/schema.prisma), so at most
// one Student row can ever match — the real safeguard against a rogue
// account pre-claiming a real student's email is that Student.email itself
// is now gated at write time against the preloaded roster (see
// src/lib/allowed-email.ts, checked in src/actions/students.ts and the
// roster-import path). isGoogleStudentProvisioningAllowed below is a
// defense-in-depth re-check at the moment the login is actually minted, plus
// a domain check independent of the roster.
export async function provisionStudentFromGoogle(email: string): Promise<SessionUser | null> {
  const normalized = email.toLowerCase().trim();
  if (!(await isGoogleStudentProvisioningAllowed(normalized))) return null;

  const student = await prisma.student.findFirst({
    where: { email: normalized, linkedUserId: null },
    select: { id: true, displayName: true, createdByUserId: true },
  });
  if (!student) return null;

  const created = await prisma.user.create({
    data: {
      name: student.displayName,
      email: normalized,
      passwordHash: await hashPassword(generateOpaqueSecret()),
      role: "CLIENT",
    },
  });
  await prisma.student.update({ where: { id: student.id }, data: { linkedUserId: created.id } });

  // Visible, auditable trail for the teacher whose workspace this student
  // lives in — a first-time Google link is exactly the kind of event that
  // should never be silent, given it mints portal access.
  await prisma.notification.create({
    data: {
      userId: student.createdByUserId,
      studentId: student.id,
      title: "Student linked their Google account",
      message: `${student.displayName} signed in with Google (${normalized}) and now has portal access. If this wasn't expected, revoke it from their student page.`,
    },
  }).catch(() => { /* notification failure shouldn't block the login itself */ });

  return toSessionUser({ ...created, studentAccount: { id: student.id } });
}

// Redirect the user to set a new password before using the app, if required.
export function enforcePasswordReset(user: SessionUser) {
  if (user.mustChangePassword) redirect("/change-password");
}

export { dashboardPathFor };
