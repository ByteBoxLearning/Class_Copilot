# Class Copilot

> **Status lives in TODO.md, not here.** This file only covers setup/usage — see `TODO.md` for what's
> built so far and what's next, and `CONTEXT.md` for the architecture and why it's built this way.

A K-12 classroom management and learning platform with two sides:

- **For teachers**: track each student's daily engagement (empathy, discipline, collaboration,
  citizenship) and their proficiency against teacher-defined standards, combine both into a
  configurable computed grade, and give students prompt, specific feedback. AI-assisted tools
  (an Assignment Builder, an end-of-term Comments generator, standards-mapping suggestions) draft
  content from a class's real data — a teacher always reviews and approves before anything is saved
  or shown to a student.
- **For students**: a learning portal (`/portal`) to see progress and a "Practice Mode" area —
  AI-scored free-response and multiple-choice practice questions (AP Chemistry and Introductory
  Chemistry banks today), with progressive hints and a predicted-mastery preview. Practice results
  are always advisory: they only become part of a student's official grade if a teacher reviews and
  approves them.

Each **teacher** who signs up gets their own independent, private workspace — their own classes,
students, and standards, invisible to every other teacher's workspace by default. A teacher can
explicitly grant a colleague **co-teacher** access to one or more of their specific classes for real
collaboration; that grant never widens beyond the classes it names.

Forked from a CRM scaffold — see `CONTEXT.md` for the full domain mapping and why this architecture
was reused. (Note: `CONTEXT.md`/parts of `TODO.md` describe the original single-teacher premise the
fork started from — data isolation between teachers was added later, see `TODO.md`'s multi-tenant
workspaces milestone, and is authoritative over anything CONTEXT.md still implies about one shared
teacher.)

---

## Roles

| Role | Sees | Can do |
|---|---|---|
| **Teacher** | Their own workspace only — classes/students they created, plus any class an explicit co-teacher grant gives them | Manage their own classes & students, assign co-teachers, generate student invite links, all dashboards/reports/AI tools, manage their own co-teacher accounts |
| **Co-Teacher** | Only the classes they're assigned to (or every class taught by the one teacher who created their account, if granted all-access — never platform-wide) | Log engagement, record mastery, manage tasks — for their assigned classes only |
| **Student** | Only their own data, via `/portal` | See their own engagement, mastery, and predicted grade; use Practice Mode; see feedback a teacher chose to share |

A student gets portal access via a one-time invite link a teacher generates (they choose their own
email/password when they open it) or, if configured, by signing in with a school Google account that
matches their roster email — a teacher never sets or sees a student's password.

---

## Run it locally (no online services, no API keys)

The app is **local-first**: it runs entirely on a local **SQLite** database with seeded demo data.

```bash
cd classroom-tracker
npm install

# Create your local env (SQLite + a generated AUTH_SECRET):
cp .env.example .env
node -e "console.log('AUTH_SECRET=\"'+require('crypto').randomBytes(32).toString('hex')+'\"')"
# → paste that AUTH_SECRET into .env (DATABASE_URL is already file:./dev.db)

npm run db:push      # create the SQLite schema
npm run db:seed      # teacher + 2 co-teachers + 6 demo students
npm run dev          # http://localhost:3000
```

`npm run build` compiles the whole app; `npm run db:reset` wipes + reseeds.

### Demo logins (password `ChangeMe123!` for all)

| Role | Email |
|---|---|
| Teacher | `teacher@classroom.test` |
| Co-Teacher | `co-teacher1@classroom.test` / `co-teacher2@classroom.test` |
| Student | `ava@student.test` / `liam@student.test` / `noor@student.test` / `ethan@student.test` / `maya@student.test` |

One demo student (Jordan Lee) is seeded without a portal login, to demonstrate the
"student exists before being invited" state. Or go to `/signup` to create a brand-new, separate
teacher workspace of your own instead of using the seeded one.

AI features (Assignment Builder, Comments generator, Practice Mode's FRQ scoring/coaching,
standards-mapping suggestions) work with **zero API keys configured** — they render a clean "not
configured" state instead of erroring. Add a key from `/admin/settings` (stored encrypted in the
DB) to turn them on; see `TODO.md` for the Google Sign-In setup steps if you want that too.

