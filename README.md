# Neuralitica — Marketing Product (V1)

AI-powered content production for local service providers (plumbers, barbers, etc.): the system interviews the client once, builds a business profile, and then produces **3 Instagram Reels per week** — strategy, scripts, captions, AI video, QA, and client approval — **without the client ever recording anything**. Cheap-API-first economics with interchangeable video providers.

This README is the entry point for **humans and AI agents** (Cursor, Codex, Claude, etc.). Read it top to bottom and you have full context: what is being built, from which documents, with which stack and rules, and which agents do the work.

---

## 1. Where everything lives

| Path | What it is |
|---|---|
| `plan/USER_STORIES.md` | **The canonical backlog.** Every story that will be developed (US-1.x–US-13.x + US-X.1–X.3), each with acceptance criteria (functional + `[SEC]` security), FE/BE/DB work tables, dependencies, sprint order, and MVP cut line. Nothing gets built that is not in this file. |
| `plan/MODULES_ROADMAP_v1.1.html` | Source roadmap: the 13 modules, product hard rules, provider strategy, and risks. Stories were derived from it. |
| `plan/SECURITY_BASELINE.md` | Design-time security review of the whole backlog: per-module verdicts, trust boundaries, abuse cases, and future-proofing constraints (auth, RLS, multi-tenancy). |
| `plan/HIGH_LEVEL_PLAN.md` | High-level phase context. |
| `plan/stories/US-x.y/` | Per-story working folders, **created lazily when a story enters a sprint** (see §4). |
| `../AGENTS.md` (repo root) | **Hard project rules** — architecture defaults, planning, frontend, and backend rules. Binding for every agent and human. Read it before writing any code. |
| `.cursor/agents/*.md` | The agent team definitions (see §5). Written as portable markdown role files usable by Cursor, Codex, Claude, or any agent runtime. |

---

## 2. Stack

- **Next.js** — one app for frontend **and** backend (App Router).
- **Supabase (Postgres)** — the database for all environments.
- **Vercel** — deployment target.
- **PrimeReact** — default UI library; custom components are exceptions.
- **i18n** — English and Spanish translation files for all user-facing copy.

### Hard architectural rules

1. **Only the backend integrates with Supabase.** Supabase clients, URLs, and keys (service-role AND anon) exist exclusively in server code — Server Actions, Route Handlers (`app/**/route.ts`), and server helpers. No `@supabase/supabase-js` import may be reachable from a Client Component; no Supabase env var may use the `NEXT_PUBLIC_` prefix.
2. **The frontend only calls Next.js endpoints.** Server Components load data via server-side helpers; Client Components call Server Actions or Route Handlers. This includes future authentication: the browser talks to Next.js auth endpoints; only the backend talks to Supabase Auth, with sessions in httpOnly cookies.
3. **Database naming:** every Supabase object — tables, triggers, indexes, functions, enums, policies — carries the **`neuramark_` prefix**. Story documents use logical names (`interview_sessions`); the physical object is `neuramark_interview_sessions` (index: `neuramark_interview_sessions_client_id_idx`, trigger: `neuramark_interview_sessions_set_updated_at`). Schema changes go through Supabase migrations only — never ad-hoc dashboard edits.
4. **No real authentication yet.** Auth/login/session work is deliberately out of scope. The current user is hardcoded and served by a single server-side `getCurrentUser()` helper: `gaveho@gmail.com` / `Gabriel Vega`. Every table still carries `client_id` so real auth, RLS, and multi-tenancy can be added later without rewrites.
5. **Server Components by default**; `"use client"` only for interactivity or browser APIs, with the boundary kept as small as possible.
6. **No speculative APIs.** Every endpoint must name the concrete frontend consumer (story) it serves.
7. **Dashboard is the default entry route.**

---

## 3. The backlog (`plan/USER_STORIES.md`)

- 40 stories across 13 modules, phases 1–5, plus cross-cutting stories (dashboard entry, EN/ES localization, hardcoded user).
- Story IDs are stable (`US-{phase}.{seq}`) — never renumber.
- Each story has: story statement, FE/BE/DB work table, checkbox acceptance criteria (functional + `[SEC]` security criteria added by the security-architect), and `Depends on`.
- The file ends with the **dependency-aware sprint order** (Sprint 1–7) and the **MVP cut line**: stories through US-11.3 constitute the operable V1; US-12.x/13.x are P1.
- Acceptance criteria checkboxes in this file are checked **only by the product-owner** after a requirements-validator PASS.

