# Security Design Review — US-1.1

**Story:** US-1.1 — Start guided business interview  
**Date:** 2026-08-28  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-1.1 `[SEC]`), `plan/SECURITY_BASELINE.md` (Interview Builder), `plan/stories/US-1.1/TASKS.md`, `plan/stories/US-1.1/SPEC-REVIEW.md` (ALIGNED), `plan/stories/US-14.5/SECURITY.md`, `lib/auth/require-user.ts`, `lib/auth/public-routes.ts`, `lib/supabase/server.ts`, `AGENTS.md`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct: one `neuramark_interview_sessions` row per Cliente (`UNIQUE (client_id)`), product page `/interview` under `app/(app)/` (not public), identity only from `getCurrentUser().id` / `requireActive()`, structured `answers` jsonb with server Zod, this story writes `draft` only, no Ficha viva / submit / `completed`. Auth is already shipped (US-14.5) — do not redesign it. Entrevista inicial is a **product** surface behind `requireActive()`.

No REDESIGN. Conditions are the `[SEC]` criteria below plus the **CONTRACT freeze list**. Orchestrator may proceed to CONTRACT.md.

**This story owns:** wizard + persist draft JSON + survive refresh; table/enum/trigger/RLS; dashboard Start CTA wired to `/interview`.

**This story does not own:** dashboard resume prompt (US-1.2); submit / `completed` / Ficha viva (US-1.3); auth, allowlist contents (except `/interview` must stay **off** it), login/signup/reset.

**Terminology:** **Entrevista inicial**, **Cliente**, **Ficha viva** (out of scope — name only). Do not use CONTEXT _Evitar_ terms (cuestionario, onboarding interview, Business Profile, perfil de negocio, admin / administrador / staff) in CONTRACT, this file’s product-facing examples, or EN/ES copy.

---

### Threat Summary

US-1.1 is the first **product write** of Cliente-authored business text. It is not spend-bearing, but it is the seed for later LLM prompts and the first owned jsonb document. Primary threats:

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **IDOR via session UUID or `client_id`** | Read/write another Cliente’s Entrevista | No session id in URL/body. `client_id` only from `getCurrentUser().id`. Strip/ignore if sent. Lookups `WHERE client_id = $server` |
| **Client-supplied `status=completed`** | Skip US-1.3 completeness / Ficha viva gate | `status` absent from request; 1.1 always writes `draft`. `UPDATE … AND status = 'draft'` |
| **Naive UPSERT clobbers `completed`** | Future US-1.3 row overwritten by 1.1 persist | Forbidden. INSERT new draft or `UPDATE … WHERE client_id = $1 AND status = 'draft'`. 409 if 0 rows |
| **Storage / jsonb bomb** | Huge payload, DB bloat, CPU on parse | Per-field Zod caps **and** 64 KiB app gate (413) **and** DB CHECK 80 KiB |
| **XSS via free-text answers** | Script in services/zone/restrictions on render | Store as data; React text nodes only; no `dangerouslySetInnerHTML` |
| **SQLi via jsonb concat** | Query injection | Parameterized writes; answers bound as jsonb values |
| **CSRF persist** | Cross-origin POST writes the victim’s draft | POST-only Server Action (Next.js origin check). No GET mutation |
| **Skip middleware, call action directly** | Unauthenticated / inactive write | Action calls `requireActive("handler")` itself. Inactive → 403, no write |
| **`/interview` on public allowlist** | Anonymous HTML / data leak | Must not add to `isPublicPath`. Same class as `/dashboard` |
| **Stale cached interview HTML** | Shared device / back button shows answers | `Cache-Control: no-store` on `/interview` (same as other `(app)` surfaces) |
| **Prototype / unknown keys** | Extra jsonb fields become a dump later | Zod `.strict()`; merge only the seven step keys |
| **Operator reads another tenant** | Privilege confusion | No `client_id` parameter even for Operator. Own row only. No `requireOperator()` here |

