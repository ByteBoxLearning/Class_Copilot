import { LogOut, GraduationCap } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireGuest } from "@/lib/guest-auth";
import { guestLogoutAction } from "@/actions/guest-auth";
import { values, EXTERNAL_UNIT_SOURCES } from "@/lib/enums";
import { APP_NAME } from "@/lib/app-config";
import { GuestPracticeApp } from "@/components/practice/guest-practice-app";
import type { PracticeSet, MCQAnswer, FRQAnswer } from "@/lib/practice/types";

export default async function GuestPracticePage() {
  const guest = await requireGuest();

  const inProgress = await prisma.guestPracticeAttempt.findFirst({
    where: { guestUserId: guest.id, status: "IN_PROGRESS" },
    orderBy: { createdAt: "desc" },
  });

  const resumable = inProgress
    ? {
        attemptId: inProgress.id,
        practiceSet: inProgress.practiceSetJson ? (JSON.parse(inProgress.practiceSetJson) as PracticeSet) : null,
        mcqAnswers: (JSON.parse(inProgress.answersJson || "{}").mcqAnswers ?? {}) as Record<string, MCQAnswer>,
        frqAnswers: (JSON.parse(inProgress.answersJson || "{}").frqAnswers ?? {}) as Record<string, FRQAnswer>,
        endTimestamp: inProgress.endTimestamp ? inProgress.endTimestamp.getTime() : null,
      }
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <GraduationCap className="h-4 w-4 text-primary" /> {APP_NAME} Practice
          </div>
          <form action={guestLogoutAction}>
            <button type="submit" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Hi {guest.name.split(" ")[0]}!</h1>
          <p className="text-sm text-slate-500">
            Self-paced practice, not connected to any class or teacher. Nothing here affects a grade.
          </p>
        </div>
        <GuestPracticeApp sources={values(EXTERNAL_UNIT_SOURCES)} resumable={resumable} />
      </main>
    </div>
  );
}
