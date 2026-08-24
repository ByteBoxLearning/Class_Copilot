"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ChevronLeft, ChevronRight, Smile, Frown, Lightbulb,
  HeartHandshake, HeartCrack, ShieldCheck, ShieldAlert, Users, UserX, Flag, FlagOff,
  MessageSquareText, MessageSquarePlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { BADGE_COLORS, labelOf, MASTERY_LEVELS, STUDENT_FLAGS } from "@/lib/enums";
import {
  setDailyCheck, setDailyCheckNote, setDailyStandardFocus, setDailyUnderstandingCheck,
  type DailyCheckField,
} from "@/actions/daily-checks";
import { FeedbackPanel, type FeedbackItem } from "@/components/feedback/feedback-panel";

type Check = Record<DailyCheckField, string | null>;
type StudentRow = { id: string; displayName: string; flag: string };
type StandardOption = { id: string; code: string | null; title: string };
type UnderstandingCheck = { level: string | null; standardId: string | null };

const EMPTY_CHECK: Check = {
  engagement: null, empathy: null, discipline: null, collaboration: null, citizenship: null,
};

// The five quick daily reads a teacher can tap per student. Engagement was
// the original explicit ask; the other four are the original Milestone F
// vision, added back after a dogfooding check-in confirmed the simplified
// two-toggle version wasn't enough on its own. Understanding used to live
// here too but is now a distinct, Standard-linked, MasteryEvent-producing
// check (see the "Understanding" column built separately below) — it no
// longer fits this generic blank/positive/negative shape.
const DIMENSIONS: {
  key: DailyCheckField;
  label: string;
  positive: string;
  negative: string;
  positiveIcon: React.ReactNode;
  negativeIcon: React.ReactNode;
}[] = [
  { key: "engagement", label: "Engagement", positive: "ENGAGED", negative: "DISTRACTING", positiveIcon: <Smile className="h-5 w-5" />, negativeIcon: <Frown className="h-5 w-5" /> },
  { key: "empathy", label: "Empathy", positive: "SHOWED_EMPATHY", negative: "LACKED_EMPATHY", positiveIcon: <HeartHandshake className="h-5 w-5" />, negativeIcon: <HeartCrack className="h-5 w-5" /> },
  { key: "discipline", label: "Discipline", positive: "DISCIPLINED", negative: "UNDISCIPLINED", positiveIcon: <ShieldCheck className="h-5 w-5" />, negativeIcon: <ShieldAlert className="h-5 w-5" /> },
  { key: "collaboration", label: "Collaboration", positive: "COLLABORATIVE", negative: "UNCOOPERATIVE", positiveIcon: <Users className="h-5 w-5" />, negativeIcon: <UserX className="h-5 w-5" /> },
  { key: "citizenship", label: "Citizenship", positive: "GOOD_CITIZENSHIP", negative: "POOR_CITIZENSHIP", positiveIcon: <Flag className="h-5 w-5" />, negativeIcon: <FlagOff className="h-5 w-5" /> },
];

// Cycles unset -> positive -> negative -> unset on each tap, matching the
// blank-by-default philosophy: the teacher only touches cells for students
// who stood out that day, not every cell for every student.
function nextValue(current: string | null, positive: string, negative: string): string | null {
  if (current === null) return positive;
  if (current === positive) return negative;
  return null;
}

function ToggleCell({
  value,
  positive,
  negative,
  positiveIcon,
  negativeIcon,
  onTap,
  disabled,
}: {
  value: string | null;
  positive: string;
  negative: string;
  positiveIcon: React.ReactNode;
  negativeIcon: React.ReactNode;
  onTap: (next: string | null) => void;
  disabled: boolean;
}) {
  const label = value === positive ? "positive" : value === negative ? "negative" : "unset";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onTap(nextValue(value, positive, negative))}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
        value === positive && "border-emerald-300 bg-emerald-50 text-emerald-600",
        value === negative && "border-red-300 bg-red-50 text-red-600",
        value === null && "border-border bg-white text-slate-300 hover:bg-accent hover:text-slate-400",
      )}
      title={`Tap to cycle (currently ${label})`}
    >
      {value === positive ? positiveIcon : value === negative ? negativeIcon : positiveIcon}
    </button>
  );
}

