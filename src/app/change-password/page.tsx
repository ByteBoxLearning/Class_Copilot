import { requireUser } from "@/lib/auth";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const forced = Boolean(user.mustChangePassword);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-800">
            {forced ? "Set your password" : "Change password"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {forced
              ? "Welcome! Please choose a new password to finish setting up your account."
              : "Update the password for your account."}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <ChangePasswordForm forced={forced} role={user.role} />
        </div>
      </div>
    </div>
  );
}