**Residual risk accepted:** An **activated** session can issue many draft UPDATEs (write amplification). Storage is bounded (one row, 64 KiB). Persist rate limit is **not** required in 1.1 (see freeze §2). Prompt injection through answers is contained later (US-4.x delimited data); this story must not send answers to an LLM.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Entrevista `answers` jsonb | Medium — business PII-adjacent; future LLM fuel | Browser form → Server Action only. Never in client-side Supabase |
| `neuramark_interview_sessions` row | Medium — one per Cliente | Service-role Node client; RLS deny-by-default |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()`. Never from body/query/headers |
| `status` (`draft` \| `completed`) | High — later completeness gate | Server-written. 1.1 → `draft` only. Not in the request |
| `current_step` | Low — UX cursor; injection if used as a path | Frozen enum of seven keys. Never interpolated into imports/paths |
| Session cookie (`sb-*`) | High — already US-14.5 | Unchanged. Interview does not set cookies |
| Service-role key | Critical | `lib/supabase/server.ts` Node only. Never `NEXT_PUBLIC_*`, never Client Components, never Edge |
| Interview HTML | Medium — contains answers | `(app)` + `no-store`. Not public |

**Boundaries:**

1. **Browser → Entrevista UI** — Untrusted. Client validation is presentation only. No `@supabase/supabase-js`, no keys, no `client_id` in forms or query.
2. **Browser → persist Server Action** — Untrusted POST. CSRF via Next.js origin check. `requireActive("handler")` before any read/write.
3. **RSC load → Postgres** — Server Component / server helper loads or creates the **current user’s** draft. No public GET list/detail by UUID.
4. **Next.js → Supabase** — Parameterized service-role access. RLS enabled, **zero** named policies (same as `neuramark_clients`).
5. **Auth** — Reuse US-14.5. Do not edit `lib/auth/*`, middleware allowlist (except ensuring `/interview` is **not** added), or session cookies.

---

## Abuse Cases Considered

- *As a malicious actor, I can PUT `client_id` of another Cliente in the body or `?client_id=`* → **Blocked:** identity only from `getCurrentUser().id`. Forbidden keys stripped/rejected. Queries never use request `client_id`.
- *As a malicious actor, I can open `/interview/[uuid]` or send a session id and read someone else’s draft* → **Blocked:** no session id in URL or body in 1.1. Load by current user only.
- *As a malicious actor, I can send `status: "completed"` and skip US-1.3* → **Blocked:** `status` not in the contract; ignored/rejected; writer always `draft`. Completeness for Ficha viva is US-1.3.
- *As a malicious actor, I can persist after US-1.3 marked the row `completed` and overwrite the submitted Entrevista* → **Blocked:** `UPDATE … WHERE client_id = $1 AND status = 'draft'`. Zero rows → **409**, no INSERT of a second row (`UNIQUE (client_id)`).
- *As a malicious actor, I can POST 10 MB of jsonb and fill the database* → **Blocked:** per-field Zod limits, then 64 KiB UTF-8 of `JSON.stringify(answers)` → **413**, no store; DB CHECK 80 KiB as backstop.
- *As a malicious actor, I can put `<script>` / HTML in a service name and execute it on the wizard* → **Blocked:** React text nodes / PrimeReact children; no `dangerouslySetInnerHTML`; never interpolate into HTML, SQL, or shell.
- *As a malicious actor, I can CSRF-save a victim’s draft from `https://evil.example`* → **Blocked:** POST-only Server Action origin check (same class as `logIn`). `SameSite=Lax` cookies. No GET persist.
- *As a malicious actor, I am inactive and I call the persist action directly, skipping the layout* → **Blocked:** action calls `requireActive("handler")`. Inactive → **403**, no write. Unauthenticated → **401**.
- *As a malicious actor, I can add `/interview` to the public allowlist (or hit a public Route Handler)* → **Blocked:** `/interview` stays off `isPublicPath`. No public interview API.
- *As an Operator, I can pass another Cliente’s id and read their Entrevista* → **Blocked:** no such parameter. Own `getCurrentUser().id` only. Operator-for-others is a future story, not a 1.1 back door.
- *As a malicious actor, I can `current_step: "../evil"` and trigger a dynamic import* → **Blocked:** `current_step` is an enum of seven English snake keys (CHECK/enum in DB + Zod). Never used as a filesystem or import path.
- *As a malicious actor, I can merge `__proto__` / unknown keys into jsonb for later dump* → **Blocked:** Zod `.strict()` on the answers object; server merge copies only the seven step keys.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-1.1 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

- [ ] **[SEC] All interview answers are re-validated server-side against a typed schema (Zod);** client-side validation is presentation only
- [ ] **[SEC] Interview sessions are created and loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string
- [ ] **[SEC] Total `answers` JSON payload rejected above a configured size limit (64 KiB / 65536 UTF-8 bytes of `JSON.stringify(answers)`) with a 413 (PAYLOAD_TOO_LARGE), preventing storage abuse;** schema / required-field failures remain 400
- [ ] **[SEC] Free-text answers are stored as data and always rendered escaped;** they are never interpolated into HTML, SQL, or shell commands
- [ ] **[SEC] (added) No client-supplied interview session UUID** in path, query, or body in this story. Load and persist by `getCurrentUser().id` only. If `id` / `session_id` / `sessionId` is sent, strip or reject — do not use it
- [ ] **[SEC] (added) `status` is never read from the client.** This story writes `draft` only. US-1.3 is the only path that may set `completed`
- [ ] **[SEC] (added) Draft writes use `UPDATE … WHERE client_id = $1 AND status = 'draft'`** (or equivalent INSERT of a new draft). A `completed` row must not be overwritten. Zero rows updated → **409**, no second row
- [ ] **[SEC] (added) `/interview` is not on the public allowlist** (`isPublicPath`). Page lives under `app/(app)/`. Mutations call `requireActive("handler")` independently of middleware / layout
- [ ] **[SEC] (added) Persist is a POST-only Server Action** with the same CSRF origin check as auth mutations. No GET persist. No interview Route Handler required
- [ ] **[SEC] (added) Per-field Zod caps** (CONTRACT freeze numbers): list `items` max **20**; each item **1–500** chars after trim; `description` **1–2000** chars after trim when that step is advanced; `restrictions.items` **0–20** (empty allowed). Unknown keys rejected (`.strict()`)
- [ ] **[SEC] (added) XSS:** wizard and dashboard copy render answers as React text nodes / PrimeReact children only. **No** `dangerouslySetInnerHTML`, markdown-to-HTML, or `innerHTML` from answers
- [ ] **[SEC] (added) Parameterized jsonb writes only.** Answers bound as JSON/jsonb values — never string-concatenated into SQL
- [ ] **[SEC] (added) RLS enabled on `neuramark_interview_sessions`, deny-by-default, zero named policies** (same as `neuramark_clients`). No browser ownership policies. Service-role Node only
- [ ] **[SEC] (added) DB CHECK `octet_length(answers::text) <= 81920`** (80 KiB) as a backstop above the 64 KiB app gate. App still rejects at 65536 with 413 before insert/update
- [ ] **[SEC] (added) Product HTML for `/interview` sends `Cache-Control: no-store`** (extend `next.config.ts` headers like `/dashboard`). `force-dynamic` on the page or parent `(app)` layout
- [ ] **[SEC] (added) Minimal load shape for the wizard:** `current_step`, `answers`, `status` (always `draft` here). Do not return other tenants’ rows, Auth tokens, `auth_user_id`, `role`, or service-role error internals. Prefer omitting session `id` from client props so the UI cannot put it in the URL
- [ ] **[SEC] (added) `current_step` is an allowlisted enum** of the seven storage keys. DB CHECK or enum. Never used to build file paths or dynamic imports
- [ ] **[SEC] (added) Do not log `answers` bodies** (or full persist payloads) in production logs / error telemetry

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

These are the picks this review was required to freeze. CONTRACT.md must copy them, not reopen them.

#### 1. DB-level size CHECK **and** app 64 KiB — **both**

| Layer | Rule | User-visible |
|---|---|---|
| App (authoritative for UX) | After Zod parse, `Buffer.byteLength(JSON.stringify(answers), "utf8") > 65536` → **no store** | **413** / `PAYLOAD_TOO_LARGE` |
| DB backstop | `CONSTRAINT neuramark_interview_sessions_answers_size_check CHECK (octet_length(answers::text) <= 81920)` | Must not fire on a valid 64 KiB write (jsonb canonicalization slack). If it ever fires (bypass), fail closed — generic 500, not a silent truncate |

Do **not** app-only. Do **not** set the CHECK at exactly 65536 (false 500s). 80 KiB is slack, not a second product limit.

#### 2. Persist rate limit — **not required** in 1.1

Not in story AC. **Not** added as a security floor.

Reason: persist is behind `requireActive()` (operator-activated accounts); storage is bounded (`UNIQUE (client_id)` + 64 KiB); `neuramark_auth_attempts` is an **auth** table — do not extend its enum for product writes; no Upstash.

Residual: activated session write amplification. Revisit if abused, or when US-1.3 triggers downstream spend.

#### 3. Oversize **413** vs schema **400** — **split** (PO preference, now frozen)

| Failure | HTTP (if any Route Handler) | Server Action discriminant |
|---|---|---|
| Byte cap (64 KiB) | **413** | `PAYLOAD_TOO_LARGE` |
| Zod / required / unknown keys / wrong types | **400** | `VALIDATION_ERROR` + field-level messages |
| Unauthenticated | **401** | existing auth envelope |
| Inactive | **403** | existing auth envelope |
| Write to `completed` row | **409** | `CONFLICT` (or equivalent) — no write |

Measure bytes of the **merged `answers` object** that would be stored, UTF-8, `JSON.stringify` default (no pretty-print).

#### 4. `UPDATE … AND status = 'draft'` — **mandatory** in 1.1

Not optional. Cheap insurance so US-1.3 cannot be undone by this persist action.

- First visit: `INSERT` (`status = 'draft'`, empty structured `answers`, first `current_step`). On `UNIQUE` race: SELECT existing row; do not UPDATE if `status <> 'draft'`.
- Later: `UPDATE … SET answers, current_step, updated_at WHERE client_id = $1 AND status = 'draft'`.
- **Forbidden:** `ON CONFLICT (client_id) DO UPDATE` without `WHERE … status = 'draft'`.
- Zero rows → **409**. Do not INSERT a second row.

Full completed read-only + Operator reopen remains US-1.2 / SPEC.

#### 5. Per-field max lengths (defense in depth) — CONTRACT must use these numbers

UTF-16 / Zod `.max()` on **trimmed** strings. Empty strings after trim are invalid **items**. 64 KiB remains the byte backstop (4-byte UTF-8 can 413 before hitting char max).

| Field | Shape | Advance rule (1.1) | Caps |
|---|---|---|---|
| `services.items` | `string[]` | ≥ 1 | max **20** items; each **1–500** |
| `zone.description` | `string` | non-empty | **1–2000** |
| `tone.description` | `string` | non-empty | **1–2000** (free text, not a closed enum) |
| `offers.items` | `string[]` | ≥ 1 | max **20**; each **1–500** |
| `objections.items` | `string[]` | ≥ 1 | max **20**; each **1–500** |
| `style.description` | `string` | non-empty | **1–2000** (free text, not a closed enum) |
| `restrictions.items` | `string[]` | array required; **empty allowed** | **0–20**; each present item **1–500** |

- Storage keys (English snake, SPEC order): `services` → `zone` → `tone` → `offers` → `objections` → `style` → `restrictions`.
- Answers object: `.strict()` — only those seven keys. Missing keys allowed on incomplete drafts.
- Merge: copy only those keys from the existing row + the step being saved. No deep merge of arbitrary JSON.
- `tone` / `style`: **free text** (SPEC names steps only). Closed enums not required for 1.1.

#### 6. XSS — React text nodes only

- No `dangerouslySetInnerHTML`, no markdown HTML, no `innerHTML`, no string-built HTML from answers.
- PrimeReact `Message` / labels: pass strings as children/text, not as HTML.
- Do not put answers into `href`, `src`, or CSS from untrusted strings.

#### 7. IDOR — no client-supplied session UUID in 1.1

- Route: `/interview` only. No `/interview/[id]`, no `?session=`.
- Persist/load: `WHERE client_id = getCurrentUser().id`.
- Strip/reject `id`, `session_id`, `sessionId`, `client_id`, `clientId`, `status`, `role`, `active`, `auth_user_id`.

### Required implementation constraints

1. **Surface:** RSC load (get-or-create draft) + **one** persist Server Action. Do not add a public Route Handler. Do not add `@supabase/supabase-js` to Client Components.
2. **`requireActive("handler")` on the action; `requireActive("page")` already on `(app)` layout.** Middleware is convenience. Inactive → 403 no write.
3. **Do not edit auth modules** except adding `/interview` to `no-store` headers in `next.config.ts` (and tests that the path is not public).
4. **RLS:** `ENABLE ROW LEVEL SECURITY`; **zero** `CREATE POLICY`. Comment: service-role bypass; no browser SDK.
5. **Naming:** `neuramark_interview_sessions`, enum `neuramark_interview_session_status` (`draft` \| `completed`), CHECK/enum for `current_step`, trigger `neuramark_interview_sessions_set_updated_at` (prefixed function if new). `UNIQUE (client_id)`. FK to `neuramark_clients.id` (ON DELETE CASCADE is acceptable).
6. **No Ficha viva:** no `neuramark_business_profiles`, no `source_interview_id`, no submit CTA, no LLM call.
7. **Dependencies:** Zod already in the app. No new packages. No Upstash. No lookalike form libraries that render HTML from answers.
8. **Get-or-create race:** handle unique violation with SELECT; never clobber `completed`.
9. **Revalidate:** `revalidatePath` for `/interview` (and dashboard if it later reads the row). Page `force-dynamic` / parent already `force-dynamic`.

---

## Future-Proofing Notes

- **US-1.2** may add a dashboard resume prompt and completed read-only UX. Keep the write predicate; 1.2 should not introduce a client-supplied UUID. If a UUID ever appears, ownership check is mandatory (existing US-1.2 `[SEC]`).
- **US-1.3** is the only `completed` + Ficha viva path. Completeness is server-side then; 1.1 must not grow a hidden submit.
- **Multi-tenancy / RLS later:** `client_id` is already the tenant key; deny-by-default RLS means ownership policies are additive. Do not add `authenticated` policies that assume a browser Supabase client.
- **Prompt injection (US-4.x):** treat stored answers as untrusted data in prompts (delimited). Not this story’s job — do not “sanitize” free text into a different meaning here.
- **Operator-for-Cliente:** if Operators later view another tenant’s Entrevista, that must be a new, explicit, `requireOperator()` endpoint with a **server-authorized** target id — never by accepting `client_id` on this Cliente persist action.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-1.1/CONTRACT.md` exists, verify before coding proceeds:

- [ ] One row per Cliente `UNIQUE (client_id)`; load/persist by `getCurrentUser().id`; no session UUID in URL/body
- [ ] `status` omitted from request; 1.1 writes `draft` only; strip `client_id` / `status` / ids
- [ ] Write predicate `status = 'draft'`; 409 on completed; no blind UPSERT
- [ ] Persist = Server Action + CSRF origin check; RSC load; no public interview Route Handler
- [ ] Zod `.strict()` seven keys; per-field caps frozen above; empty `restrictions.items` allowed; tone/style free text
- [ ] Oversize → 413 / `PAYLOAD_TOO_LARGE` at 65536 UTF-8 bytes; schema → 400 / `VALIDATION_ERROR`
- [ ] App 64 KiB **and** DB CHECK 80 KiB; parameterized jsonb; RLS zero policies; `neuramark_` prefix
- [ ] `/interview` under `(app)`, not public; `requireActive` on mutations; `no-store`
- [ ] XSS: no `dangerouslySetInnerHTML`; answers as text nodes
- [ ] Minimal response; no answers in logs
- [ ] Out of scope: US-1.2 dashboard resume prompt; US-1.3 submit/`completed`/Ficha viva; auth redesign; persist rate-limit table
- [ ] EN/ES: Entrevista inicial / Initial interview; no _Evitar_ synonyms
