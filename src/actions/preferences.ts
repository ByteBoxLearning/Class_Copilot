"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

// Per-user UI preferences (key/value JSON). Currently used by the jobs table to
// remember which columns each user has hidden, so the choice survives refresh
// and follows them across devices. Available to admin + assistants alike.

// Read a single preference for the current user. Returns null if unset.
export async function getPreference(key: string): Promise<string | null> {
  const user = await requireUser();
  const row = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: user.id, key } },
  });
  return row?.value ?? null;
}

// Save (upsert) a preference value for the current user.
export async function setPreference(key: string, value: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.userPreference.upsert({
    where: { userId_key: { userId: user.id, key } },
    update: { value },
    create: { userId: user.id, key, value },
  });
  return { ok: true };
}
