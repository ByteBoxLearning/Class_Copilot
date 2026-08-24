"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Upload, FileText, Cloud, ArrowRight, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { parseCsv } from "@/lib/import/csv";
import type { ImportSheet } from "@/lib/import/types";
import { guessMapping } from "@/lib/standards-import/map";
import { FIELD_LABELS, type ColumnMapping, type FieldKey, type StandardsImportPreviewRow } from "@/lib/standards-import/types";
import { previewStandardsImport, importStandards } from "@/actions/standards-import";

type Step = "source" | "map" | "confirm";

const STATUS_BADGE: Record<StandardsImportPreviewRow["status"], { label: string; color: string }> = {
  NEW: { label: "New", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  UPDATE_EXISTING: { label: "Updates existing", color: "bg-sky-100 text-sky-800 border-sky-200" },
  ERROR: { label: "Error", color: "bg-red-100 text-red-800 border-red-200" },
};

// Mirrors src/components/roster/import-wizard.tsx's Source -> Map -> Confirm
// shape exactly, for Standards instead of Students. Same CSV/paste-only file
// support (no binary .xlsx parsing) and the same disabled "Connect Google
// Sheets — coming soon" card, since pasting a Google Sheets/Excel selection
// already works via parseCsv's tab-delimiter sniffing.
export function StandardsImportWizard({ classId, className }: { classId: string; className: string }) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("source");
  const [sheet, setSheet] = useState<ImportSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<StandardsImportPreviewRow[] | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; errors: number } | null>(null);

  function loadSheet(s: ImportSheet) {
    setSheet(s);
    setMapping(guessMapping(s.headers));
    setStep("map");
  }

  function handleFile(file: File) {
    file.text().then((text) => {
      if (/�/.test(text.slice(0, 200))) {
        toast("Looks like this file isn't UTF-8 — in Excel use Save As → CSV UTF-8, then re-upload.", "error");
        return;
      }
      loadSheet(parseCsv(text, file.name));
    });
  }

  function handlePaste() {
    if (!pasteText.trim()) return;
    loadSheet(parseCsv(pasteText, "Pasted text"));
  }

  function goToConfirm() {
    if (!sheet) return;
    start(async () => {
      const res = await previewStandardsImport(classId, sheet, mapping);
      if (!res.ok) { toast(res.error, "error"); return; }
      setPreview(res.rows);
      setStep("confirm");
    });
  }

  function commitImport() {
    if (!sheet) return;
    start(async () => {
      const res = await importStandards(classId, sheet, mapping);
      if (!res.ok) { toast(res.error, "error"); return; }
      setResult(res);
      toast(`Imported ${res.created + res.updated} standards.`);
    });
  }

  const errorCount = preview?.filter((r) => r.status === "ERROR").length ?? 0;
  const newCount = preview?.filter((r) => r.status === "NEW").length ?? 0;
  const updateCount = preview?.filter((r) => r.status === "UPDATE_EXISTING").length ?? 0;

  if (result) {
    return (
      <Card>
        <CardContent className="space-y-3 py-6 text-center">
          <Check className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="text-sm text-slate-700">
            Imported into <span className="font-medium">{className}</span>: {result.created} new, {result.updated}{" "}
            updated{result.errors ? `, ${result.errors} skipped with errors` : ""}. Newly imported standards aren&apos;t
            scoped to specific practice questions yet — use &quot;Map questions to standards&quot; on the Standards
            page to finish that.
          </p>
          <Link href="/classes/standards"><Button>Back to standards</Button></Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <StepIndicator step={step} />

      {step === "source" && (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-lg border border-border p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-700"><Upload className="h-4 w-4" /> Upload a CSV file</p>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
                />
                <p className="text-xs text-slate-400">Exported from Google Sheets, Excel, or any spreadsheet tool.</p>
              </div>

              <div className="space-y-2 rounded-lg border border-border p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-700"><FileText className="h-4 w-4" /> Paste from a spreadsheet</p>
                <Textarea
                  rows={4}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder={"title\tcode\tpractice source\tpractice unit\nScientific Notation\t2.2A\tINTRO_CHEM\t2"}
                />
                <Button size="sm" onClick={handlePaste} disabled={!pasteText.trim()}>Use pasted data</Button>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-dashed border-border p-4 opacity-70">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-500"><Cloud className="h-4 w-4" /> Connect Google Sheets</p>
              <p className="text-xs text-slate-400">
                Not set up yet — needs a Google Cloud OAuth client. Copy your sheet's cells and use "Paste from a
                spreadsheet" for now (that already works for data copied out of Sheets or Excel).
              </p>
              <Button size="sm" variant="outline" disabled>Connect Google (coming soon)</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "map" && sheet && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <p className="text-sm text-slate-500">
              Map each column from <span className="font-medium">{sheet.sourceLabel}</span> to a standard field. Only
              "Title" is required. Unmapped columns are skipped.
            </p>
            <div className="space-y-2">
              {sheet.headers.map((header, i) => (
                <div key={i} className="grid grid-cols-1 items-center gap-2 rounded-md border border-border p-2.5 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{header || `Column ${i + 1}`}</p>
                    <p className="truncate text-xs text-slate-400">
                      e.g. {sheet.rows.slice(0, 2).map((r) => r[i]).filter(Boolean).join(", ") || "—"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <Select
                      value={mapping[i] ?? "skip"}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [i]: e.target.value as FieldKey }))}
                    >
                      {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                        <option key={k} value={k}>{FIELD_LABELS[k]}</option>
                      ))}
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-1">
              <Button variant="outline" onClick={() => setStep("source")}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={goToConfirm} disabled={pending}>{pending ? "Checking…" : "Preview"} <ArrowRight className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "confirm" && preview && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color="bg-emerald-100 text-emerald-800 border-emerald-200">{newCount} new</Badge>
              <Badge color="bg-sky-100 text-sky-800 border-sky-200">{updateCount} updates existing</Badge>
              {errorCount > 0 && <Badge color="bg-red-100 text-red-800 border-red-200">{errorCount} errors — will be skipped</Badge>}
            </div>

            <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Practice unit</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.rowIndex} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 text-xs text-slate-400">{r.rowIndex + 2}</td>
                      <td className="px-3 py-2 text-slate-700">{r.title || <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {r.externalUnitSource && r.externalUnitId ? `${r.externalUnitSource} #${r.externalUnitId}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Badge color={STATUS_BADGE[r.status].color}>{STATUS_BADGE[r.status].label}</Badge>
                        {r.error && <span className="ml-1.5 text-xs text-red-600">{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {errorCount > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Rows with errors will be skipped — fix them in your source file and re-import if needed.</p>
            )}

            <div className="flex justify-between pt-1">
              <Button variant="outline" onClick={() => setStep("map")}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={commitImport} disabled={pending}>{pending ? "Importing…" : `Import ${newCount + updateCount} standards`}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "source", label: "Source" },
    { key: "map", label: "Map columns" },
    { key: "confirm", label: "Confirm" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span className={i <= activeIndex ? "font-medium text-primary" : "text-slate-400"}>{i + 1}. {s.label}</span>
          {i < steps.length - 1 && <span className="text-slate-300">→</span>}
        </div>
      ))}
    </div>
  );
}
