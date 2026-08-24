"use client";

import { useMemo, useState } from "react";
import { Sparkles, Copy, Check, Loader2 } from "lucide-react";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { generateStudentComment } from "@/actions/comments";
import { formatTokens, formatCostUsd, AI_PROVIDER_ORDER, AI_PROVIDER_META, type AiModelChoice } from "@/lib/ai/engines";
import { localDayString } from "@/lib/utils";

type StudentOption = { id: string; displayName: string };

function daysAgoString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function CommentGenerator({
  classId,
  students,
  aiModels,
}: {
  classId: string;
  students: StudentOption[];
  aiModels: AiModelChoice[];
}) {
  const { toast } = useToast();
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [from, setFrom] = useState(daysAgoString(90));
  const [to, setTo] = useState(localDayString());
  const [model, setModel] = useState(() => aiModels.find((m) => !m.locked)?.value ?? aiModels[0]?.value ?? "");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [usageLine, setUsageLine] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const anyUsable = useMemo(() => aiModels.some((m) => !m.locked), [aiModels]);

  async function generate() {
    if (!studentId) { toast("Pick a student first.", "error"); return; }
    if (from > to) { toast("The start date must be before the end date.", "error"); return; }
    setGenerating(true);
    setUsageLine(null);
    const res = await generateStudentComment(studentId, classId, from, to, model);
    setGenerating(false);
    if (!res.ok) { toast(res.error, "error"); return; }
    setDraft(res.text);
    if (res.usage) {
      const cost = res.estCostUsd !== null ? formatCostUsd(res.estCostUsd) : null;
      setUsageLine(`${formatTokens(res.usage.totalTokens)} tokens${cost ? ` · ${cost}` : ""}`);
    }
    setCopied(false);
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    toast("Copied to clipboard.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <Field label="Student">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {students.length === 0 && <option value="">No students enrolled</option>}
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.displayName}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-full rounded-md border border-input px-3 text-sm" />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-full rounded-md border border-input px-3 text-sm" />
          </Field>
        </div>

        <Field label="AI engine" hint={!anyUsable ? "No AI engine is configured yet — an admin needs to add a provider key in Admin → Settings." : undefined}>
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            {AI_PROVIDER_ORDER.map((provider) => {
              const group = aiModels.filter((m) => m.provider === provider);
              if (!group.length) return null;
              return (
                <optgroup key={provider} label={AI_PROVIDER_META[provider].label}>
                  {group.map((m) => (
                    <option key={m.value} value={m.value} disabled={m.locked}>
                      {m.label}{m.locked ? (m.lockReason === "needs key" ? " (needs key)" : " (off)") : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </Field>

        <Button onClick={generate} disabled={generating || !studentId || !anyUsable} className="w-full">
          {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate comment</>}
        </Button>

        <p className="flex items-start gap-1.5 text-xs text-slate-400">
          Draws only on this student&apos;s Monitor check-ins and mastery evidence within the date range above. Nothing here is saved —
          review, edit, and copy the draft into your report-card system.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Draft</p>
          {usageLine && <span className="text-xs text-slate-400">{usageLine}</span>}
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Generate a draft, then edit it freely before copying it out."
          className="h-72 resize-y font-sans text-sm"
        />
        <div className="flex justify-end">
          <Button variant="outline" onClick={copy} disabled={!draft}>
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
