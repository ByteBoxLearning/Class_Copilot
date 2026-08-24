"use client";

import { useState, useTransition } from "react";
import { Link2, Copy, Check, ShieldOff, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { generateStudentInviteLink, cancelStudentInvite, revokeStudentLogin } from "@/actions/students";

type LinkedUser = { id: string; name: string; email: string; active: boolean } | null;
type PendingInvite = { token: string; expiresAt: string } | null;

function inviteUrl(token: string): string {
  return typeof window === "undefined" ? `/invite/${token}` : `${window.location.origin}/invite/${token}`;
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function StudentInvite({
  studentId,
  linkedUser,
  pendingInvite,
}: {
  studentId: string;
  linkedUser: LinkedUser;
  pendingInvite: PendingInvite;
}) {
  const { toast } = useToast();
  const [invite, setInvite] = useState(pendingInvite);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const res = await generateStudentInviteLink(studentId);
      if (res.ok) {
        setInvite({ token: res.token, expiresAt: res.expiresAt });
        setCopied(false);
      } else {
        toast(res.error, "error");
      }
    });
  }

  function cancel() {
    start(async () => {
      const res = await cancelStudentInvite(studentId);
      if (res.ok) setInvite(null);
      else toast(res.error ?? "Failed.", "error");
    });
  }

  function revoke() {
    setConfirmRevoke(false);
    start(async () => {
      const res = await revokeStudentLogin(studentId);
      if (res.ok) toast("Portal login revoked.");
      else toast(res.error ?? "Failed.", "error");
    });
  }

  function copy(token: string) {
    navigator.clipboard.writeText(inviteUrl(token));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (linkedUser) {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-border p-2.5">
          <p className="truncate text-sm text-slate-700">{linkedUser.name}</p>
          <p className="truncate text-xs text-slate-400">{linkedUser.email}</p>
          <p className="mt-1 text-xs">{linkedUser.active ? <span className="text-green-700">Portal active</span> : <span className="text-slate-400">Portal revoked</span>}</p>
        </div>
        {linkedUser.active && (
          <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(true)} disabled={pending}>
            <ShieldOff className="h-4 w-4" /> Revoke access
          </Button>
        )}
        <ConfirmModal
          open={confirmRevoke}
          onClose={() => setConfirmRevoke(false)}
          onConfirm={revoke}
          title="Revoke portal access?"
          message="The student will be logged out and can no longer sign in. Their data is kept."
          confirmLabel="Revoke"
          danger
        />
      </div>
    );
  }

  if (invite) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          Share this link with the student — they&apos;ll set their own email and password. Expires in{" "}
          {daysUntil(invite.expiresAt)} day{daysUntil(invite.expiresAt) === 1 ? "" : "s"}.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-slate-50 p-2">
          <code className="flex-1 truncate select-all text-sm">{inviteUrl(invite.token)}</code>
          <button onClick={() => copy(invite.token)} className="text-slate-400 hover:text-slate-700" title="Copy link">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
            <RefreshCw className="h-3.5 w-3.5" /> Regenerate
          </Button>
          <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
            <X className="h-3.5 w-3.5" /> Cancel invite
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Give this student access to a limited portal to see their own progress.</p>
      <Button onClick={generate} disabled={pending}>
        <Link2 className="h-4 w-4" /> {pending ? "Generating…" : "Generate invite link"}
      </Button>
    </div>
  );
}
