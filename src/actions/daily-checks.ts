"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { assertCanAccessClass, assertCanAccessStudent } from "@/lib/access";
import {
  DAILY_ENGAGEMENT, DAILY_EMPATHY, DAILY_DISCIPLINE,
  DAILY_COLLABORATION, DAILY_CITIZENSHIP, values,
} from "@/lib/enums";
import { logActivity } from "@/lib/activity-log";
import { generateDailyCheckFeedback } from "@/lib/daily-check-feedback";
import { z } from "zod";

const FIELDS = ["engagement", "empathy", "discipline", "collaboration", "citizenship"] as const;

const fieldSchema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  field: z.enum(FIELDS),
  value: z.union([
    z.enum(values(DAILY_ENGAGEMENT)),
    z.enum(values(DAILY_EMPATHY)),
    z.enum(values(DAILY_DISCIPLINE)),
    z.enum(values(DAILY_COLLABORATION)),
    z.enum(values(DAILY_CITIZENSHIP)),
    z.null(),
  ]),
});

const focusSchema = z.object({
  classId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  standardId: z.union([z.string().min(1), z.null()]),
});

// Deliberately just Proficient ("3") / Developing ("2") — the Monitor's
// quick check is a two-tier tap, not the full 1-4 range (see
// setDailyUnderstandingCheck below). A teacher who needs Beginning/Advanced,
// or a note, uses the Mastery Roster page (/classes/mastery, recordMasteryEvent
// in src/actions/mastery.ts) instead — that page's full evidenceType/level
// picker is "the other method" for a fuller observation.
const understandingSchema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  level: z.union([z.literal("3"), z.literal("2"), z.null()]),
});

const noteSchema = z.object({
  studentId: z.string().min(1),
  classId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  note: z.string().max(2000, "Note is too long (max 2000 characters)"),
});

export type DailyCheckField = (typeof FIELDS)[number];
export type SetDailyCheckResult = { ok: true } | { ok: false; error: string };

// Shared by setDailyCheck and setDailyCheckNote — a write to either one
// counts as "checking in" on a class for the day. Ticks the auto-derived
// daily-checklist item on the first successful write for a (classId, date),
// rather than requiring a separate action the teacher has to remember.
async function markCheckedIn(userId: string, classId: string, date: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
  if (!cls) return;
  const itemKey = `monitor_${classId}`;
  await prisma.checklistCompletion.upsert({
    where: { userId_itemKey_date: { userId, itemKey, date } },
    update: { completed: true, completedAt: new Date() },
    create: { userId, itemKey, itemLabel: `Check in — ${cls.name}`, date, completed: true, completedAt: new Date() },
  });
}

// Tap-to-cycle one dimension's cell for one student, one class, one day.
// Upserts so re-tapping the same day just updates that one row — never a
// duplicate. `value: null` clears the cell (back to unset). `field` is
// zod-constrained to one of the six real DailyCheck columns, so the
// computed-key cast below is runtime-safe.
export async function setDailyCheck(
  studentId: string,
  classId: string,
  date: string,
  field: DailyCheckField,
  value: string | null,
): Promise<SetDailyCheckResult> {
  const user = await requireStaff();
  const parsed = fieldSchema.safeParse({ studentId, classId, date, field, value });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    await assertCanAccessClass(user, d.classId);
    await assertCanAccessStudent(user, d.studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student/class." };
  }

  // `d.field` is zod-constrained to one of the six real DailyCheck string
  // columns, so this dynamic key is runtime-safe even though Prisma's
  // generated checked/unchecked union types can't express it statically.
  const data: any = { [d.field]: d.value };

  const row = await prisma.dailyCheck.upsert({
    where: { studentId_classId_date: { studentId: d.studentId, classId: d.classId, date: d.date } },
    update: { ...data, loggedById: user.id },
    create: { studentId: d.studentId, classId: d.classId, date: d.date, loggedById: user.id, ...data },
  });

  await markCheckedIn(user.id, d.classId, d.date);

  revalidatePath("/classes/monitor");
  return row ? { ok: true } : { ok: false, error: "Failed to save." };
}

// Sets (or clears, if blank) the free-text note elaborating on whatever was
// flagged that day — one holistic note per (student, class, day), not
// per-dimension, matching the existing DailyCheck.note column that had been
// on the model since Milestone F's "early slice" but never wired up.
export async function setDailyCheckNote(
  studentId: string,
  classId: string,
  date: string,
  note: string,
): Promise<SetDailyCheckResult> {
  const user = await requireStaff();
  const parsed = noteSchema.safeParse({ studentId, classId, date, note });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    await assertCanAccessClass(user, d.classId);
    await assertCanAccessStudent(user, d.studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student/class." };
  }

  const trimmed = d.note.trim() || null;

  const row = await prisma.dailyCheck.upsert({
    where: { studentId_classId_date: { studentId: d.studentId, classId: d.classId, date: d.date } },
    update: { note: trimmed, loggedById: user.id },
    create: { studentId: d.studentId, classId: d.classId, date: d.date, loggedById: user.id, note: trimmed },
  });

  await markCheckedIn(user.id, d.classId, d.date);

  revalidatePath("/classes/monitor");
  return row ? { ok: true } : { ok: false, error: "Failed to save." };
}

