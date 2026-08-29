# US-1.1 — Start guided business interview

**Priority:** P0  
**Depends on:** none in `USER_STORIES.md` · **runtime (done):** US-14.5 (`getCurrentUser()` session → `neuramark_clients`, `requireActive()`, `app/(app)/layout.tsx`) · US-14.1 (`neuramark_clients`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-1.1 (source of truth — do not redefine)  
**Implementers:** nextjs-backend + nextjs-frontend (`docs/development/AGENT-ROSTER.md` Fase 1). No content/media/integrations specialist.  
**Canonical terms:** **Entrevista inicial** (not “onboarding interview” / “cuestionario”); **Ficha viva** is US-1.3 (not this story). Role: **Cliente**.

## Out of scope (do not implement here)

- **US-1.2:** dedicated “Save & continue later” control; dashboard **resume prompt** for an incomplete Entrevista; completed-session **read-only mutation story** (operator reopen, UI treating completed as locked). You **may** persist drafts here so 1.2 can resume — see **Draft persist for US-1.2** below.
- **US-1.3:** submit / mark `completed` / create or update **Ficha viva** (`neuramark_business_profiles`). No profile-builder enqueue, no `source_interview_id`, no success-redirect to profile review.
- **US-2.x:** Ficha viva UI, PATCH allowlist, `getBusinessProfileForAgents`.
- Reopening a completed Entrevista at will (SPEC Fuera V1). Free-form interview without steps (SPEC Fuera V1).
- Auth changes: do **not** edit `lib/auth/*`, signup/login/logout/reset, `requireActive()`, middleware allowlist (except: new interview route must **stay off** the public list).
- `@supabase/supabase-js` in Client Components; Supabase keys in the browser; `client_id` from body/query/headers.

## Scope split vs US-1.2 / US-1.3

US-1.1 AC says the Cliente can complete all sections in one sitting **or** save and resume (US-1.2). Interpret: **1.1 persists drafts** so the wizard continues in the same sitting and **survives refresh**. Dedicated resume-from-dashboard UX is **US-1.2**. Marking `completed` and creating **Ficha viva** is **US-1.3**. Implementers must not ship profile creation or a “submit interview” path that pretends the Entrevista is finished for downstream agents.

## Draft persist for US-1.2 (in scope here)

- Create or update one **draft** `neuramark_interview_sessions` row for `getCurrentUser().id`.
- Persist structured `answers` + `current_step` on step advance (and on load after refresh).
- GET (or Server Component load) returns that draft for the current Cliente — no session id required in the URL.
- Do **not** build dashboard “you have an incomplete interview” copy/prompt (US-1.2). Wiring the existing dashboard **Start interview** CTA to the wizard **is** in scope.

## PO decisions (freeze in CONTRACT unless SECURITY vetoes)

| Topic | Decision |
|-------|----------|
| Cardinality | **One row per Cliente** — `UNIQUE (client_id)` on `neuramark_interview_sessions`. SPEC Fuera V1: Cliente does not reopen at will. |
| URL | Product page under `(app)`, e.g. `/interview`. **No session id in the path or query.** Load by current user only. |
| Status | Introduce enum `draft` \| `completed`. **This story only writes `draft`.** Never accept `status` from the client. US-1.3 is the only path that may set `completed`. |
| Steps (SPEC) | Fixed order: `services` → `zone` → `tone` → `offers` → `objections` → `style` → `restrictions` (UI EN/ES; storage keys English snake as CONTRACT freeze). |
| Last step | Saving the last step keeps `status=draft`. No “create Ficha viva” / complete CTA. |
| Oversize | Reject total `answers` JSON above limit (AC example **64 KB**) with **413** (payload too large). Schema/required-field failures → **400**. Exact byte limit in CONTRACT. |
| Identity | `client_id` = `getCurrentUser().id` only. Actions/handlers call `requireActive()` (page already gated by `(app)` layout; mutations must still call it — do not trust middleware). |

## Recommended answers JSON (CONTRACT freezes types/limits)

Structured object keyed by step — **not** a single free-text blob. Client validation is presentation only; server Zod is the gate.

| Step key | Suggested shape | Advance rule (1.1) |
|----------|-----------------|--------------------|
| `services` | `{ items: string[] }` | ≥ 1 item |
| `zone` | `{ description: string }` | non-empty |
| `tone` | `{ description: string }` | non-empty |
| `offers` | `{ items: string[] }` | ≥ 1 item |
| `objections` | `{ items: string[] }` | ≥ 1 item |
| `style` | `{ description: string }` | non-empty |
| `restrictions` | `{ items: string[] }` | array required; **empty list allowed** (“none”) |

Per-field max length + max array size belong in CONTRACT so 64 KB is a backstop, not the only cap. Free-text is stored as data; render escaped (React text nodes / PrimeReact); never interpolate into HTML/SQL/shell.

## Carry-forwards / reuse (do not reinvent)

- [ ] **`(app)` layout** already calls `requireActive("page")`. Put the Entrevista page under `app/(app)/`. Do not add `/interview` to `isPublicPath`.
- [ ] **Dashboard CTA copy** already exists: `messages/en.json` / `es.json` → `dashboard.interviewCard`; `app/(app)/dashboard/page.tsx` passes it into `DashboardView`. CTA is currently non-navigating text — wire it to the wizard. Prefer canonical **Entrevista inicial** / EN equivalent over “cuestionario” / “onboarding interview”.
- [ ] **No-store** on product HTML: follow the same `Cache-Control: no-store` pattern as other `(app)` surfaces (US-14.5).
- [ ] **RLS deny-by-default** (enable RLS, **no** browser-facing ownership policies). Service-role stays server-only (`lib/supabase/server.ts`).
- [ ] **Do not change auth code.**

## FE checklist

Concrete BE consumers: Entrevista wizard (load draft + persist step); dashboard Start CTA → wizard route.

- [x] Product route under `app/(app)/` (suggested `/interview`) — Server Component shell; `"use client"` **only** for wizard interactivity (steps, validation display, pending).
- [x] Multi-step UI in SPEC order: services, zone, tone, offers, objections, style, restrictions. PrimeReact before custom widgets (`Stepper` / `Steps`, form inputs, `Button`, `Message`).
- [x] Progress indicator (current step / total).
- [x] Per-step validation as **presentation only**; invalid/incomplete required fields **block advance** with clear messages (EN/ES). Server remains the authority.
- [x] Loading / empty / error / pending: first visit (empty draft), save/advance in flight, server 400 field errors, oversize/generic failure, unauthenticated already handled by layout.
- [x] On refresh, restore `current_step` and saved answers from the server (same sitting / refresh resume — **not** the US-1.2 dashboard prompt).
- [x] Dashboard `interviewCard` CTA navigates to the Entrevista. Do **not** add “resume later” dashboard prompt copy (US-1.2).
- [x] EN + ES in `messages/en.json` and `messages/es.json`. UI copy: **Entrevista inicial** (ES); EN may translate. Avoid CONTEXT _Evitar_ synonyms. Do not label this flow as creating **Ficha viva**.
- [x] Render free-text as escaped text (default React). No `dangerouslySetInnerHTML`, no string-built HTML/SQL/shell from answers.
- [x] No Supabase SDK or keys in the client bundle; no `client_id` in forms or query.

## BE checklist

Concrete FE consumers: Entrevista page/wizard (GET or RSC load of current draft; POST/Server Action to create/update draft); dashboard only links to the page (no extra interview API).

- [x] **Load session** for `requireActive()` user: return existing draft or create one (`status=draft`, `current_step` at first step, `answers` structured empty object). `client_id` from `getCurrentUser().id` only — strip/ignore `client_id` if the client sends it.
- [x] **Persist draft:** validate body with Zod (step payload + merged `answers`). Reject unknown keys / wrong types. Incomplete required fields for the step being advanced → **400** with field-level messages the wizard can show.
- [x] Re-validate **full merged answers** server-side on every write (not only the current step’s client checks).
- [x] Total `answers` JSON over configured size (e.g. 64 KB) → **413** (or 400 if CONTRACT must use one status — prefer 413). No store.
- [x] Never persist `status` from the request; always `draft` in this story. Do not invoke Ficha viva / profile builder.
- [x] CSRF: Server Action origin check (preferred for UI-coupled mutations) or Route Handler Origin validation — same class as auth actions.
- [x] Parameterized DB access only; answers bound as JSON/jsonb **values**, never concatenated into SQL.
- [x] Lookups filtered by server `client_id`. If CONTRACT later allows a session UUID, still verify ownership (IDOR); **1.1 recommended: no client-supplied session id**.
- [x] Product Server Actions / Route Handlers call `requireActive()` (or `getCurrentUser()` + active check). Inactive → 403, no writes. Unauthenticated → 401 / redirect per existing guard helpers.
- [x] Explicit cache: mutation `revalidatePath` for dashboard/interview as needed; interview page `force-dynamic` or equivalent so drafts are not served stale.
- [x] Automated tests: happy-path create/load/update; validation 400; oversize 413; `client_id` in body ignored; cannot set `status=completed`; identity from session only.

## DB checklist

All objects `neuramark_` prefix (table, enum, indexes, trigger, policies if any).

- [x] Migration: enum `neuramark_interview_session_status` (`draft` \| `completed`). 1.1 inserts `draft` only; `completed` exists for US-1.3.
- [x] Migration: table `neuramark_interview_sessions` (`id`, `client_id` FK → `neuramark_clients.id`, `status`, `current_step`, `answers` jsonb NOT NULL, `created_at`, `updated_at`).
- [x] `UNIQUE (client_id)` (one Entrevista inicial row per Cliente). Index name e.g. `neuramark_interview_sessions_client_id_idx` if not implied by UNIQUE.
- [x] Trigger `neuramark_interview_sessions_set_updated_at` (and function if needed, also prefixed) on UPDATE.
- [x] CHECK or enum for `current_step` (the seven step keys) — freeze allowed values in CONTRACT.
- [x] ENABLE ROW LEVEL SECURITY; deny-by-default (no authenticated/anon policies unless SECURITY requires a named `neuramark_*` policy). Service-role bypasses.
- [x] Optional CHECK: `octet_length(answers::text)` cap as defense in depth (SECURITY/CONTRACT decide vs app-only 64 KB).
- [x] No `neuramark_business_profiles` in this migration.

## Gates (orchestrator)

- [x] SPEC-REVIEW.md
- [x] SECURITY.md
- [x] CONTRACT.md + FE signoff
- [x] VALIDATION.md
- [x] QA.md

## Open questions (do not block PREP; freeze in SPEC-REVIEW / SECURITY / CONTRACT)

1. **Per-field Zod limits** — PO sketched shapes above; CONTRACT must freeze max string length, max array length, and whether `tone`/`style` are free text vs closed enums. Not a SPEC conflict (SPEC names steps only).
2. **413 vs 400 for oversize** — PO prefers 413 for byte-limit, 400 for schema. AC allows either. SECURITY/CONTRACT pick one and document the client-visible error code.
3. **DB-level size CHECK** vs app-only limit — SECURITY decides.
4. **Writes to a `completed` row** — nothing in 1.1 sets `completed`. Recommended: `UPDATE … WHERE client_id = $1 AND status = 'draft'` so a future completed row is not overwritten. Full completed read-only + operator exception is **US-1.2 / SPEC**. Not the primary 1.1 deliverable.
5. **Rate limit** on persist — not in US-1.1 AC. SECURITY may add a coarse IP/user cap to prevent jsonb write abuse; if added, it is a security floor, not extra product UX.
6. **Empty `restrictions`** — PO: empty array is valid. Spec-guardian confirm.
7. **Dashboard card EN title** today is “Business interview”. FE should align to **Entrevista inicial** / agreed EN translation without using _Evitar_ terms. Not a SPEC blocker.

No SPEC vs USER_STORIES conflict requiring a spec-guardian amendment: SPEC §3 Interview Builder steps, table, server validation, and `client_id` via `getCurrentUser()` match this story. SPEC “enviar cuando esté completa” and Ficha viva on submit are **US-1.3**. SPEC “guardar borrador y retomar” is split: persist in **1.1**, dashboard resume UX in **1.2**.
