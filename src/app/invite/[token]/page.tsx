import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getInviteInfo } from "@/actions/invite";
import { APP_NAME } from "@/lib/app-config";
import { InviteAcceptForm } from "./invite-accept-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // A signed-in user visiting an invite link is almost certainly the teacher
  // testing the link, or a student already logged in elsewhere — either way,
  // don't let it silently attach to their current session.
  const currentUser = await getSessionUser();

  const info = await getInviteInfo(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {info.valid ? `Set up ${info.studentName}'s portal login` : "Portal invite"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          {!info.valid ? (
            <p className="text-sm text-slate-600">{info.reason}</p>
          ) : currentUser ? (
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                You&apos;re currently signed in as <span className="font-medium">{currentUser.email}</span>. Log out
                first, then reopen this link to set up {info.studentName}&apos;s login.
              </p>
              <Link href="/login" className="text-primary hover:underline">
                Go to login
              </Link>
            </div>
          ) : (
            <InviteAcceptForm token={token} studentName={info.studentName} />
          )}
        </div>
      </div>
    </div>
  );
}
