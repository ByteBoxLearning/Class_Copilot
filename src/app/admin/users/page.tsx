import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { UserManager } from "@/components/users/user-manager";

export default async function UsersPage() {
  const admin = await requireRole("OWNER");
  const users = await prisma.user.findMany({
    where: { OR: [{ id: admin.id }, { ownerId: admin.id }] },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Add employees, reset passwords, and manage access."
      />
      <UserManager users={rows} currentUserId={admin.id} />
    </div>
  );
}
