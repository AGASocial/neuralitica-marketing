# Security Design Review — US-2.3

**Story:** US-2.3 — Expose profile to agents (API contract)  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-2.3 `[SEC]`), `plan/SECURITY_BASELINE.md` (Business Profile), `plan/stories/US-2.1/SECURITY.md` + `US-2.2/SECURITY.md` (carry-forward), `plan/stories/US-2.3/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), `lib/contracts/profile.ts`, `lib/profile/get-business-profile-for-client.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: ship a **server-only** helper `getBusinessProfileForAgents(clientId)` that returns a **minimal Zod agent DTO** projected from the canonical Ficha viva row (`neuramark_business_profiles`). Callers are **trusted server/orchestration code only** (System cycle jobs, agent runners, Operator-gated server jobs that already resolved the target tenant). **Not** a public Route Handler; **not** for the browser; **not** a substitute for arity-0 `getBusinessProfileForClient`. Pre-onboarding / missing row → typed `{ exists: false }` (no throw). `visualModeSummary: null` (key present) until US-3.x. Omit consent internals, raw Entrevista blobs, `source_interview_id`, tokens, privilege fields.

No REDESIGN. No veto of orchestrator / SPEC-REVIEW / PO lean defaults (server-only path; trusted callers; no `requireActive` inside helper; soft empty; `clientId` on success DTO; distinct Cliente helper; stub visual key; omit interview linkage). Orchestrator may proceed to CONTRACT.md after freezing the items below.

**Inherited floors (US-1.1 / US-1.2 / US-1.3 / US-2.1 / US-2.2 — do not weaken):** RLS deny-by-default on `neuramark_business_profiles`, service-role Node only; parameterized SQL; no `@supabase/supabase-js` in Client Components; no free-text `fields` in production logs; Cliente path remains arity-0 `getBusinessProfileForClient` with `requireActive` / `getCurrentUser()` only; PATCH remains Server Action with no tenant args from the browser.

**This story owns:** `getBusinessProfileForAgents(clientId)` + Zod agent DTO (+ types) in `lib/contracts/…`; 404-safe empty; visual stub; MUST-import documentation for future agents; unit tests proving server-only + soft empty + minimal strip.

**This story does not own:** FE UI; public HTTP by `clientId`; Preferencias / Consentimiento persistence (US-3.x); wiring Content Strategy / Script / Caption / QA LLM jobs (US-4.x+); merge with Cliente helper; `profile_versions`; auth redesign.

**Terminology:** **Ficha viva** / Living profile · **Entrevista inicial** · **Cliente** · **Operator** · **Preferencias de producción visual** · **Modalidad de producción** (future summary) · **Consentimiento de avatar**. Technical helper name `getBusinessProfileForAgents` is SPEC-canonical (S3.M3) — keep in code. Do not use CONTEXT _Evitar_ terms in product-facing docs.

---

