"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Download, Trash2, FileText, Sparkles } from "lucide-react";
import { Field, Select, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/ui/modal";
import { uploadAssignmentMaterial, deleteAssignmentMaterial } from "@/actions/materials";
import { ASSIGNMENT_MATERIAL_KINDS, labelOf } from "@/lib/enums";
import type { ActionResult } from "@/actions/types";

export type MaterialRow = {
  id: string;
  fileName: string;
  kind: string;
  mimeType: string | null;
  sizeBytes: number | null;
  hasExtractedText: boolean;
  createdAt: string;
};

function formatBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function UploadSubmit() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="sm" disabled={pending}>{pending ? "Uploading…" : "Upload"}</Button>;
}

export function MaterialManager({
  assignmentId,
  materials,
  onUseAsSource,
}: {
  assignmentId: string;
  materials: MaterialRow[];
  onUseAsSource?: (materialId: string, fileName: string) => void;
}) {
  const { toast } = useToast();
  const [state, formAction] = useActionState<ActionResult, FormData>(uploadAssignmentMaterial.bind(null, assignmentId), { ok: false });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (state.ok) toast("File uploaded.");
    else if (state.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteAssignmentMaterial(confirmDelete);
    if (res.ok) toast("File deleted.");
    else toast(res.error || "Could not delete.", "error");
    setConfirmDelete(null);
  }

  return (
    <div className="space-y-3">
      {materials.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-slate-400">No files attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {materials.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <a href={`/api/materials/${m.id}`} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-slate-700 hover:underline">
                    {m.fileName}
                  </a>
                  <p className="text-[11px] text-slate-400">
                    {formatBytes(m.sizeBytes)}{m.hasExtractedText ? " · text extracted" : m.mimeType === "application/pdf" ? " · PDF, not text-extracted" : ""}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge color="bg-slate-100 text-slate-600 border-slate-200">{labelOf(ASSIGNMENT_MATERIAL_KINDS, m.kind)}</Badge>
                {onUseAsSource && m.hasExtractedText && (
                  <button
                    type="button"
                    onClick={() => onUseAsSource(m.id, m.fileName)}
                    className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100"
                    title="Use this file's extracted text as the source material for an Improve generation"
                  >
                    <Sparkles className="h-3 w-3" /> Use as source
                  </button>
                )}
                <a href={`/api/materials/${m.id}`} download className="rounded p-1.5 text-slate-400 hover:bg-accent hover:text-slate-600" title="Download">
                  <Download className="h-4 w-4" />
                </a>
                <button type="button" onClick={() => setConfirmDelete(m.id)} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-2.5">
        <Field label="File" className="min-w-[200px]">
          <Input name="file" type="file" accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg" required className="h-9 py-1.5" />
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue="ORIGINAL" className="h-9">
            {ASSIGNMENT_MATERIAL_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes (optional)" className="min-w-[160px]">
          <Input name="versionNotes" placeholder="e.g. original worksheet" className="h-9" />
        </Field>
        <UploadSubmit />
      </form>
      <p className="text-[11px] text-slate-400">
        .docx/.txt/.md are text-extracted for use as AI source material. PDFs and images are stored but not extracted — paste their text instead if you want to improve from them.
      </p>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete this file?"
        message="This removes the file from storage. This can't be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
