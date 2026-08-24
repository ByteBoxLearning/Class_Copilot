"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, KeyRound } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/actions/account";
import { dashboardPathFor } from "@/lib/auth-paths";
import type { ActionResult } from "@/actions/types";

function SubmitButton({ forced }: { forced: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <KeyRound className="h-4 w-4" /> {pending ? "Saving…" : forced ? "Set password & continue" : "Update password"}
    </Button>
  );
}

export function ChangePasswordForm({ forced, role }: { forced: boolean; role: string }) {
  const [state, formAction] = useActionState<ActionResult, FormData>(changePassword, { ok: false });
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </div>
      )}
      {!forced && (
        <Field label="Current password" error={err("currentPassword")}>
          <Input name="currentPassword" type="password" autoComplete="current-password" />
        </Field>
      )}
      <Field label="New password" error={err("newPassword")} hint="At least 8 characters.">
        <Input name="newPassword" type="password" autoComplete="new-password" required autoFocus />
      </Field>
      <Field label="Confirm new password" error={err("confirmPassword")}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton forced={forced} />
      {!forced && (
        <div className="text-center">
          <Link href={dashboardPathFor(role)} className="text-sm text-slate-500 hover:underline">
            Back to dashboard
          </Link>
        </div>
      )}
    </form>
  );
}