### Threat Summary (US-2.3–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **IDOR via untrusted `clientId`** | Read another Cliente’s Ficha viva (services, offers, restrictions → LLM fuel) | **No** public Route Handler / Server Action / RSC that accepts browser/query/body `clientId` as authority. Helper callable **only** from trusted server orchestration that already resolved the UUID. Validate `clientId` as UUID; parameterized `WHERE client_id = $clientId` |
| **Client-bundle / browser leak** | Agent DTO + service-role path reach the browser; IDOR becomes trivial | Module **must** `import "server-only"`. Never import from `"use client"` trees, Client Components, or FE barrels. Distinct file from Cliente helper |
| **Confused deputy with `getBusinessProfileForClient`** | Browser path gains arity-1 tenant arg “by refactor”; agents reuse Cliente DTO with session coupling | Keep **separate modules, names, types, arities**. Cliente = arity 0 + `requireActive`. Agents = arity 1 UUID, **no** session. Do not re-export agents helper from Cliente module or vice versa |
| **Over-disclosure** | Consent ledger, raw interview, tokens, `role`, `source_interview_id`, `updated_by` enter prompts / logs | **Minimal** Zod projection: seven `fields` + `version` + optional `updatedAt` + echo `clientId` when exists + `visualModeSummary: null`. Strip list enforced in schema / mapper |
| **Existence / tenant oracle** | Attacker distinguishes “foreign client exists” vs “UUID never used” | **Intentionally same soft empty** `{ exists: false }` for missing row (and no distinct forbidden). No HTTP surface → no remote oracle. Document: do **not** add foreign-vs-missing discriminants later |
| **Corrupt jsonb invents agent fuel** | Invalid `fields` silently become empty strings / hallucinated profile | Read-time Zod; corrupt → **distinct soft failure** (`loadFailed: true` or agent equivalent) — never invent data; never throw hard on orchestration happy path for missing |
| **Public GET `/api/…?clientId=`** | Classic IDOR API | **Out of scope / REJECT.** Helper is not an HTTP contract |
| **Logging free-text fields** | PII/business text in logs / LLM traces | Log **codes only** — never full `fields` bodies |
| **Prompt injection (deferred)** | Cliente-authored text steers later agents | Store/return as **data** here; delimiter + schema-validated agent output remain US-4.x+. Do not “sanitize meaning” in this helper |

