# Context

> **Status lives in TODO.md only — this file is not updated per-milestone.**
> It's revisited only for a genuinely new architectural decision, not for "we finished milestone X."

## What this is

A K-12 classroom engagement + standards-mastery tracker for a single teacher (Jordi), built for the
upcoming academic year. Two tracking domains, both first-class:

1. **Daily engagement** — empathy, discipline, collaboration, citizenship — a grading component
   separate from academic mastery, captured with minimal friction (the stated pain point: "I'm good
   at assessing but struggle recording these daily interactions").
2. **Standards mastery** — the primary grade driver, tracked per student per standard with a full
   evidence history, not a single overwritten value.

Students log in (the `/portal/*` area, built Milestone H) to see their own progress on both and
identify areas to improve — own data only, no peer comparison or ranking. The platform is meant to
reinforce a culture of empathy, respect, and introspective growth through prompt, specific feedback —
the `Feedback` model (Milestone H, formerly `Comment`) is literally that: a teacher's explicit,
optionally-student-visible message attached to a specific piece of evidence. Later additions, all
built: a **configurable grading policy** that combines mastery and engagement into an actual computed
grade (confirmed 2026-08-04, built Milestone E); an **AI-powered End-of-Term Comments generator** that
drafts a report-card comment per student from their real Monitor + mastery data (requested and built
2026-08-08, Milestone G.1); and an **AI-powered Assignment Builder** — worksheets/quizzes/etc.
generated from scratch or improved from uploaded/pasted material, tied to standards (confirmed
2026-08-04, built 2026-08-08, Milestone G).

## Where this came from

`classroom-tracker/` is a fork of the recruitment-agency CRM at the repo root (`../`), itself cloned
from a public template as a domain-agnostic starting scaffold. The parent repo deliberately hasn't
committed to one domain — it expects multiple independent verticals forked as sibling subfolders
(each a standalone copy: own `package.json`/Prisma schema/SQLite db/`.env`, not a shared monorepo).
This is the **second** such vertical — the first is `../college-counseling/`, whose fork pattern
(lettered milestones, literal role values kept, hand-port the security spine first) this fork
follows directly.

**Why this stack/architecture was reused**: the CRM's owner/assistant/client model with
record-level, IDOR-guarded data isolation (`src/lib/access.ts`) maps cleanly onto
teacher/co-teacher/student with student-scoped data — the hard problem (auth, scoping, Server Action
patterns, a working UI kit) was already solved and didn't need re-deriving.

## Domain mapping

| CRM concept | This app | Notes |
|---|---|---|
| `User` (OWNER\|ASSISTANT\|CLIENT) | `User`, same role strings | Relabeled Teacher / Co-Teacher / Student in `ROLE_LABELS` only |
| `Client` | `Student` ✅ | `fieldLabel`->`gradeLevel`; job-search fields dropped; `flag` for roster at-a-glance; `email`/`externalId` added for roster import (Milestone C) |
| `ClientAssistant` | `ClassCoTeacher` ✅ | Re-pointed to **class**-level assignment — a co-teacher is assigned to a `Class`, student access derived via `Enrollment` (2-hop) |
| `Category` | `StandardCategory` ✅ | Same shape, global strand grouping |
| — | `Class`, `Enrollment` ✅ (Milestone B) | A section/period; student<->class join |
| — | `Standard` ✅ | Teacher-defined mastery target, scoped to a `Class`, with a `code` field for the Assignment Builder |
| — | `MasteryEvent` ✅ | **Append-only** — current mastery is a recency-weighted average of ALL events, not just the latest one (see `src/lib/mastery-math.ts` and "Decisions" below) |
| — | `GradingPolicy` ✅ | Per-class configurable grading model (preset type + JSON config), computed via `src/lib/grading.ts` |
| — | `DailyCheck` ✅ | Replaced the originally-sketched `EngagementLog` model, but as of 2026-08-08 covers the **same 4 dimensions it was named for** (empathy/discipline/collaboration/citizenship) plus the explicitly-requested engagement+understanding — one row per (student, class, date), upserted on tap. See "Decisions" below. |
| `Comment` | renamed `Feedback` ✅ (Milestone H) | Visibility simplified from 3-tier to 2-tier: `TEACHER_ONLY` \| `STUDENT_VISIBLE`; gained optional `masteryEventId`/`dailyCheckId` attachment FKs — see "Decisions" below |
| `ChecklistCompletion` | kept, **repurposed** ✅ | Auto-derived "did I check in on [Class] today?" signal, keyed `monitor_${classId}` — written, not yet surfaced in any UI (Milestone I) |
| `Setting` | revived, trimmed ✅ (Milestone G.1) | Dropped in Milestone A, brought back 2026-08-08 scoped to 6 AI/Google keys only — see "What came back" below |
| — | `Assignment`, `AssignmentStandard`, `AssignmentMaterial` ✅ (Milestone G) | AI-generated/improved/manually-written classroom materials tied to standards; `AssignmentMaterial` modelled on `JobFile`'s shape, not a revival of it — denormalized `classId` for single-lookup IDOR, same trick as `JobFile.clientId` |
| `DailySummary`, `Job`, `JobFile`, `CvProfile`, `GeneratedCv`, `SavedSearch` | **dropped** (Milestone A) | No equivalent in this domain — see "What was stripped" below |

## Decisions made so far

- **Standalone copy, not a shared-package monorepo.** With two verticals now (this one and
  college-counseling), extracting shared packages would still be premature for two consumers.
- **Role values (`OWNER`/`ASSISTANT`/`CLIENT`) are kept as-is**, relabeled only in UI copy
  (Teacher/Co-Teacher/Student). Each fork is an independent codebase, so there's no shared-runtime
  cost to deferring a literal rename.
- **Content first, rename second** (Milestone A vs B), matching the college-counseling precedent.
- **`ClientAssistant`->`ClassCoTeacher` is a re-point, not a literal rename**, done in Milestone B. A
  co-teacher is assigned to a whole class/section; student-level access is derived through
  `Enrollment` (2-hop: co-teacher -> assigned classes -> enrolled students). The isolation test
  (`scripts/isolation-test.mts`) was rewritten to seed a student enrolled in two classes taught by
  different co-teachers specifically to exercise this cross-class boundary, not just single-class
  access.
- **Mastery scale: 1-4 (Beginning / Developing / Proficient / Advanced).** Deliberately richer than
  the daily engagement check's quick +/-1 flags since mastery is the primary grade driver.
- **Current mastery is a recency-weighted average, not most-recent-only or highest-ever-only**
  (resolved with Jordi 2026-08-07). Neither extreme fit: most-recent-only discards a student's whole
  history on every new data point (noisy, and doesn't let earlier evidence "help build" the picture,
  which Jordi explicitly wanted); highest-ever-only can mask real regression/forgetting. The formula
  (`src/lib/mastery-math.ts::computeMastery`): sort a student's `MasteryEvent`s for a standard
  oldest-to-newest, weight the i-th event by its position (oldest = 1, each later event = weight+1,
  so the most recent of n events counts n× the first), take the weighted average, round to the
  nearest integer clamped to 1-4. Deliberately linear rather than exponential decay — explainable to
  a teacher as "recent counts more, but nothing is thrown away," not a black box. This directly
  determines Milestone E's `masteryPercentFor()` behavior, so resolving it here first (rather than
  deferring into E as originally planned) was the right sequencing call.