// Sets (or clears) which Standard a class is working on for a given day —
// the day's "focus" that every student's setDailyUnderstandingCheck below
// attaches to. One row per (class, day); re-setting it just updates that row
// (does NOT retroactively change any already-recorded DailyCheck.standardId
// or MasteryEvent, which are denormalized at the moment of the tap).
export async function setDailyStandardFocus(
  classId: string,
  date: string,
  standardId: string | null,
): Promise<SetDailyCheckResult> {
  const user = await requireStaff();
  const parsed = focusSchema.safeParse({ classId, date, standardId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    await assertCanAccessClass(user, d.classId);
  } catch {
    return { ok: false, error: "You don't have access to that class." };
  }

  if (d.standardId === null) {
    await prisma.dailyStandardFocus.deleteMany({ where: { classId: d.classId, date: d.date } });
    revalidatePath("/classes/monitor");
    return { ok: true };
  }

  const standard = await prisma.standard.findUnique({ where: { id: d.standardId }, select: { classId: true } });
  if (!standard || standard.classId !== d.classId) return { ok: false, error: "Standard not found in this class." };

  await prisma.dailyStandardFocus.upsert({
    where: { classId_date: { classId: d.classId, date: d.date } },
    update: { standardId: d.standardId, setById: user.id },
    create: { classId: d.classId, date: d.date, standardId: d.standardId, setById: user.id },
  });

  revalidatePath("/classes/monitor");
  return { ok: true };
}

// Records a per-standard understanding check for one student on one day.
// Unlike every other DailyCheck dimension, this ALSO writes a real,
// append-only MasteryEvent (evidenceType OBSERVATION) — the whole point of
// linking this check to a Standard in the first place. Requires the day's
// focus Standard to already be set (setDailyStandardFocus); a fresh
// MasteryEvent is created on every change (never edited in place), matching
// the "correct via a newer record" convention used everywhere else
// MasteryEvent is written (see recordMasteryEvent in src/actions/mastery.ts)
// — there's no MasteryEvent edit/delete capability anywhere in this app.
export async function setDailyUnderstandingCheck(
  studentId: string,
  classId: string,
  date: string,
  level: string | null,
): Promise<SetDailyCheckResult> {
  const user = await requireStaff();
  const parsed = understandingSchema.safeParse({ studentId, classId, date, level });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  try {
    await assertCanAccessClass(user, d.classId);
    await assertCanAccessStudent(user, d.studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student/class." };
  }

  if (d.level === null) {
    await prisma.dailyCheck.upsert({
      where: { studentId_classId_date: { studentId: d.studentId, classId: d.classId, date: d.date } },
      update: { understanding: null, standardId: null, loggedById: user.id },
      create: { studentId: d.studentId, classId: d.classId, date: d.date, loggedById: user.id },
    });
    await markCheckedIn(user.id, d.classId, d.date);
    revalidatePath("/classes/monitor");
    return { ok: true };
  }

  const focus = await prisma.dailyStandardFocus.findUnique({
    where: { classId_date: { classId: d.classId, date: d.date } },
    select: { standardId: true, standard: { select: { title: true } } },
  });
  if (!focus) return { ok: false, error: "Pick today's standard above before checking understanding." };

  await prisma.$transaction([
    prisma.dailyCheck.upsert({
      where: { studentId_classId_date: { studentId: d.studentId, classId: d.classId, date: d.date } },
      update: { understanding: d.level, standardId: focus.standardId, loggedById: user.id },
      create: {
        studentId: d.studentId, classId: d.classId, date: d.date, loggedById: user.id,
        understanding: d.level, standardId: focus.standardId,
      },
    }),
    prisma.masteryEvent.create({
      data: {
        studentId: d.studentId,
        standardId: focus.standardId,
        level: Number(d.level),
        evidenceType: "OBSERVATION",
        recordedById: user.id,
      },
    }),
  ]);
  await logActivity({
    userId: user.id,
    studentId: d.studentId,
    actionType: "MASTERY_EVENT_RECORDED",
    description: `Recorded level ${d.level} on "${focus.standard.title}" (daily understanding check)`,
  });

  await markCheckedIn(user.id, d.classId, d.date);

  revalidatePath("/classes/monitor");
  revalidatePath("/classes/mastery");
  revalidatePath(`/admin/students/${d.studentId}`);
  return { ok: true };
}

// Drafts student-facing feedback from a teacher's private Monitor note — see
// generateDailyCheckFeedback (src/lib/daily-check-feedback.ts) for the
// prompt/tone logic. Uses `noteText` as given (the note textarea's current
// value, which may not be saved yet) rather than re-reading DailyCheck.note
// from the database, so a teacher doesn't have to save first just to draft
// from what they just typed. Never persists anything itself — the caller
// (FeedbackPanel) drops the result into its own compose box for the teacher
// to edit and explicitly save via the existing addFeedback action.
export async function generateFeedbackFromNote(
  studentId: string,
  classId: string,
  date: string,
  noteText: string,
): Promise<{ ok: true; draft: string } | { ok: false; error: string }> {
  const user = await requireStaff();
  if (!noteText.trim()) return { ok: false, error: "Write a private note first — feedback is drafted from it." };

  try {
    await assertCanAccessClass(user, classId);
    await assertCanAccessStudent(user, studentId);
  } catch {
    return { ok: false, error: "You don't have access to that student/class." };
  }

  const [check, student] = await Promise.all([
    prisma.dailyCheck.findUnique({
      where: { studentId_classId_date: { studentId, classId, date } },
      select: { engagement: true, empathy: true, discipline: true, collaboration: true, citizenship: true },
    }),
    prisma.student.findUnique({ where: { id: studentId }, select: { displayName: true } }),
  ]);
  if (!student) return { ok: false, error: "Student not found." };

  const draft = await generateDailyCheckFeedback(student.displayName.split(" ")[0], noteText, {
    engagement: check?.engagement ?? null,
    empathy: check?.empathy ?? null,
    discipline: check?.discipline ?? null,
    collaboration: check?.collaboration ?? null,
    citizenship: check?.citizenship ?? null,
  });
  if (!draft) return { ok: false, error: "Couldn't generate feedback right now — you can still write it yourself below." };
  return { ok: true, draft };
}