// The per-student control for the Standard-linked understanding check — a
// quick two-tier tap, not a 4-level picker (that fuller range is what the
// Mastery Roster page, /classes/mastery, is for). Cycles blank -> Proficient
// -> Developing -> blank, matching the same tap-to-cycle shape as the other
// DailyCheck dimensions, just with these two specific levels instead of a
// generic positive/negative pair — and unlike those, a tap here still writes
// a real MasteryEvent, not just a local display flag.
function UnderstandingCell({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (next: string | null) => void;
}) {
  function next() {
    if (value === null) return onChange("3"); // Proficient
    if (value === "3") return onChange("2"); // Developing
    return onChange(null);
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={next}
      className={cn(
        "inline-flex h-8 min-w-[86px] items-center justify-center rounded-full border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        value ? BADGE_COLORS[value] : "border-border bg-white text-slate-300 hover:bg-accent hover:text-slate-400",
      )}
      title={disabled ? "Pick today's standard focus above first" : "Tap to cycle: blank → Proficient → Developing → blank"}
    >
      {value ? labelOf(MASTERY_LEVELS, value) : "—"}
    </button>
  );
}

function NoteButton({ note, hasExtra, onClick }: { note: string | null; hasExtra: boolean; onClick: () => void }) {
  const filled = !!note || hasExtra;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
        filled ? "border-sky-300 bg-sky-50 text-sky-600" : "border-border bg-white text-slate-300 hover:bg-accent hover:text-slate-400",
      )}
      title={note ? note : hasExtra ? "Has feedback" : "Add a note or feedback"}
    >
      {filled ? <MessageSquareText className="h-5 w-5" /> : <MessageSquarePlus className="h-5 w-5" />}
    </button>
  );
}