---

## Tech

Next.js 15 (App Router) · React 18 · TypeScript · Tailwind + a hand-built shadcn-style UI kit ·
Prisma (SQLite local / Postgres-ready) · custom JWT auth (jose + bcrypt) · Zod · Recharts ·
lucide-react.

### Security (enforced server-side)

- **The access-control spine** — `src/lib/access.ts` (`assertCanAccessStudent`/`assertCanAccessClass`,
  `accessibleStudentIds`/`accessibleClassIds`, `studentScopeWhere`/`classScopeWhere`/
  `studentIdScopeWhere`/`taskScopeWhere`) is called by every student- and class-scoped action, query,
  and API route. Each teacher (`OWNER`) is scoped to classes they teach or hold an explicit
  co-teacher grant on, and students they created or who are enrolled in one of those classes — never
  "every class/student in the database." A co-teacher (`ASSISTANT`) is scoped to their assigned
  classes (or their one owning teacher's classes, if granted all-access — never platform-wide).
- **`src/actions/users.ts`'s `requireOwnedAssistant`** — every account-management action (role
  change, deactivate, delete, password reset) can only ever target an `ASSISTANT` the calling
  teacher personally created; it can never touch another teacher's account.
- **Required `AUTH_SECRET`** (no fallback), short session TTL + a `sessionVersion` check so
  role/deactivation changes revoke stale sessions immediately, not just on next expiry.
- **Encrypted-at-rest AI/OAuth provider keys** (`src/lib/crypto.ts`/`settings.ts`) when set from
  `/admin/settings` instead of `.env`.
- **A preloaded roster allowlist gates who can get an account** (`src/lib/allowed-email.ts`,
  managed from `/admin/settings`) — set `ALLOWED_EMAIL_DOMAIN` to restrict sign-up and Google
  Sign-In to the school's domain, and preload approved staff/student emails so `/signup` can't be
  used to create a rogue teacher account, and a Student record's email can't be set to an address
  the school hasn't verified. This is what closes a real identity-hijack risk in Google Sign-In's
  auto-provisioning: without it, anyone could pre-create a Student row using a real student's
  email before that student ever signs in, and silently capture their Google identity into an
  unrelated workspace. Bootstrap-friendly — an empty roster just means the domain check (if any)
  is the only gate, so the first admin can still sign up before preloading anything.
- **A FERPA data-sharing disclosure gates every AI feature** (`src/lib/ai/run-model.ts`) — no
  prompt reaches a third-party AI provider until an admin explicitly acknowledges the trade-off in
  `/admin/settings`. Student/class names are also redacted before sending to the End-of-Term
  Comments generator and Monitor's AI feedback drafts (`src/lib/comments/anonymize.ts`) and
  restored locally afterward — the AI never actually needs the real name to produce usable output.
- **Login/signup/invite-accept are rate-limited** (`src/lib/rate-limit.ts`, in-memory/per-process
  — fine for this app's single-instance deployment), and so are the AI-calling Practice Mode
  actions a student can trigger, to blunt scripted password-guessing and runaway AI-cost abuse
  without adding friction to normal use.
- Passwords require 8+ characters plus a number and a special character (`src/lib/validations.ts`).

Run the isolation tests:
```bash
node --env-file=.env --import tsx scripts/multi-tenant-isolation-test.mts
node --env-file=.env --import tsx scripts/isolation-test.mts
```

---

## Going online later (only after local review)

Switch to a **new** Postgres/Supabase project: flip `prisma/schema.prisma` `provider` back to
`postgresql` + restore `directUrl`, set the pooled `DATABASE_URL`/`DIRECT_URL` and a **new**
`AUTH_SECRET`, then `prisma db push`. File uploads (`src/lib/storage.ts`) are local-disk only today —
that needs a real backend (e.g. S3/Supabase Storage) before hosting anywhere with an ephemeral or
multi-instance filesystem, since uploaded files won't otherwise survive a restart/redeploy.
