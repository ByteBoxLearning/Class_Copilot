import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForGoogleProfile } from "@/lib/google-oauth";
import { createSession, sessionUserForEmail, provisionStudentFromGoogle, dashboardPathFor } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

const STATE_COOKIE = "google_oauth_state";

function siteUrl(path: string): URL {
  return new URL(path, process.env.NEXTAUTH_URL || "http://localhost:3000");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const deniedOrError = url.searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (deniedOrError) return NextResponse.redirect(siteUrl("/login?error=google_denied"));
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(siteUrl("/login?error=google_failed"));
  }

  let profile;
  try {
    profile = await exchangeCodeForGoogleProfile(code);
  } catch {
    return NextResponse.redirect(siteUrl("/login?error=google_failed"));
  }
  if (!profile.emailVerified) return NextResponse.redirect(siteUrl("/login?error=google_unverified_email"));

  // Match an already-existing account first (any role — staff accounts are
  // created by the owner, student accounts by an invite link or roster
  // import). Only for a CLIENT (student) email with no account yet do we
  // auto-provision, since a roster Student.email is itself the teacher's
  // authorization for that address.
  let sessionUser = await sessionUserForEmail(profile.email);
  if (!sessionUser) sessionUser = await provisionStudentFromGoogle(profile.email);
  if (!sessionUser) return NextResponse.redirect(siteUrl("/login?error=google_no_account"));

  await createSession(sessionUser);
  await logActivity({ userId: sessionUser.id, actionType: "USER_LOGIN", description: "User logged in with Google" });

  const dest = sessionUser.mustChangePassword ? "/change-password" : dashboardPathFor(sessionUser.role);
  return NextResponse.redirect(siteUrl(dest));
}