- **Mastery calculation is a per-class configurable strategy, not one fixed formula** (added
  2026-08-08, after Milestone E, at Jordi's request for research into other SBG models). Recency-
  Weighted Average (above) stays the default, but a class can opt into three researched alternatives
  in `src/lib/mastery-math.ts::computeMastery()`: **Decaying Average** (Marzano's model — `new =
  old*(1-d) + latest*d`, `d` a directly tunable decay rate — the closest thing to an industry-standard
  answer to "how much does recent count vs. baseline"), **Most Recent Evidence** (only the last N
  events count at all — the purist mastery-learning stance that old struggles stop counting once
  overwritten), and **Highest of Recent Evidence** (best level within the last N events wins —
  retake-friendly). Orthogonal to these is an `EvidenceWeightMap` — a per-`evidenceType` multiplier
  (default 1, settable to 0 to exclude a type entirely) applied before any strategy runs. This is the
  direct answer to "does homework count the same as an assessment": SBG literature doesn't agree
  (purists like Wormeli/O'Connor say formative work like homework/observation shouldn't count toward
  a summative grade at all), so rather than picking a side, it's a per-class dial. Config lives on
  `GradingPolicy` (`masteryStrategy` + `masteryConfigJson`) alongside the grading-combination config,
  even though it governs mastery computation, not grade combination — kept on the same row rather
  than a new model since both are "how this class's grade gets computed," edited from the same page.
- **Grading is computed, configurable, and in scope for v1** (decided 2026-08-04, built 2026-08-08)
  — this **supersedes** an earlier position that v1 wouldn't compute a final grade. `GradingPolicy`
  is per-class with a `configJson` blob that **is** zod-validated on write, in deliberate contrast to
  `AssignmentDoc` parsing (built 2026-08-08 with the Assignment Builder), which **is** lenient
  (JSON.parse + shallow shape check, malformed sections dropped individually, falls back to an empty
  doc on total garbage — never throws). The line: validate strictly what a human authored (a grading
  formula that drives a real grade), parse leniently what a model generated (which the teacher reviews
  and can edit/regenerate if imperfect — see `src/lib/assignments/types.ts::parseAssignmentDoc`). A
  `POINTS` preset is declared in the type union (greyed out in the UI, "coming soon") but still not
  built — the Assignment Builder deliberately shipped with **no per-student score row**, so there's
  still nothing to compute POINTS grading from.
- **A missing grade component is excluded, never treated as zero** (`src/lib/grading-math.ts::
  weightedAverage`). A class using the WEIGHTED preset with mastery evidence but zero engagement logs
  gets a mastery-only grade, not a grade dragged down by a phantom 0% engagement score — the same
  "exclude, don't zero" principle already used for `engagementPercentFor`'s unlogged days.
  `levelToPercent` linearly interpolates a fractional mastery average (e.g. 3.33) between its two
  nearest integer levels' configured percentages, rather than rounding to an integer level first —
  preserves the precision `mastery-math.ts`'s recency weighting was built for.
- **`engagementPercentFor()` landed with Milestone E, not stubbed until F as originally planned** —
  since `DailyCheck` already existed from the 2026-08-05 "early slice," there was no reason to leave
  the WEIGHTED preset's engagement component returning `null`. `src/lib/engagement.ts` is a peer of
  `src/lib/mastery.ts`, not part of `grading.ts` itself, so it's independently reusable (e.g. a future
  engagement-trend view).
- **Grading policy management lives at `/classes/grading`, not `/admin/classes/[id]/grading`** as
  originally sketched — the same reasoning as the Standards page's earlier move: `/admin/*` routes
  are OWNER-only at the layout level, and a co-teacher needs read-only visibility into how a class's
  grade is computed. Uses the shared class-switcher context (`?class=`) rather than a class-id route
  param, consistent with Monitor/Standards/Mastery.
- **Roster bulk-import is one pipeline, two sources** (decided 2026-08-04): CSV is parsed **in the
  browser** (`File.text()`), so a roster full of student PII never touches the server as an upload;
  Google Sheets is fetched server-side. Both normalize to the same `ImportSheet` shape and share the
  mapping/preview/commit path — there is no separate "Google import" code path, only a different
  source adapter. CSV parsing is **hand-rolled** (RFC-4180, not `papaparse`), consistent with this
  codebase's existing hand-rolled-JWT (`jose` instead of NextAuth) / hand-rolled-AES
  (`src/lib/crypto.ts` instead of a secrets library) posture — a documented one-file escape hatch to
  `papaparse` exists if a real SIS export breaks the hand-rolled parser.
- **Google OAuth is ephemeral by design** (decided 2026-08-04): no refresh token, no
  `GoogleConnection` model, no stored Google credential at all — a short-lived httpOnly cookie
  holding the access token, cleared immediately after import. Reasoning: roster import runs a
  handful of times per term, not continuously; the payload is student PII, so minimizing what's
  persisted matters; and a Google OAuth app in "Testing" publishing status (no verification review)
  issues refresh tokens that expire in 7 days regardless, so "persistent" sync wouldn't reliably stay
  persistent without a separate Google-verification project. Hand-rolled `fetch` calls are used for
  the 3 needed endpoints rather than the `googleapis` SDK, for the same minimal-dependency reasoning
  as the CSV parser.
- **The multi-provider AI dispatch is revived, generalized, and re-scoped** (decided 2026-08-04,
  built 2026-08-08 as Milestone G.1). Split into `src/lib/ai/` (domain-neutral: provider registry,
  per-provider callers, `run-model.ts` dispatcher, `model-guard.ts`, and — added when the Assignment
  Builder needed it — `json.ts::extractJson()`, generalized from the source's CV-specific helper) and,
  per feature, its own domain layer (`src/lib/comments/`, `src/lib/assignments/`). This split is a
  deliberate improvement over the source CRM, which coupled the registry to the CV domain — it also
  means the still-deferred AI reflection-coach (below) can reuse `src/lib/ai/` later instead of
  re-deriving dispatch. **Generalized one step further than the source**: each provider caller takes
  an `opts.json` flag, returning either strict JSON (`{ json: true }`, used by the Assignment Builder)
  or plain prose (the default, used by Comments) — Claude and OpenRouter never forced a format either
  way, only Gemini/OpenAI's JSON-mode flags became conditional. The `` `${Provider} API {status}: ...`
  `` error-string convention every provider caller throws is load-bearing for `aiErrorMessage()`'s
  regex-based friendly-error mapping and must be preserved by any new provider. `Setting`/
  `src/lib/crypto.ts` (AES-256-GCM keyed off `AUTH_SECRET`) come back from Milestone A's strip, but
  re-scoped to exactly 6 managed keys (4 AI providers + Google OAuth client id/secret) — branding,
  plan/billing, job-board keys, and the default-Gemini-model setting stay stripped, since nothing in
  this domain needs them.
- **End-of-Term Comments generates plain prose, not a structured doc — deliberately the simplest AI
  feature in this app** (built 2026-08-08). Unlike `CvDoc`/the planned `AssignmentDoc`, there is
  nothing to parse: the model's raw text output, trimmed, IS the comment. This ruled out the "who
  authored it" strict-vs-lenient validation split entirely for the prompt's *output* — it only applies
  to the prompt *template* itself (`saveCommentsPrompt` guards that placeholders survive an edit,
  same posture as `saveCvPrompt`'s guard, since a teacher-edited prompt still drives a real
  generation). `src/lib/comments/format.ts` (pure) / `summary.ts` (server-only, Prisma) mirrors the
  `mastery-math.ts`/`mastery.ts` split so the formatting logic is independently testable without the
  `server-only` package blocking `tsx` — see `scripts/comments-test.mts`.
- **A term's date range is picked manually each generation, not stored** (confirmed with Jordi
  2026-08-08, asked via `AskUserQuestion` before building). Rejected a `Term` model (start/end dates
  defined once per school year) as unnecessary setup for a feature usable immediately; a `from`/`to`
  date picker is more flexible anyway (works for a custom sub-range like "just this unit", not only a
  full term). Standards mastery for the summary is computed from **only** the `MasteryEvent`s inside
  that range (via `computeMastery()`, same pure formula, just a filtered input) — deliberately
  different from the "current mastery" shown everywhere else in the app (all-time history), because an
  end-of-term comment should reflect the term, not the student's entire time in the class.
- **A generated comment is never persisted** (same conversation, same confirmation). The teacher edits
  the draft in a plain textarea and copies it out themselves; no `GeneratedComment` model, no
  regenerate-from-history. This kept the feature to one server action with zero new write paths — if
  Jordi later wants a saved history, that's a small, additive follow-up (a model plus one `create`
  call), not a redesign.
- **The Assignment Builder lives at `/classes/assignments`, not `/admin/assignments`** (built
  2026-08-08) — the same deviation, for the same reason, as Standards/Mastery/Grading/Comments before
  it: `/admin/*` is OWNER-only at the layout level, and a co-teacher can reasonably want to build
  materials for a class they co-teach, not just view them. This is the fourth feature to make this
  exact call, at which point it's less a one-off deviation than the actual convention for anything
  both roles use — a future feature defaulting to `/admin/*` should be the one that has to justify
  itself, not the other way around.
- **Two prompts, not one, for the Assignment Builder** (GENERATE from scratch vs. IMPROVE existing
  material) — same reasoning as the CV Builder's separate prompts for generation vs. AI-editing:
  the rules genuinely differ (IMPROVE must anchor to the source material and forbids inventing new
  content; GENERATE has no such anchor). One prompt with an if-this-then-that instruction block was
  considered and rejected as more fragile to edit than two focused ones.
- **`AssignmentMaterial` is a manual attachment library, not something the AI writes to** — uploading
  a file (`ORIGINAL`/`AI_IMPROVED`/`FINAL`/`REFERENCE`, the teacher's own categorization) is always a
  deliberate teacher action. The AI never auto-saves a generated draft as a new material file; the
  generated `AssignmentDoc` (structured sections) already lives in `Assignment.contentJson`, which is
  the primary artifact. This keeps the generation pipeline simple (prompt in, doc out, no disk writes)
  and keeps `AssignmentMaterial` doing one job — attachments — instead of two.
- **A `POINTS` grading preset still doesn't exist, confirmed at Assignment Builder ship time** — the
  builder deliberately has no per-student score/submission model (`Assignment` is the material itself,
  not a gradebook entry), so there's still nothing for a points-based grade to sum. This was flagged as
  a possibility back in Milestone E and holds: `POINTS` stays declared-but-`available:false` in
  `GRADING_POLICY_TYPES` until a genuinely new feature (submissions/scoring) is scoped.
- **The AI reflection-coach concept from college-counseling is explicitly deferred**, not designed in
  this fork yet. Its structural-guardrail approach (a return type with no field that can hold prose)
  is worth reusing rather than re-deriving once it's built — see
  `../college-counseling/src/lib/coach/types.ts` for the pattern, and `src/lib/ai/` (Milestone G)
  for the dispatch layer it would sit on top of.
- **`Comment` renamed to `Feedback` at reshape time, not just relabeled internally** (Milestone H,
  2026-08-16). Checked before touching it: zero code anywhere created a `Comment` row (Milestone A
  ported the model but nothing was ever built on it), so this was free — no migration, no legacy-value
  bridge needed for the visibility enum either. The rename itself was worth doing because "Comment"
  had become a genuinely confusing name by this point: Milestone G's End-of-Term **Comments** AI
  feature already owns that word elsewhere in this same codebase. Same judgment call this fork has
  made before on `Client`→`Student`, `ClientAssistant`→`ClassCoTeacher`, `Category`→`StandardCategory`:
  rename when keeping the old name would actively mislead, not just when it's inconvenient.
- **`Feedback` attaches to a specific `MasteryEvent` or `DailyCheck` (optionally), deliberately
  separate from `evidenceNote`/`note` on those same rows.** The two private fields are the teacher's
  own record-keeping — never shown to a student, no visibility concept at all. `Feedback` is the
  opposite: an explicit message with a `TEACHER_ONLY`/`STUDENT_VISIBLE` toggle the teacher sets on
  purpose. Conflating the two (e.g. adding a "make this note visible" flag to `DailyCheck.note`
  itself) was considered and rejected — it would mean a field designed for quick private shorthand
  could accidentally go out to a student, whereas a separate model makes "visible to the student" an
  opt-in action every time, never a flag left on by default.
- **The `DAILY_CHECK` feedback target upserts its `DailyCheck` row** (mirroring
  `setDailyCheckNote`'s established pattern) rather than requiring one to already exist. A `MasteryEvent`
  target does the opposite — it must already exist and is verified to belong to the claimed student
  before feedback attaches, since (unlike a daily check) there's no sensible "attach feedback to
  evidence that doesn't exist yet" case for mastery.
- **The student portal shows every active class at once, with no class switcher** — `AppShell`
  already hid the switcher for `CLIENT` role from the original scaffold, before the portal pages
  existed to use it; Milestone H just confirmed that was the right call and built accordingly.
  A student juggling several classes shouldn't have to flip between them to see an overview; the
  staff-side one-class-at-a-time pattern exists because staff act *within* a class (record evidence,
  take attendance), while a student's portal is purely read-only across all of them at once.
- **`DailyCheck`'s simplified two-toggle design was a deliberate Milestone F simplification, not a
  cancellation, of the original 4-dimension vision** — and the dogfooding check-in flagged back on
  2026-08-05 to test that call finally happened 2026-08-08. Jordi asked for the full original model
  back: `empathy`/`discipline`/`collaboration`/`citizenship`, each still a blank-by-default +/-1 tap,
  **added alongside** `engagement`/`understanding` rather than replacing them — `engagement`
  specifically is load-bearing for the WEIGHTED grading preset (`engagementPercentFor()`), so
  swapping it out would have silently changed already-computed grades. `roster-monitor.tsx` was
  refactored from two hardcoded table columns to a `DIMENSIONS`-driven grid as part of this, so a
  future 7th dimension is a one-entry array addition, not another hand-written column.
- **A daily note is one holistic free-text field per (student, class, day), not one per dimension**
  (added 2026-08-08, same day as the 4-dimension expansion above). `DailyCheck.note` had existed on
  the model since it was first designed but was never wired to any read/write path — this just
  connects it, no schema change. Kept singular rather than per-dimension because the ask was to
  "elaborate on any positive or negative issue noted" for the day, and a teacher jotting a note is
  almost always explaining the whole picture ("distracting today, but stepped up during group work
  after"), not annotating one toggle in isolation — a per-dimension note would fragment that into
  disconnected clauses. Reachable via a modal, not inline, since free text needs more room than a tap
  target; `Modal`/`Textarea` (already-existing UI primitives) were reused rather than adding new ones.
- **The trend-suggestion chip (Milestone I) is two independent signals, combined by "bad wins,"
  never a single opaque score.** Mastery trend (oldest vs. newest half of a student's `MasteryEvent`s
  for the class, needs ≥3 events) and engagement trend (last 7 logged days vs. the 7 before, needs ≥2
  logged days each side) are computed separately in `reports-math.ts::computeTrendSuggestion` and
  only combined at the very end: `NEEDS_SUPPORT` if either signal is bad, `EXCELLING` only if both
  present signals are good, `null` (no chip at all) if there's no usable signal on either side. The
  deliberate asymmetry — one bad signal is enough to flag concern, but excellence needs both — mirrors
  how a teacher would actually reason about it: you don't need two problems to justify a look-in, but
  you'd want more than one good sign before calling a kid excelling. Never auto-applied to
  `Student.flag` — always a dismissible suggestion the teacher clicks to accept, reusing the existing
  `setStudentFlag` action unchanged.
- **The AI usage/cost panel (Milestone I, `/admin/settings`) can only ever reflect Assignment Builder
  spend, and says so explicitly.** The End-of-Term Comments generator (Milestone G.1) was deliberately
  built to persist nothing — the whole point was "editable draft, you copy it out yourself, no new
  storage." That design choice means its AI cost genuinely has nowhere to accumulate; the panel
  states this rather than silently under-reporting total spend as if Assignment-only figures were the
  whole picture.
- **The Milestone A placeholder daily checklist (`DEFAULT_CHECKLIST`/`getTodayChecklist`/
  `DailyChecklist`) was replaced, not extended, once real per-class check-in data existed** (Milestone
  I, 2026-08-16) — `reports.ts::dailyChecklistFor()` reads the exact `ChecklistCompletion` rows
  `setDailyCheck`/`setDailyCheckNote` had already been auto-deriving since Milestone F (keyed
  `monitor_${classId}`), so surfacing them was a pure read-side addition, no new writes. The old
  system's genuinely dead code (`getTodayChecklist`, the `DailyChecklist` component — zero remaining
  callers after the swap, confirmed by grep) was deleted outright, following this fork's established
  precedent of removing code once nothing references it (e.g. `LEGACY_VISIBILITY` at the Milestone H
  reshape). `toggleChecklistItem`/`DEFAULT_CHECKLIST` in `src/actions/tasks.ts`/`enums.ts` were
  deliberately left alone despite also having zero remaining callers — unlike the never-written
  `Comment` model, real `ChecklistCompletion` rows may exist under those old item keys from actual
  usage, and there's nothing to gain by deleting an orphaned action that doesn't touch that data
  either way.

## What was stripped (Milestone A)

No classroom equivalent exists for: the CV/cover-letter AI subsystem (`src/lib/cv/`, `CvProfile`,
`GeneratedCv`), the job-search subsystem (`src/lib/jobsearch/`, `SavedSearch`), `src/lib/ssrf.ts` and
URL-extraction routes, `Job`/`JobFile` and everything keyed off them, `DailySummary` (absorbed by
`DailyCheck` + repurposed `ChecklistCompletion`), and the job-pipeline-specific option sets in
`src/lib/enums.ts`.

Several admin/staff/portal pages were reduced to minimal working stubs rather than adapted in
Milestone A, since they were built entirely around Job-pipeline data with no 1:1 replacement — they
get properly rebuilt as the real models land (Milestones C, D, E, F, I).

## What came back (and why)

The admin API-key Settings page (`src/lib/settings.ts`, `src/lib/crypto.ts`, the `Setting` model) was
stripped in Milestone A ("no AI-provider-key management needed until the reflection-coach work
resumes") and came back in Milestone G.1 (2026-08-08) — not for the reflection-coach, but because
Jordi asked first for an End-of-Term Comments generator and later an Assignment Builder, both needing
the same multi-provider-key-management. This is an amendment to Milestone A's record, not a walk-back
of the original call: at the time, no AI feature was in scope at all, so stripping it was correct;
scope changed 2026-08-04 (Assignment Builder) and again 2026-08-08 (Comments, moved ahead of it — see
"Decisions made so far"). Re-scoped differently from the source this time: 6 keys instead of the
original 10; no branding/plan/job-board settings; and the CV-specific `src/lib/cv/` registry/dispatch
was rebuilt as the domain-neutral `src/lib/ai/`, not revived verbatim — see "Decisions made so far"
for the `json`/text dual-mode generalization that made this possible.

`src/lib/storage.ts` also came back (2026-08-08, for `AssignmentMaterial` uploads) — **local-disk-only**,
deliberately without its Supabase branch (`supabase-storage.ts`, `@supabase/supabase-js`), which would
do nothing until this app is actually deployed online; that branch stays stripped until then. `JobFile`
itself was never revived — `AssignmentMaterial` is new, only modelled on its shape (see the domain
mapping table above).

## Gotchas inherited from the source app

SQLite has no `mode: "insensitive"` and no `directUrl` (matters if/when migrating to Postgres);
`AUTH_SECRET` is required with no fallback (the app throws on boot if missing).
