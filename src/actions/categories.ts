"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

export async function addCategory(_prev: { ok: boolean; error?: string }, formData: FormData) {
  const user = await requireRole("OWNER");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name) return { ok: false, error: "Name is required." };

  const existing = await prisma.standardCategory.findUnique({ where: { name } });
  if (existing) return { ok: false, error: "That category already exists." };

  await prisma.standardCategory.create({ data: { name, description } });
  await logActivity({ userId: user.id, actionType: "CATEGORY_CREATED", description: `Added category: ${name}` });
  revalidatePath("/admin/categories");
  return { ok: true };
}

export async function toggleCategory(id: string, active: boolean) {
  await requireRole("OWNER");
  await prisma.standardCategory.update({ where: { id }, data: { active } });
  revalidatePath("/admin/categories");
  return { ok: true };
}

// Permanently delete a category.
export async function deleteCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("OWNER");
  const category = await prisma.standardCategory.findUnique({ where: { id } });
  if (!category) return { ok: false, error: "Category not found." };

  await prisma.standardCategory.delete({ where: { id } });
  await logActivity({ userId: user.id, actionType: "CATEGORY_DELETED", description: `Deleted category: ${category.name}` });
  revalidatePath("/admin/categories");
  return { ok: true };
}
