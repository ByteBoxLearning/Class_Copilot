"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { GradeResult } from "@/lib/grading";

// Hidden by default (see /portal/dashboard) — a deliberate choice, not
// remembered across visits, so checking the grade is always an active
// decision rather than the first thing the page shows.
export function GradeReveal({ grade }: { grade: GradeResult }) {
  const [shown, setShown] = useState(false);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {shown ? "Hide my grade" : "Show my grade"}
      </button>
      {shown && (
        <div className="mt-2">
          {grade.percent !== null ? (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Predicted grade</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-800">{grade.letter}</span>
                <span className="text-sm text-slate-500">{grade.percent}%</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">For reference only — your final grade may differ.</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Not enough data yet</p>
          )}
          {grade.components.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-slate-500">
              {grade.components.map((c) => (
                <li key={c.key} className="flex justify-between">
                  <span>{c.label} ({c.weight}%)</span>
                  <span>{c.percent !== null ? `${Math.round(c.percent)}%` : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
