import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth";
import { feedbackForDailyChecks } from "@/lib/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BADGE_COLORS, labelOf, FEEDBACK_VISIBILITY,
  DAILY_ENGAGEMENT, DAILY_EMPATHY, DAILY_DISCIPLINE, DAILY_COLLABORATION, DAILY_CITIZENSHIP,
} from "@/lib/enums";

const DIMENSIONS = [
  { key: "engagement" as const, label: "Engagement", options: DAILY_ENGAGEMENT },
  { key: "empathy" as const, label: "Empathy", options: DAILY_EMPATHY },
  { key: "discipline" as const, label: "Discipline", options: DAILY_DISCIPLINE },
  { key: "collaboration" as const, label: "Collaboration", options: DAILY_COLLABORATION },
  { key: "citizenship" as const, label: "Citizenship", options: DAILY_CITIZENSHIP },
];

const RECENT_DAYS = 30;

// Own daily check-in history only, grouped by class — a reflective view of
// what's been logged, not a comparison against classmates.
export default async function PortalEngagementPage() {
  const user = await requireClient();
  const studentId = user.studentId;

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    include: { class: { select: { id: true, name: true } } },
    orderBy: { class: { name: "asc" } },
  });

  const since = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString().slice(0, 10);
  const checks = await prisma.dailyCheck.findMany({
    where: { studentId, classId: { in: enrollments.map((e) => e.class.id) }, date: { gte: since } },
    orderBy: { date: "desc" },
  });
  const feedbackByCheck = await feedbackForDailyChecks(checks.map((c) => c.id), false);

  const checksByClass = new Map<string, typeof checks>();
  for (const c of checks) {
    const arr = checksByClass.get(c.classId) ?? [];
    arr.push(c);
    checksByClass.set(c.classId, arr);
  }

  const hasAnyChecks = checks.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Engagement" subtitle={`Your daily check-ins over the last ${RECENT_DAYS} days, across all your classes.`} />

      {!hasAnyChecks ? (
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">Nothing has been logged for you recently.</CardContent></Card>
      ) : (
        enrollments.filter((e) => (checksByClass.get(e.class.id)?.length ?? 0) > 0).map((e) => (
          <Card key={e.class.id}>
            <CardContent className="pt-5">
              <p className="mb-3 text-sm font-semibold text-slate-800">{e.class.name}</p>
              <ul className="space-y-3">
                {(checksByClass.get(e.class.id) ?? []).map((c) => {
                  const flagged = DIMENSIONS.filter((d) => c[d.key]);
                  const items = feedbackByCheck.get(c.id) ?? [];
                  if (flagged.length === 0 && items.length === 0) return null;
                  return (
                    <li key={c.id} className="rounded-md border border-border p-3">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-500">{c.date}</span>
                        {flagged.map((d) => {
                          const value = c[d.key] as string;
                          return <Badge key={d.key} color={BADGE_COLORS[value]}>{labelOf(d.options, value)}</Badge>;
                        })}
                      </div>
                      {items.length > 0 && (
                        <ul className="space-y-2 border-t border-border pt-2">
                          {items.map((f) => (
                            <li key={f.id} className="rounded bg-slate-50 p-2">
                              <div className="mb-0.5 flex items-center justify-between">
                                <span className="text-[11px] font-medium text-slate-500">{f.authorName}</span>
                                <Badge color={BADGE_COLORS[f.visibility]}>{labelOf(FEEDBACK_VISIBILITY, f.visibility)}</Badge>
                              </div>
                              <p className="text-xs text-slate-600">{f.message}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
