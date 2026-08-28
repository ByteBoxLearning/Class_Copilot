import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { getGuestSessionUser } from "@/lib/guest-auth";
import { APP_NAME } from "@/lib/app-config";
import { GuestLoginForm } from "./guest-login-form";

export default async function GuestLoginPage() {
  const guest = await getGuestSessionUser();
  if (guest) redirect("/guest/practice");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{APP_NAME} Practice</h1>
          <p className="mt-1 text-sm text-slate-500">Log in to your practice account</p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <GuestLoginForm />
        </div>
      </div>
    </div>
  );
}
