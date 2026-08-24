# Class Copilot

> **Status lives in TODO.md, not here.** This file only covers setup/usage — see `TODO.md` for what's
> built so far and what's next, and `CONTEXT.md` for the architecture and why it's built this way.

A classroom engagement + standards-mastery tracker for a teacher's classes. One **teacher** manages
one or more **classes**, tracks each student's daily engagement (empathy, discipline, collaboration,
citizenship) and their proficiency against teacher-defined standards, and gives students prompt,
specific feedback. **Students** log into a limited portal to see their own progress on both and
identify areas to improve. An optional **co-teacher** role can be assigned to specific classes.

Forked from a CRM scaffold — see `CONTEXT.md` for the full domain mapping and why this architecture
was reused.

---

## Roles

| Role | Sees | Can do |
|---|---|---|
| **Teacher** | Everything | Manage classes & students, assign co-teachers, invite student logins, all dashboards |
| **Co-Teacher** | Only classes they're assigned to | Log engagement, record mastery, manage tasks — for their assigned classes |
| **Student** | Only their own data, via `/portal` | See their own engagement and mastery progress |

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
"student exists before being invited" state.

---

## Tech

Next.js 15 (App Router) · React 18 · TypeScript · Tailwind + a hand-built shadcn-style UI kit ·
Prisma (SQLite local / Postgres-ready) · custom JWT auth (jose + bcrypt) · Zod · Recharts ·
lucide-react.

### Security (enforced server-side)

- **Student-scoping spine** — `src/lib/access.ts` (`assertCanAccessClient`, `accessibleClientIds`,
  `clientScopeWhere`) is called by every student-scoped action, query and API route. Renamed and
  extended with class-level scoping in Milestone B — see `TODO.md`.
- **Required `AUTH_SECRET`** (no fallback), short session TTL + a `sessionVersion` check so
  role/deactivation changes revoke stale sessions.

Run the isolation test (once adapted in Milestone B — see `TODO.md`):
```bash
node --env-file=.env --import tsx scripts/isolation-test.mts
```

---

## Going online later (only after local review)

Switch to a **new** Postgres/Supabase project: flip `prisma/schema.prisma` `provider` back to
`postgresql` + restore `directUrl`, set the pooled `DATABASE_URL`/`DIRECT_URL` and a **new**
`AUTH_SECRET`, then `prisma db push`.
