# TODO / Roadmap — Class Copilot

> **This is the sole authoritative status document.** Every milestone's checklist, decision, and
> "notable change" callout lives here and only here — README.md and CONTEXT.md deliberately do not
> restate status, so they can't go stale the way they did in the college-counseling fork's first pass.

_Last updated: 2026-08-16 — **Milestones A through I are all complete** (C.3 is the sole exception,
still blocked on Jordi's Google Cloud setup). Post-E, mastery-calculation models were made
configurable per class. F's last open item — the dogfooding check-in on Monitor's design — was
resolved: Jordi asked for the full original 4-dimension model, now shipped alongside the original
two, plus a per-day note/comment option. G was re-sequenced at Jordi's request (Comments before the
Assignment Builder) and both pieces are done, along with the AI infra (`/admin/settings`) both depend
on. H (student portal) renamed `Comment`→`Feedback` and reshaped it to attach to specific evidence,
then built the portal on top. I (teacher dashboard & reporting) closed out the same day — real
mastery/engagement charts, a computed (non-authoritative) trend-suggestion chip, a "students needing
attention" list, and a real per-class daily checklist replacing the last Milestone A placeholder.
Only Milestone J's explicitly-deferred backlog and the blocked C.3 remain._

## Early slice: Monitor + Standards — 2026-08-05

Jordi asked directly for a working roster/check-in page and a standards page before the full
lettered sequence would have reached them, plus flagged a second broken nav link (`Clients` still
pointed at the pre-Milestone-B `/admin/clients` route). All three landed today, ahead of their
originally-planned milestones:

- **Nav fix**: `nav-config.ts`'s `Clients` entry (dead link to `/admin/clients`) → `Students`,
  pointing at the real `/admin/students` route. `middleware.ts` also had stale `/jobs`, `/cv`,
  `/clients` prefixes left from Milestone A — trimmed, `/classes` added.
- **New shared route group**: `src/app/classes/` (layout + `requireStaff()`, reachable by both
  Teacher and Co-Teacher, unlike the role-specific `/admin` and `/assistant` trees) — this is the
  route shape originally sketched for Milestone F's engagement-logging UI, built now instead.
