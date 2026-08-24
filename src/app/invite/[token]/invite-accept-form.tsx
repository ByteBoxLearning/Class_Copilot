"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, GraduationCap } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { acceptStudentInvite } from "@/actions/invite";
import type { ActionResult } from "@/actions/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <GraduationCap className="h-4 w-4" /> {pending ? "Creating your login…" : "Create my login"}
    </Button>
  );
}

export function InviteAcceptForm({ token, studentName }: { token: string; studentName: string }) {
  const [state, formAction] = useActionState<ActionResult, FormData>(acceptStudentInvite.bind(null, token), { ok: false });
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-slate-500">
        Hi {studentName.split(" ")[0]}! Choose the email and password you&apos;ll use to sign in.
      </p>
      {state.error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </div>
      )}
      <Field label="Your email" error={err("email")}>
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Choose a password" error={err("password")} hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" error={err("confirmPassword")}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton />
    </form>
  );
}
