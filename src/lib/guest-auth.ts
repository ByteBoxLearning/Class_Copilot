import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import { hashPassword, verifyPassword } from "./auth";

// Fully separate session system from src/lib/auth.ts's teacher/student
// sessions — a different cookie name, a different table (GuestUser, never
// User/Student), and no role/ownerId/studentId concepts at all. Deliberately
// duplicated rather than shoehorned into SessionUser: a guest isn't a role
// within a workspace, it's a different kind of account entirely.
const COOKIE_NAME = "guest_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days — a guest has no teacher to re-invite them, so a short TTL would just be friction

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set. Copy .env.example to .env.");
  return new TextEncoder().encode(secret);
}

export type GuestSessionUser = {
  id: string;
  name: string;
  email: string;
  sv: number;
};

export async function createGuestSession(user: GuestSessionUser): Promise<void> {
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

export async function destroyGuestSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getGuestSessionUser(): Promise<GuestSessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const id = payload.id as string;
    const tokenSv = typeof payload.sv === "number" ? payload.sv : 0;

    const dbUser = await prisma.guestUser.findUnique({ where: { id }, select: { active: true, sessionVersion: true } });
    if (!dbUser || !dbUser.active || dbUser.sessionVersion !== tokenSv) return null;

    return {
      id,
      name: payload.name as string,
      email: payload.email as string,
      sv: tokenSv,
    };
  } catch {
    return null;
  }
}

export async function requireGuest(): Promise<GuestSessionUser> {
  const user = await getGuestSessionUser();
  if (!user) redirect("/guest/login");
  return user;
}

export async function authenticateGuest(email: string, password: string): Promise<{ user: GuestSessionUser } | { error: string } | null> {
  const guest = await prisma.guestUser.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!guest) return null;
  if (!guest.active) return { error: "This account has been deactivated." };
  const ok = await verifyPassword(password, guest.passwordHash);
  if (!ok) return null;
  return { user: { id: guest.id, name: guest.name, email: guest.email, sv: guest.sessionVersion } };
}

export { hashPassword };