**Residual risk accepted:** The helper **trusts its caller** for tenancy (no `requireActive` inside). Defense is architectural: no untrusted surface may pass `clientId`. Future auth/RLS policies are additive; they must not rely on browser-supplied ids. Soft “used by agents” AC is satisfied by export + MUST-import comment + tests; real call sites US-4.1+ inherit this floor. Integer `version` is trace metadata, not full history (`profile_versions` Fuera V1).

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_business_profiles.fields` jsonb | Medium–High — business PII-adjacent; **LLM fuel** for Strategy/Script/Caption/QA | Service-role Node read; Zod seven-key validate; minimal agent DTO only |
| `version` | Medium — agent traceability / lineage | Required positive int when `exists`; server-owned column |
| `updated_at` | Low–Medium — optional freshness for agents | Optional ISO on success DTO if CONTRACT includes it |
| `client_id` (arg + echo) | High — tenancy key | Trusted orchestration UUID only. Never browser/query/body authority. Echo on success DTO is **server-only** (never client-bundled) |
| `source_interview_id` | Medium — FK / linkage | **Omit always** from agent DTO (PO lean confirmed) |
| Consent / Preferencias stores (US-3.x) | Highest — legal | **Not read/returned** here; `visualModeSummary: null` stub only |
| Raw `neuramark_interview_sessions` | High — full Entrevista | **Never SELECT** from this helper |
| Service-role key | Critical | Node only. Never Client Components |
| Agent prompts / job context (future) | High — consumes this DTO | Out of this story; consumers MUST import this helper only |

**Boundaries:**

1. **Trusted server caller → `getBusinessProfileForAgents(clientId)`** — Caller is System orchestration / agent job / Operator-gated server job that **already resolved** target `clientId` server-side. Untrusted input must **not** reach this argument as authority.
2. **Helper → Postgres** — Parameterized `SELECT` on `neuramark_business_profiles` where `client_id = $clientId`. Service-role Node; RLS enabled, zero named policies (unchanged). Verify-only schema.
3. **Browser / HTTP** — **No boundary crossing.** No Route Handler, no Server Action, no RSC prop path that accepts tenant UUID for this read.
4. **Cliente UI path** — Remains `getBusinessProfileForClient()` only (US-2.1/2.2). Do not route Cliente RSC through the agents helper.

---

## Abuse Cases Considered

- *As a malicious actor, I can `GET /api/profile-for-agents?clientId=<victim>` or call a Server Action with a tenant UUID and read their Ficha viva* → **Blocked:** no public Route Handler; no Server Action / browser entry that accepts `clientId` as authority for this helper. BUILD veto if introduced.
- *As a malicious actor, I can import `getBusinessProfileForAgents` into a Client Component and call it with arbitrary UUIDs* → **Blocked:** `import "server-only"`; module must not appear in client graphs; tests / review prove separation from `"use client"` trees.
- *As a malicious actor, I conflate helpers: expose arity-1 `getBusinessProfileForClient(victimId)` “for agents” or re-export agents helper under Cliente name* → **Blocked:** distinct modules, names, types, arities frozen; Cliente stays arity 0.
- *As a malicious actor, I pass `clientId` from a forged RSC/searchParam into orchestration “wrapper” that blindly forwards to the helper* → **Blocked by design contract:** callers that accept browser input **must not** use request body/query/headers as tenancy authority. Operator regenerate jobs resolve target id **server-side** (job row / Operator-gated selection), never raw browser body.
- *As a malicious actor, I distinguish “this UUID has a profile” vs “forbidden / foreign” via error codes* → **Blocked / intentional:** missing → `{ exists: false }` only (same class whether row absent). Corrupt → soft `loadFailed` (own data integrity), **not** a tenant-oracle channel. Do not add `FORBIDDEN` / foreign-tenant codes on this path.
- *As a malicious actor, I get consent ledger internals, raw Entrevista answers, tokens, `role`, `source_interview_id`, or `updated_by` inside the agent DTO and exfiltrate via prompt logs* → **Blocked:** minimal strip list; Zod agent schema omits those keys; never SELECT interview sessions from this helper.
- *As a malicious actor, I force inventing profile text when jsonb is corrupt so agents publish bad content* → **Blocked:** Zod on read; soft failure class; never invent fields.
- *As an Operator UI (future), I POST `{ clientId }` from the browser and expect the helper to trust it* → **Blocked for V1 and as permanent floor for this helper:** even Operator-triggered jobs must resolve the target from **server-side job context**, not treat request body as authority. Cross-tenant Operator **UI** remains out of V1.
- *As a malicious actor, I log or dump full free-text `fields` on soft failure* → **Blocked:** log codes / static strings only.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-2.3 are binding. Items marked **(added)** are new in this review — paste them into the story when the PO next edits USER_STORIES. Do not drop or weaken any existing `[SEC]` line. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding — do not weaken adjacent profile paths):**

- [ ] **[SEC] Interview sessions / profiles are loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string *(Cliente / PATCH paths — US-1.x / US-2.1 / US-2.2)*
- [ ] **[SEC] Profile is fetched by the server-resolved current user; the endpoint does not accept an arbitrary `client_id` parameter from the browser** *(US-2.1 Cliente helper — unchanged)*
- [ ] **[SEC] Free-text answers / profile fields are stored as data** and never interpolated into HTML, SQL, or shell *(downstream UI; agents treat as delimited data in US-4.x)*

**US-2.3 story `[SEC]` (existing):**

- [ ] **[SEC] `getBusinessProfileForAgents` is a server-only module (never imported into client bundles) and is the only path agents use to read profile data**
- [ ] **[SEC] Contract output excludes fields agents do not need (no consent record internals, no raw interview blobs) — minimal response shape by design**

**Added in this review:**

- [ ] **[SEC] (added) Export exactly `getBusinessProfileForAgents(clientId: string)` from an `import "server-only"` module** (CONTRACT path lean: `lib/profile/get-business-profile-for-agents.ts`). File header / export comment: Content Strategy, Video Script, Caption, QA (and future orchestration) **MUST** import this helper only — no raw `neuramark_interview_sessions` SELECT, no Cliente DTO reuse for prompts
- [ ] **[SEC] (added) `clientId` is a UUID from trusted server/job context only.** Validate UUID format before query (invalid → soft empty / typed validation failure — **no throw that crashes callers**, CONTRACT exact). **Never** accept browser body, query, headers, or Cliente Server Action tenant args as authority for this read
- [ ] **[SEC] (added) Helper does not call `requireActive` / session** (System jobs may lack Cliente session). Tenancy trust is **caller + no untrusted HTTP surface**, not session. Do **not** add a public “trusted token” query param as a substitute
- [ ] **[SEC] (added) No public Route Handler, no Server Action, and no RSC entry** that exposes profile-by-`clientId` for agents (or aliases this helper to HTTP). Prove absence in tests / review checklist
- [ ] **[SEC] (added) Keep `getBusinessProfileForClient` distinct:** arity 0; separate module; separate result types. Do not merge, alias, re-export agents helper from Cliente module, or client-bundle either profile helper
- [ ] **[SEC] (added) Minimal agent DTO when `exists: true`:** validated seven `fields` + positive `version` + **`clientId`** (echo of trusted arg) + **`visualModeSummary: null`** (key present) + optional `updatedAt` if CONTRACT includes it. **Always omit:** consent internals, raw Entrevista session blobs, `source_interview_id`, tokens, `role`, `auth_user_id`, `updated_by`, profile row `id`, Preferencias columns invented here
- [ ] **[SEC] (added) Missing / pre-onboarding → `{ exists: false }`** (typed soft empty; no throw). **Intentionally no oracle** distinguishing foreign-tenant vs never-existed UUID — same missing shape. Do not add `FORBIDDEN` / foreign-tenant discriminants on this path
- [ ] **[SEC] (added) Corrupt / Zod-invalid `fields` → distinct soft failure** (e.g. `{ exists: false, loadFailed: true }` or CONTRACT-named agent equivalent). Never invent profile data; log **codes only**
- [ ] **[SEC] (added) Parameterized `SELECT … WHERE client_id = $clientId`** on `neuramark_business_profiles` only; service-role Node; RLS remains deny-by-default. No browser Supabase
- [ ] **[SEC] (added) Do not log full free-text `fields` in production** — codes / static strings only
- [ ] **[SEC] (added) Operator-triggered regenerate / cross-tenant jobs (when they exist) must resolve target `clientId` from server-side job context**, never from raw request body as authority — even if Operator role is authenticated
- [ ] **[SEC] (added) Automated security tests cover at least:** happy path DTO shape (seven fields + version + `clientId` + `visualModeSummary: null`); missing → `{ exists: false }`; invalid UUID soft-fail; corrupt fields → soft `loadFailed` (or equivalent); module has `server-only`; strip list / schema rejects over-disclosure keys; Cliente helper remains arity 0 and separate; no Route Handler profile-by-clientId introduced

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Surface — **server helper only** (APPROVE)

| Rule | Detail |
|---|---|
| Export | `getBusinessProfileForAgents(clientId)` — SPEC name |
| Module | `import "server-only"`; lean path `lib/profile/get-business-profile-for-agents.ts` |
| HTTP | **Forbidden:** any Route Handler / public API exposing this by UUID |
| Browser | **Forbidden:** Client Component / `"use client"` import |
| FE | None this story; FE SIGNOFF **N/A** |

#### 2. Identity / IDOR — **trusted caller + UUID arg** (APPROVE WITH CONDITIONS)

| Rule | Detail |
|---|---|
| Who may pass `clientId` | Trusted server orchestration only: System cycle / agent runners / Operator-gated **server** jobs that already resolved the target |
| Who may **not** | Browser, query, headers, Cliente Server Actions with tenant arg, public API, untrusted LLM tool bridges that forward user JSON as `clientId` |
| Helper auth | **No** `requireActive` inside (PO lean APPROVED). Do not invent bearer “internal tokens” in query strings |
| Validation | `clientId` must be UUID; parameterized equality only |
| Operator | May pass another Cliente’s id **only** inside server jobs with server-resolved target — **never** request-body as authority |

**Condition:** CONTRACT.md must state explicitly that any future HTTP wrapper is a **new story** and inherits IDOR veto unless it uses server-resolved identity (not body UUID as authority).

#### 3. Oracle / missing — **same soft empty** (APPROVE — intentional)

| Case | Result |
|---|---|
| No row for UUID | `{ exists: false }` |
| Invalid UUID | Soft empty / typed validation failure (CONTRACT exact) — **not** a distinct “forbidden tenant” oracle |
| Corrupt `fields` | Distinct soft `loadFailed` (align US-2.1 mapper if practical) |
| Throw on missing | **REJECT** |

Document in CONTRACT: soft empty does **not** distinguish foreign vs missing; that is intentional because the helper must remain safe if a future mistaken caller appears. Primary control remains: **no untrusted surface**.

#### 4. DTO minimal shape — **APPROVE**

| When | Shape (CONTRACT freezes exact Zod names) |
|---|---|
| Exists | `{ exists: true, clientId, version, fields, visualModeSummary: null, updatedAt? }` |
| Missing | `{ exists: false }` |
| Load/corrupt | `{ exists: false, loadFailed: true }` (or agent-named equivalent — freeze one) |

- Reuse seven-key Zod (`interviewAnswersCompleteSchema` / `BusinessProfileFields`) for `fields`.
- `visualModeSummary`: key **present**, value **`null`** until US-3.x (do not invent modalities).
- `clientId` on success: **APPROVED** (server-only trace). Must never ship in a client bundle.
- Omit: consent, raw interview, `source_interview_id`, tokens, `role`, `auth_user_id`, `updated_by`, profile `id`.

#### 5. Separation from Cliente helper — **APPROVE (hard)**

| Helper | Arity | Identity | Audience |
|---|---|---|---|
| `getBusinessProfileForClient` | **0** | `requireActive` / `getCurrentUser().id` | Cliente UI RSC |
| `getBusinessProfileForAgents` | **1** (`clientId`) | Trusted job context UUID | Server agents / orchestration |

Do not share a single overloaded function. Shared private mapper for Zod/row mapping is OK if it does not leak Cliente UX shapes into agent contracts incorrectly — CONTRACT may wrap or fork.

#### 6. DB / packages — **APPROVE**

- Verify-only `neuramark_business_profiles`. No Preferencias columns. No `profile_versions`.
- No new npm dependencies for this story.

---

## Future-Proofing Notes

- **US-3.x** may populate `visualModeSummary` from Preferencias / Consentimiento — still via this helper (or a narrow extension), never by dumping consent ledger into prompts. Selecting `own_avatar` without consent remains a US-3.x / job gate, not invented here.
- **US-4.x+** agent jobs **MUST** import this helper only. Prompt-injection containment (delimit Cliente free text; schema-validate agent output) lands with those stories; this DTO is untrusted **data**.
- **Multi-tenancy / RLS:** enabling tenant policies later is additive. Do not teach callers to pass browser ids. Service-role jobs must continue to scope by explicit server-resolved `client_id`.
- **Auth (US-14.5):** System jobs may still lack a Cliente session — keep helper session-free; do not retrofit `requireActive` in a way that breaks cron/orchestration.
- **Do not** later “simplify” by merging Cliente and agents helpers into one arity-optional function — that recreates IDOR footguns.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-2.3/CONTRACT.md` exists, spot-check before BUILD:

