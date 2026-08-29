# Security Design Review — US-1.2

**Story:** US-1.2 — Save and resume interview  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-1.2 `[SEC]`), `plan/SECURITY_BASELINE.md` (Interview Builder), `plan/stories/US-1.1/SECURITY.md` (inherited floors), `plan/stories/US-1.2/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), `lib/interview/*`, `lib/contracts/interview.ts`, `app/(app)/dashboard/page.tsx`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: explicit **Save & continue later**, dashboard incomplete / resume prompt for the **server-resolved** Cliente, completed **read-only** enforced on the server (reuse US-1.1 `UPDATE … AND status = 'draft'` → **409**), primary load/resume by `getCurrentUser()` / `requireActive()`, and Operator reopen deferred to **SQL/ops only** (no Cliente reopen UI, no in-app `requireOperator()` action required in this story).

No REDESIGN. No veto that blocks BUILD after CONTRACT freezes the items below. Orchestrator may proceed to CONTRACT.md.

**Inherited floors (US-1.1 — do not weaken):** 64 KiB UTF-8 answers gate (413 / `PAYLOAD_TOO_LARGE`) + DB CHECK 80 KiB; `UPDATE … AND status = 'draft'` on every draft write; identity only via `getCurrentUser()` / `requireActive()`; Zod `.strict()` seven keys + per-field caps; answers rendered as escaped React text nodes only; strip/reject identity and privilege keys; `/interview` off `isPublicPath`; `Cache-Control: no-store`; parameterized jsonb; RLS deny-by-default, service-role Node only; no answers bodies in production logs.

**This story owns:** Save & continue later (persist + navigate dashboard); dashboard Start vs Resume / incomplete prompt + completed read-only entry; prove draft continuity across refresh and new browser sessions (DB + auth cookie, not localStorage); harden completed write rejection coverage; IDOR policy if a session id ever appears on the wire; document Operator SQL reopen.

**This story does not own:** US-1.3 submit / write `completed` / **Ficha viva**; Cliente reopen-at-will; full US-X.1 dashboard aggregator; auth redesign; Operator interview console; `/interview/[id]`.

**Terminology:** **Entrevista inicial**, **Cliente**, **Operator**. Do not use CONTEXT _Evitar_ terms in CONTRACT, this file’s product-facing examples, or EN/ES copy.

---

### Threat Summary (US-1.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Write to `completed` session** | Undo US-1.3 submit / corrupt submitted Entrevista | Every mutation reuses draft write predicate (`status = 'draft'`). Zero rows → **409**. Client cannot send `status`. FE hides edit controls; server is authority |
| **IDOR via session UUID** | Read another Cliente’s draft / progress | Primary path: load by `getCurrentUser().id` only; `/interview` with **no** id. If id appears: strip-and-ignore **or** ownership-check; foreign → **404/empty** (not 403). Prefer omit `id` from all client props |
| **Dashboard leaks other tenants** | Cross-Cliente interview state via helper params | Dashboard summary: **no** `client_id` / session id parameter. Query `WHERE client_id = $server`. Minimal shape — **no** `answers` body |
| **Resume after logout / shared device** | Stale HTML or local-only draft on wrong account | Draft lives in Postgres under `client_id`. Resume requires `requireActive()`. `no-store` on dashboard + `/interview`. **Forbidden:** localStorage / sessionStorage as source of truth |
| **Weaker Save & continue persist** | Bypass advance-rule Zod; store invalid partials | Same validation as step advance / `persistInterviewDraft`. Invalid → errors, stay on step, no navigate |
| **Get-or-create on dashboard** | Side-effect empty rows; false “in progress” | Dashboard **read-only** helper: no INSERT. No row → not started → Start CTA |
| **Operator reopen via Cliente UI / forged action** | Cliente flips completed → draft | No reopen control for Cliente. V1 reopen = documented SQL only. No app write path that sets `status = 'draft'` from `completed` in this story |
| **Stale incomplete prompt** | UX confusion (not IDOR) after save-and-leave | `revalidatePath('/dashboard')` and `/interview` on successful persist / save-and-leave |

**Residual risk accepted:** Activated Cliente write amplification on draft (same as 1.1) — still bounded by one row + 64 KiB; persist rate limit still **not** required. SQL Operator reopen has no app audit trail in V1 — accepted (same trust model as `active`/`role` SQL flips); document ops procedure. Prompt injection via answers remains deferred to US-4.x containment.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Entrevista `answers` jsonb | Medium — business PII-adjacent; future LLM fuel | Wizard persist only. **Dashboard must not receive raw answers** |
| `status` / `current_step` | Medium / Low — gate + resume cursor | Server-read for dashboard summary; `status` never client-writable here |
| `hasProgress` (derived) | Low — Start vs Resume UX | Computed server-side from own row only |
| Session UUID (`neuramark_interview_sessions.id`) | Medium — IDOR handle if exposed | Prefer omit from client props. If ever accepted: ownership-check |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()`. Never from body/query/headers |
| Session cookie (`sb-*`) | High — US-14.5 | Unchanged. Resume after new browser session = same auth user → same DB row |
| Service-role key | Critical | Node only. Never Client Components |

**Boundaries:**

1. **Browser → Save & continue later** — Untrusted POST Server Action. Same CSRF / `requireActive("handler")` / Zod / draft predicate as US-1.1 persist.
2. **Browser → Dashboard RSC** — Untrusted only insofar as the session cookie identifies the user; helper resolves identity server-side and loads **that** row’s summary only.
3. **Browser → `/interview` resume** — Same as 1.1 get-or-create / completed view. No session id in URL.
4. **Ops → SQL reopen** — Trusted Operator channel outside the app (V1). Not a Cliente API.
5. **Auth** — Reuse US-14.5. Do not edit `lib/auth/*` allowlist. Keep `/interview` and `/dashboard` off `isPublicPath`.

---

## Abuse Cases Considered

- *As a malicious actor, I can call Save & continue later / persist after the row is `completed` and overwrite the submitted Entrevista* → **Blocked:** `UPDATE … WHERE client_id = $1 AND status = 'draft'`; zero rows → **409**. No INSERT of a second row (`UNIQUE (client_id)`).
- *As a malicious actor, I can send `status: "draft"` or omit UI checks to unlock edits on a completed session* → **Blocked:** `status` rejected via forbidden keys / never read from client; write predicate is DB-side.
- *As a malicious actor, I can pass another Cliente’s `session_id` / `id` on persist or a future load helper and read their answers* → **Blocked:** primary path ignores client ids (strip). If a surface validate-and-uses an id: `row.client_id === getCurrentUser().id` or **404/empty**. Never return another tenant’s row. Prefer **404/empty** over **403** (no ownership oracle).
- *As a malicious actor, I can call a dashboard status helper with `?client_id=` or body `clientId` and learn another Cliente’s progress* → **Blocked:** helper accepts **no** client/session id parameter; always scopes to `requireActive()` / `getCurrentUser().id`.
- *As a malicious actor, I can scrape dashboard HTML/JSON for full `answers` of any user* → **Blocked:** dashboard payload is minimal (`status`, `currentStep`, `hasProgress` — exact names in CONTRACT). No `answers` object on the card path.
- *As a malicious actor, I log out and still see the previous user’s incomplete prompt from bfcache / CDN* → **Blocked:** `Cache-Control: no-store` on dashboard and `/interview`; handlers re-resolve identity per request.
- *As a malicious actor, I rely on localStorage draft after stealing a laptop without the auth cookie* → **Blocked by design:** draft source of truth is Postgres; localStorage must not be the resume source. Without a valid activated session → **401/403**, no data.
- *As a malicious actor, I use Save & continue later with empty/invalid current-step fields to bypass advance validation* → **Blocked:** same advance-rule Zod as `persistInterviewDraft`; invalid → `VALIDATION_ERROR`, no navigate.
- *As a malicious actor, I hit the dashboard repeatedly to force get-or-create empty drafts for enumeration/side effects* → **Blocked:** dashboard helper is SELECT-only; no get-or-create.
- *As a Cliente, I can reopen my completed Entrevista via a hidden button or forged Server Action* → **Blocked:** no reopen action in this story; no app path that sets `completed` → `draft`. SPEC Fuera V1 for Cliente reopen-at-will.
- *As an Operator, I need to reopen for support* → **Allowed only via documented SQL** (V1). Not a Cliente surface. Future `requireOperator()` action would be a new story with its own SECURITY gate.
- *As a malicious actor, I can CSRF Save & continue later from `https://evil.example`* → **Blocked:** POST-only Server Action origin check (same class as auth / US-1.1 persist).

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-1.2 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding; re-assert for any new 1.2 surfaces):**

- [ ] **[SEC] All interview answers are re-validated server-side against a typed schema (Zod);** client-side validation is presentation only
- [ ] **[SEC] Interview sessions are created and loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string
- [ ] **[SEC] Total `answers` JSON payload rejected above 64 KiB (65536 UTF-8 bytes of `JSON.stringify(answers)`) with 413 / `PAYLOAD_TOO_LARGE`**
- [ ] **[SEC] Free-text answers are stored as data and always rendered escaped;** never interpolated into HTML, SQL, or shell

**US-1.2 story `[SEC]` (existing):**

- [ ] **[SEC] Read-only enforcement for `completed` sessions happens server-side:** mutation endpoints/Server Actions reject writes to completed sessions regardless of what the UI allows
- [ ] **[SEC] Resume loads the draft by the server-resolved current user only;** a session ID supplied by the client is validated to belong to that user (IDOR guard for future multi-tenancy) **or** stripped/ignored so it is never used — foreign data must never leak

**Added in this review:**

- [ ] **[SEC] (added) Every draft write path** (including Save & continue later and any thin wrapper) uses `UPDATE … WHERE client_id = $server AND status = 'draft'` (or INSERT of a new draft only when no row exists). Zero rows updated on a `completed` row → **409** / `CONFLICT`. No blind UPSERT. This story **never** writes `status = 'completed'`
- [ ] **[SEC] (added) Dashboard interview summary** is loaded only for `getCurrentUser().id` / `requireActive()`. The helper accepts **no** `client_id`, `session_id`, or equivalent parameter. Failed/empty load must not leak another tenant’s data
- [ ] **[SEC] (added) Dashboard payload is minimal:** may include `status`, `currentStep` (resume cursor), and derived `hasProgress` (or equivalent). **Must omit** `answers`, session UUID (prefer), Auth tokens, `auth_user_id`, `role`, service-role error internals
- [ ] **[SEC] (added) Dashboard helper must not get-or-create** an interview row. No row → not-started / Start CTA
- [ ] **[SEC] (added) Save & continue later uses the same current-step validation rules as step advance / `persistInterviewDraft`.** No weaker soft-save path. Invalid → field errors, stay on step, no dashboard navigation
- [ ] **[SEC] (added) Primary resume URL remains `/interview` with no session id in path or query.** Do not add `/interview/[id]` in this story
- [ ] **[SEC] (added) Client-supplied `id` / `session_id` / `sessionId`:** strip-and-ignore on persist (continue US-1.1). If any new load surface intentionally accepts an id, ownership-check (`row.client_id === user.id`) before return; foreign id → **404/empty** (prefer over 403). Tests must prove foreign ids do not leak
- [ ] **[SEC] (added) Draft continuity across new browser sessions** uses server DB + auth session cookie only — **not** `localStorage` / `sessionStorage` as source of truth
- [ ] **[SEC] (added) Operator reopen in V1 is SQL/ops only** (documented). No Cliente reopen UI. No Server Action in this story that transitions `completed` → `draft`
- [ ] **[SEC] (added) `revalidatePath('/dashboard')` and `revalidatePath('/interview')`** on successful persist / save-and-leave
- [ ] **[SEC] (added) XSS bar unchanged:** dashboard progress labels and any answer-derived copy render as React text nodes / PrimeReact children only — no `dangerouslySetInnerHTML`
- [ ] **[SEC] (added) Do not log `answers` bodies** (or full persist payloads) in production logs / error telemetry

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator reopen — **SQL/ops only in V1** (APPROVE product default)

| Path | V1 |
|---|---|
| Cliente reopen UI / action | **Forbidden** (SPEC Fuera V1) |
| `requireOperator()` Server Action | **Not required** this story |
| Documented SQL | **Required** — e.g. `UPDATE neuramark_interview_sessions SET status = 'draft', updated_at = now() WHERE client_id = $1 AND status = 'completed'` (ops-run; exact SQL in CONTRACT/ops note) |
| Audit table | **Not required** for SQL-only V1 |

Rationale: matches activation/`role` SQL trust model. An in-app Operator reopen later needs its own story + SECURITY (fresh `requireOperator()`, target authorization, optional audit).

**No BUILD veto** if implementers ship SQL docs only and zero reopen UI.

#### 2. Save & continue later — **same validation as advance** (APPROVE)

- Reuse `persistInterviewDraft` or a thin wrapper that calls the same validation + draft write predicate.
- Invalid current step → `VALIDATION_ERROR` + field errors; **do not** navigate to dashboard.
- Valid → persist → `revalidatePath` dashboard + interview → FE navigates to `/dashboard`.
- Still `requireActive("handler")`; still strip/reject identity and privilege keys; still 64 KiB / Zod floors.

#### 3. Dashboard Start vs Resume — **meaningful progress** (APPROVE)

| Server state | Card |
|---|---|
| No row | **Start** (US-1.1) |
| `status = 'draft'` and **not** meaningful progress | **Start** |
| `status = 'draft'` and meaningful progress | **Resume** / incomplete prompt + `current_step` label |
| `status = 'completed'` | Completed / view-only entry — **no** edit / Save & continue |

**Meaningful progress (freeze):** `current_step !== first step` (`services`) **OR** at least one of the seven answers keys is present. CONTRACT may name the boolean `hasProgress`.

**Mandatory:** no get-or-create on dashboard read.

#### 4. Session id / IDOR — **strip-primary; validate if ever used** (APPROVE product default)

| Surface | Policy |
|---|---|
| Happy-path resume | Load by `getCurrentUser().id` only. URL `/interview` — **no** id |
| Persist / Save & continue input | Continue US-1.1: **strip** `id` / `session_id` / `sessionId` / `client_id`; **reject** `status` / `role` / `active` / `auth_user_id` |
| Optional future/deep-link id | If CONTRACT adds any accept-id surface: ownership-check or reject; foreign → **404/empty**. Do **not** add `/interview/[id]` in 1.2 |
| Client props | Prefer **omit** session UUID from wizard and dashboard props so the UI cannot put it in the URL |

USER_STORIES IDOR AC is satisfied by strip-and-ignore (id never used) **plus** tests that foreign ids cannot be used to read data; validate-and-use is allowed only if ownership is enforced.

#### 5. Completed read-only — **server authority** (harden, do not redesign)

- All write paths: draft predicate → **409** on completed.
- This story **never** writes `completed` (US-1.3).
- FE: no edit / Next / Save & continue when `completed` (extend `InterviewCompletedView` + dashboard).
- Add automated coverage if US-1.1 gaps remain (e.g. Save & continue later against completed row).

#### 6. Dashboard response shape — **minimal** (new surface)

Example shape for CONTRACT (names flexible, fields not):

```ts
// Conceptual — CONTRACT owns exact schema
{ status: 'draft' | 'completed'; currentStep: InterviewStepKey; hasProgress: boolean }
// or discriminated: { kind: 'not_started' } | { kind: 'in_progress', currentStep } | { kind: 'completed' }
```

**Forbidden in dashboard summary:** `answers`, other tenants’ rows, auth/role internals.

#### 7. Resume after logout / new session

- Continuity = same activated Supabase Auth user → same `neuramark_clients.id` → same interview row.
- After logout: no product data without new login + `requireActive()`.
- **Forbidden:** treating browser storage as the draft store.

### Required implementation constraints

1. **Extend** `lib/interview/*` / dashboard RSC — do not fork parallel persist APIs that skip the draft predicate.
2. **One** mutation class: Server Actions only; no public interview Route Handler.
3. **Do not edit auth modules** except ensuring `revalidatePath` / headers remain correct (`no-store` already expected on dashboard + interview).
4. **No new packages.** No Upstash. No browser Supabase.
5. **No migration** unless CONTRACT somehow requires audit (it must not for SQL-only reopen). Verify existing enum/table only.
6. **EN/ES:** Entrevista inicial / Initial interview; no _Evitar_ synonyms; no Ficha viva labeling on this flow.

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Add Cliente “reopen completed” UI or action | **REJECT** — redesign to remove |
| Add persist path that writes without `status = 'draft'` predicate, or writes `completed` | **REJECT** |
| Add dashboard helper that accepts `client_id` / session id from the client as identity | **REJECT** |
| Add `/interview/[id]` without ownership-check design (this story must not add it) | **REJECT** |
| Use localStorage as resume source of truth | **REJECT** |
| Soft-save invalid step on Save & continue later | **REJECT** — keep advance-rule bar |
| Return full `answers` on dashboard card payload | **APPROVE WITH CONDITIONS** violation — strip before merge; CONTRACT must forbid |

None of the orchestrator product defaults trigger a veto.

---

## Future-Proofing Notes

- **US-1.3** remains the only path that may set `completed` and create **Ficha viva**. Keep write predicate so 1.3 cannot be undone by 1.2 persist.
- **Multi-tenancy:** ownership checks and “no client_id param” are the entire IDOR defense later; keep them even while single-tenant.
- **Operator-for-Cliente interview console:** future story with `requireOperator()`, server-authorized target id, never by accepting `client_id` on Cliente persist/dashboard helpers.
- **In-app Operator reopen:** new story; add audit if product needs it; do not bolt onto 1.2 without a SECURITY pass.
- **Prompt injection:** still treat answers as untrusted data for later agents; not this story’s job.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-1.2/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Primary load/resume by `getCurrentUser().id`; `/interview` without session id; one row per Cliente
- [ ] Session id policy frozen: strip on persist; ownership-check or strip on any accept-id surface; foreign → 404/empty; prefer omit UUID from props
- [ ] Save & continue later: same advance-rule validation; reuse draft write path; then navigate dashboard; `revalidatePath` dashboard + interview
- [ ] Dashboard summary: no `client_id`/session param; no get-or-create; Start vs Resume vs completed shapes; **no `answers`**
- [ ] Meaningful progress predicate frozen (`current_step !== services` OR ≥1 answers key)
- [ ] Never write `status = completed` in this story; reject client-supplied `status`; writes only with `status = 'draft'` → 409 if completed
- [ ] Operator reopen: SQL/ops note only; no Cliente reopen; no requireOperator action required
- [ ] Inherited floors unchanged: 64 KiB, Zod caps, XSS text nodes, RLS, parameterized jsonb, `requireActive`, `no-store`
- [ ] Continuity: DB + auth cookie; not localStorage
- [ ] Out of scope: US-1.3 submit/Ficha viva; US-2.x; full US-X.1 aggregator; auth redesign
- [ ] EN/ES: Entrevista inicial / Initial interview; no CONTEXT _Evitar_ synonyms

---

## Ops note — Operator SQL reopen (V1)

Document for operators (exact SQL may be copied into CONTRACT):

```sql
-- Reopen a completed Entrevista inicial for support (Operator / ops only).
-- Replace :client_id with the neuramark_clients.id UUID.
UPDATE neuramark_interview_sessions
SET status = 'draft',
    updated_at = now()
WHERE client_id = :client_id
  AND status = 'completed';
```

No app endpoint. No Cliente UI. Confirm row ownership out-of-band before running.
