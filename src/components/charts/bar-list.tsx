import { cn } from "@/lib/utils";

// A lightweight, dependency-free horizontal bar list for category breakdowns.
export function BarList({
  data,
  emptyLabel = "No data yet",
  max = 8,
  barClass = "bg-primary/80",
}: {
  data: { label: string; count: number }[];
  emptyLabel?: string;
  max?: number;
  barClass?: string;
}) {
  const rows = data.slice(0, max);
  const peak = Math.max(1, ...rows.map((r) => r.count));

  if (rows.length === 0) {
    return <p className="py-4 text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="w-40 shrink-0 truncate text-sm text-slate-600" title={r.label}>
            {r.label}
          </div>
          <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className={cn("h-full rounded", barClass)}
              style={{ width: `${(r.count / peak) * 100}%` }}
            />
          </div>
          <div className="w-8 shrink-0 text-right text-sm font-medium tabular-nums text-slate-700">
            {r.count}
          </div>
        </div>
      ))}
    </div>
  );
}
