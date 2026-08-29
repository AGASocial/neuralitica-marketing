# US-2.3 — Expose profile to agents (API contract)

**Priority:** P0  
**Depends on:** US-2.1 ✅ CLOSED · US-2.2 ✅ CLOSED (version bump agents consume) · table from US-1.3  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-2.3 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** primary (`docs/development/AGENT-ROSTER.md` Fase 1). No FE. No content/media/integrations specialist for the helper itself — domain agents consume it in later stories.  
**Canonical terms:** **Ficha viva** / Living profile · **Entrevista inicial** · Role: **Cliente** / **Operator** · **Preferencias de producción visual**. Avoid CONTEXT _Evitar_ terms in product-facing docs. SPEC name: `getBusinessProfileForAgents`.

## Out of scope (do not implement here)

- **FE UI** — no Cliente / Operator screens, no Preferencias editors.
- **Public HTTP API** — no Route Handler `GET /api/…?clientId=`.
- **Wiring every agent job** — Content Strategy / Script / Caption / QA LLM jobs are later phases; this story ships the **contract + helper** (stub export + MUST-import comment OK).
- **Consent / Preferencias persistence** — US-3.x; visual summary stub/`null` only.
- **`getBusinessProfileForClient` changes** — do not merge agent and Cliente helpers; keep distinct modules (US-2.1 SECURITY carry-forward).
- **`profile_versions` history table** — SPEC Fuera V1.
- Auth redesign; browser Supabase; new packages; logging full free-text `fields`.

## Scope split

| Concern | Owner |
|---------|--------|
| Create/upsert on Entrevista submit | **US-1.3** (done) |
| Read-only Cliente Ficha viva | **US-2.1** (done) |
| Edit / PATCH + version bump | **US-2.2** (done) |
| Agent API contract + server helper | **US-2.3** (this story) |
| Preferencias / visual allowlist data | **US-3.x** |
| Strategy / Script / Caption / QA jobs that **call** the helper | **US-4.x+** |

## PO decisions (freeze in CONTRACT unless SECURITY vetoes)

| Topic | Decision |
|-------|----------|
| Helper name / file | `getBusinessProfileForAgents(clientId)` — SPEC S3.M3. BUILD path lean: `lib/profile/get-business-profile-for-agents.ts` with `import "server-only"`. |
| Zod / types | Agent DTO in `lib/contracts/profile.ts` (or adjacent) — documented in code types. Reuse `interviewAnswersCompleteSchema` / `BusinessProfileFields` for the seven field keys when `exists`. |
| Minimal shape | When exists: `{ exists: true, clientId, version, fields }` (+ optional `updatedAt`). Always omit: consent internals, raw interview session blobs, `source_interview_id` unless CONTRACT explicitly needs a non-PII trace id (PO lean: **omit**), tokens, `role`, `auth_user_id`, `updated_by`. |
| Visual mode summary | Include optional field e.g. `visualModeSummary: null` (or stub object) until US-3.x populates Preferencias allowlist. Do **not** invent modalities here. |
| Missing / pre-onboarding | **404-safe empty** — typed `{ exists: false }` (or equivalent); **no throw** that breaks orchestration; no foreign-tenant oracle distinction if caller is trusted (SECURITY freezes). |
| Corrupt `fields` | Soft empty / typed failure class (align US-2.1 map helper if practical); log **codes only**, never free-text fields. |
| Who may pass `clientId` | **Trusted server context only** (orchestration / agent jobs / System cycle). **Not** from browser, query, or Cliente Server Actions. SECURITY freezes: Operator/system vs IDOR — see Open questions. |
| Auth inside helper | **PO lean:** helper does **not** call `requireActive` / session — caller is already trusted System code that resolved `clientId`. SECURITY may require an assert (e.g. `assertServerOnly` / internal caller token) — CONTRACT freezes. |
| Single path AC | Export one function; document in file header that Content Strategy, Video Script, Caption, QA **MUST** import this helper only (no raw interview SELECT, no Cliente DTO reuse for prompts). |
| Cliente helper | Keep `getBusinessProfileForClient` separate; never client-bundle the agents module. |
| DB | Verify-only. No migration expected. |
| Tests | Happy path with fixture row; missing → empty; Zod invalid → safe empty; `server-only` / not importable from client patterns; optional: prove agents module does not export to `"use client"` trees. |

## Carry-forwards / reuse (do not reinvent)

- Reuse `mapBusinessProfileRow` / shared Zod seven-key validation where it does not leak Cliente soft-UX shapes into agent DTO (CONTRACT may wrap or fork map).
- Same table, RLS deny-by-default, service-role Node only.
- US-2.1 SECURITY: agent helper **may** take internal `clientId` from trusted server callers — **distinct** from arity-0 Cliente helper.
- US-2.2: agents always read **current** `fields` + bumped `version` after Cliente edits.

---

## FE checklist

None for this story.

