import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth";
import { computeGrade } from "@/lib/grading";
import { currentMasteryForAllStandards } from "@/lib/mastery";
import { pickAreasToImprove } from "@/lib/mastery-math";
import { feedbackForStudent } from "@/lib/feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeReveal } from "@/components/portal/grade-reveal";
import { FEEDBACK_VISIBILITY, BADGE_COLORS, MASTERY_LEVELS, labelOf } from "@/lib/enums";

// The student portal overview: every active class at a glance. Leads with
// "How can I improve?" (the same struggling/fallback standards logic as
// /portal/mastery) rather than the computed grade, which is tucked behind an
// explicit reveal — a deliberate choice so a student's first read of this
// page is "what to work on," not a number to fixate on. Own progress only —
// no peer comparison or ranking (see CONTEXT.md).
export default async function PortalDashboard() {
  const user = await requireClient();

  const [student, enrollments, currentMap] = await Promise.all([
    prisma.student.findUnique({ where: { id: user.studentId }, select: { displayName: true } }),
    prisma.enrollment.findMany({
      where: { studentId: user.studentId, status: "ACTIVE" },
      include: {
        class: {
          select: {
            id: true, name: true, subject: true,
            standards: { where: { active: true }, select: { id: true, code: true, title: true } },
          },
        },
      },
      orderBy: { class: { name: "asc" } },
    }),
    currentMasteryForAllStandards(user.studentId),
  ]);

  const classes = await Promise.all(
    enrollments.map(async (e) => {
      const grade = await computeGrade(user.studentId, e.class.id);
      const standards = e.class.standards.map((s) => {
        const current = currentMap.get(s.id);
        return { ...s, level: current?.level ?? null, rawAverage: current?.rawAverage ?? null };
      });
      const { improve } = pickAreasToImprove(standards);
      return { classId: e.class.id, className: e.class.name, subject: e.class.subject, grade, improve: improve.slice(0, 3) };
    }),
  );

  const recentFeedback = await feedbackForStudent(user.studentId, false, 5);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome${student ? `, ${student.displayName.split(" ")[0]}` : ""}`}
        subtitle="Your classes, and what to focus on next."
      />

      {classes.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-slate-500">You&apos;re not enrolled in any classes yet.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.classId}>
              <CardContent className="pt-5">
                <p className="text-sm font-semibold text-slate-800">{c.className}</p>
                {c.subject && <p className="text-xs text-slate-400">{c.subject}</p>}

                <div className="mt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">How can I improve?</p>
                  {c.improve.length > 0 ? (
                    <ul className="mt-1.5 space-y-1.5">
                      {c.improve.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate text-slate-700">{s.code ? `[${s.code}] ` : ""}{s.title}</span>
                          {s.level ? (
                            <Badge color={BADGE_COLORS[String(s.level)]}>{labelOf(MASTERY_LEVELS, String(s.level))}</Badge>
                          ) : (
                            <span className="shrink-0 text-xs text-slate-300">No evidence yet</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm text-slate-400">No standards tracked yet for this class.</p>
                  )}
                </div>

                <GradeReveal grade={c.grade} />

                <div className="mt-3 flex gap-3 border-t border-border pt-3 text-xs">
                  <Link href={`/portal/mastery?class=${c.classId}`} className="text-primary hover:underline">Full mastery breakdown</Link>
                  <Link href={`/portal/engagement?class=${c.classId}`} className="text-primary hover:underline">Engagement</Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Recent feedback</CardTitle></CardHeader>
        <CardContent>
          {recentFeedback.length === 0 ? (
            <p className="text-sm text-slate-400">No feedback has been shared with you yet.</p>
          ) : (
            <ul className="space-y-3">
              {recentFeedback.map((f) => (
                <li key={f.id} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">{f.authorName}</span>
                    <Badge color={BADGE_COLORS[f.visibility]}>{labelOf(FEEDBACK_VISIBILITY, f.visibility)}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{f.message}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{f.createdAt.toLocaleDateString()}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
