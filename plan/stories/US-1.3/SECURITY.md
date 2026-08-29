# Security Design Review — US-1.3

**Story:** US-1.3 — Submit interview for profile generation  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-1.3 `[SEC]`), `plan/SECURITY_BASELINE.md` (Interview Builder), `plan/stories/US-1.1/SECURITY.md` + `US-1.2/SECURITY.md` (inherited floors), `plan/stories/US-1.3/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), `lib/interview/*`, `lib/contracts/interview.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: **Submit** validates completeness **server-side over stored answers** → upserts **one** `neuramark_business_profiles` row → sets interview `status = 'completed'` **only after** a successful profile write (fail-closed) → soft-success idempotent double-submit under **DB UNIQUE** constraints → FE lands on a **gated stub** (`/profile`) until US-2.1. Client never sends `status`. Identity only via `getCurrentUser()` / `requireActive()`.

No REDESIGN. No veto of orchestrator product defaults. Orchestrator may proceed to CONTRACT.md after freezing the items below.

**Inherited floors (US-1.1 / US-1.2 — do not weaken):** 64 KiB UTF-8 answers gate (413 / `PAYLOAD_TOO_LARGE`) + DB CHECK 80 KiB on interview `answers`; draft persist `UPDATE … AND status = 'draft'` → **409**; identity only via `getCurrentUser()` / `requireActive()`; Zod `.strict()` seven keys + per-field caps; answers rendered as escaped React text nodes only; strip/reject identity and privilege keys; `/interview` (and new stub) off `isPublicPath`; `Cache-Control: no-store`; parameterized SQL/jsonb; RLS deny-by-default, service-role Node only; no answers/profile free-text bodies in production logs; dashboard summary omits `answers`; no `/interview/[id]`; Operator reopen remains SQL/ops only (no Cliente reopen).

**This story owns:** `submitInterview` (CONTRACT name); completeness Zod (all seven steps); create `neuramark_business_profiles` + uniques; fail-closed `draft` → `completed`; idempotent re-submit; stub `/profile` under `(app)`; dashboard completed → stub link.

**This story does not own:** full Ficha viva UI (US-2.1); PATCH / version bump (US-2.2); agent DTO (US-2.3); LLM profile builder; Cliente reopen; auth redesign; draft persist (1.1/1.2).

**Terminology:** **Entrevista inicial**, **Ficha viva**, **Cliente**, **Operator**. EN UI may use **Living profile**. Do not use CONTEXT _Evitar_ terms (Business Profile / perfil de negocio, cuestionario, onboarding interview, admin / administrador / staff) in CONTRACT, this file’s product-facing examples, or EN/ES copy.

---

### Threat Summary (US-1.3–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **`status: completed` without completeness** | Skip Ficha viva gate; agents see completed Entrevista with no / bad profile | Client `status` rejected (`FORBIDDEN_FIELDS`). Completeness Zod over **DB** answers. Handler sets `completed` only after successful profile upsert |
| **Complete-by-client-payload** | Attacker forges full answers in submit body, never persisted, marks completed | **Ignore** client answers as source of truth. Load session + `answers` by `getCurrentUser().id`. Optional persist-then-submit must reuse US-1.1 draft write + Zod, then re-read DB |
| **Incomplete submit still writes profile / flips status** | Half-completed state; orphan or empty Ficha viva | Incomplete → **400** field-level; **no** profile write; **leave** `draft` |
| **IDOR via session / profile / `client_id` / `source_interview_id`** | Read/write another tenant’s Entrevista or Ficha viva | No client-supplied ids as identity. Load/upsert scoped to `getCurrentUser().id`. Strip/reject `client_id`, session ids, `source_interview_id` |
| **Race double-submit** | Two profile rows; completed without profile; torn state | `UNIQUE (source_interview_id)` + `UNIQUE (client_id)`. Prefer **one DB transaction**: upsert profile → `UPDATE` session `completed` where still `draft` (or already completed + same source). Unique violation → soft success / one row |
| **Profile write without auth** | Unauthenticated / inactive creates Ficha viva | `requireActive("handler")` before any read/write. Inactive → **403**, no write. Unauthenticated → **401** |
| **Stub `/profile` public or unscoped** | Anonymous or cross-tenant profile HTML | Under `(app)`; `requireActive("page")`; off `isPublicPath`; `no-store`. Load own profile only (or empty stub). No `client_id` / profile id param |
| **Incomplete / error response leak** | Field paths or bodies leak other tenants; oracle on foreign ids | Errors only for own session. Prefer **404/empty** if any foreign id surface ever appears (do not add). Do not dump full `answers` / profile blob in error envelopes |
| **Status before profile (ordering)** | `completed` with missing profile; agents assume Ficha viva exists | Fail-closed: **never** set `completed` unless profile upsert succeeded in the same transaction (preferred) or equivalent ordered fail-closed sequence with compensating cleanup |
| **Blind UPSERT / draft clobber from 1.1/1.2** | Post-submit overwrite of submitted answers | Unchanged: draft writes keep `status = 'draft'` predicate → **409**. This story is the **only** app path that sets `completed` |
| **Operator reopen + re-submit duplicate profile** | Second Ficha viva row | `UNIQUE (client_id)`: same row updated; may refresh `fields` / `updated_at` / `source_interview_id` (same session PK under V1 one-session-per-Cliente). No second insert |

**Residual risk accepted:** Activated Cliente can re-submit after Operator SQL reopen and overwrite Ficha viva `fields` (same trust model as SQL `active`/`role`). No app audit trail on overwrite in V1. Persist rate limit still **not** required. Prompt injection via answers/profile text deferred to US-4.x. Orphan profile if a non-transactional status update fails mid-flight is recoverable on next submit via `UNIQUE (client_id)` upsert — still **prefer single transaction** so residual is rare.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Entrevista `answers` jsonb | Medium — business PII-adjacent; LLM fuel later | Completeness reads **DB only**. Submit must not trust client blob as SoT |
| `status` (`draft` \| `completed`) | High — completeness / Ficha viva gate | Server-written. Only this story may set `completed` in-app |
| `neuramark_business_profiles` row | Medium — canonical Ficha viva | Service-role Node; RLS deny-by-default; upsert only after auth + completeness |
| `source_interview_id` | Medium — idempotency key + FK | Server-set from own session PK. Never from client |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()`. Never body/query/headers |
| Stub `/profile` HTML | Low–Medium until US-2.1 (minimal); later Medium | `(app)` + `requireActive` + `no-store`; own row only |
| Session cookie (`sb-*`) | High — US-14.5 | Unchanged |
| Service-role key | Critical | Node only. Never Client Components |

**Boundaries:**

1. **Browser → Submit Server Action** — Untrusted POST. CSRF via Next.js origin check. `requireActive("handler")` before load/validate/upsert/status.
2. **Browser → stub `/profile` RSC** — Session identifies user; page loads **that** Cliente’s stub/profile summary only (minimal until US-2.1).
3. **Browser → Dashboard completed link** — Link target only; no `client_id` query. Card summary still omits `answers` (US-1.2).
4. **Next.js → Postgres** — Parameterized service-role. Prefer single transaction for profile + status. RLS enabled, **zero** named policies on new table (match interview sessions).
5. **Auth** — Reuse US-14.5. Do not edit `lib/auth/*` allowlist. Keep `/interview`, `/dashboard`, `/profile` off `isPublicPath`.

---

## Abuse Cases Considered

- *As a malicious actor, I can POST `status: "completed"` (or omit UI) and skip completeness / Ficha viva* → **Blocked:** `status` in `FORBIDDEN_FIELDS` / never read from client; only handler writes `completed` after profile upsert.
- *As a malicious actor, I can send a full forged `answers` body on submit without those answers being stored, and become completed* → **Blocked:** completeness and map use **stored** answers for `getCurrentUser().id`. Client answers ignored as SoT (optional dirty-step persist-then-submit reuses draft path, then re-reads DB).
- *As a malicious actor, I can submit incomplete answers and still get a profile row or `completed`* → **Blocked:** completeness Zod fails → **400** field-level; no upsert; leave `draft`.
- *As a malicious actor, I can pass another Cliente’s `client_id`, session id, or `source_interview_id` and write/read their Ficha viva* → **Blocked:** strip/reject those keys; queries always `WHERE client_id = $server`. Prefer omit session/profile UUIDs from client props.
- *As a malicious actor, I double-click Submit / race two requests and create two profiles* → **Blocked:** `UNIQUE (source_interview_id)` and `UNIQUE (client_id)`; unique violation → soft success, one row; transaction / ordered fail-closed status update.
- *As a malicious actor, I call submit unauthenticated or inactive* → **Blocked:** `requireActive("handler")` → **401** / **403**, no write.
- *As a malicious actor, I open `/profile` without a session or scrape CDN/bfcache for another user’s stub* → **Blocked:** `(app)` + `requireActive("page")`; not on public allowlist; `Cache-Control: no-store`.
- *As a malicious actor, I mark completed then use US-1.1/1.2 persist to rewrite submitted answers* → **Blocked:** draft predicate → **409**; no second interview row (`UNIQUE (client_id)` on sessions).
- *As a malicious actor, I CSRF submit from `https://evil.example`* → **Blocked:** POST-only Server Action origin check (same class as persist / auth).
- *As a malicious actor, I probe incomplete submit errors to learn another tenant’s field state* → **Blocked:** submit always scopes to own session; no foreign id surface in this story.
- *As an Operator, I SQL-reopen then Cliente re-submits and I expect a second Ficha viva* → **Prevented by design:** upsert same `client_id` row; refresh `fields`; one canonical Ficha viva.
- *As a malicious actor, I hit a public Route Handler that upserts profiles* → **Blocked:** Server Action only; no public profile/interview submit API.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-1.3 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding; re-assert for submit + stub + profile surfaces):**

- [ ] **[SEC] All interview answers are re-validated server-side against a typed schema (Zod);** client-side validation is presentation only
- [ ] **[SEC] Interview sessions are created and loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string
- [ ] **[SEC] Total `answers` JSON payload rejected above 64 KiB (65536 UTF-8 bytes of `JSON.stringify(answers)`) with 413 / `PAYLOAD_TOO_LARGE`** (any persist-then-submit path)
- [ ] **[SEC] Free-text answers / profile fields are stored as data and always rendered escaped;** never interpolated into HTML, SQL, or shell
- [ ] **[SEC] Read-only enforcement for `completed` sessions happens server-side** on draft mutation paths (US-1.1/1.2 predicates unchanged)

**US-1.3 story `[SEC]` (existing):**

- [ ] **[SEC] Completeness is verified server-side at submit time;** a client cannot mark a session `completed` by flipping a status field in the request
- [ ] **[SEC] Idempotency is enforced with a DB-level constraint** (e.g. unique `business_profiles.source_interview_id`), not only application logic

**Added in this review:**

- [ ] **[SEC] (added) Completeness Zod runs over answers loaded from the DB for `getCurrentUser().id` only.** Client-submitted answers are **not** the source of truth for completeness or profile mapping. Incomplete → **400** with field-level errors; **no** profile write; session remains `draft`
- [ ] **[SEC] (added) `status` is never read from the client.** This story is the only in-app writer of `completed`. Reject `status`, `role`, `active`, `auth_user_id`, and reject/strip `client_id`, session ids, `source_interview_id` if present (`FORBIDDEN_FIELDS` / strip class)
- [ ] **[SEC] (added) Fail-closed ordering:** upsert `neuramark_business_profiles` **succeeds before** (or atomically with) setting session `status = 'completed'`. Prefer a **single DB transaction**. Profile write failure or incompleteness → leave `draft`. Never set `completed` then best-effort profile
- [ ] **[SEC] (added) `neuramark_business_profiles` has `UNIQUE (source_interview_id)` and `UNIQUE (client_id)`** (V1 one Ficha viva per Cliente). Double-submit / unique violation → **soft success** (e.g. `alreadyCompleted: true`) with the same logical profile link — **no second row**
- [ ] **[SEC] (added) Profile upsert sets `client_id` and `source_interview_id` from server-resolved user + own session PK only.** Map from stored answers (jsonb `fields` 1:1 interview keys for V1 unless CONTRACT freezes equivalent columns)
- [ ] **[SEC] (added) Submit and any profile mutation call `requireActive("handler")` independently of middleware/layout.** Unauthenticated → **401**; inactive → **403**; no side effects
- [ ] **[SEC] (added) Stub route `/profile` (or CONTRACT path) lives under `app/(app)/`, is not on `isPublicPath`, uses `requireActive("page")`, sends `Cache-Control: no-store`.** No `client_id` / profile id query param as identity
- [ ] **[SEC] (added) Stub / success payloads are minimal until US-2.1:** confirmation + optional own-profile existence flag / redirect target. Must **omit** other tenants’ data, Auth tokens, `auth_user_id`, `role`, service-role internals. Prefer omitting raw full `fields` dump on the stub if not required for UX (US-2.1 owns full render)
- [ ] **[SEC] (added) Concurrent double-submit must not leave `completed` without a profile row, nor two profiles.** Prove with tests: complete submit → one profile + `completed`; race/double → one profile; incomplete → 400 + still `draft` + zero new profile (or unchanged)
- [ ] **[SEC] (added) RLS enabled on `neuramark_business_profiles`, deny-by-default, zero named policies;** service-role Node only. Parameterized writes only
- [ ] **[SEC] (added) Re-submit when already `completed`:** soft success → stub; **do not** reopen to `draft`; **do not** run incompleteness 400 against a completed row’s historical answers as a failure path that blocks idempotent success
- [ ] **[SEC] (added) Do not log full `answers` or profile `fields` free text** in production logs / error telemetry
- [ ] **[SEC] (added) `revalidatePath` for `/interview`, `/dashboard`, and stub `/profile`** on successful submit
- [ ] **[SEC] (added) XSS bar unchanged:** stub and success copy render as React text nodes / PrimeReact children only — no `dangerouslySetInnerHTML` from interview/profile text

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Answers source of truth — **DB for current user** (APPROVE orchestrator default #7)

| Rule | Detail |
|---|---|
| Completeness | Zod over **stored** `answers` for `getCurrentUser().id` |
| Profile map | Same stored object → `fields` |
| Client body | Empty / minimal submit input preferred. If answers appear in the payload, **ignore for SoT** (do not complete-by-payload) |
| Dirty last step | Optional **persist-then-submit**: call existing draft persist (US-1.1 floors) then re-SELECT answers, then completeness. Not a weaker path |

#### 2. Fail-closed transaction ordering (APPROVE orchestrator default #6) — **mandatory**

```text
BEGIN
  -- auth + load own draft session (outside or inside; identity already resolved)
  -- completeness check (app); abort if incomplete (no writes)
  UPSERT neuramark_business_profiles (... client_id, source_interview_id, fields ...)
  UPDATE neuramark_interview_sessions
    SET status = 'completed', updated_at = now()
    WHERE client_id = $server AND id = $session
      AND (status = 'draft' OR status = 'completed');  -- idempotent
COMMIT
```

- **Forbidden:** `UPDATE status = completed` then best-effort profile insert.
- **Preferred:** single transaction / RPC. If app-level two-step is unavoidable: profile first; on status failure compensating delete **or** leave orphan recoverable via next upsert on `UNIQUE (client_id)` — document in CONTRACT; still treat as fail-closed for the user-visible outcome (session stays `draft` until status write succeeds).
- Incomplete or profile failure → **leave `draft`**; no half-completed UX lying about success.

#### 3. Uniques + idempotency (APPROVE orchestrator defaults #2, #4, #5)

| Constraint | Purpose |
|---|---|
| `UNIQUE (source_interview_id)` | AC [SEC] idempotency; one profile per source Entrevista |
| `UNIQUE (client_id)` | V1 one Ficha viva per Cliente; Operator reopen + re-submit updates same row |

- Create-on-submit; upsert if row exists for `client_id` and/or `source_interview_id`.
- Double-submit / unique violation → **soft success** (`ok: true`, `alreadyCompleted: true` or equivalent) — **not** hard 409 for “already done”.
- 409 remains for **draft** writes against completed sessions (US-1.1/1.2), not for idempotent re-submit.

#### 4. Operator reopen overwrite semantics (APPROVE)

V1: Operator SQL sets interview `draft` again (US-1.2 ops note). Cliente edits + re-submits:

- Upsert **updates** the existing profile for that `client_id`.
- `source_interview_id` remains the same session PK (one session per Cliente in V1).
- `fields` / `updated_at` / `version` (if present) refresh per CONTRACT.
- **No** second profile row. No Cliente reopen UI in this story.

#### 5. Profile field shape (APPROVE orchestrator default #1)

- V1: jsonb `fields` mirroring the seven interview keys (same Zod shapes / caps as stored answers).
- Size: mapped `fields` must respect the same per-field caps; total size bounded consistently with interview answers (do not introduce an unbounded jsonb dump).
- No LLM rewrite in this story.

#### 6. Stub route `/profile` (APPROVE orchestrator defaults #3, #8)

| Rule | Detail |
|---|---|
| Path | `/profile` under `(app)` (US-2.1 replaces content in place) |
| Auth | `requireActive("page")`; not public |
| Cache | `no-store` |
| UI | Stub/success only — no full field grid |
| Dashboard | Completed card may link to `/profile` |
| Load | Own profile only if stub needs existence check; no id params |

#### 7. Submit surface

- One Server Action (`submitInterview` or CONTRACT name). No public Route Handler.
- CSRF: POST-only Server Action origin check.
- Extend `FORBIDDEN_FIELDS` / strip lists to include `source_interview_id` (reject or strip — never use from client).

### Required implementation constraints

1. **Extend** `lib/interview/*` + new profile data helper under server-only modules — do not fork a parallel submit that skips completeness or auth.
2. **Do not weaken** draft persist predicate; this story does not change US-1.1/1.2 write paths except `revalidatePath` targets as needed.
3. **Do not edit auth modules** except ensuring `/profile` is in `no-store` headers and **not** on `isPublicPath`.
4. **Migration:** `neuramark_business_profiles` with FKs to `neuramark_clients` and `neuramark_interview_sessions`, both UNIQUEs, RLS zero policies, `neuramark_` indexes/triggers as needed. No agent tables. No `profile_versions` history table.
5. **No new packages.** No Upstash. No browser Supabase.
6. **No LLM / queue / spend** in this story.
7. **Tests (security-relevant):** complete → one profile + completed; incomplete → 400 fields + draft + no profile; double-submit → one profile + soft success; client `status` / `client_id` / `source_interview_id` rejected; unauthenticated/inactive no write; draft persist still 409 after complete; stub not public.

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Set `status = 'completed'` before / without successful profile upsert (or skip completeness) | **REJECT** |
| Trust client-submitted answers as SoT for completeness / profile map (complete-by-payload) | **REJECT** |
| Ship without DB `UNIQUE (source_interview_id)` (app-only idempotency) | **REJECT** |
| Accept `client_id` / `source_interview_id` / session id from the client as identity or write target | **REJECT** |
| Add `/profile` (or stub) to `isPublicPath` or serve it without `requireActive` | **REJECT** |
| Add a public Route Handler that upserts profiles or marks completed | **REJECT** |
| Allow draft persist to overwrite `completed` sessions | **REJECT** (regression of 1.1/1.2) |
| Create multiple profiles per Cliente / per source interview in the happy path | **REJECT** |
| Put `@supabase/supabase-js` in Client Components or expose service-role | **REJECT** |
| Expand stub into full Ficha viva field grid claiming US-2.1 done | **Out of scope** — strip before merge; not a security REDESIGN but **BUILD scope veto** for this story |

None of the eight orchestrator product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-2.1** replaces stub content in place at `/profile`; keep ownership-scoped load (`getCurrentUser().id` only) so the page does not grow a `client_id` param.
- **US-2.2** PATCH must not reopen interview status; profile edits are a separate allowlisted mutation with version bump.
- **US-2.3** agent helper is server-only and must not import into client bundles; minimal DTO (no raw interview blob required if `fields` already normalized).
- **Multi-tenancy:** `client_id` + deny-by-default RLS + no client-supplied tenant ids remain the IDOR defense; enabling tenant RLS policies later is additive.
- **Prompt injection:** stored `fields` remain untrusted data for later agents (delimited), not sanitized into different meaning here.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-1.3/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `submitInterview` (name frozen): `requireActive("handler")`; load own session + **stored** answers; reject/strip forbidden identity/privilege/`status`/`source_interview_id` fields
- [ ] Completeness Zod: all seven keys; empty `restrictions.items` allowed; incomplete → 400 field-level; no profile write; leave `draft`
- [ ] Upsert `neuramark_business_profiles`: server `client_id` + `source_interview_id`; jsonb `fields` 1:1 interview keys; create-on-submit / update if exists
- [ ] `UNIQUE (source_interview_id)` + `UNIQUE (client_id)`; double-submit → soft success, one row
- [ ] Fail-closed: completed **only after** successful profile upsert; prefer single transaction; never from request body
- [ ] Already completed re-submit: soft success → stub; no reopen
- [ ] Stub `/profile` under `(app)`, gated, `no-store`, minimal; dashboard may link; US-2.1 replaces content later
- [ ] Inherited floors unchanged: 64 KiB, Zod caps, XSS text nodes, draft write predicate, RLS, parameterized writes, `requireActive`
- [ ] Response shapes minimal (no over-exposure); no answers/profile free text in logs
- [ ] Out of scope: US-2.1 full UI; US-2.2; US-2.3; LLM builder; Cliente reopen; auth redesign
- [ ] EN/ES: Entrevista inicial / Initial interview; Ficha viva / Living profile; no CONTEXT _Evitar_ synonyms

---

## CONTRACT freeze list (binding summary)

1. **SoT:** DB answers for current user; ignore client answers as completeness/profile SoT.  
2. **Completeness:** server Zod all seven steps → 400 fields; no writes on failure.  
3. **Ordering:** profile upsert succeeds before/with `completed`; single transaction preferred; fail-closed.  
4. **Uniques:** `UNIQUE (source_interview_id)` + `UNIQUE (client_id)`; soft-success idempotency.  
5. **Identity:** `requireActive`; never trust `client_id` / `status` / `source_interview_id` / session ids from client.  
6. **Stub:** `/profile` gated + `no-store` + minimal; not public.  
7. **Shape:** jsonb `fields` 1:1 interview keys; create-on-submit; Operator reopen overwrites same row.  
8. **Surface:** Server Action only; RLS deny-by-default; no new packages; no LLM.

---

## BUILD vetoes (summary)

1. Completed without successful profile upsert / without completeness.  
2. Complete-by-client-payload (client answers as SoT).  
3. Missing DB unique on `source_interview_id` (app-only idempotency).  
4. Client-supplied tenant/session/`source_interview_id` as write/read authority.  
5. Public or unauthenticated stub / profile upsert Route Handler.  
6. Regression: draft persist overwrites `completed`.  
7. Multiple Ficha viva rows per Cliente or per source interview on happy/idempotent paths.  
8. Service-role or Supabase client in the browser.
