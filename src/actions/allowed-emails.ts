"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import type { ActionResult } from "./types";

export type AllowedEmailRow = {
  id: string;
  email: string;
  role: "STAFF" | "STUDENT";
  claimed: boolean;
  createdAt: string;
};

export async function listAllowedEmails(): Promise<AllowedEmailRow[]> {
  await requireOwner();
  const rows = await prisma.allowedEmail.findMany({ orderBy: [{ role: "asc" }, { email: "asc" }] });
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as "STAFF" | "STUDENT",
    claimed: !!r.claimedByUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accepts a blob of emails separated by newlines/commas/whitespace — pasted
// straight from a spreadsheet column or a SIS export. Silently skips
// malformed lines and rows already on the list (idempotent, safe to re-paste
// an updated roster export).
export async function bulkAddAllowedEmails(role: "STAFF" | "STUDENT", raw: string): Promise<ActionResult & { added?: number; skipped?: number }> {
  const admin = await requireOwner();
  const candidates = raw
    .split(/[\n,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const emails = [...new Set(candidates.filter((e) => EMAIL_RE.test(e)))];
  if (emails.length === 0) return { ok: false, error: "No valid email addresses found." };

  // SQLite (this app's local/dev provider) doesn't support createMany's
  // skipDuplicates — pre-filter against what's already on the list instead,
  // which works identically once this moves to Postgres too.
  const existing = await prisma.allowedEmail.findMany({ where: { email: { in: emails } }, select: { email: true } });
  const existingSet = new Set(existing.map((e) => e.email));
  const toAdd = emails.filter((e) => !existingSet.has(e));

  if (toAdd.length > 0) {
    await prisma.allowedEmail.createMany({
      data: toAdd.map((email) => ({ email, role, addedById: admin.id })),
    });
  }
  await logActivity({
    userId: admin.id,
    actionType: "ALLOWED_EMAIL_ADDED",
    description: `Added ${toAdd.length} ${role.toLowerCase()} email(s) to the approved roster`,
  });
  revalidatePath("/admin/settings");
  return { ok: true, added: toAdd.length, skipped: emails.length - toAdd.length };
}

export async function removeAllowedEmail(id: string): Promise<ActionResult> {
  const admin = await requireOwner();
  const row = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Not found." };
  await prisma.allowedEmail.delete({ where: { id } });
  await logActivity({
    userId: admin.id,
    actionType: "ALLOWED_EMAIL_REMOVED",
    description: `Removed ${row.email} from the approved roster`,
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}
