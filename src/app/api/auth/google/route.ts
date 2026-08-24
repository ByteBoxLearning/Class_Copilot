import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { buildGoogleAuthUrl, googleSignInConfigured } from "@/lib/google-oauth";

const STATE_COOKIE = "google_oauth_state";

// GET /api/auth/google — the "Continue with Google" link on /login points
// here. Sets a short-lived CSRF state cookie, then redirects to Google's
// consent screen. See the callback route for the other half of the flow.
export async function GET() {
  if (!(await googleSignInConfigured())) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", process.env.NEXTAUTH_URL || "http://localhost:3000"));
  }

  const state = randomBytes(16).toString("hex");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(await buildGoogleAuthUrl(state));
}
