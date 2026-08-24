"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { EngagementDayPoint } from "@/lib/reports-math";

// Days with no logs come through as percent: null — recharts just leaves a
// gap in the line rather than dipping to 0, matching the "exclude, don't
// zero" convention used everywhere else engagement feeds a computed number.
export function EngagementTrendChart({ points }: { points: EngagementDayPoint[] }) {
  const anyData = points.some((p) => p.percent !== null);
  if (!anyData) {
    return <p className="py-8 text-center text-sm text-slate-400">No engagement checks logged in this window yet.</p>;
  }

  const data = points.map((p) => ({ date: p.date.slice(5), percent: p.percent, sampleSize: p.sampleSize }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value, _name, item) => [
              value === null || value === undefined ? "no checks logged" : `${value}% (n=${item.payload.sampleSize})`,
              "Engaged",
            ]}
          />
          <Line type="monotone" dataKey="percent" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