- [ ] Export `getBusinessProfileForAgents(clientId)` from `import "server-only"` module; path frozen
- [ ] Zod agent DTO: exists → seven fields + positive `version` + `clientId` + `visualModeSummary: null` (+ optional `updatedAt`); missing → `{ exists: false }`; corrupt → soft `loadFailed` (exact names frozen)
- [ ] Strip list explicit: no consent, raw interview, `source_interview_id`, tokens, privilege fields, `updated_by`, profile `id`
- [ ] Trusted-caller / no HTTP / no browser / no `requireActive` inside helper documented
- [ ] UUID validation + parameterized `WHERE client_id = $clientId`
- [ ] Oracle policy: same soft empty for missing; no foreign-vs-missing discriminant
- [ ] MUST-import comment for Strategy / Script / Caption / QA
- [ ] Cliente helper remains arity 0 and separate; no merge
- [ ] Soft “used by agents” satisfied by export + comment + tests (LLM jobs out of scope)
- [ ] FE SIGNOFF N/A; DB verify-only; no new packages
- [ ] Out of scope: Preferencias editors, public API, `profile_versions`, auth redesign, browser Supabase

---

## CONTRACT freeze list (binding summary)

1. **Surface:** `getBusinessProfileForAgents(clientId)` only from `import "server-only"` module (`lib/profile/get-business-profile-for-agents.ts` or CONTRACT exact). **No** Route Handler / Server Action / browser entry.
2. **Callers:** Trusted server orchestration only; `clientId` = UUID from server-resolved job context — **never** raw browser body/query/headers as authority.
3. **Helper auth:** **No** `requireActive` inside; no query-param “internal token” substitute.
4. **DTO exists:** seven validated `fields` + positive `version` + echo `clientId` + `visualModeSummary: null` (+ optional `updatedAt`).
5. **DTO missing:** `{ exists: false }` — no throw; **intentional** same shape (no foreign-vs-missing oracle).
6. **Corrupt fields:** distinct soft `loadFailed` (or CONTRACT name); never invent data; log codes only.
7. **Omit always:** consent internals, raw Entrevista blobs, `source_interview_id`, tokens, `role`, `auth_user_id`, `updated_by`, profile `id`.
8. **Separation:** `getBusinessProfileForClient` arity 0 remains distinct — no merge / alias / client-bundle of agents module.
9. **DB:** verify-only; no Preferencias columns; no `profile_versions`.
10. **Out of scope:** FE; public HTTP; US-3.x editors; US-4.x LLM wiring (stub + MUST-import OK); auth redesign; new packages; browser Supabase.

