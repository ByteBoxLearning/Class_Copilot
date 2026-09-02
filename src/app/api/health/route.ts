import { NextResponse } from "next/server";

// Plain liveness check for an external uptime pinger to hit every ~10 min so
// the Render free-tier web service never spins down (spin-down + wake-up
// latency was breaking the Google Sign-In round trip — see TODO.md). No auth,
// no DB call — this only needs to prove the Node process is awake, not that
// the database is reachable.
export async function GET() {
  return NextResponse.json({ ok: true });
}
