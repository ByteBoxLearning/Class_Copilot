"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { suggestQuestionMapping, saveQuestionMapping, type MappingCandidate, type MappingStandard } from "@/actions/standards-mapping";
import type { UnitSource } from "@/lib/practice/types";

// The AI-assist review step for the fine-grained standard<->question
// mapping workaround. Always opens into a review table the teacher can
// freely override before saving — suggestQuestionMapping never writes
// anything, and even a failed suggestion still drops the teacher into an
// editable, all-unassigned table so manual assignment is never blocked on
// the AI being available.
export function QuestionMappingModal({
  open,
  onClose,
  classId,
  unitSource,
  unitId,
  unitTitle,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  unitSource: UnitSource;
  unitId: string;
  unitTitle: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [standards, setStandards] = useState<MappingStandard[]>([]);
  const [questions, setQuestions] = useState<MappingCandidate[]>([]);
  const [draft, setDraft] = useState<Record<string, string | null>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNotice(null);
    suggestQuestionMapping(classId, unitSource, Number(unitId)).then((res) => {
      setLoading(false);
      setStandards(res.standards ?? []);
      setQuestions(res.questions ?? []);
      if (res.ok) {
        setDraft(Object.fromEntries(res.assignments.map((a) => [a.questionId, a.standardId])));
      } else {
        setDraft({});
        setNotice(res.error);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, unitSource, unitId]);

  async function save() {
    setSaving(true);
    const assignments = Object.entries(draft).map(([questionId, standardId]) => ({ questionId, standardId }));
    const res = await saveQuestionMapping(classId, unitSource, Number(unitId), assignments);
    setSaving(false);
    if (res.ok) {
      toast("Question mapping saved.");
      onClose();
    } else {
      toast(res.error, "error");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Map questions — ${unitTitle}`} className="max-w-2xl">
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-400">Asking the AI for a suggested mapping…</p>
      ) : (
        <div className="space-y-3">
          {notice && (
            <p className="rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
              {notice}{questions.length > 0 && " You can still assign each question to a standard manually below."}
            </p>
          )}
          {!notice && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <Sparkles className="h-3.5 w-3.5" /> AI-suggested — review and adjust before saving. Nothing is saved yet.
            </p>
          )}
          {questions.length === 0 ? (
            notice ? null : <p className="py-4 text-center text-sm text-slate-400">No bank questions found for this unit.</p>
          ) : (
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {questions.map((q) => (
                <div key={q.id} className="grid grid-cols-1 items-center gap-2 rounded-md border border-border p-2.5 sm:grid-cols-3">
                  <div className="min-w-0 sm:col-span-2">
                    {q.topicTag && <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">{q.topicTag}</span>}
                    <span className="text-xs text-slate-600">{q.stem}</span>
                  </div>
                  <Select
                    value={draft[q.id] ?? ""}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [q.id]: e.target.value || null }))}
                  >
                    <option value="">— none —</option>
                    {standards.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </Select>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || questions.length === 0}>{saving ? "Saving…" : "Save mapping"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
