"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { bulkAddAllowedEmails, removeAllowedEmail } from "@/actions/allowed-emails";
import type { AllowedEmailRow } from "@/actions/allowed-emails";

// Admin-managed roster allowlist (see src/lib/allowed-email.ts). Once at
// least one STAFF row exists, /signup only accepts emails on that list;
// once at least one STUDENT row exists, a Student record's email (manual
// entry or roster import) must match one too. Empty lists mean the domain
// check (if ALLOWED_EMAIL_DOMAIN is set) is the only gate — bootstrap-
// friendly so preloading a roster is optional, not required, to get started.
export function RosterAllowlistForm({ rows, domain }: { rows: AllowedEmailRow[]; domain: string | null }) {
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        {domain
          ? <>Sign-up and student portal linking are restricted to <strong>@{domain}</strong> addresses.</>
          : <>No email domain restriction is configured — set <code className="font-mono">ALLOWED_EMAIL_DOMAIN</code> in your environment to require a school domain.</>}
        {" "}Preloading a list below adds a second check: only emails on the matching list can sign up (Staff) or link a student portal login via Google (Student).
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <RosterList title="Approved staff emails" role="STAFF" rows={rows.filter((r) => r.role === "STAFF")} />
        <RosterList title="Approved student emails" role="STUDENT" rows={rows.filter((r) => r.role === "STUDENT")} />
      </div>
    </div>
  );
}

function RosterList({ title, role, rows }: { title: string; role: "STAFF" | "STUDENT"; rows: AllowedEmailRow[] }) {
  const [raw, setRaw] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function add() {
    if (!raw.trim()) return;
    start(async () => {
      const res = await bulkAddAllowedEmails(role, raw);
      if (res.ok) { toast(`Added ${res.added} email(s)${res.skipped ? ` (${res.skipped} already listed/invalid)` : ""}.`); setRaw(""); }
      else toast(res.error || "Could not add.", "error");
    });
  }
  function remove(id: string) {
    start(async () => {
      const res = await removeAllowedEmail(id);
      if (!res.ok) toast(res.error || "Could not remove.", "error");
    });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <Label>{title} <span className="font-normal text-slate-400">({rows.length} on file)</span></Label>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Paste emails — one per line, or comma-separated"
        className="mt-2 h-20 w-full resize-y rounded-md border border-border p-2 font-mono text-xs text-slate-700"
      />
      <Button size="sm" className="mt-2" onClick={add} disabled={pending || !raw.trim()}>
        <ShieldCheck className="h-3.5 w-3.5" /> Add to list
      </Button>

      {rows.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto border-t border-border pt-3 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-slate-600">
              <span className="truncate font-mono">{r.email}</span>
              <div className="flex items-center gap-2 shrink-0">
                {r.claimed && <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">in use</span>}
                <button type="button" onClick={() => remove(r.id)} disabled={pending} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
