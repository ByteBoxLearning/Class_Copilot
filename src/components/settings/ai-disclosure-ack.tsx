"use client";

import { useTransition } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { saveAiDisclosureAck } from "@/actions/settings";

// Every AI feature (End-of-Term Comments, Assignment Builder, Practice Mode
// scoring/coaching/chat) sends some student data to a third-party provider's
// API — see src/lib/ai/run-model.ts, which refuses to call any provider
// until this is acknowledged. Names are redacted before sending where
// practical (see src/lib/comments/summary.ts / daily-check-feedback.ts), but
// the underlying content (notes, responses, standards evidence) still
// leaves the building — an admin needs to knowingly accept that trade-off.
export function AiDisclosureAck({ acknowledged }: { acknowledged: boolean }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function toggle(next: boolean) {
    start(async () => {
      const res = await saveAiDisclosureAck(next);
      if (res.ok) toast(next ? "AI features enabled." : "AI features disabled.");
      else toast(res.error || "Could not save.", "error");
    });
  }

  return (
    <div className={`rounded-lg border p-4 ${acknowledged ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-3">
        {acknowledged ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
        <div className="space-y-2 text-sm">
          <p className="text-slate-700">
            Turning on any AI feature sends some student data — aggregated engagement/mastery summaries, a private teacher note, or a
            practice response — to whichever third-party AI provider's key is configured (Gemini, OpenAI, Anthropic, or OpenRouter).
            Student and class names are replaced with a placeholder before sending where possible, but the underlying content is not.
          </p>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={acknowledged} onChange={(e) => toggle(e.target.checked)} disabled={pending} className="h-4 w-4" />
            I understand, and I'm turning AI features on for this workspace.
          </label>
          {!acknowledged && <p className="text-xs text-amber-700">Until this is checked, every AI feature stays disabled — the same as having no key configured.</p>}
        </div>
      </div>
    </div>
  );
}
