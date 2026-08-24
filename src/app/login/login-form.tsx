"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { loginAction, type LoginState } from "@/actions/auth";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Log in"}
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.3-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.3 18.9 12 24 12c3.1 0 5.9 1.1 8 3l6-6C34.5 5.1 29.5 3 24 3 15.3 3 7.9 8 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 45c5.4 0 10.3-2 14-5.3l-6.5-5.4c-2 1.4-4.6 2.2-7.5 2.2-5.2 0-9.6-3.3-11.3-7.9l-6.6 5C8 39.9 15.4 45 24 45z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.5 5.4C41.5 36 45 30.5 45 24c0-1.2-.1-2.3-.3-3.5z" />
    </svg>
  );
}

export function LoginForm({ googleError }: { googleError?: string | null }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div className="space-y-4">
      {googleError && (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {googleError}
        </div>
      )}
      <a
        href="/api/auth/google"
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <GoogleIcon /> Continue with Google
      </a>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
      </div>
      <form action={formAction} className="space-y-4">
        {state.error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="you@example.com" required autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" placeholder="••••••••" required />
        </Field>
        <SubmitButton />
      </form>
      <div className="text-center">
        <Link href="/signup" className="text-sm text-slate-500 hover:underline">
          New teacher? Create your own workspace
        </Link>
      </div>
    </div>
  );
}
