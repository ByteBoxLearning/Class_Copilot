import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { resolveCurrentClassId } from "@/lib/classes";
import { assertCanAccessClass } from "@/lib/access";
import {
  masteryDistributionForClass, engagementTrendForClass,
  standardsNeedingReinforcement, studentsNeedingReinforcement,
} from "@/lib/reports";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MasteryDistributionChart } from "@/components/reports/mastery-distribution-chart";
import { EngagementTrendChart } from "@/components/reports/engagement-trend-chart";
import { BADGE_COLORS, MASTERY_LEVELS, labelOf } from "@/lib/enums";

const TREND_DAYS = 14;
const WEAK_STANDARDS_SHOWN = 4;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const classId = await resolveCurrentClassId(user, sp.class ?? null);

  if (!classId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reports" subtitle="Class-wide mastery distribution and engagement trend." />
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No classes yet — once you have a class with students and standards, reports show up here.
        </CardContent></Card>
      </div>
    );
  }

  await assertCanAccessClass(user, classId);

  const [cls, distribution, trend, standardsNeeding, studentsNeeding] = await Promise.all([
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { name: true } }),
    masteryDistributionForClass(classId),
    engagementTrendForClass(classId, TREND_DAYS),
    standardsNeedingReinforcement(classId),
    studentsNeedingReinforcement(classId),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        subtitle={`${cls.name} — class-wide mastery and engagement, at a glance. Use the class switcher above to check a different class.`}
      />

      <Card>
        <CardHeader><CardTitle>Mastery distribution</CardTitle></CardHeader>
        <CardContent>
          <MasteryDistributionChart distribution={distribution} />
          <p className="mt-2 text-xs text-slate-400">Every enrolled student × active standard pair, bucketed by current level.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Standards needing reinforcement</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {standardsNeeding.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No standards defined for this class yet.</p>
          ) : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {standardsNeeding.map((s) => (
                <div key={s.standardId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">{s.code ? `[${s.code}] ` : ""}{s.title}</p>
                    <p className="text-xs text-slate-400">
                      {s.strugglingCount} of {s.totalStudents} student{s.totalStudents === 1 ? "" : "s"} at Beginning/Developing
                      {s.noEvidenceCount > 0 && ` · ${s.noEvidenceCount} with no evidence yet`}
                    </p>
                  </div>
                  {s.avgLevel !== null ? (
                    <Badge color={BADGE_COLORS[String(Math.round(s.avgLevel))]}>avg {s.avgLevel.toFixed(1)} · {s.masteredCount} mastered</Badge>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-300">No evidence yet</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400">Sorted by how many students are below Proficient on each standard, worst first.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Students needing reinforcement</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {studentsNeeding.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No enrolled student is currently below Proficient on any standard.</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {studentsNeeding.map((st) => (
                <div key={st.studentId} className="rounded-md border border-border p-2.5">
                  <p className="mb-1.5 text-sm font-medium text-slate-700">{st.displayName}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {st.weakStandards.slice(0, WEAK_STANDARDS_SHOWN).map((ws) => (
                      <Badge key={ws.standardId} color={BADGE_COLORS[String(ws.level)]}>
                        {ws.code ? `[${ws.code}] ` : ""}{ws.title} · {labelOf(MASTERY_LEVELS, String(ws.level))}
                      </Badge>
                    ))}
                    {st.weakStandards.length > WEAK_STANDARDS_SHOWN && (
                      <span className="text-xs text-slate-400">+{st.weakStandards.length - WEAK_STANDARDS_SHOWN} more</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400">Sorted by how many standards each student is behind on, worst first.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Engagement trend</CardTitle></CardHeader>
        <CardContent>
          <EngagementTrendChart points={trend} />
          <p className="mt-2 text-xs text-slate-400">% of logged Monitor check-ins marked Engaged, last {TREND_DAYS} days. Days with no checks logged are gaps, not zeros.</p>
        </CardContent>
      </Card>
    </div>
  );
}
