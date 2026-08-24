import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth";
import { currentMasteryForAllStandards } from "@/lib/mastery";
import { pickAreasToImprove } from "@/lib/mastery-math";
import { masteryDistribution } from "@/lib/reports-math";
import { feedbackForMasteryEvents, type FeedbackRow } from "@/lib/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MasteryDistributionChart } from "@/components/reports/mastery-distribution-chart";
import { MasteryDial } from "@/components/mastery/mastery-dial";
import { BADGE_COLORS, labelOf, MASTERY_LEVELS, FEEDBACK_VISIBILITY } from "@/lib/enums";

type StandardRow = { id: string; code: string | null; title: string; description: string | null };

// One standard's row on the page, plus enough of its mastery result to sort
// and bucket it into "areas to improve" vs "areas mastered" below.
type StandardWithMastery = StandardRow & { level: number | null; rawAverage: number | null; feedback: FeedbackRow[] };

function StandardCard({ s }: { s: StandardWithMastery }) {
  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-700">{s.code ? `[${s.code}] ` : ""}{s.title}</p>
          {s.description && <p className="text-xs text-slate-400">{s.description}</p>}
        </div>
        {s.level ? (
          <Badge color={BADGE_COLORS[String(s.level)]}>{labelOf(MASTERY_LEVELS, String(s.level))}</Badge>
        ) : (
          <span className="text-xs text-slate-300">No evidence yet</span>
        )}
      </div>
      {s.feedback.length > 0 && (
        <ul className="mt-2 space-y-2 border-t border-border pt-2">
          {s.feedback.map((f) => (
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
}

// Own standards-mastery only, grouped by class — no peer comparison or
// class-wide distribution (that's the teacher-side Reports page's job,
// src/app/classes/reports/page.tsx — this reuses its exact chart component,
// just fed this one student's own per-standard levels instead of a whole
// class's roster).
export default async function PortalMasteryPage() {
  const user = await requireClient();
  const studentId = user.studentId;

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    include: {
      class: {
        select: {
          id: true, name: true,
          standards: { where: { active: true }, orderBy: [{ order: "asc" }, { title: "asc" }], select: { id: true, code: true, title: true, description: true } },
        },
      },
    },
    orderBy: { class: { name: "asc" } },
  });

  const [currentMap, events] = await Promise.all([
    currentMasteryForAllStandards(studentId),
    prisma.masteryEvent.findMany({ where: { studentId }, select: { id: true, standardId: true } }),
  ]);
  const feedbackByEvent = await feedbackForMasteryEvents(events.map((e) => e.id), false);
  const feedbackByStandard = new Map<string, FeedbackRow[]>();
  for (const e of events) {
    const items = feedbackByEvent.get(e.id);
    if (!items?.length) continue;
    const arr = feedbackByStandard.get(e.standardId) ?? [];
    arr.push(...items);
    feedbackByStandard.set(e.standardId, arr);
  }

  const hasAnyStandards = enrollments.some((e) => e.class.standards.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Mastery" subtitle="Your current level on each standard, across all your classes." />

      {!hasAnyStandards ? (
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">No standards have been set up for your classes yet.</CardContent></Card>
      ) : (
        enrollments.filter((e) => e.class.standards.length > 0).map((e) => {
          const standards: StandardWithMastery[] = e.class.standards.map((s) => {
            const current = currentMap.get(s.id);
            return { ...s, level: current?.level ?? null, rawAverage: current?.rawAverage ?? null, feedback: feedbackByStandard.get(s.id) ?? [] };
          });

          const dist = masteryDistribution(standards.map((s) => s.level), standards.length);
          const masteredCount = dist.level3 + dist.level4;
          const masteredPercent = standards.length > 0 ? (masteredCount / standards.length) * 100 : 0;

          const notAssessed = standards.filter((s) => s.level === null);
          const { improve, mastered } = pickAreasToImprove(standards);

          return (
            <Card key={e.class.id}>
              <CardContent className="space-y-5 pt-5">
                <p className="text-sm font-semibold text-slate-800">{e.class.name}</p>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <MasteryDial percent={masteredPercent} label={`${masteredCount} of ${standards.length} standards mastered`} />
                  <div className="flex-1">
                    <MasteryDistributionChart distribution={dist} />
                  </div>
                </div>

                {improve.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Areas to improve</p>
                    <ul className="space-y-3">{improve.map((s) => <StandardCard key={s.id} s={s} />)}</ul>
                  </div>
                )}

                {mastered.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Areas mastered</p>
                    <ul className="space-y-3">{mastered.map((s) => <StandardCard key={s.id} s={s} />)}</ul>
                  </div>
                )}

                {notAssessed.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Not yet assessed</p>
                    <ul className="space-y-3">{notAssessed.map((s) => <StandardCard key={s.id} s={s} />)}</ul>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
