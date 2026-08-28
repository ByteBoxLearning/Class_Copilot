// Centralised "enum" values. Because SQLite doesn't support Prisma enums, the
// database stores these as plain strings; this file is the single source of
// truth for the allowed values, their display labels, and badge colours.
//
// Job-pipeline-only option sets (stages, application/CV/cover-letter statuses,
// outcomes, file types, work modes, salary/currency dropdowns, source
// websites) were removed along with the Job model in Milestone A.

export type Option = { value: string; label: string };

function opts(pairs: [string, string][]): Option[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

// OWNER = Teacher, ASSISTANT = Co-Teacher, CLIENT = Student. Role values kept
// literal per the fork convention (see CONTEXT.md); only labels change.
export const ROLES = ["OWNER", "ASSISTANT", "CLIENT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Teacher",
  ADMIN: "Teacher", // legacy alias
  ASSISTANT: "Co-Teacher",
  CLIENT: "Student",
};

// Student enrollment lifecycle status.
export const STUDENT_STATUSES = opts([
  ["ACTIVE", "Active"],
  ["INACTIVE", "Inactive"],
  ["ARCHIVED", "Archived"],
]);

// Manual teacher-set roster at-a-glance indicator (distinct from `status`).
export const STUDENT_FLAGS = opts([
  ["EXCELLING", "Excelling"],
  ["ON_TRACK", "On track"],
  ["NEEDS_SUPPORT", "Needs support"],
]);

// Used by Task.priority — a generic priority scale, not job-pipeline-specific.
export const PRIORITIES = opts([
  ["HIGH", "High"],
  ["MEDIUM", "Medium"],
  ["LOW", "Low"],
]);

// DailyCheck.engagement — the quick daily behavior read on the Monitor page.
export const DAILY_ENGAGEMENT = opts([
  ["ENGAGED", "Engaged"],
  ["DISTRACTING", "Distracting"],
]);

// The four character/behavior dimensions from the original Milestone F
// vision, added back after a 2026-08-08 dogfooding check-in. Same
// blank-by-default +/-1 shape as engagement (DailyCheck.understanding is no
// longer part of this family — see its comment in schema.prisma).
export const DAILY_EMPATHY = opts([
  ["SHOWED_EMPATHY", "Showed empathy"],
  ["LACKED_EMPATHY", "Lacked empathy"],
]);
export const DAILY_DISCIPLINE = opts([
  ["DISCIPLINED", "Disciplined"],
  ["UNDISCIPLINED", "Undisciplined"],
]);
export const DAILY_COLLABORATION = opts([
  ["COLLABORATIVE", "Collaborative"],
  ["UNCOOPERATIVE", "Uncooperative"],
]);
export const DAILY_CITIZENSHIP = opts([
  ["GOOD_CITIZENSHIP", "Good citizenship"],
  ["POOR_CITIZENSHIP", "Poor citizenship"],
]);

// MasteryEvent.level — a standard 4-point K-12 standards-based-grading
// rubric, deliberately richer than DailyCheck's quick +/-1 flags since
// mastery is the primary grade driver (see CONTEXT.md).
export const MASTERY_LEVELS = opts([
  ["1", "Beginning"],
  ["2", "Developing"],
  ["3", "Proficient"],
  ["4", "Advanced"],
]);

// MasteryEvent.evidenceType — what kind of check produced this assessment.
// PRACTICE (Milestone K) is self-generated AI-scored practice, always
// teacher-approved before it becomes a real MasteryEvent (see
// PracticeMasteryProposal) — distinguished from QUIZ (teacher-administered)
// so a teacher who doesn't trust self-scored practice can weight it
// differently (see DEFAULT_EVIDENCE_WEIGHTS / evidenceWeightPractice).
export const MASTERY_EVIDENCE_TYPES = opts([
  ["QUIZ", "Quiz"],
  ["HOMEWORK", "Homework"],
  ["PROJECT", "Project"],
  ["OBSERVATION", "Observation"],
  ["CONVERSATION", "Conversation"],
  ["RETAKE", "Retake"],
  ["PRACTICE", "AI Practice"],
  ["CANVAS_IMPORT", "Canvas import"],
  ["OTHER", "Other"],
]);

// GradingPolicy.masteryStrategy — how "current mastery" is derived from a
// student's MasteryEvent history for a standard. Orthogonal to
// GradingPolicy.type (which decides how mastery combines with engagement).
// RECENCY_WEIGHTED is the default (confirmed with Jordi 2026-08-07); the
// other three are alternate standards-based-grading models a teacher can opt
// into per class — see src/lib/mastery-math.ts for the formulas.
export const MASTERY_STRATEGIES = opts([
  ["RECENCY_WEIGHTED", "Recency-Weighted Average"],
  ["DECAYING_AVERAGE", "Decaying Average"],
  ["MOST_RECENT_N", "Most Recent Evidence"],
  ["HIGHEST_RECENT_N", "Highest of Recent Evidence"],
]);

export const MASTERY_STRATEGY_HINTS: Record<string, string> = {
  RECENCY_WEIGHTED: "Every event counts, but more recent ones are weighted more heavily (oldest = 1x, most recent = Nx).",
  DECAYING_AVERAGE: "Each new event pulls the running average toward itself by the decay rate — the classic Marzano SBG model.",
  MOST_RECENT_N: "Only the last N pieces of evidence count at all. Older struggles stop counting once enough recent evidence exists.",
  HIGHEST_RECENT_N: "The best level shown within the last N pieces of evidence wins outright — rewards retakes without needing an all-time best.",
};

export const DEFAULT_DECAY_RATE = 0.35;
export const DEFAULT_WINDOW_SIZE = 3;

// Per-evidence-type multiplier applied before a mastery strategy runs — lets
// a teacher weigh a QUIZ more heavily than a HOMEWORK check, or set a type to
// 0 to exclude it from the grade entirely (a common "purist" SBG stance on
// homework/observation counting as practice, not evidence). Unlisted types
// default to weight 1.
export const DEFAULT_EVIDENCE_WEIGHTS: Record<string, number> = {
  QUIZ: 1, HOMEWORK: 1, PROJECT: 1, OBSERVATION: 1, CONVERSATION: 1, RETAKE: 1, PRACTICE: 1, OTHER: 1,
};

// GradingPolicy.type — how a class's computed grade combines its inputs.
// POINTS is declared but not available: it presupposes scored assignments,
// which don't exist until the Assignment Builder milestone, and that
// milestone deliberately ships no per-student score row (see CONTEXT.md).
export const GRADING_POLICY_TYPES: (Option & { available: boolean })[] = [
  { value: "STANDARDS_ONLY", label: "Standards Only", available: true },
  { value: "WEIGHTED", label: "Weighted (Mastery + Engagement)", available: true },
  { value: "POINTS", label: "Points-based", available: false },
];

// Default MasteryEvent level -> percent mapping used by STANDARDS_ONLY and
// WEIGHTED presets when a class has no custom GradingPolicy.configJson yet.
// 55/70/85/100 (not a linear 25/50/75/100) so "Developing" doesn't read as a
// failing grade — a common convention in standards-based grading.
export const DEFAULT_LEVEL_PERCENT: Record<"1" | "2" | "3" | "4", number> = { "1": 55, "2": 70, "3": 85, "4": 100 };

// Default engagement value mapping for the WEIGHTED preset.
export const DEFAULT_ENGAGEMENT_VALUE: Record<"ENGAGED" | "DISTRACTING", number> = { ENGAGED: 100, DISTRACTING: 50 };

// Assignment.assignmentType — what kind of classroom material this is. Also
// used as generation guidance in the AI prompt (see src/lib/assignments).
export const ASSIGNMENT_TYPES = opts([
  ["WORKSHEET", "Worksheet"],
  ["QUIZ", "Quiz"],
  ["HOMEWORK", "Homework"],
  ["PROJECT", "Project"],
  ["WARM_UP", "Warm-up"],
  ["EXIT_TICKET", "Exit ticket"],
  ["OTHER", "Other"],
]);

// Assignment.status — DRAFT is the default on save; READY signals it's
// finished and ready to use in class; ARCHIVED hides it from the default
// list view without deleting it.
export const ASSIGNMENT_STATUSES = opts([
  ["DRAFT", "Draft"],
  ["READY", "Ready"],
  ["ARCHIVED", "Archived"],
]);

// Assignment.source — how the saved content came to be. AI_IMPROVED means it
// started from uploaded/pasted material run through the "Improve" prompt,
// distinct from AI (generated from scratch).
export const ASSIGNMENT_SOURCES = opts([
  ["AI", "AI-generated"],
  ["AI_IMPROVED", "AI-improved from material"],
  ["MANUAL", "Manually written"],
]);

// AssignmentMaterial.kind — teacher's own categorization of an attached file.
export const ASSIGNMENT_MATERIAL_KINDS = opts([
  ["ORIGINAL", "Original source"],
  ["AI_IMPROVED", "AI-improved version"],
  ["FINAL", "Final version"],
  ["REFERENCE", "Reference"],
]);

// AssignmentDoc section kinds (src/lib/assignments/types.ts) — the ordered
// building blocks of an assignment's body.
export const ASSIGNMENT_SECTION_KINDS = opts([
  ["instructions", "Instructions"],
  ["questions", "Questions"],
  ["activity", "Activity"],
  ["materials", "Materials needed"],
  ["rubric", "Rubric"],
  ["answer_key", "Answer key"],
  ["notes", "Notes"],
]);

// Feedback.visibility — TEACHER_ONLY (the default; staff only) or
// STUDENT_VISIBLE (explicitly shown to the student in their portal). Simple
// 2-tier by design (Milestone H, 2026-08-16) — the source CRM's 3-tier
// PUBLIC/INTERNAL/CLIENT_VISIBLE was never built on in this fork (dropped in
// Milestone A, no code ever wrote a Comment row), so there was no legacy data
// to bridge; this is a clean reshape, not a migration.
export const FEEDBACK_VISIBILITY = opts([
  ["TEACHER_ONLY", "Teacher only"],
  ["STUDENT_VISIBLE", "Visible to student"],
]);

// Standard.externalUnitSource / PracticeMasteryProposal.unitSource — which
// external practice-content taxonomy a unit id belongs to (Milestone K). A
// plain string, not an enum, so a third subject is cheap to add later.
export const EXTERNAL_UNIT_SOURCES = opts([
  ["AP_CHEM", "AP Chemistry"],
  ["INTRO_CHEM", "Introductory Chemistry"],
]);

// PracticeAttempt.status.
export const PRACTICE_ATTEMPT_STATUSES = opts([
  ["IN_PROGRESS", "In progress"],
  ["SUBMITTED", "Submitted"],
  ["ABANDONED", "Abandoned"],
]);

// PracticeMasteryProposal.status — a practice result awaiting (or having
// received) teacher review before it becomes a real MasteryEvent.
export const PRACTICE_PROPOSAL_STATUSES = opts([
  ["PENDING", "Pending review"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
]);

// The user's default daily checklist. Placeholder content for Milestone A —
// replaced in Milestone D by `dailyChecklistFor(classes)`, which generates one
// "Log engagement — [Class]" item per active class instead of a static list.
export const DEFAULT_CHECKLIST: { key: string; label: string }[] = [
  { key: "review_classes", label: "Review today's classes" },
  { key: "check_in_students", label: "Check in on flagged students" },
];

// Colour classes for badges. Keyed by value; falls back to a neutral style.
export const BADGE_COLORS: Record<string, string> = {
  // Priority
  HIGH: "bg-red-100 text-red-800 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-200",
  LOW: "bg-slate-100 text-slate-700 border-slate-200",
  // Student status
  ACTIVE: "bg-green-100 text-green-800 border-green-200",
  INACTIVE: "bg-amber-100 text-amber-800 border-amber-200",
  ARCHIVED: "bg-slate-100 text-slate-500 border-slate-200",
  // Student flag
  EXCELLING: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ON_TRACK: "bg-sky-100 text-sky-800 border-sky-200",
  NEEDS_SUPPORT: "bg-orange-100 text-orange-800 border-orange-200",
  // Daily check: engagement
  ENGAGED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  DISTRACTING: "bg-red-100 text-red-800 border-red-200",
  // Daily check: empathy / discipline / collaboration / citizenship
  SHOWED_EMPATHY: "bg-emerald-100 text-emerald-800 border-emerald-200",
  LACKED_EMPATHY: "bg-red-100 text-red-800 border-red-200",
  DISCIPLINED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  UNDISCIPLINED: "bg-red-100 text-red-800 border-red-200",
  COLLABORATIVE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  UNCOOPERATIVE: "bg-red-100 text-red-800 border-red-200",
  GOOD_CITIZENSHIP: "bg-emerald-100 text-emerald-800 border-emerald-200",
  POOR_CITIZENSHIP: "bg-red-100 text-red-800 border-red-200",
  // Mastery level (1-4)
  "1": "bg-red-100 text-red-800 border-red-200",
  "2": "bg-amber-100 text-amber-800 border-amber-200",
  "3": "bg-sky-100 text-sky-800 border-sky-200",
  "4": "bg-emerald-100 text-emerald-800 border-emerald-200",
  // Assignment status (ARCHIVED reuses the student-status colour above)
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  READY: "bg-green-100 text-green-800 border-green-200",
  // Feedback visibility
  TEACHER_ONLY: "bg-slate-100 text-slate-600 border-slate-200",
  STUDENT_VISIBLE: "bg-violet-100 text-violet-800 border-violet-200",
  // Practice attempt / mastery-proposal status (IN_PROGRESS/PENDING share a
  // color, APPROVED reuses READY's green, REJECTED reuses HIGH's red)
  IN_PROGRESS: "bg-amber-100 text-amber-800 border-amber-200",
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  SUBMITTED: "bg-sky-100 text-sky-800 border-sky-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  ABANDONED: "bg-slate-100 text-slate-500 border-slate-200",
};

// Helper: turn a raw enum value into its human label using the given option set.
export function labelOf(options: Option[], value?: string | null): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

// Flat lists of valid values, handy for Zod enum validation.
export const values = (o: Option[]) => o.map((x) => x.value) as [string, ...string[]];
