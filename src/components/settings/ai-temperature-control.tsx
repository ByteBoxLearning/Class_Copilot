"use client";

import { useState, useTransition } from "react";
import { Check, RotateCcw, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveAiTemperatures } from "@/actions/settings";
import { DEFAULT_AI_TEMPS, AI_PROVIDER_ORDER, AI_PROVIDER_META } from "@/lib/ai/engines";

// One temperature box per provider (each 0-1). Higher = fuller/more varied;
// lower = terser/more conservative. Applies to every AI feature that calls
// runModel() — this is a provider-level knob, not per-feature.
export function AiTemperatureControl({ temps }: { temps: Record<string, number> }) {
  const [vals, setVals] = useState<Record<string, string>>(
    () => Object.fromEntries(AI_PROVIDER_ORDER.map((p) => [p, String(temps[p] ?? DEFAULT_AI_TEMPS[p])])),
  );
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const set = (key: string, v: string) => setVals((p) => ({ ...p, [key]: v }));

  function save() {
    const map: Record<string, number> = {};
    for (const p of AI_PROVIDER_ORDER) {
      const n = parseFloat(vals[p]);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        toast(`${AI_PROVIDER_META[p].label}: enter a value between 0 and 1.`, "error");
        return;
      }
      map[p] = n;
    }
    start(async () => {
      const res = await saveAiTemperatures(map);
      if (res.ok) toast("AI temperatures saved.");
      else toast(res.error || "Could not save.", "error");
    });
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Thermometer className="h-4 w-4 text-rose-500" /> Generation temperature <span className="font-normal text-slate-400">(per provider)</span>
        </p>
        <button
          type="button"
          onClick={() => setVals(Object.fromEntries(AI_PROVIDER_ORDER.map((p) => [p, String(DEFAULT_AI_TEMPS[p])])))}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary"
        >
          <RotateCcw className="h-3 w-3" /> Reset defaults
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {AI_PROVIDER_ORDER.map((p) => (
          <label key={p} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600">{AI_PROVIDER_META[p].label.replace(/\s*—.*$/, "")}</span>
            <input
              type="number" min={0} max={1} step={0.05} value={vals[p]}
              onChange={(ev) => set(p, ev.target.value)}
              className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
              placeholder="0–1"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}><Check className="h-4 w-4" /> {pending ? "Saving…" : "Save temperatures"}</Button>
        <span className="text-xs text-slate-400">Each must be between 0 and 1. Higher = more varied output; lower = more conservative.</span>
      </div>
    </div>
  );
}
