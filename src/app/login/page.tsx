import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getSessionUser, dashboardPathFor } from "@/lib/auth";
import { APP_NAME } from "@/lib/app-config";
import { LoginForm } from "./login-form";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google Sign-In isn't set up yet. Use your email and password instead.",
  google_denied: "Google sign-in was cancelled.",
  google_failed: "Something went wrong signing in with Google. Please try again.",
  google_unverified_email: "That Google account's email isn't verified. Use a verified school account.",
  google_no_account: "No account found for that Google email. Ask your teacher to set you up first.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(dashboardPathFor(user.role));
  const { error } = await searchParams;
  const googleError = error ? GOOGLE_ERROR_MESSAGES[error] ?? null : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-500">Engagement + mastery tracking for your classes</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <LoginForm googleError={googleError} />
        </div>
      </div>
    </div>
  );
}
