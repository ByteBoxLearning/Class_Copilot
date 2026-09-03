"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { UserPlus, X, Upload, Send, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { enrollStudent, unenrollStudent, sendClassInvites } from "@/actions/classes";
import { setStudentFlag } from "@/actions/students";
import { BADGE_COLORS, labelOf, STUDENT_FLAGS } from "@/lib/enums";

type Enrolled = { id: string; displayName: string; flag: string };
type StudentOpt = { id: string; displayName: string };
type Grade = { percent: number | null; letter: string | null };
type TrendSuggestion = { suggested: "EXCELLING" | "ON_TRACK" | "NEEDS_SUPPORT"; reason: string };

const TREND_ICON = { EXCELLING: TrendingUp, ON_TRACK: Minus, NEEDS_SUPPORT: TrendingDown };

export function RosterManager({
  classId,
  enrolled,
  unenrolledStudents,
  grades,
  trendSuggestions,
}: {
  classId: string;
  enrolled: Enrolled[];
  unenrolledStudents: StudentOpt[];
  grades?: Record<string, Grade>;
  trendSuggestions?: Record<string, TrendSuggestion>;
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState("");
  const [flags, setFlags] = useState<Record<string, string>>(Object.fromEntries(enrolled.map((s) => [s.id, s.flag])));

  function add() {
    if (!pick) return;
    start(async () => {
      const res = await enrollStudent(classId, pick);
      if (res.ok) { toast("Student enrolled."); setPick(""); }
      else toast(res.error ?? "Failed.", "error");
    });
  }
  function remove(id: string) {
    start(async () => {
      const res = await unenrollStudent(classId, id);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
    });
  }
  function sendInvites() {
    start(async () => {
      const res = await sendClassInvites(classId);
      if (!res.ok) { toast(res.error, "error"); return; }
      const parts: string[] = [];
      if (res.sent) parts.push(`Sent ${res.sent} invite${res.sent === 1 ? "" : "s"}`);
      if (res.skippedAlreadyLinked) parts.push(`${res.skippedAlreadyLinked} already had a login`);
      if (res.skippedNoEmail) parts.push(`${res.skippedNoEmail} had no email on file`);
      if (res.failed) parts.push(`${res.failed} failed to send${res.firstError ? ` (${res.firstError})` : ""}`);
      toast(parts.length ? parts.join(" · ") : "No students needed an invite.", res.failed ? "error" : "success");
    });
  }

  function applySuggestion(studentId: string, suggested: "EXCELLING" | "ON_TRACK" | "NEEDS_SUPPORT") {
    setFlags((prev) => ({ ...prev, [studentId]: suggested }));
    start(async () => {
      try {
        await setStudentFlag(studentId, suggested);
        toast("Flag updated.");
      } catch {
        toast("Could not update flag.", "error");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-500">{enrolled.length} student{enrolled.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          {enrolled.length > 0 && (
            <Button variant="outline" size="sm" onClick={sendInvites} disabled={pending} title="Emails a portal invite link to every enrolled student with an email on file who doesn't already have a login">
              <Send className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Send invite links to all"}
            </Button>
          )}
          <Link href={`/admin/classes/${classId}/roster/import`}>
            <Button variant="outline" size="sm"><Upload className="h-3.5 w-3.5" /> Import roster</Button>
          </Link>
        </div>
      </div>

      {enrolled.length === 0 ? (
        <p className="text-sm text-slate-400">No students enrolled yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {enrolled.map((s) => {
            const flag = flags[s.id] ?? s.flag;
            const suggestion = trendSuggestions?.[s.id];
            const Icon = suggestion ? TREND_ICON[suggestion.suggested] : null;
            return (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm text-slate-700">{s.displayName}</span>
                <Badge color={BADGE_COLORS[flag]}>{labelOf(STUDENT_FLAGS, flag)}</Badge>
                {grades?.[s.id]?.percent != null && (
                  <Badge color="bg-slate-100 text-slate-700 border-slate-200">{grades[s.id].letter} · {grades[s.id].percent}%</Badge>
                )}
                {suggestion && Icon && suggestion.suggested !== flag && (
                  <button
                    type="button"
                    onClick={() => applySuggestion(s.id, suggestion.suggested)}
                    disabled={pending}
                    title={`${suggestion.reason} — click to apply`}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-500 hover:border-primary hover:text-primary"
                  >
                    <Icon className="h-3 w-3" /> Suggest: {labelOf(STUDENT_FLAGS, suggestion.suggested)}
                  </button>
                )}
              </span>
              <button onClick={() => remove(s.id)} disabled={pending} className="text-slate-400 hover:text-red-600" title="Remove from class">
                <X className="h-4 w-4" />
              </button>
            </li>
            );
          })}
        </ul>
      )}

      {unenrolledStudents.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9">
            <option value="">Add existing student…</option>
            {unenrolledStudents.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </Select>
          <Button size="sm" onClick={add} disabled={pending || !pick}><UserPlus className="h-4 w-4" /> Add</Button>
        </div>
      )}
    </div>
  );
}
