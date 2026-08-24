"use client";

import { useState, useActionState, useEffect, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus, Copy, Check, Globe, Power } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { createUser, setAllClientsAccess, setUserActive, type CreateUserResult } from "@/actions/users";

type AssistantRow = {
  id: string; name: string; email: string; active: boolean;
  allClientsAccess: boolean; pendingReset: boolean; classIds: string[];
};
type ClassOpt = { id: string; name: string };

export function AssistantManager({
  assistants,
  classes,
}: {
  assistants: AssistantRow[];
  classes: ClassOpt[];
  currentUserId: string;
}) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [pending, start] = useTransition();
  const className = new Map(classes.map((c) => [c.id, c.name]));

  function toggleAllAccess(id: string, value: boolean) {
    start(async () => {
      const res = await setAllClientsAccess(id, value);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
    });
  }
  function toggleActive(id: string, value: boolean) {
    start(async () => {
      const res = await setUserActive(id, value);
      if (!res.ok) toast(res.error ?? "Failed.", "error");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add assistant</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Classes</TH>
              <TH>All-class access</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {assistants.map((a) => (
              <TR key={a.id}>
                <TD>
                  <div className="font-medium text-slate-800">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.email}{a.pendingReset ? " · pending first login" : ""}</div>
                </TD>
                <TD>
                  {a.allClientsAccess ? (
                    <span className="text-xs text-slate-500">All classes</span>
                  ) : a.classIds.length === 0 ? (
                    <span className="text-xs text-amber-600">None assigned</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {a.classIds.slice(0, 3).map((cid) => (
                        <Badge key={cid} color="bg-slate-100 text-slate-600 border-slate-200">{className.get(cid) ?? "?"}</Badge>
                      ))}
                      {a.classIds.length > 3 && <span className="text-xs text-slate-400">+{a.classIds.length - 3}</span>}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-slate-400">
                    Class assignment management is coming soon.
                  </div>
                </TD>
                <TD>
                  <button
                    onClick={() => toggleAllAccess(a.id, !a.allClientsAccess)}
                    disabled={pending}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${a.allClientsAccess ? "border-teal-200 bg-teal-50 text-teal-700" : "border-border text-slate-500 hover:bg-accent"}`}
                    title="Grant/revoke access to every class"
                  >
                    <Globe className="h-3.5 w-3.5" /> {a.allClientsAccess ? "On" : "Off"}
                  </button>
                </TD>
                <TD>
                  <button
                    onClick={() => toggleActive(a.id, !a.active)}
                    disabled={pending}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${a.active ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}
                  >
                    <Power className="h-3.5 w-3.5" /> {a.active ? "Active" : "Inactive"}
                  </button>
                </TD>
              </TR>
            ))}
            {assistants.length === 0 && (
              <TR><TD className="py-6 text-center text-sm text-slate-400" >No assistants yet. Add one to get started.</TD></TR>
            )}
          </tbody>
        </Table>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add an assistant">
        <AddAssistantForm onDone={() => setAddOpen(false)} />
      </Modal>
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><UserPlus className="h-4 w-4" /> {pending ? "Creating…" : "Create assistant"}</Button>;
}

function AddAssistantForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [state, formAction] = useActionState<CreateUserResult, FormData>(createUser, { ok: false });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.error) toast(state.error, "error");
  }, [state, toast]);

  if (state.ok && state.tempPassword) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">Assistant created. Share this one-time password with them:</p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-slate-50 p-2">
          <code className="flex-1 select-all text-sm">{state.tempPassword}</code>
          <button onClick={() => { navigator.clipboard.writeText(state.tempPassword!); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-slate-400 hover:text-slate-700">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-slate-500">Class assignment management is coming soon.</p>
        <div className="flex justify-end pt-1"><Button onClick={onDone}>Done</Button></div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="role" value="ASSISTANT" />
      <Field label="Name" required error={state.fieldErrors?.name}>
        <Input name="name" required autoFocus />
      </Field>
      <Field label="Email (login)" required error={state.fieldErrors?.email}>
        <Input name="email" type="email" required />
      </Field>
      <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-500">
        A one-time password is generated on screen. They&apos;ll set their own on first login.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <SubmitBtn />
      </div>
    </form>
  );
}
