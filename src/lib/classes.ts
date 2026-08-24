import "server-only";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";
import { accessibleClassIds } from "./access";

export const CURRENT_CLASS_KEY = "currentClassId";

export type ClassOption = {
  id: string;
  name: string;
  subject: string | null;
  archived: boolean;
};

// The classes a staff user may switch between (teacher -> all; co-teacher ->
// assigned or all). Active first, then by name. Students don't switch.
export async function listAccessibleClasses(user: SessionUser): Promise<ClassOption[]> {
  const ids = await accessibleClassIds(user);
  const where = ids === "ALL" ? {} : { id: { in: ids } };
  const classes = await prisma.class.findMany({
    where,
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: { id: true, name: true, subject: true, archived: true },
  });
  return classes;
}

// Resolve the "current class" a staff user is working on:
//   1. an explicit ?class= / preference id they may access, else
//   2. their last-selected class (UserPreference), else
//   3. the first accessible class.
// Returns null when the user has no accessible classes yet.
export async function resolveCurrentClassId(
  user: SessionUser,
  explicitId?: string | null,
): Promise<string | null> {
  const ids = await accessibleClassIds(user);
  const canSee = (id: string) => ids === "ALL" || ids.includes(id);

  if (explicitId && canSee(explicitId)) return explicitId;

  const pref = await prisma.userPreference.findUnique({
    where: { userId_key: { userId: user.id, key: CURRENT_CLASS_KEY } },
    select: { value: true },
  });
  if (pref?.value && canSee(pref.value)) {
    // Confirm it still exists (could have been deleted).
    const exists = await prisma.class.findUnique({ where: { id: pref.value }, select: { id: true } });
    if (exists) return pref.value;
  }

  const first = await prisma.class.findFirst({
    where: ids === "ALL" ? {} : { id: { in: ids } },
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  return first?.id ?? null;
}

// Persist the current class for a staff user (used by the header switcher).
export async function setCurrentClassId(userId: string, classId: string): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: CURRENT_CLASS_KEY } },
    update: { value: classId },
    create: { userId, key: CURRENT_CLASS_KEY, value: classId },
  });
}
