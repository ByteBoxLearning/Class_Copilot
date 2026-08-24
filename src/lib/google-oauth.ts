import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getApiKey } from "./settings";

// Google OAuth 2.0 "Authorization Code" flow, implemented directly against
// Google's endpoints (no next-auth/passport dependency — this app already
// has its own JWT session cookie in auth.ts; adding a second auth framework
// on top would just mean two competing session systems). See TODO.md for the
// Google Cloud Console setup steps this depends on.
//
// GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET go through settings.ts::getApiKey —
// the same DB-first/env-fallback lookup as every other provider key, so a
// teacher can set them from /admin/settings with no redeploy, exactly as
// already documented there. These are also the same two key names reserved
// for the still-unbuilt Google Sheets roster import (Milestone C.3) — one
// Google Cloud OAuth client can request both scopes, so there's no need for
// two separate credential pairs.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function googleJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(JWKS_URI));
  return jwks;
}

async function requireManagedKey(name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"): Promise<string> {
  const value = await getApiKey(name);
  if (!value) throw new Error(`${name} is not set (via /admin/settings or the env var of the same name). See TODO.md for Google Sign-In setup steps.`);
  return value;
}

function redirectUri(): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

export async function googleSignInConfigured(): Promise<boolean> {
  const [id, secret] = await Promise.all([getApiKey("GOOGLE_CLIENT_ID"), getApiKey("GOOGLE_CLIENT_SECRET")]);
  return Boolean(id && secret);
}

export async function buildGoogleAuthUrl(state: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: await requireManagedKey("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type GoogleProfile = { email: string; emailVerified: boolean; name: string };

// Exchanges the authorization `code` for tokens, then verifies the ID
// token's signature against Google's published keys (not just decoding it)
// and checks it was actually issued for THIS app before trusting its claims.
export async function exchangeCodeForGoogleProfile(code: string): Promise<GoogleProfile> {
  const clientId = await requireManagedKey("GOOGLE_CLIENT_ID");
  const clientSecret = await requireManagedKey("GOOGLE_CLIENT_SECRET");

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const tokenJson = (await tokenRes.json()) as { id_token?: string };
  if (!tokenJson.id_token) throw new Error("Google token response had no id_token.");

  const { payload } = await jwtVerify(tokenJson.id_token, googleJwks(), {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });

  const email = payload.email as string | undefined;
  if (!email) throw new Error("Google ID token had no email claim.");
  return {
    email,
    emailVerified: payload.email_verified === true,
    name: (payload.name as string | undefined) ?? email,
  };
}
