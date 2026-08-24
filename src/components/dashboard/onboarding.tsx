import Link from "next/link";
import { CheckCircle2, Circle, Rocket, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// A short guided flow for a new teacher: add your first student → assign a
// co-teacher → invite the student. Rendered only until all three are done.
// Steps reflect real state (counts passed in), so it self-completes as you go.
export function Onboarding({
  hasClient,
  hasAssignment,
  hasClientLogin,
}: {
  hasClient: boolean;
  hasAssignment: boolean;
  hasClientLogin: boolean;
}) {
  if (hasClient && hasAssignment && hasClientLogin) return null;

  const steps = [
    { done: hasClient, label: "Add your first student", desc: "Their name and grade level.", href: "/admin/students" },
    { done: hasAssignment, label: "Assign a co-teacher", desc: "So a staff member can help track a class.", href: "/admin/assistants" },
    { done: hasClientLogin, label: "Invite a student", desc: "Give them a portal login to see their progress.", href: "/admin/students" },
  ];
  const nextStep = steps.find((s) => !s.done);

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold text-slate-800">Get started</p>
              <p className="text-xs text-slate-500">Three quick steps to get your classroom set up.</p>
            </div>
          </div>
          {nextStep && (
            <Link href={nextStep.href} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              {nextStep.label} <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        <ol className="mt-4 space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
              <div>
                <Link href={s.href} className={`text-sm font-medium ${s.done ? "text-slate-400 line-through" : "text-slate-700 hover:text-primary"}`}>{s.label}</Link>
                {!s.done && <p className="text-xs text-slate-400">{s.desc}</p>}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
