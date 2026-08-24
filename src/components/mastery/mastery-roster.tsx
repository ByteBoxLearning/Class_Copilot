"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Info, MessageSquareText, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Select, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { BADGE_COLORS, labelOf, STUDENT_FLAGS, MASTERY_LEVELS, MASTERY_EVIDENCE_TYPES } from "@/lib/enums";
import { recordMasteryEvent } from "@/actions/mastery";
import { FeedbackPanel, type FeedbackItem } from "@/components/feedback/feedback-panel";

type StudentRow = { id: string; displayName: string; flag: string };
type StandardOpt = { id: string; code: string | null; title: string };
type CurrentMastery = { level: number | null; rawAverage: number | null; sampleSize: number };

export function MasteryRoster({
  classId,
  standards,
  selectedStandardId,
  students,
  currentByStudent,
  latestEventIdByStudent,
  feedbackByEvent,
}: {
  classId: string;
  standards: StandardOpt[];
  selectedStandardId: string;
  students: StudentRow[];
  currentByStudent: Record<string, CurrentMastery>;
  latestEventIdByStudent: Record<string, string>;
  feedbackByEvent: Record<string, FeedbackItem[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [evidenceType, setEvidenceType] = useState("OBSERVATION");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [current, setCurrent] = useState(currentByStudent);
  const [justRecorded, setJustRecorded] = useState<Record<string, number>>({});
  const [feedbackFor, setFeedbackFor] = useState<{ studentId: string; name: string } | null>(null);

  function pickStandard(standardId: string) {
    router.push(`/classes/mastery?class=${classId}&standard=${standardId}`);
  }

  function record(studentId: string, level: number) {
    setJustRecorded((prev) => ({ ...prev, [studentId]: level }));
    start(async () => {
      const res = await recordMasteryEvent({
        studentId,
        standardId: selectedStandardId,
        classId,
        level,
        evidenceType,
        evidenceNote: evidenceNote || undefined,
      });
      if (res.ok) {
        // Optimistically fold the new event into the displayed weighted
        // average using the same "each event's weight = its position"
        // scheme as the server, so the roster reflects it immediately.
        setCurrent((prev) => {
          const c = prev[studentId] ?? { level: null, rawAverage: null, sampleSize: 0 };
          const n = c.sampleSize + 1;
          const priorWeighted = (c.rawAverage ?? 0) * ((c.sampleSize * (c.sampleSize + 1)) / 2 || 0);
          const weightedSum = priorWeighted + level * n;
          const weightTotal = (n * (n + 1)) / 2;
          const rawAverage = weightedSum / weightTotal;
          return { ...prev, [studentId]: { level: Math.min(4, Math.max(1, Math.round(rawAverage))), rawAverage, sampleSize: n } };
        });
      }
    });
  }

  const sorted = [...students].sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
        <Select value={selectedStandardId} onChange={(e) => pickStandard(e.target.value)} className="h-9 w-auto min-w-[240px]">
          {standards.map((s) => (
            <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ""}{s.title}</option>
          ))}
        </Select>
        <Select value={evidenceType} onChange={(e) => setEvidenceType(e.target.value)} className="h-9 w-auto">
          {MASTERY_EVIDENCE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input
          value={evidenceNote}
          onChange={(e) => setEvidenceNote(e.target.value)}
          placeholder="Optional note for this batch (e.g. Ch. 4 quiz)"
          className="h-9 min-w-[220px] flex-1"
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Info className="h-3.5 w-3.5" /> Tap a level to record a new evidence point for that student. Current mastery weighs recent evidence more, but never discards earlier history.
      </p>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-border bg-white py-8 text-center text-sm text-slate-400">
          No students enrolled in this class yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-4 py-2 font-medium">Current</th>
                <th className="px-4 py-2 text-center font-medium">Record new level</th>
                <th className="px-3 py-2 text-center font-medium">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const c = current[s.id] ?? { level: null, rawAverage: null, sampleSize: 0 };
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{s.displayName}</span>
                        <Badge color={BADGE_COLORS[s.flag]}>{labelOf(STUDENT_FLAGS, s.flag)}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.level ? (
                        <span className="flex items-center gap-1.5">
                          <Badge color={BADGE_COLORS[String(c.level)]}>{labelOf(MASTERY_LEVELS, String(c.level))}</Badge>
                          <span className="text-xs text-slate-400">n={c.sampleSize}{c.rawAverage != null ? ` · ${c.rawAverage.toFixed(1)}` : ""}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">No evidence yet</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-center gap-1.5">
                        {MASTERY_LEVELS.map((opt) => {
                          const lvl = Number(opt.value);
                          const justTapped = justRecorded[s.id] === lvl;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={pending}
                              onClick={() => record(s.id, lvl)}
                              title={opt.label}
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold transition-colors disabled:opacity-50",
                                justTapped ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-slate-500 hover:bg-accent",
                              )}
                            >
                              {lvl}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        {(() => {
                          const eventId = latestEventIdByStudent[s.id];
                          const hasFeedback = !!eventId && (feedbackByEvent[eventId]?.length ?? 0) > 0;
                          return (
                            <button
                              type="button"
                              disabled={!eventId}
                              onClick={() => setFeedbackFor({ studentId: s.id, name: s.displayName })}
                              title={eventId ? "Feedback on the latest evidence" : "Record evidence first"}
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                                hasFeedback ? "border-violet-300 bg-violet-50 text-violet-600" : "border-border bg-white text-slate-300 hover:bg-accent hover:text-slate-400",
                              )}
                            >
                              {hasFeedback ? <MessageSquareText className="h-4 w-4" /> : <MessageSquarePlus className="h-4 w-4" />}
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!feedbackFor} onClose={() => setFeedbackFor(null)} title={feedbackFor ? `Feedback — ${feedbackFor.name}` : ""}>
        {feedbackFor && latestEventIdByStudent[feedbackFor.studentId] && (
          <FeedbackPanel
            studentId={feedbackFor.studentId}
            target={{ kind: "MASTERY_EVENT", masteryEventId: latestEventIdByStudent[feedbackFor.studentId] }}
            initialItems={feedbackByEvent[latestEventIdByStudent[feedbackFor.studentId]] ?? []}
          />
        )}
      </Modal>
    </div>
  );
}
