"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { approvePracticeProposal, rejectPracticeProposal, type PendingProposalRow } from "@/actions/practice-review";
import { BADGE_COLORS, MASTERY_LEVELS, labelOf } from "@/lib/enums";

export function PracticeReviewList({ proposals }: { proposals: PendingProposalRow[] }) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [rows, setRows] = useState(proposals);
  const [reviewing, setReviewing] = useState<PendingProposalRow | null>(null);
  const [level, setLevel] = useState<number>(1);
  const [rejecting, setRejecting] = useState<PendingProposalRow | null>(null);
  const [reason, setReason] = useState("");

  function openApprove(row: PendingProposalRow) {
    setLevel(row.suggestedLevel);
    setReviewing(row);
  }

  function doApprove() {
    if (!reviewing) return;
    const row = reviewing;
    setReviewing(null);
    start(async () => {
      const res = await approvePracticeProposal(row.id, { level });
      if (res.ok) { toast(`Recorded level ${level} for ${row.studentName} on "${row.standardTitle}".`); setRows((r) => r.filter((x) => x.id !== row.id)); }
      else toast(res.error, "error");
    });
  }

  function doReject() {
    if (!rejecting) return;
    const row = rejecting;
    setRejecting(null);
    start(async () => {
      const res = await rejectPracticeProposal(row.id, reason || undefined);
      if (res.ok) { toast("Rejected — no mastery event recorded."); setRows((r) => r.filter((x) => x.id !== row.id)); }
      else toast(res.error, "error");
      setReason("");
    });
  }

  if (rows.length === 0) {
    return <Card><CardContent className="py-8 text-center text-sm text-slate-400">No practice results waiting for review.</CardContent></Card>;
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-800">{r.studentName}</p>
                <Badge color="bg-slate-100 text-slate-600 border-slate-200">{r.className}</Badge>
                <Badge color="bg-violet-100 text-violet-800 border-violet-200">{r.unitTitle}</Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Scored {r.scorePercent}% → suggested <Badge color={BADGE_COLORS[String(r.suggestedLevel)]}>{labelOf(MASTERY_LEVELS, String(r.suggestedLevel))}</Badge>
                {r.standardTitle ? (
                  <> toward <span className="font-medium text-slate-600">{r.standardTitle}</span></>
                ) : (
                  <span className="text-amber-600"> — not linked to a standard yet, can&apos;t be approved until one is</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setRejecting(r)}><X className="h-4 w-4" /> Reject</Button>
              <Button size="sm" disabled={!r.standardId} onClick={() => openApprove(r)}><Check className="h-4 w-4" /> Approve</Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Modal open={reviewing !== null} onClose={() => setReviewing(null)} title="Approve practice result" className="max-w-md">
        {reviewing && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {reviewing.studentName} scored {reviewing.scorePercent}% on &quot;{reviewing.unitTitle}&quot;. This will record a MasteryEvent
              (evidence type: AI Practice) toward &quot;{reviewing.standardTitle}&quot; under your name.
            </p>
            <Field label="Level to record">
              <Select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                {MASTERY_LEVELS.map((o) => <option key={o.value} value={o.value}>{o.value} · {o.label}</option>)}
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
              <Button onClick={doApprove}>Record mastery event</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title="Reject practice result" className="max-w-md">
        {rejecting && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">No mastery event will be recorded for {rejecting.studentName}&apos;s &quot;{rejecting.unitTitle}&quot; result.</p>
            <Field label="Reason (optional, shown to no one but staff for now)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. suspected guessing, retake instead" />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="danger" onClick={doReject}>Reject</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
