"use client";

import { useState, useTransition } from "react";
import { KeyRound, Check, Trash2, Globe, Server } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveApiKey, removeApiKey } from "@/actions/settings";
import type { KeyStatus } from "@/lib/settings";

export function ApiKeysForm({ statuses }: { statuses: KeyStatus[] }) {
  return (
    <div className="space-y-4">
      {statuses.map((s) => (
        <KeyRow key={s.name} status={s} />
      ))}
    </div>
  );
}

function KeyRow({ status }: { status: KeyStatus }) {
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function save() {
    if (value.trim().length < 8) { toast("Paste the full key first.", "error"); return; }
    start(async () => {
      const res = await saveApiKey(status.name, value);
      if (res.ok) { toast(`${status.label} key saved.`); setValue(""); }
      else toast(res.error || "Could not save.", "error");
    });
  }
  function clear() {
    start(async () => {
      const res = await removeApiKey(status.name);
      if (res.ok) toast(`${status.label} key cleared.`);
      else toast(res.error || "Could not clear.", "error");
    });
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-800">{status.label}</span>
          <code className="text-xs text-slate-400">{status.name}</code>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1 text-xs text-slate-400">{status.hint}</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.source === "none" ? "Paste key…" : "Paste a new key to replace…"}
          className="flex-1"
          autoComplete="off"
        />
        <Button onClick={save} disabled={pending || !value.trim()}>
          <Check className="h-4 w-4" /> {pending ? "Saving…" : "Save"}
        </Button>
        {status.source === "website" && (
          <Button variant="outline" onClick={clear} disabled={pending} title="Remove the saved key (falls back to env var if set)">
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: KeyStatus }) {
  if (status.source === "website")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
        <Globe className="h-3 w-3" /> Set here · {status.masked}
      </span>
    );
  if (status.source === "env")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
        <Server className="h-3 w-3" /> From env · {status.masked}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
      Not set
    </span>
  );
}