- **`Standard` model** (Milestone D's core model, built early): class-scoped, optional
  `StandardCategory`, `code`/`title`/`description`/`order`. `/classes/standards` CRUD page,
  scoped to whichever class is currently selected via the header class-switcher.
- **`DailyCheck` model + `/classes/monitor` page** — **a deliberately simpler design than the
  originally-planned `EngagementLog`** (which was speculative — 4 separate dimensions:
  empathy/discipline/collaboration/citizenship, each ±1). What Jordi actually asked for was two
  quick per-student daily reads: **engagement** (Engaged/Distracting) and **understanding**
  (Understands/Needs reinforcement) — so `DailyCheck` has exactly those two nullable fields,
  `@@unique([studentId, classId, date])`, upserted on tap with the same blank-by-default,
  3-state-cycle UX already established (unset → positive → negative → unset). **Deliberately not
  tied to a specific `Standard`** — this is a fast daily signal, not a formal mastery assessment;
  linking it to specific standards is a natural follow-up if wanted, not assumed here.
- First write for a `(classId, date)` auto-upserts a `ChecklistCompletion` row keyed
  `monitor_${classId}` (the auto-derived "did I check in today?" signal from the original Milestone
  F design) — stored now, not yet surfaced on the dashboard (that's Milestone I's job).

**Open question worth resolving before Milestone D/F formally land**: does this simpler two-toggle
`DailyCheck` model replace the originally-planned multi-dimension `EngagementLog` + standards-linked
`MasteryEvent` entirely, or do both eventually coexist (quick daily check vs. richer periodic
assessment)? Not resolved — flagging so Milestone D/F aren't built redundantly against the older
speculative design without checking in first.

## Roadmap re-prioritized — 2026-08-04

After Milestone A, Jordi gave feedback that reshaped the plan: (1) nav links pointing at routes
stripped in Milestone A — fixed immediately, see below; (2) standards setup is "the main purpose of
the platform" and needs to land sooner; (3) he wants multiple preset grading models with weighted
options; (4) he wants roster bulk-import from both CSV and a live Google Sheets connection; (5) the
old CV Builder should become an AI-powered Assignment Builder tied to standards, reviving the
scaffold's multi-provider AI dispatch. Milestones were re-lettered accordingly:

| Letter | Title | Was |
|---|---|---|
| A | Fork & bootstrap ✅ | A |
| B | Data model rename & reshape ✅ | B (unchanged, +2 fields) |
| C | Classes, roster & bulk import (CSV + Google Sheets) | old C, expanded |
| D | Standards & mastery tracking ✅ | old **E** — moved up |
| E | Grading policy & computed grades ✅ | **new** |
| F | Daily engagement logging ✅ | old **D** — moved down |
| G | AI infra revival + Assignment Builder ✅ | **new** |
| H | Student portal ✅ | old F |
| I | Teacher dashboard & reporting ✅ | old G |
| J | Explicitly deferred / out of scope | old H, amended |

C.3 (Google Sheets) is a parallel track blocked on Jordi setting up his own Google Cloud OAuth
credentials (steps below) — it must not block D or E.

## Milestone A — Fork & bootstrap ✅ done

- [x] Copy `../` (the CRM root scaffold) into `classroom-tracker/`, excluding `node_modules/`,
      `.next/`, `prisma/dev.db`, `.env`, and the sibling `college-counseling/` fork.
- [x] Rename `package.json` → `classroom-tracker`, fresh description.
- [x] Strip dead subsystems with no equivalent in this domain: CV/cover-letter AI subsystem
      (`src/lib/cv/`, `CvProfile`, `GeneratedCv`), job-search subsystem (`src/lib/jobsearch/`,
      `SavedSearch`), `Job`/`JobFile` and everything keyed off them, `src/lib/ssrf.ts` +
      URL-extraction API routes, `DailySummary`, the admin API-key Settings page
      (`src/lib/settings.ts`, `src/lib/crypto.ts`), and the job-pipeline-only option sets in
      `src/lib/enums.ts`. See CONTEXT.md → "What was stripped" for the full list.
- [x] Fresh `README.md` / `CONTEXT.md` / `TODO.md`.
- [x] `.env` created from `.env.example` with a freshly generated `AUTH_SECRET`.
- [x] `npm install`, `prisma db push`, classroom-flavored seed data on the original CRM schema.
- [x] `npx tsc --noEmit` clean, `npm run build` clean, `next dev` verified.
- [x] **Follow-up (2026-08-04): broken-link sweep.** `nav-config.ts` and `notification-bell.tsx`
      still listed/linked routes stripped earlier in this milestone (Jobs, CV Builder, Job Search,
      Daily Summaries, Reports, Settings, `/jobs/${relatedJobId}`). Nav trimmed to only real routes;
      dead `relatedJobId` field removed from the client-side Notification type.

**Decision made**: `ClientAssistant` will become a **class-level** assignment (`ClassCoTeacher`) in
Milestone B rather than a literal 1:1 rename — see CONTEXT.md for why.

**Notable change from the precedent**: several dashboard/detail pages were reduced to minimal
working stubs rather than incrementally adapted, since they were built entirely around Job-pipeline
data with no direct replacement yet.

**Bug found and fixed along the way**: the shared `ActionResult` type lived in `src/actions/jobs.ts`
in the source scaffold — deleting that file broke 7 unrelated files that only wanted the type. Moved
to a new `src/actions/types.ts`.

## Milestone B — Data model rename & reshape ✅ done

- [x] `Client` → `Student` (`fieldLabel`→`gradeLevel`, dropped job-search preference fields +
      `jobSeq`, added `flag` field EXCELLING/ON_TRACK/NEEDS_SUPPORT, status ACTIVE/PAUSED/ARCHIVED →
      ACTIVE/INACTIVE/ARCHIVED). Plus the amendment fields for roster import: `email String? @unique`
      and `externalId String?`, both indexed.
- [x] `ClientAssistant` → `ClassCoTeacher`, re-pointed to class-level (see Decision above) — student
      access for a co-teacher is now derived via `Enrollment`, a genuine 2-hop lookup.
- [x] `Category` → `StandardCategory`.
- [x] Added `Class` (teacherId, name, subject, period, academicYear) and `Enrollment`
      (studentId+classId join, status ACTIVE/DROPPED/COMPLETED) models.
- [x] `Task.clientId` → `Task.studentId`, plus a new nullable `Task.classId` for class-wide tasks.
- [x] Hand-ported `src/lib/access.ts` first (the security spine): `accessibleStudentIds` now does
      the 2-hop `ClassCoTeacher → Enrollment` lookup for co-teachers; new `accessibleClassIds`,
      `classScopeWhere`, `canAccessClass`/`assertCanAccessClass` (no equivalent existed in the source
      CRM — needed since roster/logging/standards UIs are class-scoped, not just student-scoped).
- [x] Hand-ported `src/lib/auth.ts`: `SessionUser.clientId` → `studentId`, `requireClient()` returns
      `{studentId}`, `authenticate()`/`getSessionUser()` read `studentAccount` instead of
      `clientAccount`.
- [x] `src/lib/clients.ts` (+ `client-switcher.tsx`) → `src/lib/classes.ts` (+ `class-switcher.tsx`),
      `UserPreference` key `currentClientId` → `currentClassId`.
- [x] `tsc --noEmit`-driven propagation pass across `src/actions/*`, `src/app/**`, `src/components/**`
      (renamed `clients.ts`→`students.ts` action file, dropped the per-student `assignAssistant`/
      `AssistantAssigner` UI since co-teacher assignment is now class-level — rebuilt properly at the
      class level in Milestone C; added a minimal `src/actions/classes.ts::switchClass` just to keep
      the header switcher functional ahead of full Class CRUD).
- [x] Adapted `scripts/isolation-test.mts` for the 2-hop model, using a real overlap case from seed
      data (one student enrolled in two classes taught by different co-teachers) to exercise the
      cross-class IDOR boundary specifically, not just single-class access.
- [x] Verify: `tsc --noEmit` clean, `npm run build` clean (16 routes), isolation test 15/15 passing,
      dev server boots, protected routes redirect correctly, reseed succeeded.

**Decision made**: dropped the per-student assistant-assignment UI/actions entirely in this
milestone rather than shimming them — `assignAssistant`/`unassignAssistant`/`AssistantAssigner`
had no coherent meaning once co-teacher assignment became class-level. The Assistants/Co-Teachers
admin page still shows each co-teacher's class assignments (read-only chips) sourced from
`ClassCoTeacher`, with assignment management itself deferred to Milestone C's class detail page.

**Notable change**: `Student.status` values changed from `ACTIVE|PAUSED|ARCHIVED` (inherited
verbatim from `Client` in Milestone A) to `ACTIVE|INACTIVE|ARCHIVED` — "Paused" reads oddly for a
student; "Inactive" better fits an enrollment-lifecycle state (e.g. withdrawn).

**Database note**: `prisma db push --force-reset` was required (SQLite can't cleanly apply a rename
of this scope via a plain push) — this destroys local dev data. Confirmed with Jordi before running;
only seed/demo data existed at the time, no real work was lost. Reseeded immediately after.

## Milestone C — Classes, roster & bulk import

- [x] **C.1 — Classes & roster** ✅ done 2026-08-06: `/admin/classes` CRUD (list/create/archive via
      `setClassArchived`), `/admin/classes/[id]` (edit details, roster via `RosterManager` —
      enroll/remove existing students, `ClassCoTeacher` assignment via `CoTeacherAssigner`).
      Enrollment removal flips `Enrollment.status` to `DROPPED` rather than hard-deleting, so a
      student's `DailyCheck`/future `MasteryEvent` history from that enrollment period stays
      attached to a real row. `Student.flag` roster badges reused from Milestone B. Class-switcher
      already functional from Milestone B, now has real classes (beyond seed data) to switch between.
- [x] **C.2 — Bulk import pipeline + CSV source** ✅ done 2026-08-06: `src/lib/import/` (`types.ts`,
      `csv.ts` — hand-rolled RFC-4180 parser, parsed client-side via `File.text()` so student PII
      never touches the server as an upload, `map.ts` header-guessing, `prepare.ts` — server-side
      dedupe by email → externalId → case-insensitive name-within-class), `src/actions/roster-import.ts`
      (`previewRosterImport`/`importRoster`, 300-row cap, one transaction, one summary activity-log
      entry, re-derives the preview server-side rather than trusting the client's). 3-step wizard UI
      at `/admin/classes/[id]/roster/import` (source → map → confirm), reachable from the class
      detail page's roster panel. A "paste from a spreadsheet" tab was added alongside file upload —
      cheap (same parser, tab-delimited) and is also the working fallback while C.3 is blocked.
      **Verified**: new `scripts/roster-import-test.mts` (mirrors `isolation-test.mts`'s pattern of
      re-implementing `server-only`-marked logic locally, since plain `tsx`/Node can't resolve the
      `server-only` package the way Next.js's bundler does) — CSV quoting/tab-sniffing, header
      mapping, the full dedupe ladder against real seed data, idempotency (re-running the same
      preview twice yields identical verdicts), and cross-class isolation of the dedupe (a student
      enrolled in Period 5 previewed against Period 3 correctly reads MATCH_EXISTING, not
      ALREADY_ENROLLED) — all pass.
- [ ] **C.3 — Google Sheets source** (parallel track, does not block D/E) — UI stub shipped (a
      disabled "Connect Google" button in the import wizard's source step, explaining it's not set
      up yet); the OAuth flow itself is not built. Ephemeral OAuth only (no refresh token, no stored
      Google credential — short-lived httpOnly cookie, cleared after import), hand-rolled `fetch`
      calls (not the `googleapis` SDK) for the 3 endpoints needed, `jose`-signed `state` param for
      CSRF, paste-URL-or-ID + tab dropdown (not the Drive Picker).
      **Blocked on Jordi**: create a Google Cloud project → enable Sheets API → configure OAuth
      consent screen (External, add himself as a test user, scope `spreadsheets.readonly`, leave in
      "Testing") → create an OAuth Client ID (Web application, redirect
      `http://localhost:3000/api/google/callback`) → put Client ID/Secret in `.env` as
      `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. CSV upload and paste both work fully without this.
      **Update (2026-08-21)**: if Milestone S's "Google Sign-In setup" was already done, this
      reuses the SAME OAuth client — just add `spreadsheets.readonly` to the consent screen's
      scopes and this feature's redirect URI (`/api/google/callback`) to the existing client,
      no new Client ID/Secret needed.

## Milestone D — Standards & mastery tracking ✅ done 2026-08-07

- [x] Standards CRUD — shipped early (2026-08-05, see "Early slice" above) at `/classes/standards`
      rather than `/admin/classes/[id]/standards` as originally sketched; `code` field (e.g.
      `RL.9-10.2`) was included from the start.
- [x] `MasteryEvent` model (append-only — never edited/overwritten) + `src/lib/mastery-math.ts`
      (`computeMastery`, pure/client-safe) + `src/lib/mastery.ts` (`currentMasteryFor`,
      `currentMasteryForStudents` bulk variant, `currentMasteryForAllStandards`).
- [x] **Resolved with Jordi (2026-08-07)**: neither pure most-recent-wins nor pure highest-ever-wins
      — a **recency-weighted average of all events**, where each event's weight equals its position
      in chronological order (oldest = weight 1, each subsequent event = weight+1, so the most
      recent of n events counts n× as much as the very first). "Most recent counts for more, but
      earlier evidence still helps build the picture" rather than being discarded once a newer event
      exists. Explainable as a formula (not opaque exponential decay), and a real regression still
      shows up (it's not sticky at a past high) while a single early low score doesn't overwrite
      months of since-demonstrated improvement. This directly determines Milestone E's
      `masteryPercentFor()` behavior.
- [x] Mastery-entry UI at `/classes/mastery`: pick a standard (dropdown, scoped to the current class),
      set a shared evidence type/note for the batch, tap 1–4 per student to append a `MasteryEvent`
      — current computed level + raw weighted average + sample size shown live, updated optimistically
      on tap using the identical weighting formula client-side.
- [x] Per-student mastery timeline added to `/admin/students/[id]` — current level + full
      chronological evidence list (level, evidence type, note, who recorded it, when), grouped by
      standard, across every class the student is actively enrolled in.
- [x] **Verified**: new `scripts/mastery-test.mts` (pure-formula hand calculations plus a real
      seeded-fixture round trip through actual `MasteryEvent` rows) — 9/9 passing, including that a
      rising trend pulls the average up more than a flat mean would, a falling trend still shows real
      regression, and input order doesn't affect the result (sorted internally by `recordedAt`).

## Milestone E — Grading policy & computed grades ✅ done 2026-08-08

- [x] `GradingPolicy` model (per-class, `type` STANDARDS_ONLY|WEIGHTED|POINTS, `configJson` —
      zod-validated on write in `src/lib/validations.ts::gradingPolicySchema`, in deliberate
      contrast to the lenient `AssignmentDoc` parsing planned for the AI Assignment Builder
      milestone — see CONTEXT.md's "who authored it" principle).
- [x] `src/lib/grading-math.ts` (pure, client-safe: `levelToPercent` piecewise-linear interpolation
      for a fractional mastery average, `averagePercents`, `weightedAverage`, `roundPercent`,
      `letterFor`) + `src/lib/grading.ts` (`getGradingPolicy`, `computeGrade`,
      `computeGradesForClass` — the bulk/roster path, one fixed set of queries regardless of roster
      size, never N+1).
- [x] **Accelerated ahead of schedule**: `engagementPercentFor()`/`engagementPercentForStudents()`
      landed in a new `src/lib/engagement.ts` **now**, not stubbed until Milestone F as originally
      planned — the `DailyCheck` model it reads from already existed from the "early slice" work
      (2026-08-05), so there was no reason to leave it returning `null`. Unlogged days are excluded
      from the average, never counted as zero, per the confirmed design.
- [x] Presets: STANDARDS_ONLY (level→% mapping, default 55/70/85/100) and WEIGHTED (mastery/
      engagement split, default 70/30, engaged/distracting day values default 100/50) — both fully
      wired to real data, not placeholders. `weightedAverage` **excludes** a missing component from
      both the numerator and the weight total rather than zeroing it, so a class with mastery
      evidence but zero engagement logs still gets a fair mastery-only grade. POINTS is declared in
      `GRADING_POLICY_TYPES` (`available: false`, shown greyed-out with "(coming soon)" in the UI)
      but not built — it needs scored assignments, which don't exist until the Assignment Builder
      milestone, and that milestone deliberately ships no per-student score row.
- [x] Grading policy UI at **`/classes/grading`** (deviates from the originally-sketched
      `/admin/classes/[id]/grading` for the same reason Standards moved — `/admin/*` is OWNER-only
      at the layout level, and co-teachers need read-only access; uses the shared class-switcher
      context instead of a class-id route param, consistent with Monitor/Standards/Mastery). Live
      preview panel recomputes instantly client-side (same pure `grading-math.ts` functions) against
      up to 3 real enrolled students' current data as the teacher adjusts weights/percentages —
      nothing is saved until submit. OWNER can edit; ASSISTANT sees the same page with all inputs
      disabled and a note explaining why.
- [x] Grades surface on the class roster table (`/admin/classes/[id]`) and the student detail page
      (`/admin/students/[id]`, one row per enrolled class since a student's grade is always
      per-class). Portal surfacing deferred to Milestone H as planned (no student portal yet).
- [x] **Verified**: new `scripts/grading-test.mts` — 18/18 passing, including interpolation edge
      cases, the null-exclusion behavior (the most important behavioral guarantee — verified it does
      NOT silently zero a missing component), and a full 70/30 weighted-grade calculation against
      real `MasteryEvent`/`DailyCheck` rows in a self-contained fixture (its own class/student/
      standard, cleaned up after — unlike `isolation-test.mts`/`roster-import-test.mts`, this one
      doesn't depend on named seed data that can drift through real usage).

## Post-Milestone-E addition: configurable mastery-calculation models — 2026-08-08

Before moving on to Milestone F/G, Jordi asked for research into other standards-based-grading (SBG)
models: how much a recent standard grade should outweigh older evidence (and whether that's
tunable), and whether homework/observation should count the same as an assessment. Landed as an
extension of the already-shipped Milestone D mastery engine and Milestone E grading policy, not as
a new lettered milestone — it's a refinement of existing scope, not new scope.

- [x] `GradingPolicy.masteryStrategy` + `masteryConfigJson` (new columns, additive `db push`, no
      reset needed) — orthogonal to `GradingPolicy.type` (which governs how mastery combines with
      engagement into a grade, unchanged).
- [x] Four selectable models in `src/lib/mastery-math.ts::computeMastery()`:
      **Recency-Weighted Average** (the existing default, unchanged — linear position weighting),
      **Decaying Average** (Marzano-style `new = old*(1-d) + latest*d`, tunable decay rate, default
      0.35), **Most Recent Evidence** (only the last N events count at all, tunable window),
      **Highest of Recent Evidence** (best level shown within the last N events wins outright —
      retake-friendly). All four are documented research findings from common SBG practice, not
      invented from scratch.
- [x] Evidence-type weight map (`EvidenceWeightMap`) — a per-`evidenceType` multiplier (default 1)
      applied before any strategy runs; setting a type to 0 excludes it from the grade entirely.
      Directly answers "does homework count the same as an assessment?" — it's now a per-class
      config choice (e.g. weight QUIZ/PROJECT/RETAKE at 1, HOMEWORK/OBSERVATION/CONVERSATION at 0
      or 0.5) instead of a hardcoded "everything's equal" rule.
- [x] Configured **per class**, not globally (confirmed with Jordi) — a student enrolled in
      multiple classes can have each class's mastery computed under a different strategy;
      `currentMasteryForAllStandards()` (the student-detail-page summary) resolves each standard's
      own class's config rather than assuming one strategy app-wide.
- [x] `/classes/grading` UI extended: model picker with an inline explanation of each strategy,
      conditional decay-rate/window-size inputs (only shown for the strategies that use them), and a
      7-field evidence-type weight grid. The live preview panel was upgraded to send **raw**
      MasteryEvent rows (not pre-aggregated levels) for up to 3 enrolled students, so it can
      recompute `computeMastery()` client-side against the *currently selected, not-yet-saved*
      strategy — previously the preview only ever reflected whatever was already saved.
- [x] **Verified**: `scripts/mastery-test.mts` extended with 7 new checks (16/16 total) — hand-
      calculated formula checks for each of the 3 new strategies plus two evidence-weighting checks
      (weighting a type to 0 fully excludes it; a heavier-weighted type moves a decaying average more
      than a lighter one). `scripts/grading-test.mts` re-run for regression — still 18/18, unchanged,
      since the new fields default to the prior RECENCY_WEIGHTED/all-weights-1 behavior. `tsc`/build
      clean (22 routes, `/classes/grading` now 6.91 kB), dev server smoke-tested.

## Milestone F — Daily engagement logging ✅ done 2026-08-08

Most of this shipped early or as a side effect of other milestones, under a simpler design than
originally planned (see the "Early slice" entry above). The one genuinely open item — a dogfooding
check-in on whether the simplified two-toggle design was enough — was finally had today, and Jordi
asked for the fuller original vision after using the simple version for real.

- [x] Roster-grid quick-logging UI — shipped 2026-08-05 at `/classes/monitor` (blank-by-default,
      3-state tap per dimension, no Save button) — same shape as planned, different route/model name.
- [x] Upsert Server Action, keyed on `@@unique([studentId, classId, date])` —
      `src/actions/daily-checks.ts::setDailyCheck`.
- [x] Auto-derived daily-checklist signal — `setDailyCheck` upserts a `ChecklistCompletion` row keyed
      `monitor_${classId}` on first write for the day, done 2026-08-05. **Not yet done**: this isn't
      surfaced anywhere in the UI yet (no dashboard widget reads it) — that's Milestone I's job, not
      forgotten, just not built.
- [x] `src/lib/engagement.ts::engagementPercentFor()` — done 2026-08-08 as part of Milestone E (see
      above), earlier than planned since `DailyCheck` already existed.
- [x] **Dogfooding check-in — resolved 2026-08-08**: asked Jordi directly whether the two-toggle
      design (Engagement, Understanding) was enough now that he'd used it for real, or whether he
      wanted the originally-envisioned 4-dimension model (empathy, discipline, collaboration,
      citizenship). He chose to build out the full original model.
- [x] **`DailyCheck` extended with the 4 original dimensions** — `empathy` (`SHOWED_EMPATHY` |
      `LACKED_EMPATHY`), `discipline` (`DISCIPLINED` | `UNDISCIPLINED`), `collaboration`
      (`COLLABORATIVE` | `UNCOOPERATIVE`), `citizenship` (`GOOD_CITIZENSHIP` | `POOR_CITIZENSHIP`).
      **Additive, not a replacement** — Engagement and Understanding stay exactly as they were
      (Engagement specifically still drives the WEIGHTED grading preset via `engagementPercentFor()`;
      swapping it out would have silently changed already-shipped grades). Schema change was a plain
      additive `db push`, no reset needed.
- [x] `src/actions/daily-checks.ts::setDailyCheck` generalized from a 2-field ternary to a 6-field
      dynamic dispatch (`DailyCheckField` union), validated by zod against all 6 fields' value sets.
- [x] `src/components/monitor/roster-monitor.tsx` refactored from two hardcoded columns to a
      `DIMENSIONS`-driven grid — adding a 7th dimension later is a one-entry array addition, not a
      new hardcoded column. Table wrapper switched `overflow-hidden` → `overflow-x-auto` since 6
      toggle columns can now exceed a narrow viewport.
- [x] **Verified**: `tsc`/build clean (22 routes, `/classes/monitor` now 5.18 kB), a real-DB round
      trip through all 4 new fields (write via upsert, read back, confirm exact values, clean up),
      dev server smoke-tested with no runtime errors.
- [x] **Notes/comments on any flag — added 2026-08-08**, before moving to Milestone G. `DailyCheck`
      already had an unused `note` column (present since the model was first designed, never wired
      up) — no schema change needed. One holistic free-text note per (student, class, day), not
      per-dimension: a 7th "Notes" column in the roster grid shows a filled icon (with the note as a
      tooltip preview) when a note exists, blank outline otherwise; tapping it opens a modal
      (`src/components/ui/modal.tsx`) with a textarea to add/edit/clear it. New action
      `src/actions/daily-checks.ts::setDailyCheckNote` — the checklist-completion auto-tick logic
      shared with `setDailyCheck` was factored into a `markCheckedIn()` helper so a note-only write
      still counts as "checking in" for the day. **Verified**: `tsc`/build clean (`/classes/monitor`
      now 7.62 kB), a real-DB round trip (write, confirm other dimensions stay untouched, confirm the
      checklist still ticks, confirm clearing the note sets it back to `null`), dev server
      smoke-tested.

## Milestone G — AI infra revival + Assignment Builder

**Re-sequenced 2026-08-08, at Jordi's request**: he asked for an AI End-of-Term Comments generator
(drafts a report-card comment per student from their real Monitor + mastery data) — a feature not in
the original roadmap at all. It shares G.1's AI infra with the Assignment Builder but is otherwise
independent and simpler (no file upload, no standards-picker UI, no JSON contract to parse), so it
was built first. Scope decisions (asked via AskUserQuestion before building): date range is picked
manually each time (no `Term` model), and a generated comment is an editable draft only — nothing is
persisted beyond what already existed.

- [x] **G.1 — AI infra revival, done 2026-08-08**: `Setting` model (`key`/`value`/`updatedById`/
      `updatedAt`) + `src/lib/crypto.ts` (verbatim AES-256-GCM, keyed off `AUTH_SECRET`) +
      `src/lib/settings.ts` (trimmed: `MANAGED_KEYS` is exactly 6 — `GEMINI_API_KEY`,
      `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_CLIENT_ID`,
      `GOOGLE_CLIENT_SECRET` — the last two unused today, reserved for the still-blocked C.3 Google
      Sheets import at zero extra cost via the same DB-first/env-fallback `getApiKey`). `/admin/settings`
      page (OWNER-only): API key manager (masked, website-vs-env source badge), AI engine
      enable/disable toggles + per-provider temperature, and the Comments prompt editor.
- [x] **`src/lib/ai/`** — domain-neutral registry (`engines.ts`, adapted from `crm/src/lib/cv/`,
      `Cv*`→`Ai*`) + per-provider callers (`gemini-call.ts`/`openai-call.ts`/`claude-call.ts`/
      `openrouter-call.ts`) + `run-model.ts` (single `runModel(prompt, modelValue, opts)` entry point)
      + `model-guard.ts` (`validateAiModel`, `aiErrorMessage`). Generalized beyond the source CRM: each
      caller takes an `opts.json` flag so it returns either plain prose (Comments, today) or strict
      JSON (a future Assignment Builder) — the source always forced JSON mode since the CV builder
      never needed prose. The `` `${Provider} API {status}: ...` `` error-string convention every
      caller throws is preserved and load-bearing for `aiErrorMessage()`'s regex — any future provider
      caller must keep it.
- [x] **End-of-Term Comments generator — done 2026-08-08**, at `/classes/comments` (shared
      `requireStaff` route group, same as Monitor/Standards/Mastery/Grading). Pick a student from the
      class roster → pick a date range → pick an AI engine → Generate. `src/lib/comments/summary.ts`
      (server-only) aggregates that student's `DailyCheck` tallies (all 6 dimensions) + free-text
      notes + **range-scoped** standards mastery (only `MasteryEvent`s inside the picked range count —
      an end-of-term comment reflects the term, not the student's all-time history) into a
      `StudentTermSummary`. `src/lib/comments/format.ts` (pure, client-safe, mirrors the
      `mastery-math.ts`/`mastery.ts` split) turns that into the admin-editable prompt's placeholders
      and is what `src/actions/comments.ts::generateStudentComment` calls after `runModel()`. The
      model's raw text output **is** the comment — no JSON parsing anywhere in this pipeline, which is
      the one deliberate simplification prose generation gets over the CV Builder's/future Assignment
      Builder's structured-doc contract. Nothing is persisted; the draft is shown in an editable
      textarea with a Copy button.
- [x] **Verified**: `tsc`/build clean (24 routes; `/admin/settings` 4.38 kB, `/classes/comments`
      2.23 kB). New `scripts/comments-test.mts` — 22/22 passing: pure prompt-formatting edge cases
      (placeholder substitution, "no data" fallbacks, a zero-activity dimension correctly omitted, not
      shown as "0x"), the AI engine lock/enabled-state derivation logic, a crypto round-trip
      (encrypt→decrypt, plus a tampered-ciphertext-fails-to-decrypt check), a `Setting` table round
      trip against the real DB, and a self-contained-fixture integration check proving date-range
      scoping actually excludes out-of-range `DailyCheck`/`MasteryEvent` rows from the generated
      summary. Authenticated smoke test (minted a real session JWT, no browser needed) confirmed both
      `/admin/settings` and `/classes/comments` render correctly with **zero AI provider keys
      configured** — the explicit "degrades cleanly" requirement from this milestone's original plan.

### Assignment Builder — done 2026-08-08

Built G.2/G.3 in one pass, right after Comments as planned. One deliberate route deviation from the
original plan: **`/classes/assignments`, not `/admin/assignments`** — same reasoning as
Standards/Mastery/Grading/Comments (`/admin/*` is OWNER-only at the layout level; a co-teacher can
reasonably want to build materials for their own sections too, so this stayed on the shared
`requireStaff` route group instead of being walled off).

- [x] **Schema**: `Assignment` (`title`, `assignmentType`, `summary`, `contentJson`, `status`
      DRAFT|READY|ARCHIVED, `source` AI|AI_IMPROVED|MANUAL, plus the last generation's `engine`/token
      counts/`estCostUsd` — null if never AI-generated), `AssignmentStandard` (explicit join, not an
      implicit m2m, so the builder can query/resync it directly), `AssignmentMaterial` (modelled on the
      source CRM's `JobFile`, not a revival of it — denormalized `classId` for the same single-table
      IDOR check `JobFile.clientId` enabled). All additive, no reset needed.
- [x] **`src/lib/assignments/types.ts`** — `AssignmentDoc` (header + ordered typed sections:
      instructions/questions/activity/materials/rubric/answer_key/notes). `parseAssignmentDoc` is
      **lenient** (JSON.parse + shallow shape check, malformed sections dropped individually rather
      than failing the whole doc) — the deliberate opposite of `GradingPolicy.configJson`'s strict zod
      validation, per the "who authored it" principle this was originally planned around. A rubric
      row's `levels` are meant to be exactly 4 (matching Beginning/Developing/Proficient/Advanced), but
      the parser doesn't reject a different length — the section editor UI pads/truncates to 4 columns
      regardless of what's stored, so a slightly-off AI response never blocks review.
- [x] **Two prompts**, not one — `src/lib/assignments/prompt-defaults.ts` (GENERATE from scratch vs.
      IMPROVE existing material have materially different rules), both admin-editable at
      `/admin/settings` with save-time guards (required placeholders + the JSON `"sections"` contract
      must survive an edit). `src/lib/assignments/prompt.ts` (pure) assembles the final prompt;
      `src/lib/assignments/generate.ts` (server-only) fetches the real class/standards data, calls
      `runModel(prompt, model, { json: true })`, and parses the result via the new
      `src/lib/ai/json.ts::extractJson()` (generalized from the source CRM's CV-specific helper) +
      `parseAssignmentDoc`.
- [x] **"Attach and improve old material"**: paste (always available, a textarea feeding
      `{{SOURCE_MATERIAL}}`) and upload (`src/lib/assignments/extract-upload.ts`, `.docx` via
      **`mammoth`** — the one new runtime dependency this milestone adds — `.txt`/`.md` read directly;
      PDFs stored but **not** text-extracted, not an error, the UI just says to paste the text
      instead). `src/lib/storage.ts` revived **local-disk-only** — the Supabase branch was
      deliberately not brought back (would do nothing until actually deploying online; the module's
      call shape is unchanged so swapping the backend in later is contained). Files live under
      `uploads/` (already gitignored from the fork). Once an assignment is saved, an uploaded material
      with successfully-extracted text can be picked with one click ("Use as source") to seed an
      Improve generation — no re-uploading.
- [x] **Download route** `/api/materials/[id]/route.ts` — authenticated + IDOR-guarded via the
      denormalized `classId` and `canAccessClass`, same single-table-check pattern as the source CRM's
      `/api/files/[id]/route.ts`.
- [x] **Builder UI** at `/classes/assignments` (list, class-scoped, delete with confirm) →
      `/classes/assignments/new`: title/type/summary/grade level/estimated minutes → standards
      checkboxes (**≥1 required** — enforced both client-side and server-side against the real DB, not
      just trusted from the client) → source material (none/paste/attached file) → teacher notes
      (generation guidance only, not persisted) → engine picker (same locked/lockReason pattern as
      Comments) → Generate → a section-by-section editor
      (`src/components/assignments/section-editor.tsx` — add/remove/reorder sections, a dedicated
      4-column rubric grid) → Save creates the row and redirects to `/classes/assignments/[id]`, which
      unlocks the Attachments manager (upload/download/delete, "Use as source"). **Manual authoring
      works with zero AI keys configured** — Generate is simply disabled with an explanatory hint;
      every field above is hand-editable.
- [x] **No per-student score row** — confirmed unbuilt, as originally scoped. The `POINTS` grading
      preset stays declared-but-unavailable in `GRADING_POLICY_TYPES` for the same reason it always
      was. Students don't see assignments in v1 (no route exists for them to).
- [x] **Verified**: `tsc`/build clean (26 routes: `/classes/assignments` 3.13 kB,
      `/classes/assignments/new` 124 kB first-load, `/classes/assignments/[id]` 121 kB,
      `/api/materials/[id]`, `/admin/settings` grew to 7.91 kB with the two new prompt editors). New
      `scripts/assignments-test.mts` — **25/25 passing**: `extractJson` fence/prose stripping,
      `parseAssignmentDoc`'s lenient behavior (garbage input, wrong types, an unknown section kind, a
      non-object array entry, an off-length rubric row — none of it throws or corrupts the rest of the
      doc), `buildAssignmentPrompt` placeholder substitution for both GENERATE and IMPROVE modes, a
      local-disk storage round trip, and a real-DB fixture proving `Assignment`→`AssignmentStandard`/
      `AssignmentMaterial` cascade-delete behavior (children removed, the referenced `Standard` and
      `Class` themselves untouched). Regression-ran `mastery-test.mts`/`grading-test.mts`/
      `comments-test.mts` — all still passing, no interference. Authenticated smoke test (real session
      JWT) hit all four new/changed pages with **zero AI provider keys configured** — every one
      returned 200 with real rendered content and zero error-boundary markers, confirming the
      "degrades cleanly" requirement this milestone's original plan explicitly called for.

**Milestone G is now fully done.**

## Milestone H — Student portal ✅ done 2026-08-16

- [x] **`Comment` renamed to `Feedback` and reshaped**, not just relabeled — the old model had zero
      real usage anywhere in the fork (no code ever created a row, confirmed by grep before touching
      it), so this was a clean reshape, not a migration. 3-tier `PUBLIC`/`INTERNAL`/`CLIENT_VISIBLE`
      (with a legacy `ADMIN_ONLY` alias) → 2-tier `TEACHER_ONLY`/`STUDENT_VISIBLE`, default
      `TEACHER_ONLY`. Renamed because "Comment" had become ambiguous — Milestone G's End-of-Term
      **Comments** AI feature already owns that word in this codebase. Two new optional attachment
      FKs: `masteryEventId` and `dailyCheckId` (`onDelete: Cascade` on both — verified by test).
      Deliberately separate from `MasteryEvent.evidenceNote`/`DailyCheck.note`, which stay
      teacher-only private record-keeping; `Feedback` is an explicit message with its own
      visibility toggle.
- [x] **`src/lib/feedback.ts`** (server-only, no-auth-inside convention like `grading.ts`) — bulk
      `feedbackForMasteryEvents()`/`feedbackForDailyChecks()`/`feedbackForStudent()`, each taking an
      `includeTeacherOnly` flag the caller sets from the requester's actual role (staff see
      everything; a student's own portal view only ever gets `STUDENT_VISIBLE`). Soft-deleted rows
      always excluded.
- [x] **`src/actions/feedback.ts`** — `addFeedback`/`editFeedback`/`deleteFeedback` (soft-delete, kept
      for audit like the old `Comment`). `addFeedback`'s target is one of `GENERAL` /
      `{ MASTERY_EVENT, masteryEventId }` / `{ DAILY_CHECK, classId, date }` — the DAILY_CHECK case
      **upserts** the underlying `DailyCheck` row if the day has nothing else logged yet (mirrors
      `setDailyCheckNote`'s "note-only write still counts as a check-in" pattern), so a teacher can
      leave feedback on a blank day without a dead end. A `MasteryEvent`'s `studentId` is verified to
      actually match before attaching, so a spoofed-but-accessible `studentId` can't be used to attach
      feedback to a different student's evidence.
- [x] **Inline feedback UI**, both reusing one `FeedbackPanel` component (thread + compose box with a
      "Visible to student" checkbox): a new **Feedback** column on `/classes/mastery`'s roster (icon
      button opens feedback on the student's latest evidence for the selected standard, disabled until
      evidence exists) and a new section inside `/classes/monitor`'s existing day-note modal, right
      below the private note — same modal, two clearly separated concerns.
- [x] **`/portal/dashboard`, `/portal/mastery`, `/portal/engagement`** — own-progress only, no peer
      comparison/ranking, no class switcher (the portal shows every active class at once instead —
      `AppShell` already hides the switcher for `CLIENT`). Dashboard: computed grade + component
      breakdown per class (reusing `computeGrade` from Milestone E) plus a recent-feedback feed.
      Mastery: current level per standard per class, with any `STUDENT_VISIBLE` feedback shown inline
      under its standard. Engagement: last 30 days of `DailyCheck` flags per class, same inline
      feedback treatment. `CLIENT_NAV` expanded from a single "Overview" link to all three.
- [x] **Verified**: `tsc`/build clean (28 routes: `/portal/mastery` and `/portal/engagement` newly
      static-shell-sized at 145 B, `/portal/dashboard` 169 B). New `scripts/feedback-test.mts` —
      11/11 passing: visibility filtering (staff sees both tiers, a student-scoped query sees only
      `STUDENT_VISIBLE`), the `DAILY_CHECK` target's upsert-on-first-feedback behavior, the
      cross-student ownership check, soft-delete-excludes-from-queries-but-keeps-the-row behavior, and
      schema-level cascade delete. Regression-ran all four prior test scripts (mastery/grading/
      comments/assignments) — all still green. Authenticated smoke test with **two** real sessions (a
      teacher and a student, both minted JWTs) confirmed: staff routes render correctly for staff,
      portal routes render correctly for the student, and — the actual isolation check — the student's
      session hitting a staff-only route (`/classes/mastery`) got a clean 307 redirect, not a leak.

## Milestone I — Teacher dashboard & reporting ✅ done 2026-08-16

- [x] **`src/lib/reports-math.ts`** (pure, mirrors the `*-math.ts` split) — `masteryDistribution()`
      (buckets every enrolled-student × active-standard pair's current level into a class-wide
      histogram; `noEvidence` is `totalPairs - withEvidence`, not just a count of literal nulls
      passed in), `engagementTrend()` (one point per day, `percent: null` on a day with zero logs —
      "exclude, don't zero" again), and `computeTrendSuggestion()` — see below.
- [x] **Class-wide `/classes/reports`** (shared `requireStaff` route, same convention as Standards/
      Mastery/Grading/Comments/Assignments): a mastery-distribution bar chart and a 14-day
      engagement-trend line chart, both via **`recharts`** — already a dependency since the fork, just
      unused until now (no new install needed). Days with no Monitor checks logged show as a genuine
      gap in the line, not a dip to 0%.
- [x] **AI usage/cost panel** — `src/lib/assignments/usage.ts::getAssignmentUsageStats()`, added to
      `/admin/settings`. Sums tokens/cost across every AI-generated/improved `Assignment`, broken down
      by engine. **Deliberately doesn't (can't) include Comments generator spend** — that feature never
      persists a draft (Milestone G.1's design), so its cost never accumulates anywhere; the panel says
      so explicitly rather than silently under-reporting.
- [x] **Grade column on the roster** — already shipped in Milestone E (`/admin/classes/[id]`'s
      `RosterManager`). Verified still current; no rework needed, just confirming this checklist item
      against the actual code rather than assuming it was still open.
- [x] **Computed, non-authoritative trend-suggestion chip** — `trendSuggestionsForClass()` combines two
      independent signals per student: a mastery-level trend (oldest vs. newest half of their
      `MasteryEvent`s, needs ≥3 events to say anything) and an engagement-ratio trend (last 7 logged
      days vs. the 7 before that, needs ≥2 logged days each side). `NEEDS_SUPPORT` wins if either
      signal is bad; `EXCELLING` needs both signals present and good; anything else (including "no
      usable signal") stays silent rather than guessing. Shown as a small dashed chip next to a
      student's current flag on the roster **only when it disagrees** with the current flag — clicking
      it calls the existing `setStudentFlag` action (OWNER-only, unchanged) to apply it. Never
      auto-applied.
- [x] **"Students needing attention" list**, on both dashboards — `studentsNeedingAttention()` layers
      three signals: a manually-set `NEEDS_SUPPORT` flag always wins (a teacher's explicit call beats
      any computed one); otherwise a computed `NEEDS_SUPPORT` trend suggestion; otherwise a student
      with **no** mastery or engagement signal at all in the last two weeks — not struggling, just
      unobserved, which is its own reason to check in.
- [x] **Real per-class daily checklist, replacing the stale Milestone A placeholder** —
      `src/lib/reports.ts::dailyChecklistFor()` generates one "Check in — [Class]" item per the user's
      actual active classes, reading the SAME `ChecklistCompletion` rows (keyed `monitor_${classId}`)
      that `setDailyCheck`/`setDailyCheckNote` have been auto-deriving since Milestone F — flagged
      there as "not yet surfaced in any UI... Milestone I's job," now done. Read-only (no manual
      toggling — these reflect real logged activity, not a to-do list), each item links straight to
      that class's Monitor page. The old static `DEFAULT_CHECKLIST`/`getTodayChecklist`/
      `DailyChecklist` component are now fully dead (zero remaining callers, confirmed by grep) —
      `DailyChecklist` was deleted; `getTodayChecklist` was removed from `src/lib/queries.ts`, which
      now only keeps the `StatScope` type (reused, not duplicated, by `reports.ts`). `toggleChecklistItem`/
      `DEFAULT_CHECKLIST` in `src/actions/tasks.ts`/`enums.ts` were deliberately left alone — real
      `ChecklistCompletion` rows may exist under those old keys from actual usage, and deleting the
      action doesn't reclaim anything, so there was no reason to touch it.
- [x] **Both dashboards rebuilt** — Milestone A/B's generic "recent activity + a grid of every
      student" placeholder is replaced with the real check-in list + attention list on top; the OWNER
      dashboard keeps its stat cards and activity feed underneath, the ASSISTANT dashboard keeps its
      own-students grid. Student/class detail pages were checked and found already real (Mastery
      timeline + Grades card on student detail since Milestones D/E; roster/co-teacher management on
      class detail since Milestone B) — no rework needed there, just confirmed.
- [x] **Verified**: `tsc`/build clean (29 routes; `/classes/reports` is now the heaviest at 208 kB
      first-load, entirely the `recharts` bundle, code-split to that one route only). New
      `scripts/reports-test.mts` — **15/15 passing**: the distribution/trend pure-math edge cases
      (including the "no signal → null, never a default guess" case for `computeTrendSuggestion`, and
      "strong mastery alone doesn't earn EXCELLING without an engagement signal too"), plus a real-DB
      fixture confirming the class-wide distribution and AI usage stats reflect actual rows. Regression-
      ran all five prior test scripts — all still green. Authenticated smoke test with **both** a
      teacher and a co-teacher session confirmed every new/changed page renders real content with no
      errors (one initial request to `/classes/reports` hit a curl timeout on its first-ever dev-mode
      compile — 2089 modules from the `recharts` bundle taking ~10s to compile cold — confirmed via the
      dev server log as a slow-compile artifact, not a failure, and a warm retry returned a clean 200
      in under a second).

**Milestone I is now fully done — every lettered milestone in the original roadmap (A through I) is
complete.** Only Milestone J (explicitly deferred backlog) and the still-blocked C.3 (Google Sheets,
waiting on Jordi's Google Cloud setup) remain.

## Milestone J — Explicitly deferred / out of scope for v1

- AI reflection-coach feature (structural-guardrail pattern from college-counseling — can now reuse
  `src/lib/ai/` from Milestone G instead of re-deriving dispatch).
- Parent/guardian portal role.
- Grade-book/report-card **export** or SIS integration (v1 *does* compute and display a grade as of
  Milestone E — this only defers exporting it or syncing to a SIS).
- Multi-teacher/multi-school tenancy.
- External standards-framework import (Common Core/state catalogs) — teacher-authored only.
- Persistent Google refresh-token sync (a `GoogleConnection` model reusing `src/lib/crypto.ts`, only
  worth it once Google app verification is done — Testing-mode refresh tokens expire in 7 days).
- PDF/OCR text extraction for assignment materials.
- Publishing assignments to students (v1 is teacher/co-teacher-only).
- Per-student `AssignmentScore` + the `POINTS` grading preset.
- `.docx` export of generated assignments, drag-reorder in the assignment editor.
- ~~**Login with Google**~~ — ✅ done, see **Milestone S** (2026-08-21). Supplements password login
  (doesn't replace it); a Google email maps to an existing `User.email` or a roster `Student.email`
  with no account yet (auto-provisions), never a bare self-service signup; reuses the
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` Settings keys reserved here, via `getApiKey` — same OAuth
  client C.3 will use, just a broader scope (`openid email profile` today; C.3 would add
  `spreadsheets.readonly` on top).

## Milestone K — Practice Mode ✅ done 2026-08-19

Ported the standalone "AP Chemistry Practice" tool (a separate app: unit-based MCQ/FRQ
practice with AI FRQ scoring + a scoped follow-up chat, entirely client-side/`localStorage`,
no DB) into the student portal, wired into real Standards-mastery tracking. Two content
sources ship: **AP_CHEM** (the standalone tool's own hand-authored bank, ported verbatim) and
**INTRO_CHEM** (19 chapters of originally-authored MCQ/true-false content covering the same
topics as Jodi's Pearson/TestGen "Introductory Chemistry" instructor test bank — that
commercial test bank itself was deliberately **not** reproduced; see the "what didn't happen"
note below).

- [x] `Standard.externalUnitSource`/`externalUnitId` (opt-in pair, `@@unique` per class) —
      links a teacher-authored Standard to one external practice unit/chapter. A string
      source (not an enum) so a third subject is cheap to add later.
- [x] `PracticeAttempt` (one JSON-blob row per session — config/generated set/answers/
      scores/chat, mirrors `Assignment.contentJson`'s precedent) + `PracticeMasteryProposal`
      (normalized, one row per unit-practiced × mapped-standard, mirrors why `MasteryEvent`
      itself is normalized). `MASTERY_EVIDENCE_TYPES` gained `PRACTICE`, plus a matching
      `evidenceWeightPractice` dial in the grading-policy evidence-weight grid.
- [x] `src/lib/practice/*` — types/bank/timer ported from the standalone tool; `generate.ts`/
      `score.ts`/`chat.ts` rebuilt on `runModel`/`extractJson` + zod-validate-then-retry-
      then-fallback, **not** `@anthropic-ai/sdk`'s `zodOutputFormat` (the standalone tool's
      approach) — staying on the same multi-provider dispatcher every other AI feature here
      uses mattered more than the SDK's native structured-output guarantee. INTRO_CHEM
      sessions never call any of this — no FRQ content, no AI top-up needed, pure bank pick.
- [x] `src/lib/grading-math.ts::percentToLevel` — the inverse of the existing
      `levelToPercent`, reusing a class's own `level1..4` bands as the auto-level-assignment
      thresholds rather than a second, possibly-inconsistent config.
- [x] **Practice results are proposals, never automatic `MasteryEvent`s.** Every
      `MasteryEvent` ever recorded in this app has `recordedById` = a staff member; that
      invariant is fully preserved (confirmed with Jordi 2026-08-19, resolved in favor of
      teacher review over auto-record) — `src/actions/practice-review.ts`'s
      `approvePracticeProposal` does exactly what `recordMasteryEvent` does, with the
      *approving* teacher/co-teacher as `recordedById`, never the student.
- [x] `/portal/practice` (student: Setup → Practice → Review, server-persisted so a refresh
      mid-session resumes instead of losing progress — the standalone tool's original
      failure mode) + `/classes/practice-review` (staff: pending queue, approve with an
      editable level / reject with a reason).
- [x] `/classes/standards` edit form gained the optional external-unit-link fields.
- [x] `scripts/practice-test.mts` — `percentToLevel` banding, unmapped-unit proposals
      (never throws, `standardId: null`), the per-class scoping of the unique constraint,
      the ownership check, and the `recordedById`-is-staff invariant. Also authenticated-
      browser-smoke-tested end to end against the live dev app (both content sources) —
      see verification note below.

**What didn't happen, on purpose:** the original ask was to fold in Jodi's
`tro_intro7_testbank_pdf/` (19 chapters of Pearson/TestGen's commercial *Introductory
Chemistry* instructor test bank) directly. Two independent extraction attempts both declined
to bulk-transcribe it — reproducing an entire commercial test bank's questions/answer-keys
into a separate app is wholesale copying of a licensed publisher product, not something a
same-session confirmation can clear. Resolved by writing 287 originally-authored questions
across the same 19 chapters/topics instead (`INTRO_CHEM` source) — the commercial bank was
never opened for content, only its chapter list was used as a topic guide (already-known,
publicly-discoverable course structure, not proprietary).

**v1 non-goals**: a teacher-facing view of practice-attempt history beyond the review queue;
admin UI for growing either question bank past hand-edited JSON; a third content source;
streaming chat; editing a submitted attempt's answers after scoring; sub-chapter (Learning
Outcome-level) mapping granularity.

## Milestone L — Per-standard understanding check ✅ done 2026-08-19

`DailyCheck.understanding` (Monitor roster) used to be a context-free UNDERSTANDS/NEEDS_
REINFORCEMENT flag, deliberately not tied to a Standard (see its original schema comment).
Jordi asked for it to link to whichever Standard the class was working on that day and
translate directly to a real mastery level (Beginning/Developing/Proficient/Advanced) —
closing exactly the gap Milestone K's plan had flagged ("no existing mechanism links a
Standard to a taught-date").

- [x] New `DailyStandardFocus` model — one row per (class, day); a teacher picks "today's
      standard" once at the top of the Monitor roster (`/classes/monitor`) and every
      student's Understanding check that day denormalizes it onto their `DailyCheck` row (so
      a later change to the day's focus doesn't retroactively rewrite already-recorded
      evidence).
- [x] `DailyCheck.understanding` repurposed from the old 2-value flag to a `MASTERY_LEVELS`
      value ("1".."4"), plus a new `DailyCheck.standardId`. The old binary flag is fully
      removed (replaced, not kept alongside — confirmed with Jordi), so it also came out of
      the generic 6-dimension tap-to-cycle abstraction (`roster-monitor.tsx`) and the
      End-of-Term Comments dimension tally (it needs an explicit 4-way pick, not a blind
      cycle, and the same evidence now already surfaces via the comments' existing per-
      standard mastery summary — no separate plumbing needed there).
- [x] Setting a level ALSO writes a real, append-only `MasteryEvent` (`evidenceType
      OBSERVATION`, `recordedById` = the teacher who tapped it — never the student, same
      invariant as everywhere else). A fresh `MasteryEvent` is created on every change rather
      than editing one in place, matching the "correct via a newer record" convention used
      everywhere else `MasteryEvent` is written (there's no edit/delete capability for it
      anywhere in this app).
- [x] `setDailyStandardFocus` / `setDailyUnderstandingCheck` (`src/actions/daily-checks.ts`);
      the Understanding column becomes a disabled select until a focus standard is set for
      the day.
- [x] Two pre-existing dogfooding `DailyCheck.understanding` rows from before the repurposing
      (old `UNDERSTANDS`/`NEEDS_REINFORCEMENT` values) were nulled out — they no longer mean
      anything under the new "1".."4" scale.
- [x] Verified live in the browser (Playwright): the Understanding select is disabled with no
      focus standard set; setting a focus standard enables it; picking "Proficient" for a
      student creates a `MasteryEvent` (level 3, `evidenceType OBSERVATION`, `recordedById` =
      the teacher) and immediately shows up on `/classes/mastery`. Test data cleaned up
      afterward.

## Milestone M — Fine-grained standard-to-question mapping ✅ done 2026-08-19

Milestone K's Practice Mode linked exactly ONE Standard to a whole external unit/chapter —
too coarse, since a real chapter covers several distinct learning standards. This was
flagged as a v1 non-goal at the time ("sub-chapter mapping granularity") and Jordi asked for
a workaround: load standards in bulk (CSV/paste, since a chapter now needs several), then
have AI assist in linking each one to the specific bank questions it covers.

- [x] `Standard.externalQuestionIdsJson` — an optional JSON array of bank question ids that
      narrows a Standard's evidence to just those questions within its linked unit, instead
      of the whole unit. Null/empty ("unscoped") is the original Milestone K behavior,
      unchanged. Dropped the old `@@unique([classId, externalUnitSource, externalUnitId])` —
      multiple Standards can now share one unit; `checkUnitOverlap`
      (`src/actions/standards.ts`) enforces the real invariant instead (no two *scoped*
      Standards' question-id sets may overlap; unscoped Standards never conflict with
      anything, which is what lets several land on the same unit before anyone's decided
      which questions belong to which).
- [x] `src/lib/practice/mastery-map.ts` — `resolveStandardsForUnit` (was `...ForUnit`,
      singular) now returns every match, not just one. `computeUnitResults` pools each scoped
      Standard's own question subset into its own result, and only attributes the leftover
      bucket to a Standard when the unit resolves to exactly one UNSCOPED Standard (today's
      original whole-unit case, preserved exactly) — if 2+ Standards share a unit and some
      are still unscoped, that evidence stays unattributed (`standardId: null`) rather than
      guessing which one it belongs to. Fully backward compatible: every existing
      single-standard-per-unit class keeps behaving identically.
- [x] Bank question tags are NOT a reliable join key (confirmed by reading the actual data):
      INTRO_CHEM's are a small stable vocabulary (`"1.1"`, `"1.2"`, ...) but AP_CHEM's are
      freeform, AI-invented fresh per generated question and drift across sessions. So
      mapping is done at the question-**id** level, stable for both sources — which also
      means AP_CHEM's runtime-generated shortfall items (never in the bank, no id anyone
      could have pre-assigned) simply fall into the unattributed bucket until they're bank
      questions, never crash or get mis-attributed.
- [x] Manual per-question checklist on the standard edit form (`standards-manager.tsx`) —
      shows every bank question for the picked unit, disables ones already claimed by another
      *scoped* sibling, informational (not blocking) note when unscoped siblings exist.
- [x] Bulk standards import — CSV upload or paste only (confirmed with Jordi: matches the
      existing roster-import precedent exactly, no binary `.xlsx` parsing, Google Sheets via
      the same "paste a copied selection" fallback + disabled "coming soon" connect card).
      `src/lib/standards-import/` + `src/actions/standards-import.ts` mirror
      `src/lib/import/` + `src/actions/roster-import.ts` structurally (hand-rolled
      `parseCsv`, reused as-is; Source → Map → Confirm wizard; server re-derives the preview
      from the raw sheet before committing, never trusts the client's). Imported/updated
      standards always land UNSCOPED — the CSV format stays "here are my standards and
      roughly which chapter each belongs to," not question-level detail.
- [x] AI-assisted question↔standard mapping (`src/actions/standards-mapping.ts`) — follows
      `generateAssignmentDoc`'s "ephemeral, review before persistence" pattern (**not**
      practice generation's "validated but shown directly to students" pattern): the
      suggestion never touches the database. A review modal
      (`question-mapping-modal.tsx`, surfaced on `/classes/standards` once a unit has 2+
      linked standards) shows every bank question with an editable standard dropdown,
      pre-filled from the AI where available; even a fully failed AI call still drops the
      teacher into a working, all-unassigned manual table — the fallback is never a dead end.
- [x] `scripts/standards-import-test.mts` (new) + `scripts/practice-test.mts` extended for
      multi-standard resolution and `checkUnitOverlap`'s allow/reject cases.
- [x] Verified live in the browser: CSV-imported 3 standards into one Intro Chem chapter
      (previously impossible), manually mapped chapter questions across two of them via the
      review modal (the AI call correctly failed-and-fell-back with no Gemini key configured
      in this dev environment — confirms the fallback path itself, not just the happy path),
      then ran a real student practice session covering that chapter: the Review screen and
      the teacher's Practice Review queue both showed three separate, correctly-scored
      results — one per scoped standard plus one unattributed leftover bucket — instead of
      the single lumped result Milestone K was stuck with. Test data cleaned up afterward.

**What this deliberately doesn't do**: no live Google Sheets API/OAuth integration (same
posture as roster import); no automatic re-mapping when the bank's question set changes
underneath an existing mapping; no UI to bulk-clear a whole class's scoping at once.

## Milestone N — Standards library (cross-class browse & copy) ✅ done 2026-08-19

Milestone M's fine-grained mapping made setting up a chapter's standards real work (CSV
import + AI-assisted question mapping) — Jordi asked for that work to be reusable across
classes/teachers rather than redone from scratch each time. First checked the actual current
access model before building anything: `accessibleClassIds`/`accessibleStudentIds`
(`src/lib/access.ts`) already return `"ALL"` for any OWNER unconditionally — there's no
per-teacher privacy boundary today, and question banks (`src/lib/practice/data/bank/*.json`)
are already global static files, identical for every class. Confirmed with Jordi that
tightening that access model is explicitly OUT of scope here — what's missing is just a
browsing/reuse UI, not a new permissions layer.

- [x] `src/actions/standards-library.ts` — `listLibraryStandards` (every standard in another
      accessible class, optionally search-filtered) + `copyStandardIntoClass` (creates an
      independent copy in the target class, carrying over the external unit link AND any
      `externalQuestionIdsJson` mapping verbatim — the whole point, so copying a standard
      someone already AI-mapped skips redoing that work). Standards stay class-scoped by
      design (each class needs its own row for its own MasteryEvent history) — this is a
      **copy**, never a live/shared row. Still re-runs `checkUnitOverlap` against the TARGET
      class, never assumes the source class's validation carries over.
- [x] Explicitly scoped through `accessibleClassIds`, not "every class in the database" — an
      OWNER already sees everything (per the access-model finding above) but an ASSISTANT
      co-teacher's access stays correctly restricted to their assigned classes; this library
      must not widen that.
- [x] `StandardsLibraryModal` (`src/components/standards/standards-library-modal.tsx`) —
      grouped by **`Class.subject`**, not the per-standard `category`/strand grouping the
      main Standards page already has: the library spans many classes/teachers/subjects,
      answering "which subject is this from," a different question than "which strand within
      my one subject." Search-filtered, shows an "already copied" indicator (by title match)
      without blocking a second copy if that's genuinely wanted.
- [x] Verified live in the browser: temporarily gave one class a different `subject` to
      confirm two distinct group headers render correctly, searched to confirm filtering,
      copied a standard (with its INTRO_CHEM unit link) into an empty class, confirmed it
      appeared on that class's own Standards page with the link intact. Reverted the subject
      change and deleted the copied test standard afterward.

**What this deliberately doesn't do**: no per-teacher privacy boundary (confirmed explicitly
out of scope — OWNER access is unchanged); no live/synced sharing (copies are independent
from the moment of copy); no bulk multi-select copy (one at a time, matching this app's
general bias toward explicit single actions over batch operations elsewhere).

## Milestone O — Practice coaching feedback, Intro Chem free-response, exec summary ✅ done 2026-08-19

Three asks: (1) turn practice-session data into real feedback for students, not just a score;
(2) give Intro Chem a free-response question bank (it was MCQ-only, by design, since
Milestone K); (3) an accurate platform exec summary for the marketing team's branding/launch
planning (published as a Claude Artifact, not committed here).

- [x] `src/lib/practice/coaching.ts::generateCoachingFeedback` — one AI call per submitted
      attempt, built from the student's actual missed MCQs and lost FRQ rubric points (never
      generic advice). Best-effort, single attempt, no retry: this is advisory only, so a
      failed/unavailable call just means the section doesn't render — nothing downstream
      depends on it, unlike FRQ scoring or standard-mapping. Persisted on
      `PracticeAttempt.coachingFeedbackJson` so revisiting Review (or the idempotent resubmit
      path) doesn't re-call the AI.
- [x] "Predicted mastery" — reused the existing per-unit `suggestedLevel`/`scorePercent`
      already computed for the teacher-approval queue; the only change needed was making the
      framing explicit on the student's Review screen (heading + a one-line disclaimer that
      it doesn't affect the official grade). Deliberately did NOT invent a separate
      blended/overall number — a session usually spans multiple standards, so per-standard
      predicted levels are more honest than one averaged figure would be.
- [x] Intro Chem free-response bank — 76 originally-authored items (2 short/4pt + 2
      long/10pt per chapter × 19 chapters), authored by 4 parallel agents under the same
      non-negotiable policy as the original Milestone K MCQ content: never open/consult
      `tro_intro7_testbank_pdf/`, entirely original scenarios/numbers. Structurally validated
      (parts/rubric point sums, label alignment, unique ids, correct `unitId`) — 0 issues
      across all 76 items; spot-checked several by hand for chemistry/arithmetic accuracy.
      `FRQItem.source` gained `"original"` alongside MCQItem's existing value of the same
      name.
- [x] `getBankFRQs` (`src/lib/practice/bank.ts`) no longer hardcodes `INTRO_CHEM -> []`; wired
      the 19 new files in. `generatePracticeSet` restructured so BOTH sources get a real bank
      pick for FRQs, but the AI shortfall top-up stays AP_CHEM-only — matching the same
      "no AI top-up for Intro Chem" posture MCQs already had, for the same reason
      (no seed workedSolution/rubric to style-match against, and no need to: the bank is
      sized for realistic practice-set counts). `scoreFrqResponse`/chat were already fully
      source-agnostic — only their comments were stale, not their logic.
- [x] `setup-step.tsx` — free-response question counts are no longer hidden for Intro Chem;
      the AP-exam-pacing timer stays AP_CHEM-only (that's a genuinely AP-specific format,
      unlike the FRQ counts themselves).
- [x] Exec summary published as a Claude Artifact (private by default) — grounded only in
      what's actually built, including an honest "current stage" section (single-teacher
      dogfooded prototype, no per-teacher privacy boundary yet, one subject proven end to
      end) so marketing plans from real maturity, not an inflated pitch.
- [x] Verified live in the browser: an Intro Chem session with MCQ + long + short
      free-response items generated correctly from the new bank, submitted without crashing
      even with FRQ AI-scoring unavailable in this dev environment (graceful "Could not be
      scored," matching the pre-existing fallback contract), and the Review screen showed the
      new "Predicted mastery" framing correctly. Coaching feedback correctly stayed hidden
      since it also needs a configured AI key here — the intended graceful-omission behavior,
      not a bug. Test data cleaned up afterward.

## Milestone P — Understanding-check simplification & student mastery visuals ✅ done 2026-08-20

Two rollbacks/additions from real dogfooding feedback: (1) the Monitor's Understanding
dropdown (Milestone L) "felt off" — replaced with a plain two-tier tap; (2) the student
portal's grade needed to read as provisional, and the Mastery tab needed visual aids instead
of a flat list.

- [x] `UnderstandingCell` (`roster-monitor.tsx`) is a tap-to-cycle button again, not a
      `<select>` — blank → Proficient → Developing → blank, matching the same interaction
      shape as the other DailyCheck dimensions. Deliberately only these two levels: Beginning/
      Advanced (and a free-text note) stay on "the other method" — the Mastery Roster page's
      full picker (`/classes/mastery`) — which was always the intended fuller-observation
      path. `setDailyUnderstandingCheck`'s zod schema (`src/actions/daily-checks.ts`) now
      rejects any level besides `"3"`/`"2"`/null at the server too, not just client-side.
- [x] `/portal/dashboard` — each class's computed grade is now explicitly labeled "Predicted
      grade" with a one-line disclaimer ("For reference only — your final grade may differ").
      `computeGrade`'s actual math is unchanged; this was purely a framing fix, since nothing
      here is more final/official than the mastery evidence and grading policy it's already
      built from.
- [x] `/portal/mastery` — reused the teacher-side Reports page's exact
      `MasteryDistributionChart` component (`src/components/reports/mastery-distribution-chart.tsx`,
      recharts bar chart) per class, just fed the one student's own per-standard levels
      instead of a whole roster's, plus a new dependency-free SVG ring
      (`src/components/mastery/mastery-dial.tsx`) showing "% of standards mastered." Standards
      are now grouped into **Areas to improve** (Beginning/Developing, or — with none — this
      student's own lowest-scoring mastered standards, so there's always a "focus next"
      instead of an empty section), **Areas mastered** (Proficient/Advanced), and **Not yet
      assessed** (no evidence at all yet, kept distinct from "struggling" since it isn't).
      The fallback-selected standards are excluded from "Areas mastered" so nothing appears
      in both lists at once.
- [x] Verified live in the browser against real data: confirmed the existing dogfooding
      rows (4 students already had real Understanding observations logged) rendered correctly
      as pills without needing to touch them, then exercised the full 3-tap cycle on a
      separate, verified-empty date to avoid disturbing real history — confirmed
      blank→Proficient→Developing→blank end to end via direct DB inspection, then cleaned up
      every row that test created (including one caused by an early test-script targeting bug
      that tapped the wrong column — a bug in the *test*, not the product; caught and fixed
      before trusting the result). Confirmed "Predicted grade" wording/disclaimer render, and
      the Mastery tab's dial + bar chart + three-way grouping render correctly against a real
      student's actual mixed mastery history.

## Milestone Q — Visual design refresh ✅ done 2026-08-20

Purely visual — no schema, data, or business-logic changes. The app was still running on
the unstyled shadcn/ui scaffold defaults (default HSL navy/slate palette, no chosen typeface
at all — plain browser default font) inherited from the CRM fork and never revisited since.
Refreshed the shared design tokens and primitives rather than touching every page
individually, since nearly everything already renders through them.

- [x] `src/app/globals.css` — new HSL token palette (a warm iris/violet identity, chosen to
      stay clear of the semantic mastery-level colors — red/amber/sky/emerald — so the brand
      accent is never confused with a status signal), `--radius` bumped 0.5rem → 0.75rem,
      `.dark` block kept in sync (present in `tailwind.config.ts`'s `darkMode` but not
      actually toggled anywhere in the app today — updated for no-regression, not exercised).
- [x] Manrope added via `next/font/google` (self-hosted by Next.js, no external font request)
      and wired through `tailwind.config.ts`'s `fontFamily.sans` — the app had no chosen
      typeface at all before this, just the browser default.
- [x] `tailwind.config.ts` gained `boxShadow` (`soft`/`card`/`popover`, tinted toward the new
      palette instead of neutral black) and real `keyframes`/`animation` entries
      (`fade-in`/`rise-in`/`slide-in-right`) — the latter fixed a latent bug along the way:
      `toast.tsx` referenced an `animate-in` class that did nothing, since the
      `tailwindcss-animate` plugin it comes from was never installed; replaced with a real,
      dependency-free animation instead of adding that plugin.
- [x] Shared primitives refreshed in place, same APIs: `Button` (soft shadow + shadow lift on
      hover, tactile `active:scale`), `Card` (softer radius, tinted shadow), `Field`/`Input`
      (softer radius, refined focus ring), `Modal` (blurred backdrop, rise-in entrance),
      `Toast` (slide-in entrance, popover shadow).
- [x] `AppShell` — the brand mark is a `GraduationCap` icon on the new primary color instead
      of plain initials; the active nav item is a soft tinted pill with a left accent bar
      instead of a hard filled rectangle. `PageHeader`'s heading now uses the `text-balance`
      utility and the theme's `text-foreground` token instead of a hardcoded slate.
- [x] Verified live in the browser across both roles against real dogfooding data — login,
      teacher dashboard, Standards (list + add-standard modal), Monitor (confirmed the
      Milestone P two-tier Understanding pills read correctly against the new palette),
      Reports (recharts bar/line colors unaffected, still legible), student dashboard
      (Predicted grade), and student Mastery (dial + bar chart + three-way grouping from
      Milestone P) — all render cleanly, nothing regressed.

## Milestone R — Reports insights & Monitor AI feedback ✅ done 2026-08-20

Two asks: (1) Reports only showed a class-wide mastery histogram — everything merged into
one chart, with no way to see WHICH standards or WHICH students actually need attention; (2)
Monitor's private note had no way to turn into an actual message to the student without the
teacher writing it from scratch, and any AI help needed to read the room — supportive by
default, but firm when the day's record includes a real behavior concern.

- [x] `src/lib/reports-math.ts::standardReinforcement` — pure per-standard bucketing (struggling/
      mastered/no-evidence counts + average level) that `masteryDistribution`'s single merged
      histogram intentionally can't answer, since it throws away which standard each reading
      belongs to.
- [x] `src/lib/reports.ts::standardsNeedingReinforcement` / `studentsNeedingReinforcement` —
      share one `currentLevelRows` fetch, then group it two ways: by standard (ranked worst
      first — most students below Proficient) and by student (which students are below
      Proficient, and on which specific standards, worst-covered student first). A student
      with none stays off the list entirely — nothing to flag.
- [x] `/classes/reports` gained two new cards between the existing mastery/engagement charts.
      The student-facing side of this same insight already existed (Milestone P's "Areas to
      improve" on `/portal/mastery`) — this closes the teacher-facing half.
- [x] `src/lib/daily-check-feedback.ts::generateDailyCheckFeedback` — drafts short, student-
      facing feedback from a teacher's private Monitor note. Tone is decided programmatically
      by `hasDisciplinaryFlag` (discipline/citizenship/collaboration's negative pole) rather
      than left for the model to infer — DISTRACTING engagement or LACKED_EMPATHY alone stay
      encouraging; an actual discipline/citizenship/collaboration concern switches to a direct,
      assertive-but-fair tone. Never persists anything itself — same "AI drafts, human decides"
      posture as the practice-mode coaching feedback and the standards-mapping suggestion;
      `generateFeedbackFromNote` (`src/actions/daily-checks.ts`) only returns the draft for
      `FeedbackPanel` to drop into its own compose box, drafted from the note textarea's
      current (possibly unsaved) text so a teacher doesn't have to save first.
- [x] `FeedbackPanel` gained a "Draft with AI" button, gated to only render for the Monitor's
      `DAILY_CHECK` target (not the Mastery Roster's `MASTERY_EVENT` target, which has no
      private note to draft from).
- [x] `scripts/reports-test.mts` extended (an existing Milestone I script, not a new one) —
      `standardReinforcement`'s bucketing, `hasDisciplinaryFlag`'s tone selection (re-
      implemented inline per this file's own established "server-only" limitation), and a
      second DB-fixture standard added to exercise the actual ranking or a struggling vs. a
      healthy standard.
- [x] Verified live in the browser against real dogfooding data: Reports correctly ranked a
      genuinely struggling standard first and listed the actual students behind on it; the
      Monitor "Draft with AI" button produced a real, warm, specific encouraging message from
      a distraction-only note, and a real, direct, firm-but-fair message once a discipline flag
      was set on a separate test day — confirming both tone branches with actual AI calls, not
      just the graceful-failure path seen in earlier milestones. Test artifacts (a tapped
      Discipline flag and its own DailyCheck row) cleaned up afterward; the private note itself
      was confirmed never persisted just from drafting, only from an explicit "Save note."

## Milestone S — Self-service invite links & Google Sign-In ✅ done 2026-08-21

Two new ways in: (1) a teacher-generated link a student opens to pick their OWN email and
password, replacing the old flow where the teacher typed the student's email and the system
handed back a one-time temp password to relay by hand; (2) "Continue with Google" on `/login`,
for students/staff with a school Google account. Neither is restricted to one Google Workspace
domain (an explicit choice — see below); the real gate is that the signed-in email has to
already be known to the app.

- [x] `prisma/schema.prisma::StudentInvite` — one row per Student, `token` unique + `expiresAt`
      (7-day TTL). Generating a new link upserts (replaces) it; accepting deletes it in the same
      transaction as linking `Student.linkedUserId` — so a used or replaced token can never be
      replayed, and "already used" collapses into the same "not valid" message as any other
      dead token rather than needing a separate state to track.
- [x] `src/actions/students.ts::generateStudentInviteLink` / `cancelStudentInvite` (owner-only)
      replace the old `inviteStudent` (which took the student's name+email from the teacher and
      returned a system-generated temp password via a `fieldErrors` hack). `src/actions/
      invite.ts::acceptStudentInvite` (deliberately unauthenticated — the token itself is the
      credential) is what a student hits at `/invite/[token]`, creates their own `User` row with
      no `mustChangePassword` (they just chose it), and auto-logs them into `/portal/dashboard`.
- [x] `src/components/students/student-invite.tsx` rewritten for the link lifecycle (generate /
      copy / regenerate / cancel) instead of a name+email form; `/admin/students/[id]` now also
      fetches the pending `invite` relation.
- [x] `src/lib/auth.ts` gained `sessionUserForEmail` (match an existing active account by email,
      no password — used by Google Sign-In) and `provisionStudentFromGoogle` (a Google email that
      matches a roster `Student.email` with no login yet gets one created on the spot — the
      roster row's own `email` field, set by the teacher via manual entry or CSV import, is
      itself the authorization; no separate invite-link step needed for that student). Neither
      function ever creates a STAFF account — those only ever come from the owner via
      `actions/users.ts`.
- [x] `src/lib/google-oauth.ts` — the OAuth "Authorization Code" flow implemented directly
      against Google's endpoints (`jose`'s remote-JWKS verify on the returned `id_token`, not
      just decoding it) rather than pulling in next-auth on top of this app's own JWT session
      cookie, which would mean two competing session systems.
      `src/app/api/auth/google/route.ts` sets a short-lived CSRF `state` cookie and redirects to
      Google; `src/app/api/auth/google/callback/route.ts` verifies `state`, exchanges the code,
      checks `email_verified`, tries `sessionUserForEmail` then `provisionStudentFromGoogle`, and
      on no match at all redirects back to `/login?error=google_no_account` — it never silently
      creates a staff account or a student account with no roster trail.
      **No domain restriction** (e.g. Google's `hd` claim) was added — an explicit choice made
      with Jordi: since sign-in still requires the email to already be known to the app (an
      existing account, or a roster `Student.email`), a random Gmail address gains nothing by
      itself. Revisit this only if the school later wants to also auto-provision *new* accounts
      straight from a Workspace domain match (not implemented — today every account still has to
      already exist somewhere first).
- [x] `.env.example` documents `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — see "Google
      Sign-In setup" below for the exact Google Cloud Console steps. Without them set, the
      button still renders but redirects back with a friendly "isn't set up yet" message
      instead of a crash.
      **Correction (2026-08-21, same day)**: `google-oauth.ts` initially read these two names
      straight from `process.env`, but `src/lib/settings.ts::MANAGED_KEYS` had already reserved
      those exact two names — for Milestone C.3, unbuilt — behind `getApiKey`'s DB-first/
      env-fallback lookup (a key set on `/admin/settings` is encrypted in the DB and takes
      precedence, env var as a fallback). Reading `process.env` directly would have silently
      ignored a key Jordi set through the Settings page. Fixed to go through `getApiKey` like
      every other provider key; `MANAGED_KEYS`' hint text updated to mention both consumers
      instead of only citing the unbuilt one.
- [x] `scripts/invite-and-google-auth-test.mts` — the invite link's full lifecycle (create,
      regenerate invalidates the old token, expired rejected, email-already-in-use rejected,
      accept creates+links+deletes-the-invite-row, a consumed token can't be replayed) and the
      Google matching rules (existing active account matches, a deactivated one does not, no
      match at all returns null, a roster `Student.email` auto-provisions exactly once).
- [x] Verified live in the browser end-to-end against a throwaway test student (cleaned up
      afterward): teacher generates a link on `/admin/students/[id]`, the student (logged out)
      opens it, picks their own email+password, lands straight in `/portal/dashboard`, and the
      teacher's page immediately shows "Portal active" with the student's own chosen email —
      never the teacher's. Revisiting the same link afterward correctly shows an
      already-invalid message. The Google button and its query-param error messages
      (`google_not_configured`, `google_no_account`) render correctly on `/login`; the live
      Google consent screen itself wasn't exercised (no `GOOGLE_CLIENT_ID`/`SECRET` configured in
      this environment) — that requires the Google Cloud Console setup below.

### Google Sign-In setup (do this once, in the Google Cloud Console)

1. Go to https://console.cloud.google.com/ and create a project (or pick an existing one).
2. **APIs & Services → OAuth consent screen**: choose "Internal" if this is a Google Workspace
   for Education account and you only want your own school's users to see it in the picker
   (this is a UX restriction on Google's consent screen, not the same thing as this app's own
   email-matching gate above — both can be used together), or "External" otherwise. Fill in the
   app name (e.g. "Class Copilot") and support email.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**. Application type:
   "Web application". Add an **Authorized redirect URI**:
   - Local dev: `http://localhost:3000/api/auth/google/callback`
   - Production: `https://<your-real-domain>/api/auth/google/callback`
4. Copy the generated **Client ID** and **Client secret** into `.env` as `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`. Restart the dev server (env vars are read at process start).
5. That's it — no code changes needed. A student/staff email only signs in successfully if it
   already matches an existing account or a roster `Student.email` (see above); everyone else
   gets sent back to `/login?error=google_no_account`.

## Milestone T — Multi-tenant workspaces & signup ✅ done 2026-08-21

Jordi wants to share the tool with colleagues, each creating their own account. Today's app was
single-tenant: OWNER always saw and could act on **every** class/student in the database
(`accessibleClassIds`/`accessibleStudentIds` returned `"ALL"`/`true` unconditionally). Confirmed
with Jordi before building: each teacher's classes/students are now **private by default**
(explicit `ClassCoTeacher` grants still work for real collaboration); the Standards Library
(Milestone N) stays cross-teacher on purpose (no student data in it); AI provider keys
(`Setting` table) stay one shared config, not per-teacher; and this shipped as one full pass,
not phased, since a signed-up colleague seeing another teacher's students even briefly isn't
acceptable for K-12 data.

- [x] **Schema**: `User.ownerId` (nullable self-relation — null for OWNER, set to the creating
      OWNER's id for ASSISTANT) + `Student.createdByUserId` (required — every student has a
      creator, so a not-yet-enrolled roster row still has an owner). Backfilled the one existing
      OWNER + two ASSISTANTs + all 6 existing students before flipping the column to required.
- [x] **`src/lib/access.ts` rewritten**: OWNER's accessible classes = `teacherId === self` OR an
      explicit co-teacher grant (was `"ALL"`); accessible students = created by self OR enrolled
      in an accessible class. ASSISTANT's `allClientsAccess` now means "my owning teacher's
      classes," not literally every class platform-wide. `canAccessClass`/`canAccessStudent` do
      real per-record checks for OWNER instead of an unconditional `true`.
- [x] **Two full audits (Explore agents) found every write action and read query that bypassed
      `access.ts` entirely** rather than just relying on its now-fixed OWNER branch — the actual
      bulk of this milestone's work:
      - `src/actions/students.ts` never imported `access.ts` at all — every mutator (`updateStudent`,
        `setStudentStatus`/`Flag`, the invite-link actions, `revokeStudentLogin`) added
        `assertCanAccessStudent`.
      - `src/actions/classes.ts`: `updateClass`/`setClassArchived` now require real class
        ownership (not just any co-teacher); `assignCoTeacher`/`unassignCoTeacher` verify the
        caller owns the class; `enrollStudent`/`unenrollStudent` verify both ends.
      - `src/actions/users.ts`: every mutator (`changeUserRole`, `setAllClientsAccess`,
        `updateUser`, `deleteUser`, `setUserActive`, `resetUserPassword`) previously worked on
        **any** user platform-wide with only a role check — any OWNER could deactivate/delete/
        demote any other OWNER's account. Added `requireOwnedAssistant` — every target must now
        be an ASSISTANT this specific OWNER created (or, for edit/reset, themself). Dropped the
        now-meaningless "last remaining admin" guardrail (every OWNER is independent now).
        `createUser` only ever creates ASSISTANT accounts now (OWNER accounts come from `/signup`
        only) — an existing assistant can still be promoted to OWNER via `changeUserRole` (a
        "graduation" into their own workspace, clears their `ownerId`).
      - `src/actions/tasks.ts`: `archiveTask`/`unarchiveTask`/`deleteTask` had **zero** ownership
        check at all (any OWNER could delete any task platform-wide); `canEditTask` hardcoded
        `role === "OWNER"` as a universal pass. Added `taskInOwnerWorkspace`/
        `isOwnWorkspaceAssignee`; `createTask`/`updateTask` now validate `studentId`/`classId`/
        `assignedToId` against the caller's own workspace.
      - `src/lib/notifications.ts`: `notifyOwners`/`notifyAdmins` (fan out to every OWNER
        platform-wide) were dead code — deleted. `notifyCoTeachersForStudent`'s `allClientsAccess`
        branch had the same bug live (any all-access assistant on ANY workspace got pinged about
        ANY student) — fixed to scope to the student's actual owning teacher(s).
      - `src/lib/import/prepare.ts::buildPreview` (roster CSV import): the email/externalId
        dedupe lookup was **platform-wide** — importing a CSV whose email happened to match an
        unrelated teacher's existing student would have silently enrolled that other teacher's
        private student into this class. Now takes the caller's `accessibleStudentIds` and
        rejects an out-of-workspace match as a per-row error instead of matching it.
      - Roughly a dozen admin pages queried with no scope at all (`/admin/students`,
        `/admin/dashboard`'s counts, `/admin/activity` (plus a new `activityScopeWhere` helper),
        `/admin/tasks` (plus a new `taskScopeWhere` helper), `/admin/classes`, `/admin/classes/[id]`
        (ownership-checked + 404s, plus the "unenrolled students"/co-teacher pickers scoped),
        `/admin/classes/[id]/roster/import` (ownership-checked), `/admin/students/[id]`
        (ownership-checked + 404s; also stopped showing a shared student's OTHER classes the
        viewer has no access to), `/admin/users`, `/admin/assistants`.
      - `src/actions/standards-library.ts` needed an actual code change, not just a comment — it
        derived its "browse other classes" scope from `accessibleClassIds`, which now means
        "my workspace" instead of "everything." Decoupled entirely: `listLibraryStandards` queries
        every class's standards unconditionally (the deliberate cross-teacher exception), and
        `copyStandardIntoClass` dropped its now-wrong source-class access check — the real
        boundary is (and always was meant to be) the check on the TARGET class you're copying into.
- [x] **Signup**: `/signup` (public) creates a new OWNER account — its own independent, empty
      workspace, `ownerId: null`. Distinct from `/admin/users`'s `createUser`, which only creates
      ASSISTANT accounts inside an *existing* owner's workspace. Google Sign-In (Milestone S) is
      untouched — it only ever matches an existing account, never creates a new OWNER.
- [x] New `scripts/multi-tenant-isolation-test.mts`: two independent OWNER fixtures never see
      each other's class/student; an all-access ASSISTANT is scoped to their own teacher's
      classes, not the platform; an explicit cross-workspace `ClassCoTeacher` grant still works
      and doesn't leak visibility back the other direction. `scripts/grading-test.mts`,
      `comments-test.mts`, `feedback-test.mts`, `reports-test.mts`, and the Milestone S
      invite/Google-auth test all had their DB fixtures updated for the new required
      `createdByUserId` column and re-verified passing.
- [x] Verified live in the browser: signed up as a second, throwaway teacher — landed on a
      completely empty dashboard (zero trace of the real dogfooding classes/students), created
      their own class successfully, `/admin/users` showed only themself, the Standards Library
      still showed the real teacher's standards (cross-teacher, working as designed), and a
      direct URL to a real student's id from the new teacher's session returned a clean 404
      rather than rendering — the actual IDOR check, not just "the page looks empty." Throwaway
      account and its class cleaned up afterward; real dogfooding data (8 users, 6 students)
      confirmed unchanged before and after.

## Milestone U — Formula rendering, retention-seeded practice, richer Intro Chem content, calmer dashboard ✅ done 2026-08-22

Four related Practice Mode / student-portal asks. Confirmed with Jordi before building: a
lightweight custom renderer for the chemistry shorthand already in use (not LaTeX/KaTeX);
"scaffolding" = progressive revealable hints (not separate tiered questions); retention re-asks
stay seamless (no "you've seen this before" label); the dashboard's default view becomes
"How can I improve?" with the grade behind an explicit reveal.

- [x] `src/lib/practice/chem-text.ts` — `renderChemText`/`<ChemText>` parses the plain-ASCII
      chemistry shorthand already used everywhere (`H2O`, `Fe^3+`, `7.20 x 10^-3`) into real
      sub/superscripts. Uses `React.createElement` directly rather than JSX so it runs
      identically inside the Next.js app and under a plain `tsx` test script. Handles reaction
      arrows, scientific notation, charges/exponents, AND two real ambiguous cases found by
      grepping actual bank content before writing a single rule: electron-configuration notation
      (`2p6`, `3d10` — the trailing digit is a superscript, the opposite of the general subscript
      rule, disambiguated because orbital letters are always lowercase and preceded by a digit,
      which never happens in a real element symbol) and isotope mass numbers immediately
      followed by an element letter (`^235U` — only "235" superscripts, not "235U" as one blob).
      Wired into every question/choice/explanation/hint/coaching/chat-message render call site
      (`practice-step.tsx`, `review-step.tsx`, `chat-panel.tsx`).
- [x] `src/lib/practice/notation.ts` — the plain-text notation convention, previously only given
      to the AI when generating AP Chem bank-shortfall content (`generate.ts`), now also given to
      `coaching.ts` and `chat.ts`'s prompts, so ALL AI-generated text stays consistent with what
      the renderer actually parses.
- [x] `src/lib/practice/bank.ts::selectWithRetention` — prefers items a student hasn't seen
      before (tracked via `PracticeAttempt.practiceSetJson`, which already stores exact item ids
      — no schema change), with a ~20% chance to deliberately reintroduce one seen item when the
      pool has room to spare (never during an actual shortfall, where seen items are already
      being pulled in of necessity — an earlier version of this swap could pick the ONLY unseen
      item in a shortfall and defeat the point; fixed before shipping, caught by the pure-function
      test). `submitPracticeAttempt` compares a repeated item's old outcome to its new one and
      feeds a short summary into `coaching.ts`'s prompt — genuine growth/regression surfaces
      through the existing coaching narrative, no separate UI section, staying seamless.
      Live-verified: two back-to-back Intro Chem Chapter 2 sessions for the same student produced
      zero overlapping questions, drawing from the newly-expanded 21-question pool.
- [x] **Intro Chem content, ~2.6x larger**: 5 parallel background agents (one per ~4 chapters)
      added 6 new MCQs per chapter (2 beginner/2 intermediate/2 advanced, each with a real
      `explanation` — Intro Chem MCQs had NONE before this) and doubled each chapter's FRQ pool
      from 4 to 8, plus retrofitted `difficulty` + `hints` onto every pre-existing FRQ. Total:
      401 MCQs (114 with hints) + 152 FRQs (152 with hints) across all 19 chapters — a new
      `scripts/bank-content-validate.mts` structural pass (unique ids, `correctIndex` range,
      rubric/part point sums, hints shape) found zero issues. `MCQItem`/`FRQItem` gained optional
      `difficulty`/`hints` fields (`src/lib/practice/types.ts`) — fully backward-compatible with
      existing untagged AP Chem content. `practice-step.tsx` gained a "Need a hint?" progressive
      reveal control (local state only, never scored or persisted).
- [x] `src/lib/mastery-math.ts::pickAreasToImprove` — the struggling/fallback "areas to improve"
      logic extracted out of `/portal/mastery/page.tsx` (unchanged behavior there) so
      `/portal/dashboard` can reuse it instead of duplicating the fallback rule.
      `/portal/dashboard` now leads with "How can I improve?" (top 3 struggling/fallback
      standards per class) instead of the grade; the grade moved behind a new
      `src/components/portal/grade-reveal.tsx` "Show my grade" toggle — deliberately not
      remembered across visits, so checking it stays an active choice.
- [x] Verified live against real dogfooding data (Ava Thompson): the dashboard correctly led with
      her 3 actual struggling standards, grade hidden until the reveal toggle was clicked; a real
      Intro Chem practice session rendered genuine superscripts (`cm³`, `3.0 × 10²`) in questions,
      choices, and explanations, a "Need a hint?" control appeared and revealed hint text, and the
      end-of-session AI coaching feedback also rendered with correct superscripts (confirming the
      shared `NOTATION_RULES` prompt wiring). `npx tsc --noEmit`, `npm run build`, the extended
      `scripts/practice-test.mts` (16 new `renderChemText` cases + 4 `selectWithRetention` cases),
      and the new `scripts/bank-content-validate.mts` all pass. Test-created `PracticeAttempt`
      rows cleaned up afterward.

## Verification checklist (per milestone, from Milestone B onward)

- `npx tsc --noEmit` and `npm run build` clean.
- Adapted `scripts/isolation-test.mts`: a co-teacher assigned to Class 1 only sees Class 1's enrolled
  students and is denied access to a Class-2-only student's records (including students enrolled in
  *both* classes resolving correctly for each co-teacher); a student sees only their own data;
  `allClientsAccess` still grants `"ALL"` regardless of `ClassCoTeacher` rows.
- Dev server boots, protected routes redirect correctly for each role.
- From Milestone C onward: roster-import idempotency (re-import produces zero new rows) —
  `scripts/roster-import-test.mts`.
- From Milestone D onward: mastery-weighting formula spot checks — `scripts/mastery-test.mts`.
- **Caveat on `isolation-test.mts`/`roster-import-test.mts`**: both assume the exact original seed
  fixtures exist (`Math — Period 3`/`Math — Period 5` by name, specific students). As of 2026-08-07,
  Jordi has been using the live dev app — `Math — Period 5` was renamed/replaced with
  `Chemistry (A block)` through the real Classes UI — so these two scripts will fail against the
  live dev database, not because of a regression, but because their fixtures have organically
  drifted. They still pass against a fresh `db:seed`. `mastery-test.mts` avoids this by creating and
  cleaning up its own standard fixture rather than depending on named seed data beyond the always-
  present teacher/students.
- From Milestone E onward: grading-math hand-computed spot checks for each preset —
  `scripts/grading-test.mts` (uses its own self-contained fixture, immune to the seed-drift caveat
  above).
- Post-E: mastery-strategy spot checks for all 4 models plus evidence-type-weight exclusion —
  `scripts/mastery-test.mts`.
- From Milestone G.1 onward: `scripts/comments-test.mts` — prompt-formatting edge cases, AI
  engine lock-state derivation, a crypto round trip, a `Setting` table round trip, and date-range
  scoping for the Comments generator's term summary.
- From Milestone G onward: `scripts/assignments-test.mts` — `extractJson`/`parseAssignmentDoc` lenient
  edge cases, prompt-placeholder substitution, a local-disk storage round trip, and a real-DB fixture
  proving `Assignment` → `AssignmentStandard`/`AssignmentMaterial` cascade-delete behavior. Both the
  Comments generator and the Assignment Builder were authenticated-smoke-tested with **zero AI
  provider keys configured** and rendered cleanly — the "degrades cleanly" requirement. IDOR coverage
  for `AssignmentMaterial`/`/api/materials/[id]` is via the same `canAccessClass` gate already covered
  by `isolation-test.mts`'s class-scoping checks, not a separate script.
- From Milestone H onward: `scripts/feedback-test.mts` — visibility filtering (staff vs. student
  view), the `DAILY_CHECK` target's upsert-on-first-feedback behavior, a cross-student ownership
  check, soft-delete/cascade-delete behavior. Authenticated smoke test used **two real sessions**
  (teacher + student) and confirmed the student's session gets a clean redirect off staff-only
  routes — the actual cross-role isolation check for the portal, not just "the page renders."
- From Milestone I onward: `scripts/reports-test.mts` — pure distribution/trend/suggestion math edge
  cases (including that `computeTrendSuggestion` returns `null`, never a default guess, when there's
  no usable signal) plus a real-DB fixture for the class-wide aggregates and AI usage stats.
- From Milestone K onward: `scripts/practice-test.mts` (percentToLevel banding, unmapped-unit
  handling, per-class unique-constraint scoping, ownership/`recordedById` invariants). Also
  authenticated-browser-smoke-tested against the live dev app (`Chemistry (A block)`, Jordi's real
  dogfooding class): teacher links a standard to a unit, a student runs a real AP_CHEM session
  (bank pick + live AI-generated question + explanation) and a real INTRO_CHEM session (pure bank,
  confirmed near-instant/zero AI calls), both produce a PENDING proposal, teacher approves one from
  `/classes/practice-review` and the resulting `MasteryEvent` was confirmed directly in the DB —
  correct student/standard/level, `evidenceType: "PRACTICE"`, `recordedById` the teacher. Test
  standards/attempts/events were cleaned up afterward, not left in the live dev database.
