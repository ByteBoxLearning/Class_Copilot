import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryManager } from "@/components/categories/category-manager";

export default async function CategoriesPage() {
  const categories = await prisma.standardCategory.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-4">
      <PageHeader title="Standard categories" subtitle="Manage the strand/category groupings available when defining standards." />
      <CategoryManager categories={categories.map((c) => ({ id: c.id, name: c.name, description: c.description, active: c.active }))} />
    </div>
  );
}
