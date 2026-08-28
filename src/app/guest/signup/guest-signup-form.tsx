"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, GraduationCap } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { guestSignupAction } from "@/actions/guest-auth";
import type { ActionResult } from "@/actions/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <GraduationCap className="h-4 w-4" /> {pending ? "Creating your account…" : "Start practicing"}
    </Button>
  );
}

export function GuestSignupForm() {
  const [state, formAction] = useActionState<ActionResult, FormData>(guestSignupAction, { ok: false });
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-slate-500">
        This account is only for self-paced practice — it&apos;s not connected to any class, teacher, or grade.
      </p>
      {state.error && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {state.error}
        </div>
      )}
      <Field label="Your name" error={err("name")}>
        <Input name="name" required autoFocus />
      </Field>
      <Field label="Email" error={err("email")}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Choose a password" error={err("password")} hint="At least 8 characters, with a number and a symbol.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" error={err("confirmPassword")}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton />
      <div className="text-center">
        <Link href="/guest/login" className="text-sm text-slate-500 hover:underline">
          Already have a practice account? Log in
        </Link>
      </div>
    </form>
  );
}
