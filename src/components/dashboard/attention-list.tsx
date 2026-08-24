import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { AttentionStudent } from "@/lib/reports";

// A computed, non-authoritative "who should I check on" list — see
// src/lib/reports.ts::studentsNeedingAttention for how a student lands
// here. Never hides or overrides the teacher's own judgment; just surfaces
// it prominently.
export function AttentionList({ students }: { students: AttentionStudent[] }) {
  if (students.length === 0) {
    return <p className="text-sm text-slate-400">Nothing flagged right now.</p>;
  }
  return (
    <ul className="space-y-2">
      {students.map((s) => (
        <li key={`${s.id}-${s.classId}`}>
          <Link
            href={`/admin/students/${s.id}`}
            className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 hover:bg-amber-50"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800">{s.displayName} <span className="font-normal text-slate-400">· {s.className}</span></span>
              <span className="block text-xs text-slate-500">{s.reason}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
