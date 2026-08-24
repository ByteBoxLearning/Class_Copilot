"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveAiEnabledModels } from "@/actions/settings";
import { AI_PROVIDER_ORDER, AI_PROVIDER_META, type AiModelChoice } from "@/lib/ai/engines";

// Admin control: tick which AI engines/models are offered across every AI
// feature in the app (End-of-Term Comments now, Assignment Builder later). A
// model also needs its provider key (shown as "needs key") before anyone can
// actually use it — the tick just decides whether it's offered at all.
export function AiModelToggles({ models }: { models: AiModelChoice[] }) {
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(models.filter((m) => m.enabled).map((m) => m.value)),
  );
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const toggle = (v: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });

  function save() {
    start(async () => {
      const res = await saveAiEnabledModels([...enabled]);
      if (res.ok) toast("AI engines updated — applies everywhere in the app.");
      else toast(res.error || "Could not save.", "error");
    });
  }

  return (
    <div className="space-y-4">
      {AI_PROVIDER_ORDER.map((provider) => {
        const group = models.filter((m) => m.provider === provider);
        if (!group.length) return null;
        const hasKey = group[0].hasKey;
        return (
          <div key={provider} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">{AI_PROVIDER_META[provider].label}</p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                  hasKey ? "bg-green-50 text-green-700 border border-green-200" : "bg-slate-100 text-slate-500 border border-slate-200"
                }`}
              >
                {hasKey ? <><Check className="h-3 w-3" /> Key set</> : <><KeyRound className="h-3 w-3" /> No key</>}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.map((m) => {
                const on = enabled.has(m.value);
                return (
                  <label key={m.value} className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 hover:bg-accent">
                    <input type="checkbox" checked={on} onChange={() => toggle(m.value)} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-slate-800">{m.label}</span>
                        {!m.free && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 border border-amber-200">paid</span>}
                        {on && !m.hasKey && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400"><Lock className="h-2.5 w-2.5" /> needs key</span>
                        )}
                      </span>
                      {m.note && <span className="mt-0.5 block text-xs text-slate-500">{m.note}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}><Check className="h-4 w-4" /> {pending ? "Saving…" : "Save engines"}</Button>
        <span className="text-xs text-slate-400">Unticked or key-less engines show locked 🔒 wherever an engine picker appears.</span>
      </div>
    </div>
  );
}