---

## BUILD vetoes (summary)

1. **Public Route Handler or Server Action** exposing profile by `clientId` / any HTTP alias of this helper.  
2. **`clientId` from untrusted input as authority** (browser body, query, headers, Cliente Server Action tenant arg, user-controlled LLM tool JSON forwarded unchecked).  
3. **Client-bundle / `"use client"` import** of `getBusinessProfileForAgents` (or re-export into a client barrel).  
4. **Merge or overload** with `getBusinessProfileForClient` (arity-optional / shared public export that accepts tenant id for UI).  
5. **Over-disclosure:** returning consent internals, raw interview sessions, `source_interview_id`, tokens, `role`, `auth_user_id`, `updated_by`, or inventing Preferencias/modalities beyond `visualModeSummary: null`.  
6. **Distinct foreign-vs-missing / FORBIDDEN oracle** on this path (or any error channel that enumerates other tenants).  
7. **Throwing hard** on missing/pre-onboarding (breaks orchestration); inventing fields on corrupt jsonb.  
8. **Logging full free-text `fields`** in production.  
9. **Browser Supabase / service-role in Client Components**; new npm packages without justification.  
10. **`profile_versions` table**, Preferencias/Consentimiento persistence, or full LLM agent job wiring under this story’s BUILD.

---

## Open questions — SECURITY resolutions

| # | Question | Resolution |
|---|---|---|
| 1 | Who may pass `clientId`? | **Trusted server orchestration only.** Operator-gated jobs may pass another Cliente’s id only when the target was **server-resolved**. Never request-body as authority. |
| 2 | `requireActive` inside helper? | **No** (PO lean APPROVED). Architectural floor = no untrusted surface + UUID validation + parameterized query. |
| 3 | Empty shape | **`{ exists: false }`** soft typed; no HTTP 404 surface. |
| 4 | Include `clientId` on success DTO? | **Yes** when `exists` — server-only trace. Never client-bundled. |
| 5 | `visualModeSummary` stub | **Key present as `null`** until US-3.x. |
| 6 | Corrupt fields | **Distinct soft `loadFailed`** (align US-2.1); never invent; codes-only logs. |
| 7 | Omit `source_interview_id`? | **Yes — omit always.** |
| 8 | No-op consumer stub? | **Export + MUST-import comment + unit tests** satisfy V1; real call sites US-4.1+. |
| — | Foreign vs missing oracle? | **Intentionally identical soft empty** for missing row. Document in CONTRACT; do not add discriminants. |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE SIGNOFF **N/A**.
