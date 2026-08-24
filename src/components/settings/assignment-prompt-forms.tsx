"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { saveAssignmentGeneratePrompt, saveAssignmentImprovePrompt } from "@/actions/settings";
import { DEFAULT_ASSIGNMENT_GENERATE_PROMPT, DEFAULT_ASSIGNMENT_IMPROVE_PROMPT } from "@/lib/assignments/prompt-defaults";

function PromptEditor({
  label,
  prompt,
  defaultPrompt,
  placeholderNote,
  save,
}: {
  label: string;
  prompt: string;
  defaultPrompt: string;
  placeholderNote: React.ReactNode;
  save: (prompt: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [p, setP] = useState(prompt);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function onSave() {
    start(async () => {
      const res = await save(p);
      if (res.ok) toast("Prompt saved.");
      else toast(res.error || "Could not save.", "error");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <button type="button" onClick={() => setP(defaultPrompt)} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary">
          <RotateCcw className="h-3 w-3" /> Reset to default
        </button>
      </div>
      <textarea value={p} onChange={(e) => setP(e.target.value)} className="h-64 w-full resize-y rounded-md border border-border p-3 font-mono text-xs text-slate-700" />
      <p className="text-xs text-slate-400">{placeholderNote}</p>
      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={pending}><Check className="h-4 w-4" /> {pending ? "Saving…" : "Save prompt"}</Button>
      </div>
    </div>
  );
}

// Admin editors for the Assignment Builder's two prompts. The JSON contract
// (the "sections" array shape) is guarded on save server-side; these just
// guard that the required placeholders survive an edit.
export function AssignmentGeneratePromptForm({ prompt }: { prompt: string }) {
  return (
    <PromptEditor
      label="Generate from scratch — what the AI receives with no source material"
      prompt={prompt}
      defaultPrompt={DEFAULT_ASSIGNMENT_GENERATE_PROMPT}
      placeholderNote={
        <>Must keep <span className="font-mono">{"{{ASSIGNMENT_TYPE}}"}</span>, <span className="font-mono">{"{{STANDARDS}}"}</span>, and{" "}
          <span className="font-mono">{"{{CLASS_CONTEXT}}"}</span> — the app fills these in. Keep the JSON shape with its{" "}
          <span className="font-mono">&quot;sections&quot;</span> array — the app parses it.</>
      }
      save={saveAssignmentGeneratePrompt}
    />
  );
}

export function AssignmentImprovePromptForm({ prompt }: { prompt: string }) {
  return (
    <PromptEditor
      label="Improve existing material — what the AI receives with a source document attached"
      prompt={prompt}
      defaultPrompt={DEFAULT_ASSIGNMENT_IMPROVE_PROMPT}
      placeholderNote={
        <>Must also keep <span className="font-mono">{"{{SOURCE_MATERIAL}}"}</span> (the uploaded/pasted text) — this prompt is meaningless without it.</>
      }
      save={saveAssignmentImprovePrompt}
    />
  );
}