---

## 4. Development workflow (per story)

```text
product-owner ──► security-architect ──► nextjs-frontend + nextjs-backend ──► requirements-validator ──► qa-engineer
   (define/refine)    (design review,        (implement in parallel)             (PASS/FAIL vs criteria)     (bugs/security audit)
                       [SEC] criteria)
```

When a story enters a sprint, the product-owner creates its working folder:

```text
plan/stories/US-x.y/
  TASKS.md        ← FE / BE / DB checklist sections (implementers check off their own section)
  SECURITY.md     ← security-architect design review; its criteria are binding
  VALIDATION.md   ← requirements-validator report (PASS/FAIL with file-level evidence)
  QA.md           ← qa-engineer audit report (severity-rated findings, checks run)
```

Rules of the flow:

- Folders are created **lazily** — only for stories in active work.
- `USER_STORIES.md` stays the single source of truth; `TASKS.md` expands but never contradicts it.
- Implementing agents state which acceptance criteria their change satisfies; they never check criteria in `USER_STORIES.md` themselves.
- A story is **done** when: validator PASS (all criteria incl. `[SEC]`) + qa-engineer APPROVE + product-owner checks the boxes.
- Definition-of-done checklist (from the backlog): FE states (loading/empty/error/success), server-side validation, migration/seed updated, EN + ES strings, criteria checked, downstream contracts stable.

---

## 5. The agent team (`.cursor/agents/`)

Six role definitions, usable by any AI agent runtime (Cursor subagents, Codex, Claude). Each file contains the role, required context reading, working rules, and output format. **Every agent must read `../AGENTS.md` (repo root) first — it is a hard constraint.**

| Agent file | Role | Writes to |
|---|---|---|
| `product-owner.md` | Owns the backlog: stories, tasks, priorities, sprints, status reporting. Creates story folders and `TASKS.md`. Only actor allowed to check acceptance criteria. | `plan/USER_STORIES.md`, `plan/stories/US-x.y/TASKS.md` |
| `security-architect.md` | Design-time partner of the product-owner: threat-models stories **before** implementation, adds binding `[SEC]` acceptance criteria, can veto unsafe designs (always with an alternative), runs periodic back-door sweeps of the codebase. | `plan/stories/US-x.y/SECURITY.md`, `plan/SECURITY_BASELINE.md` |
| `nextjs-frontend.md` | Implements FE tasks: Server Components first, PrimeReact, EN/ES i18n, all data via Next.js endpoints (never Supabase directly). | app code, FE section of `TASKS.md` |
| `nextjs-backend.md` | Implements BE/DB tasks: Server Actions, Route Handlers, validation, Supabase migrations with `neuramark_` prefix. **The only layer that touches Supabase.** | app code, migrations, BE/DB sections of `TASKS.md` |
| `requirements-validator.md` | Verifies a story is actually done: every acceptance criterion (functional + `[SEC]`) checked against code with file-level evidence; flags scope creep. Read-only on app code. | `plan/stories/US-x.y/VALIDATION.md` |
| `qa-engineer.md` | Enterprise-grade audit: bugs, injection, secrets/key leakage into the client bundle, back doors, unprefixed DB objects, error resilience. Must run lint/build/tests before a verdict. Read-only on app code. | `plan/stories/US-x.y/QA.md` |

Separation of duties: implementers never validate their own work; validators/QA never fix code (findings route back to the implementing agent); the product-owner owns scope, the security-architect owns the security floor — conflicts between the two are escalated to the human.

---

## 6. Quick start for a new agent or developer

1. Read `../AGENTS.md` (hard rules), then this README.
2. Read `plan/USER_STORIES.md` — conventions section first, then the story you're assigned.
3. If the story has a folder under `plan/stories/`, read `TASKS.md` and `SECURITY.md`; work only your section.
4. Follow the stack rules in §2 — especially: Supabase only from the backend, `neuramark_` prefix on every DB object, EN/ES strings, no auth work.
5. When finished, check off your `TASKS.md` items and report which acceptance criteria you satisfied — then hand off to the requirements-validator.

## 7. Current status

- Planning phase complete: backlog generated from the roadmap and security-reviewed (82 `[SEC]` criteria across 38 stories, verdict APPROVE WITH CONDITIONS, no redesigns).
- No application code yet. Next step: Sprint 1 — `US-X.3` (hardcoded user seam), `US-X.1` (dashboard), `US-1.1–1.3` (interview), `US-2.1–2.3` (business profile).
