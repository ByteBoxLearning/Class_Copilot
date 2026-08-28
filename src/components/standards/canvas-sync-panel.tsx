"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Link2 } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveCanvasCourseId, syncCanvasOutcomes, syncCanvasOutcomeResults } from "@/actions/canvas-sync";

export function CanvasSyncPanel({ classId, canvasCourseId }: { classId: string; canvasCourseId: number | null }) {
  const [courseId, setCourseId] = useState(canvasCourseId ? String(canvasCourseId) : "");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function saveCourseId() {
    start(async () => {
      const res = await saveCanvasCourseId(classId, courseId);
      if (res.ok) toast("Canvas course id saved.");
      else toast(res.error || "Could not save.", "error");
    });
  }

  function syncOutcomes() {
    start(async () => {
      const res = await syncCanvasOutcomes(classId);
      if (res.ok) toast(`Synced: ${res.created} standard(s) created, ${res.updated} updated.`);
      else toast(res.error, "error");
    });
  }

  function syncResults() {
    start(async () => {
      const res = await syncCanvasOutcomeResults(classId);
      if (res.ok) toast(`Imported ${res.imported} result(s) as mastery evidence (${res.skippedNoMatch} skipped — no matching student/standard).`);
      else toast(res.error, "error");
    });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800">
        <Link2 className="h-4 w-4 text-primary" /> Canvas Outcomes sync
      </p>
      <p className="mb-3 text-xs text-slate-400">
        Links this class to a Canvas course so its outcomes import as standards here, and Canvas outcome results feed in as
        mastery evidence alongside what you log by hand. Requires a Canvas base URL + API token in Admin → Settings.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Canvas course id" hint="From the course URL: …/courses/12345">
          <Input value={courseId} onChange={(e) => setCourseId(e.target.value)} placeholder="12345" className="w-32" />
        </Field>
        <Button variant="outline" size="sm" onClick={saveCourseId} disabled={pending}>Save</Button>
        <Button size="sm" onClick={syncOutcomes} disabled={pending || !canvasCourseId}>
          <RefreshCw className="h-3.5 w-3.5" /> Sync outcomes
        </Button>
        <Button size="sm" onClick={syncResults} disabled={pending || !canvasCourseId}>
          <RefreshCw className="h-3.5 w-3.5" /> Sync outcome results
        </Button>
      </div>
    </div>
  );
}
