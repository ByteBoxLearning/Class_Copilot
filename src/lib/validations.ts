import { z } from "zod";
import { values, PRIORITIES, FEEDBACK_VISIBILITY } from "./enums";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// A brand-new teacher creating their own independent workspace (OWNER
// account) — see actions/signup.ts. Same password-choice shape as
// acceptStudentInviteSchema below.
export const signupSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// Treat empty strings from form fields as undefined so optional fields work.
const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url("Must be a valid URL").optional(),
);

// Attachment (which MasteryEvent/DailyCheck, if any) is handled by
// actions/feedback.ts's typed `AddFeedbackTarget` param, not through this
// schema — it only validates the message/visibility fields themselves.
export const feedbackSchema = z.object({
  message: z.string().min(1, "Feedback cannot be empty"),
  visibility: z.enum(values(FEEDBACK_VISIBILITY)).default("TEACHER_ONLY"),
});

export const feedbackEditSchema = z.object({
  message: z.string().min(1, "Feedback cannot be empty"),
});

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: optionalString,
  assignedToId: optionalString,
  studentId: optionalString, // optional: student-specific, class-wide, or general
  classId: optionalString,
  date: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  recurring: z.coerce.boolean().default(false),
  priority: z.enum(values(PRIORITIES)).default("MEDIUM"),
});

export const taskUpdateSchema = z.object({
  completed: z.coerce.boolean().optional(),
  notes: optionalString,
  evidenceUrl: optionalUrl,
});

// Always creates an ASSISTANT (co-teacher) — OWNER accounts only ever come
// from /signup now, and CLIENT (Student) accounts from the student-invite
// flow, not here. An existing assistant can still be promoted to OWNER via
// changeUserRole (src/actions/users.ts) if they're "graduating" into their
// own workspace — this schema only governs the initial create.
export const newUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email address"),
});

// --- Student schemas ---------------------------------------------------------
export const studentSchema = z.object({
  displayName: z.string().min(1, "Student name is required"),
  gradeLevel: optionalString, // free text, e.g. "Grade 6" — never an enum
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  notes: optionalString,
  email: z.preprocess(emptyToUndefined, z.string().email("Enter a valid email address").optional()),
});
export type StudentInput = z.infer<typeof studentSchema>;

// Student's own email + password when accepting a self-service invite link
// (the teacher no longer picks these — see actions/invite.ts).
export const acceptStudentInviteSchema = z
  .object({
    email: z.string().email("Enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// --- Class schemas -----------------------------------------------------------
export const classSchema = z.object({
  name: z.string().min(1, "Class name is required"),
  subject: optionalString,
  period: optionalString,
  academicYear: optionalString,
});
export type ClassInput = z.infer<typeof classSchema>;

// --- Standard schemas ---------------------------------------------------------
// externalUnitSource/externalUnitId (Milestone K, Practice Mode) are an
// opt-in pair — either both set (this standard maps to one practice-content
// unit) or both blank, never one without the other.
//
// externalQuestionIds (added for the fine-grained mapping workaround) is a
// JSON-encoded string[] of bank question ids the client sends in a hidden
// form field — narrows this standard's evidence to just those questions
// within externalUnitId instead of the whole unit. Empty/absent = whole-unit,
// the original behavior. Malformed JSON is treated as "none supplied" rather
// than a validation error, since this field is UI-managed (a checklist), not
// hand-typed.
const questionIdsField = z.preprocess((v) => {
  if (typeof v !== "string" || v === "") return undefined;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : undefined;
  } catch {
    return undefined;
  }
}, z.array(z.string()).optional());

export const standardSchema = z
  .object({
    classId: z.string().min(1),
    categoryId: optionalString,
    code: optionalString,
    title: z.string().min(1, "Title is required"),
    description: optionalString,
    externalUnitSource: optionalString,
    externalUnitId: optionalString,
    externalQuestionIds: questionIdsField,
  })
  .refine((d) => Boolean(d.externalUnitSource) === Boolean(d.externalUnitId), {
    message: "Pick both a source and a unit, or leave both blank.",
    path: ["externalUnitId"],
  });
export type StandardInput = z.infer<typeof standardSchema>;

// --- Grading policy schema ----------------------------------------------------
// Teacher-authored input that drives a real grade — validated strictly on
// write (in deliberate contrast to the lenient AssignmentDoc parsing planned
// for the AI Assignment Builder milestone; see CONTEXT.md).
export const gradingPolicySchema = z
  .object({
    type: z.enum(["STANDARDS_ONLY", "WEIGHTED"]),
    level1: z.coerce.number().int().min(0, "0-100").max(100, "0-100"),
    level2: z.coerce.number().int().min(0, "0-100").max(100, "0-100"),
    level3: z.coerce.number().int().min(0, "0-100").max(100, "0-100"),
    level4: z.coerce.number().int().min(0, "0-100").max(100, "0-100"),
    minEvents: z.coerce.number().int().min(1).max(20).default(1),
    masteryWeight: z.coerce.number().int().min(0).max(100).optional(),
    engagementWeight: z.coerce.number().int().min(0).max(100).optional(),
    engagedValue: z.coerce.number().int().min(0).max(100).optional(),
    distractingValue: z.coerce.number().int().min(0).max(100).optional(),
    masteryStrategy: z.enum(["RECENCY_WEIGHTED", "DECAYING_AVERAGE", "MOST_RECENT_N", "HIGHEST_RECENT_N"]).default("RECENCY_WEIGHTED"),
    decayRate: z.coerce.number().min(0, "0-1").max(1, "0-1").default(0.35),
    windowSize: z.coerce.number().int().min(1).max(20).default(3),
    evidenceWeightQuiz: z.coerce.number().min(0).max(5).default(1),
    evidenceWeightHomework: z.coerce.number().min(0).max(5).default(1),
    evidenceWeightProject: z.coerce.number().min(0).max(5).default(1),
    evidenceWeightObservation: z.coerce.number().min(0).max(5).default(1),
    evidenceWeightConversation: z.coerce.number().min(0).max(5).default(1),
    evidenceWeightRetake: z.coerce.number().min(0).max(5).default(1),
    evidenceWeightPractice: z.coerce.number().min(0).max(5).default(1),
    evidenceWeightOther: z.coerce.number().min(0).max(5).default(1),
  })
  .refine((d) => d.type !== "WEIGHTED" || (d.masteryWeight ?? 0) + (d.engagementWeight ?? 0) === 100, {
    message: "Mastery + engagement weights must add up to 100.",
    path: ["masteryWeight"],
  });
export type GradingPolicyInput = z.infer<typeof gradingPolicySchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
