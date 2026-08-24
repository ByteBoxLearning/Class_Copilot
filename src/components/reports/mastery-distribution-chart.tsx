"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { MasteryDistribution } from "@/lib/reports-math";
import { MASTERY_LEVELS } from "@/lib/enums";

const LEVEL_COLORS = ["#ef4444", "#f59e0b", "#0ea5e9", "#10b981"]; // matches BADGE_COLORS' 1-4 hues
const NO_EVIDENCE_COLOR = "#cbd5e1";

// Class-wide "how is everyone doing" — every (enrolled student × active
// standard) pair currently sits at one level, or has no evidence yet. Not a
// per-student view (see the roster for that) — this is the aggregate shape.
export function MasteryDistributionChart({ distribution }: { distribution: MasteryDistribution }) {
  const total = distribution.level1 + distribution.level2 + distribution.level3 + distribution.level4 + distribution.noEvidence;
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">No standards or enrolled students yet.</p>;
  }

  const data = [
    ...MASTERY_LEVELS.map((l, i) => ({ name: l.label, count: distribution[`level${i + 1}` as keyof MasteryDistribution], color: LEVEL_COLORS[i] })),
    { name: "No evidence", count: distribution.noEvidence, color: NO_EVIDENCE_COLOR },
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number) => [`${value} (${total ? Math.round((value / total) * 100) : 0}%)`, "Standard readings"]}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
