"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveCommentsPrompt } from "@/actions/settings";
import { DEFAULT_COMMENTS_PROMPT } from "@/lib/comments/prompt-defaults";

// Admin editor for the End-of-Term Comments prompt. The app fills the
// {{STUDENT_NAME}} / {{CLASS_NAME}} / {{DATE_RANGE}} / {{DAILY_CHECK_SUMMARY}}
// / {{MASTERY_SUMMARY}} placeholders at generation time. Unlike the CV
// Builder's prompt this has no JSON contract to protect — the output is
// plain prose, used as-is.
export function CommentsPromptForm({ prompt }: { prompt: string }) {
  const [p, setP] = useState(prompt);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function save() {
    start(async () => {
      const res = await saveCommentsPrompt(p);
      if (res.ok) toast("Comments prompt saved.");
      else toast(res.error || "Could not save.", "error");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>End-of-Term Comments prompt <span className="font-normal text-slate-400">— what the AI receives when generating a draft</span></Label>
        <button type="button" onClick={() => setP(DEFAULT_COMMENTS_PROMPT)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary">
          <RotateCcw className="h-3 w-3" /> Reset to default
        </button>
      </div>
      <textarea value={p} onChange={(e) => setP(e.target.value)} className="h-64 w-full resize-y rounded-md border border-border p-3 font-mono text-xs text-slate-700" />
      <p className="text-xs text-slate-400">
        Must keep <span className="font-mono">{"{{STUDENT_NAME}}"}</span>, <span className="font-mono">{"{{DAILY_CHECK_SUMMARY}}"}</span>, and{" "}
        <span className="font-mono">{"{{MASTERY_SUMMARY}}"}</span> — the app fills these in with real data. <span className="font-mono">{"{{CLASS_NAME}}"}</span>{" "}
        and <span className="font-mono">{"{{DATE_RANGE}}"}</span> are also available.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}><Check className="h-4 w-4" /> {pending ? "Saving…" : "Save prompt"}</Button>
        <span className="text-xs text-slate-400">Applies to every new comment generated — for you and co-teachers.</span>
      </div>
    </div>
  );
}
