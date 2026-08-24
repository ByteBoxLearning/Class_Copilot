"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, GraduationCap } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { signupAction } from "@/actions/signup";
import type { ActionResult } from "@/actions/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      <GraduationCap className="h-4 w-4" /> {pending ? "Creating your workspace…" : "Create my workspace"}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState<ActionResult, FormData>(signupAction, { ok: false });
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-slate-500">
        This creates a brand-new, fully private workspace — your own classes and students, separate
        from any colleague&apos;s. If you&apos;re joining a co-teacher on a class they already teach,
        ask them to add you as a co-teacher instead.
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
      <Field label="Choose a password" error={err("password")} hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password" error={err("confirmPassword")}>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton />
      <div className="text-center">
        <Link href="/login" className="text-sm text-slate-500 hover:underline">
          Already have an account? Log in
        </Link>
      </div>
    </form>
  );
}