- [ ] — (explicit no-op; FE signoff on CONTRACT may be N/A or “Reviewed by FE: N/A — no UI surfaces”)

---

## BE checklist

Concrete consumers (later stories, not built here): Content Strategy, Video Script, Caption, QA agent jobs; Ciclo semanal orchestration. This story only **exports** the helper they will call.

- [x] **`getBusinessProfileForAgents(clientId)`** in `import "server-only"` module (CONTRACT path).
- [x] **Zod agent DTO** + exported types in `lib/contracts/…` — seven fields + `version` when exists; visual summary stub/`null`; minimal strip list enforced.
- [x] **404-safe empty** for missing / pre-onboarding clients (typed `exists: false` class — no throw on missing row).
- [x] File header / export comment: future agents **MUST** import this helper only.
- [x] Do **not** accept `clientId` from HTTP/query/body surfaces; no public Route Handler.
- [x] Do **not** return consent internals or raw interview blobs.
- [x] Parameterized `SELECT … WHERE client_id = $clientId`; service-role Node only.
- [x] Never log full free-text `fields` (codes only).
- [x] Automated tests: exists happy path; missing empty; invalid fields safe; module is server-only; optional regression that Cliente helper remains arity 0 and separate.
- [x] Stub-only wiring OK — do **not** implement full LLM agent jobs here.

**AC mapping (for validator later):** Single server function for agents; contract in code types; 404-safe empty; [SEC] server-only + only agent path; [SEC] minimal shape excludes consent/interview blobs.

**BE BUILD notes (nextjs-backend):** Satisfies soft “used by agents” via export + MUST-import comment + unit tests. Surfaces: `lib/profile/get-business-profile-for-agents.ts`, `mapBusinessProfileRowForAgents`, agent Zod types in `lib/contracts/profile.ts`. No HTTP / no `requireActive` / no migration / no FE.

---

## DB checklist

- [x] **Verify-only** `neuramark_business_profiles` — no new columns/tables/views for this story.
- [x] No Preferencias / consent columns here (US-3.x).
- [x] No `profile_versions`.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — S3.M3 agent contract; Strategy input Ficha viva)
- [x] SECURITY.md (security-architect — **who may pass `clientId`**; IDOR; server-only; minimal DTO)
- [x] CONTRACT.md authored (nextjs-backend) — FE signoff **N/A — 2026-08-29** (no UI)
- [x] BUILD (BE only) — `bf19e95`
- [x] VALIDATION.md — PASS WITH NOTES
- [x] QA.md — APPROVE (0 Critical, 0 High, 0 Medium, 1 Low non-blocking; CLOSE can proceed)

**Status:** CLOSED (2026-08-29). All gates complete; AC checked in `plan/USER_STORIES.md`.

**PREP complete when:** `README.md` + this `TASKS.md` exist; AC in `USER_STORIES.md` remain unchecked; no CONTRACT/SECURITY/code from PO.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Who may pass `clientId`?** — **Critical.** PO lean: only trusted server orchestration (System cycle jobs, server-side agent runners). No browser, no Cliente Server Action with a tenant arg, no public API. May Operator-triggered regenerate jobs pass another Cliente’s id? **PO lean: yes, only inside Operator-gated server jobs that already resolved the target `clientId` server-side** — never from request body as authority. SECURITY must freeze IDOR rules and whether the helper itself asserts anything beyond “caller is trusted.”
2. **Does the helper call `requireActive` / session?** — **PO lean: no** (System jobs may run without a Cliente session). SECURITY may require an internal “trusted caller” pattern instead.
3. **Empty shape naming** — `{ exists: false }` vs `null` vs typed `PROFILE_NOT_FOUND` result. AC says “404-safe empty.” **PO lean:** soft typed `{ exists: false }` (no HTTP 404 unless a public surface appears — and public surface is out of scope).
4. **Include `clientId` in success DTO?** — Useful for agent logs/trace. **PO lean: yes** when `exists` (server-only DTO). Confirm SECURITY (never reaches client bundles).
5. **`visualModeSummary` stub shape** — `null` vs `{ preferences: null }` vs omit key until US-3.x. **PO lean:** key present as `null` so later agents don’t branch on “missing key vs null.”
6. **Corrupt / Zod-invalid `fields`** — Treat as empty (`exists: false`) vs distinct `loadFailed`. **PO lean:** distinct soft failure so orchestration can skip/alert without inventing profile data; align with US-2.1 if shared mapper used.
7. **Omit `source_interview_id`?** — **PO lean: omit** (agents don’t need interview linkage; reduces leak surface).
8. **Must BUILD add a no-op consumer stub** (e.g. `lib/agents/README` or empty import test) to prove the AC “used by … agents”? — **PO lean:** typed export + comment + unit tests satisfy V1; real call sites in US-4.1+. Spec-guardian/validator confirm soft dependency language.

No SPEC amendment required: S3.M3 already names `getBusinessProfileForAgents`; Strategy/Script modules already take Ficha viva as input. Preferencias summary remains US-3.x.