export function RosterMonitor({
  classId,
  date,
  students,
  checksByStudent,
  notesByStudent,
  feedbackByStudent,
  standards,
  focusStandardId: initialFocusStandardId,
  understandingByStudent: initialUnderstandingByStudent,
}: {
  classId: string;
  date: string; // YYYY-MM-DD
  students: StudentRow[];
  checksByStudent: Record<string, Partial<Check>>;
  notesByStudent: Record<string, string | null>;
  feedbackByStudent: Record<string, FeedbackItem[]>;
  standards: StandardOption[];
  focusStandardId: string | null;
  understandingByStudent: Record<string, UnderstandingCheck>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [checks, setChecks] = useState<Record<string, Partial<Check>>>(checksByStudent);
  const [notes, setNotes] = useState<Record<string, string | null>>(notesByStudent);
  const [noteEditor, setNoteEditor] = useState<{ studentId: string; name: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [focusStandardId, setFocusStandardId] = useState(initialFocusStandardId);
  const [understanding, setUnderstanding] = useState(initialUnderstandingByStudent);

  function goToDate(newDate: string) {
    router.push(`/classes/monitor?class=${classId}&date=${newDate}`);
  }

  function shiftDate(days: number) {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    goToDate(d.toISOString().slice(0, 10));
  }

  function tap(studentId: string, field: DailyCheckField, next: string | null) {
    setChecks((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? EMPTY_CHECK), [field]: next },
    }));
    start(() => {
      void setDailyCheck(studentId, classId, date, field, next);
    });
  }

  function changeFocus(standardId: string | null) {
    const previous = focusStandardId;
    setFocusStandardId(standardId);
    start(async () => {
      const result = await setDailyStandardFocus(classId, date, standardId);
      if (!result.ok) {
        setFocusStandardId(previous);
        toast(result.error, "error");
      }
    });
  }

  function tapUnderstanding(studentId: string, next: string | null) {
    const previous = understanding[studentId] ?? { level: null, standardId: null };
    setUnderstanding((prev) => ({ ...prev, [studentId]: { level: next, standardId: focusStandardId } }));
    start(async () => {
      const result = await setDailyUnderstandingCheck(studentId, classId, date, next);
      if (!result.ok) {
        setUnderstanding((prev) => ({ ...prev, [studentId]: previous }));
        toast(result.error, "error");
      }
    });
  }

  function openNoteEditor(studentId: string, name: string) {
    setNoteEditor({ studentId, name });
    setNoteDraft(notes[studentId] ?? "");
  }

  async function saveNote() {
    if (!noteEditor) return;
    setSavingNote(true);
    const result = await setDailyCheckNote(noteEditor.studentId, classId, date, noteDraft);
    setSavingNote(false);
    if (result.ok) {
      setNotes((prev) => ({ ...prev, [noteEditor.studentId]: noteDraft.trim() || null }));
      toast("Note saved.");
      setNoteEditor(null);
    } else {
      toast(result.error, "error");
    }
  }

  const sorted = [...students].sort((a, b) => {
    const rank: Record<string, number> = { NEEDS_SUPPORT: 0, ON_TRACK: 1, EXCELLING: 2 };
    return (rank[a.flag] ?? 1) - (rank[b.flag] ?? 1) || a.displayName.localeCompare(b.displayName);
  });

  const isToday = date === new Date().toISOString().slice(0, 10);
  const [engagementDim, ...restDims] = DIMENSIONS;
  const focusStandard = standards.find((st) => st.id === focusStandardId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-white px-3 py-2">
        <div className="flex items-center gap-1">
          <button onClick={() => shiftDate(-1)} className="rounded p-1.5 text-slate-500 hover:bg-accent" title="Previous day">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && goToDate(e.target.value)}
            className="rounded-md border border-border px-2 py-1 text-sm"
          />
          <button onClick={() => shiftDate(1)} className="rounded p-1.5 text-slate-500 hover:bg-accent" title="Next day">
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button onClick={() => goToDate(new Date().toISOString().slice(0, 10))} className="ml-1 text-xs text-primary hover:underline">
              Jump to today
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">Tap a cell to cycle: blank → positive → negative → blank.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <Lightbulb className="h-4 w-4 text-slate-400" />
          Today&apos;s standard focus:
        </label>
        {standards.length === 0 ? (
          <span className="text-xs text-slate-400">No standards defined for this class yet.</span>
        ) : (
          <select
            value={focusStandardId ?? ""}
            onChange={(e) => changeFocus(e.target.value || null)}
            className="rounded-md border border-border px-2 py-1 text-xs"
          >
            <option value="">— none set —</option>
            {standards.map((st) => (
              <option key={st.id} value={st.id}>{st.code ? `${st.code} — ` : ""}{st.title}</option>
            ))}
          </select>
        )}
        <p className="text-xs text-slate-400">
          {focusStandard
            ? "Understanding checks below record evidence against this standard."
            : "Pick a standard to enable understanding checks below."}
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-border bg-white py-8 text-center text-sm text-slate-400">
          No students enrolled in this class yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="whitespace-nowrap px-4 py-2 font-medium">Student</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">{engagementDim.label}</th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">Understanding</th>
                {restDims.map((dim) => (
                  <th key={dim.key} className="whitespace-nowrap px-3 py-2 text-center font-medium">{dim.label}</th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const check = checks[s.id] ?? EMPTY_CHECK;
                const studentUnderstanding = understanding[s.id] ?? { level: null, standardId: null };
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{s.displayName}</span>
                        <Badge color={BADGE_COLORS[s.flag]}>{labelOf(STUDENT_FLAGS, s.flag)}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <ToggleCell
                          value={check[engagementDim.key] ?? null}
                          positive={engagementDim.positive}
                          negative={engagementDim.negative}
                          positiveIcon={engagementDim.positiveIcon}
                          negativeIcon={engagementDim.negativeIcon}
                          disabled={pending}
                          onTap={(next) => tap(s.id, engagementDim.key, next)}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <UnderstandingCell
                          value={studentUnderstanding.level}
                          disabled={pending || !focusStandardId}
                          onChange={(next) => tapUnderstanding(s.id, next)}
                        />
                      </div>
                    </td>
                    {restDims.map((dim) => (
                      <td key={dim.key} className="px-3 py-2.5">
                        <div className="flex justify-center">
                          <ToggleCell
                            value={check[dim.key] ?? null}
                            positive={dim.positive}
                            negative={dim.negative}
                            positiveIcon={dim.positiveIcon}
                            negativeIcon={dim.negativeIcon}
                            disabled={pending}
                            onTap={(next) => tap(s.id, dim.key, next)}
                          />
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2.5">
                      <div className="flex justify-center">
                        <NoteButton
                          note={notes[s.id] ?? null}
                          hasExtra={(feedbackByStudent[s.id]?.length ?? 0) > 0}
                          onClick={() => openNoteEditor(s.id, s.displayName)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!noteEditor} onClose={() => (savingNote ? null : setNoteEditor(null))} title={noteEditor ? `${noteEditor.name} — ${date}` : ""}>
        {noteEditor && (
          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-700">Private note <span className="font-normal text-slate-400">— only staff ever see this</span></p>
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="e.g. Struggled to stay on task during group work, but stepped up to help a classmate afterward."
                rows={4}
                maxLength={2000}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNoteEditor(null)} disabled={savingNote}>Cancel</Button>
                <Button onClick={saveNote} disabled={savingNote}>{savingNote ? "Saving…" : "Save note"}</Button>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-slate-700">Feedback <span className="font-normal text-slate-400">— optionally share with the student</span></p>
              <FeedbackPanel
                studentId={noteEditor.studentId}
                target={{ kind: "DAILY_CHECK", classId, date }}
                initialItems={feedbackByStudent[noteEditor.studentId] ?? []}
                noteText={noteDraft}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
