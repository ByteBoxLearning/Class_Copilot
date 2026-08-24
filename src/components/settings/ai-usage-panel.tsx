import { BarChart3 } from "lucide-react";
import { formatTokens, formatCostUsd } from "@/lib/ai/engines";
import type { AssignmentUsageStats } from "@/lib/assignments/usage";

// Only the Assignment Builder's usage is tracked — the End-of-Term Comments
// generator is deliberately ephemeral (see CONTEXT.md) and persists nothing,
// so its cost never accumulates anywhere. A known, deliberate gap, called
// out here rather than silently under-reporting spend.
export function AiUsagePanel({ stats }: { stats: AssignmentUsageStats }) {
  if (stats.totalGenerations === 0) {
    return <p className="text-sm text-slate-400">No AI-generated assignments yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-lg font-semibold text-slate-800">{stats.totalGenerations}</p>
          <p className="text-xs text-slate-400">generations</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-lg font-semibold text-slate-800">{formatTokens(stats.totalTokens)}</p>
          <p className="text-xs text-slate-400">tokens</p>
        </div>
        <div className="rounded-lg border border-border p-3 text-center">
          <p className="text-lg font-semibold text-slate-800">{formatCostUsd(stats.totalCostUsd)}</p>
          <p className="text-xs text-slate-400">est. cost</p>
        </div>
      </div>
      {stats.byEngine.length > 0 && (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600"><BarChart3 className="h-3.5 w-3.5" /> By engine</p>
          <ul className="space-y-1.5">
            {stats.byEngine.map((e) => (
              <li key={e.engine} className="flex items-center justify-between text-xs text-slate-500">
                <span>{e.label}</span>
                <span>{e.generations} · {formatTokens(e.tokens)} tok · {formatCostUsd(e.costUsd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Only Assignment Builder generations are tracked here — the End-of-Term Comments generator doesn&apos;t persist a draft, so its usage isn&apos;t counted.
      </p>
    </div>
  );
}
