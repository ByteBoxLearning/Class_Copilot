import Link from "next/link";
import { BookOpen, Users, UserCog } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { classScopeWhere } from "@/lib/access";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { AddClassButton } from "@/components/classes/class-form";

export default async function ClassesPage() {
  const user = await requireOwner();

  const classes = await prisma.class.findMany({
    where: await classScopeWhere(user),
    orderBy: [{ archived: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { coTeachers: true, enrollments: { where: { status: "ACTIVE" } } } },
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        subtitle={`${classes.length} class${classes.length === 1 ? "" : "es"}`}
        actions={<AddClassButton />}
      />

      {classes.length === 0 ? (
        <EmptyState
          title="No classes yet"
          message="Add your first class to start building a roster and tracking standards."
          icon={<BookOpen className="h-8 w-8" />}
          action={<AddClassButton />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} href={`/admin/classes/${c.id}`}>
              <Card className={`h-full transition-colors hover:border-primary/40 ${c.archived ? "opacity-60" : ""}`}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{c.name}</p>
                      <p className="truncate text-xs text-slate-400">{c.subject ?? "—"}{c.period ? ` · ${c.period}` : ""}</p>
                    </div>
                    {c.archived && <Badge color="bg-slate-100 text-slate-500 border-slate-200">Archived</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c._count.enrollments} students</span>
                    <span className="flex items-center gap-1"><UserCog className="h-3.5 w-3.5" /> {c._count.coTeachers} co-teacher{c._count.coTeachers === 1 ? "" : "s"}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
