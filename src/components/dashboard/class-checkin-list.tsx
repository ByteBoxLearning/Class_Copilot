import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

export type CheckinItem = { classId: string; label: string; completed: boolean };

// Read-only — unlike the old static DailyChecklist, these items reflect
// real auto-derived state (has anything been logged in Monitor for this
// class today), so there's nothing to manually tick off. Each row links
// straight to that class's Monitor page.
export function ClassCheckinList({ items }: { items: CheckinItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">No active classes yet.</p>;
  }
  const done = items.filter((i) => i.completed).length;

  return (
    <div>
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Checked in today</span>
          <span className="text-slate-500">{done}/{items.length}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${done === items.length ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${Math.round((done / items.length) * 100)}%` }}
          />
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.classId}>
            <Link
              href={`/classes/monitor?class=${i.classId}`}
              className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors ${
                i.completed ? "border-green-200 bg-green-50 text-slate-500" : "border-border bg-white hover:bg-accent text-slate-700"
              }`}
            >
              {i.completed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
