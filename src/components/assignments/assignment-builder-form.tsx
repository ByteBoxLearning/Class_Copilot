"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Save } from "lucide-react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { generateAssignment, saveAssignment } from "@/actions/assignments";
import { SectionEditor } from "./section-editor";
import { MaterialManager, type MaterialRow } from "./material-manager";
import { ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES } from "@/lib/enums";
import {
  formatTokens, formatCostUsd, AI_PROVIDER_ORDER, AI_PROVIDER_META,
  type AiModelChoice, type TokenUsage,
} from "@/lib/ai/engines";
import { emptyAssignmentDoc, type AssignmentDoc } from "@/lib/assignments/types";

type StandardOption = { id: string; code: string | null; title: string };

type ExistingAssignment = {
  id: string;
  title: string;
  assignmentType: string;
  summary: string;
  status: string;
  standardIds: string[];
  doc: AssignmentDoc;
  source: string;
  materials: MaterialRow[];
};

export function AssignmentBuilderForm({
  classId,
  standards,
  aiModels,
  existing,
}: {
  classId: string;
  standards: StandardOption[];
  aiModels: AiModelChoice[];
  existing?: ExistingAssignment;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [title, setTitle] = useState(existing?.title ?? "");
  const [assignmentType, setAssignmentType] = useState(existing?.assignmentType ?? "WORKSHEET");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [status, setStatus] = useState(existing?.status ?? "DRAFT");
  const [standardIds, setStandardIds] = useState<Set<string>>(new Set(existing?.standardIds ?? []));
  const [doc, setDoc] = useState<AssignmentDoc>(existing?.doc ?? emptyAssignmentDoc());
  const [gradeLevel, setGradeLevel] = useState(existing?.doc.gradeLevel ?? "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(existing?.doc.estimatedMinutes ? String(existing.doc.estimatedMinutes) : "");

  const [teacherNotes, setTeacherNotes] = useState("");
  const [sourceMode, setSourceMode] = useState<"NONE" | "PASTE" | "MATERIAL">("NONE");
  const [pastedText, setPastedText] = useState("");
  const [sourceMaterialId, setSourceMaterialId] = useState<string | null>(null);
  const [sourceMaterialName, setSourceMaterialName] = useState<string | null>(null);
  const [model, setModel] = useState(() => aiModels.find((m) => !m.locked)?.value ?? aiModels[0]?.value ?? "");

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastEngine, setLastEngine] = useState<string | null>(existing?.source !== "MANUAL" ? existing?.source ?? null : null);
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [source, setSource] = useState(existing?.source ?? "MANUAL");

  const anyUsable = useMemo(() => aiModels.some((m) => !m.locked), [aiModels]);

  function toggleStandard(id: string) {
    setStandardIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function useMaterialAsSource(materialId: string, fileName: string) {
    setSourceMode("MATERIAL");
    setSourceMaterialId(materialId);
    setSourceMaterialName(fileName);
  }

  async function generate() {
    if (standardIds.size === 0) { toast("Pick at least one standard first.", "error"); return; }
    setGenerating(true);
    const res = await generateAssignment(
      classId,
      [...standardIds],
      assignmentType,
      teacherNotes,
      sourceMode === "MATERIAL"
        ? { text: null, materialId: sourceMaterialId }
        : sourceMode === "PASTE"
          ? { text: pastedText, materialId: null }
          : { text: null, materialId: null },
      model,
    );
    setGenerating(false);
    if (!res.ok) { toast(res.error, "error"); return; }

    setDoc(res.doc);
    if (res.doc.title) setTitle(res.doc.title);
    if (res.doc.summary) setSummary(res.doc.summary);
    if (res.doc.gradeLevel) setGradeLevel(res.doc.gradeLevel);
    if (res.doc.estimatedMinutes) setEstimatedMinutes(String(res.doc.estimatedMinutes));
    setSource(sourceMode === "NONE" ? "AI" : "AI_IMPROVED");
    setLastEngine(model);
    setLastUsage(res.usage);
    setLastCost(res.estCostUsd);
    toast("Draft generated — review and edit below before saving.");
  }

  async function save() {
    if (!title.trim()) { toast("Give the assignment a title.", "error"); return; }
    if (standardIds.size === 0) { toast("Pick at least one standard first.", "error"); return; }
    setSaving(true);
    const fullDoc: AssignmentDoc = {
      ...doc,
      title: title.trim(),
      summary: summary.trim(),
      gradeLevel: gradeLevel.trim() || undefined,
      estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      standardCodes: standards.filter((s) => standardIds.has(s.id) && s.code).map((s) => s.code as string),
    };
    const res = await saveAssignment({
      id: existing?.id,
      classId,
      title: title.trim(),
      assignmentType,
      summary: summary.trim(),
      status,
      standardIds: [...standardIds],
      doc: fullDoc,
      source,
      engine: lastEngine,
      usage: lastUsage,
      estCostUsd: lastCost,
    });
    setSaving(false);
    if (!res.ok) { toast(res.error || "Could not save.", "error"); return; }
    toast("Assignment saved.");
    if (!existing) router.push(`/classes/assignments/${res.id}`);
    else router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fractions Practice — Adding Unlike Denominators" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value)}>
                {ASSIGNMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {ASSIGNMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>

          <Field label="Summary">
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-[70px]" placeholder="1-2 sentences describing what this covers." />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Grade level (optional)">
              <Input value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} placeholder="e.g. Grade 6" />
            </Field>
            <Field label="Estimated minutes (optional)">
              <Input type="number" min={0} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Standards <span className="font-normal text-slate-400">(pick at least one)</span></p>
            {standards.length === 0 ? (
              <p className="text-xs text-slate-400">No standards defined for this class yet.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                {standards.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-accent">
                    <input type="checkbox" checked={standardIds.has(s.id)} onChange={() => toggleStandard(s.id)} />
                    <span className="text-sm text-slate-700">{s.code ? `[${s.code}] ` : ""}{s.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Field label="Source material" hint="Improve an existing worksheet/quiz instead of generating from scratch.">
            <div className="flex gap-2">
              {(["NONE", "PASTE", "MATERIAL"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSourceMode(m)}
                  disabled={m === "MATERIAL" && !existing}
                  className={`rounded-md border px-2.5 py-1 text-xs disabled:opacity-40 ${sourceMode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-slate-600 hover:bg-accent"}`}
                >
                  {m === "NONE" ? "None (from scratch)" : m === "PASTE" ? "Paste text" : "Attached file"}
                </button>
              ))}
            </div>
          </Field>

          {sourceMode === "PASTE" && (
            <Textarea value={pastedText} onChange={(e) => setPastedText(e.target.value)} className="min-h-[120px]" placeholder="Paste the existing worksheet/quiz text here…" />
          )}
          {sourceMode === "MATERIAL" && (
            <p className="rounded-md border border-border bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {sourceMaterialName ? <>Using <strong>{sourceMaterialName}</strong> as the source. Pick a different one below in Attachments (&quot;Use as source&quot;).</> : "Pick a file below in Attachments (\"Use as source\")."}
            </p>
          )}

          <Field label="Teacher notes / constraints (optional)" hint="Guidance for this generation only — not saved with the assignment.">
            <Textarea value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)} className="min-h-[70px]" placeholder="e.g. keep it to 10 questions, multiple choice only" />
          </Field>

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

          <Button onClick={generate} disabled={generating || !anyUsable} className="w-full">
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate draft</>}
          </Button>
          {lastUsage && (
            <p className="text-xs text-slate-400">
              Last generation: {formatTokens(lastUsage.totalTokens)} tokens{lastCost !== null ? ` · ${formatCostUsd(lastCost)}` : ""}
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Sections</p>
        <SectionEditor sections={doc.sections} onChange={(sections) => setDoc((d) => ({ ...d, sections }))} />
      </div>

      {existing && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Attachments</p>
          <MaterialManager assignmentId={existing.id} materials={existing.materials} onUseAsSource={useMaterialAsSource} />
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save assignment</>}
        </Button>
      </div>
    </div>
  );
}
