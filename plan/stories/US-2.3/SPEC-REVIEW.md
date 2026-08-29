## Spec Review — US-2.3

### Verdict: ALIGNED

US-2.3 (server-only `getBusinessProfileForAgents(clientId)` with Zod **agent DTO** — seven Ficha viva `fields` + `version` + `visualModeSummary: null` stub; typed `{ exists: false }` when missing; trusted orchestration callers only; no public HTTP; no FE; omit consent / raw Entrevista) matches SPEC §3 Business Profile / **Ficha viva** (S3.M3: *contrato solo-server para agentes*), Strategy/Script/Caption/QA inputs that consume **Ficha viva** (S3.M5–M7, M11), SPEC §2 **System** role, SPEC §5–§6 (server-only secrets, `neuramark_*`, multi-tenant `client_id`), and CONTEXT **Ficha viva**. Continuity with US-2.1 (Cliente arity-0 helper) and US-2.2 (version bump agents consume) is correct: this story owns the **agent read path only**. Preferencias de producción visual stay US-3.x (summary stub only). No ADR, playbook/trend, SC-2, or V1 out-of-scope breach.

Orchestrator / PREP product defaults (encoded below) are **SPEC-aligned**. Residual open items are SECURITY/CONTRACT floors (IDOR / trusted-caller assert, corrupt-row failure class naming), not SPEC conflicts. Verdict is **ALIGNED** (not DRIFT / CONFLICT / BLOCKED).

---

### Scope split vs US-2.1 / US-2.2 / US-3.x / US-4.x — confirm

| Story | PO scope | SPEC mapping | Verdict |
|-------|----------|--------------|---------|
| **US-2.1** ✅ CLOSED | Read-only Ficha viva UI; `getBusinessProfileForClient` arity 0 | Cliente: **ver resumen vivo**; CTA si no hay ficha | **ALIGNED** (shipped; keep distinct) |
| **US-2.2** ✅ CLOSED | PATCH allowlist; bump `version` | Cliente: **editar campos permitidos**; System: versiona ediciones | **ALIGNED** (shipped; agents read current row) |
| **US-2.3** (this) | `getBusinessProfileForAgents` + Zod agent DTO; 404-safe empty; stub visual summary | System: **contrato solo-server para agentes** (`getBusinessProfileForAgents`) | **ALIGNED** |
| **US-3.x** | Preferencias de producción visual + Consentimiento de avatar | S3.M4 — not invented here; summary field may be stub/`null` | **ALIGNED** (out) |
| **US-4.x+** | Content Strategy / Script / Caption / QA **call** the helper | S3.M5–M7, M11 input: Ficha viva | **ALIGNED** (consumers later; export + MUST-import comment OK) |

SPEC S3.M3 lists view + edit + agent helper as **module** capabilities. Parent `USER_STORIES.md` already splits view (2.1) vs edit (2.2) vs agents (2.3). Do not amend SPEC. Do not check off USER_STORIES AC here.

**AC “used by Content Strategy, Video Script, Caption, QA agents”:** Satisfied for this story by shipping the **single server export** + code comment that those agents **MUST** import it only. Closing US-2.3 does **not** require wiring LLM jobs (US-4.1+). Validator may note soft dependency; not a SPEC BLOCKED / CONFLICT.

---

### Orchestrator defaults — SPEC alignment

| # | Default | SPEC / continuity | Spec-guardian |
|---|---------|-------------------|---------------|
| 1 | **`getBusinessProfileForAgents(clientId)`** in `import "server-only"` module (lean path `lib/profile/get-business-profile-for-agents.ts`) | SPEC S3.M3 names the helper; §5–§6 server-only data access; USER_STORIES [SEC] never client-bundled | **ALIGNED.** SPEC-canonical name — do not rename for glossary purity. |
| 2 | **Trusted orchestration callers only** — System cycle / agent jobs / Operator-gated server jobs that already resolved target `clientId`; **not** browser, query, Cliente Server Actions with tenant arg, public API | SPEC §2 System (ciclo / agents); Operator intervenes via server jobs; no RBAC UI V1; US-2.1 SECURITY carry-forward: agent helper may take internal `clientId` from trusted server callers | **ALIGNED.** Who-asserts-what (helper vs caller) is SECURITY freeze — not a SPEC veto of the lean. |
| 3 | **Zod agent DTO:** seven `fields` keys + `version` when exists; **`visualModeSummary: null`** (key present) | S3.M3 agent contract; S3.M5 input Ficha viva; US-2.1/2.2 seven-key continuity; S3.M4 Preferencias deferred — stub until US-3.x; USER_STORIES “include visual mode summary **when set**” → null until set | **ALIGNED.** Do not invent modalities. Optional `updatedAt` / `clientId` on success DTO = CONTRACT/SECURITY freeze (trace OK if server-only). |
| 4 | Missing / pre-onboarding → **`{ exists: false }`** (typed soft empty; no throw) | USER_STORIES AC “404-safe empty”; SPEC CTA when no ficha — agents must not crash orchestration | **ALIGNED.** Soft typed result, not HTTP 404 (no public surface). |
| 5 | **No public HTTP** Route Handler exposing profile by `clientId` | SPEC §5 server-only; USER_STORIES FE —; [SEC] only agent path | **ALIGNED.** |
| 6 | **No FE**; FE SIGNOFF **N/A** (or brief “no UI surfaces”) | USER_STORIES US-2.3 FE —; S3.M3 Cliente surfaces already US-2.1/2.2 | **ALIGNED.** |
| 7 | **Omit** consent ledger internals, raw `neuramark_interview_sessions` blobs, `source_interview_id` (PO lean), tokens, `role`, `auth_user_id`, `updated_by` | USER_STORIES [SEC] minimal shape; CONTEXT Preferencias / Consentimiento are separate entities; agents must not re-parse Entrevista | **ALIGNED.** Minimal projection — not a dump of row columns. |
| 8 | Keep **`getBusinessProfileForClient`** distinct (arity 0); never client-bundle agents module; DB verify-only; no `profile_versions` | US-2.1 SECURITY; SPEC S3.M3 Fuera V1 historial completo; US-2.2 already bumps integer `version` | **ALIGNED.** |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story unblocks SC-1/SC-3 path (agents consume current Ficha viva without re-parsing Entrevista). Does not touch Aprobación, Publicación IG, grabación humana, Preferencias editors, Playbook, Trend, or Ciclo cron wiring. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; S3.M3 / M5; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation jobs, Preferencias persistence, or public APIs. |
| Info | Roles unchanged: **System** reads Ficha viva for agents; **Cliente** continues via US-2.1/2.2 only; **Operator** may trigger regenerate jobs that pass a server-resolved target `clientId` — never request-body as authority. | SPEC §2; §3 S3.M3 + Ciclo | SECURITY: freeze IDOR / trusted-caller rules. |
| Info | **Agents vs Cliente helper vs Preferencias** cut is correct. Visual summary stub/`null` until US-3.x. No LLM rewrite of profile. No Cliente reopen Entrevista (Fuera V1). | SPEC §3 S3.M3 vs M2 Fuera vs M4; USER_STORIES US-2.x / US-3.x / US-4.x | CONTRACT non-goals. |
| Info | **Soft “used by agents” AC:** export + MUST-import comment + unit tests satisfy V1 ship; real call sites US-4.1+. Same pattern as US-2.2 soft “next agent run.” | USER_STORIES US-2.3 AC; US-4.1 Depends on US-2.3 | Validator soft-dependency note only — not SPEC BLOCKED. |
| Info | **NFR / stack:** Next.js App Router; Zod in `lib/contracts/…`; service-role Node only; `neuramark_business_profiles` verify-only; multi-tenant `client_id` arg from trusted server; never log free-text `fields` (codes only). Not ADR-0003 long work — stays on Vercel app. | SPEC §5–§6; ADR-0001/0002/0003 | No auth redesign. |
| Info | ADRs 0001–0003 untouched: no cron Route Handler, no IG Graph publish, no FFmpeg/Fly. Helper is a **dependency** of future ciclo agents (ADR-0001), not the scheduler itself. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: FE UI; public Route Handler; Preferencias / Consentimiento persistence; wiring every LLM agent job; merge with Cliente helper; `profile_versions`; Stories IG, multicanal, ads; RBAC UI. | SPEC §1 Fuera; §3 S3.M3 Fuera V1 historial | Implementers must not add HTTP/FE/visual editors/history table. |
| Low | Parent `USER_STORIES.md` module title still “Business Profile”; BE line “visual mode summary” predates Preferencias allowlist wording. CONTEXT _Evitar_ for product copy. Story README/TASKS use **Ficha viva** correctly; technical helper name is SPEC-canonical. | CONTEXT **Ficha viva**; SPEC S3.M4 Preferencias | Do not propagate _Evitar_ into CONTRACT product-facing docs. Keep stub key until US-3.x. Optional later parent-title cleanup. |
| Low | PREP open Q6 (corrupt Zod `fields` → empty vs distinct soft failure) is implementation hygiene. Either soft class is SPEC-OK if it never invents profile data or throws hard on orchestration happy path. | S3.M3; US-2.1 read-time Zod | CONTRACT/SECURITY freeze failure discriminant; prefer distinct soft failure for Operator skip/alert. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-2.3/README.md` or `TASKS.md`. Canonical use is correct: **Ficha viva**, **Entrevista inicial**, **Cliente**, **Operator**, **Preferencias de producción visual**, **Modalidad de producción** (future summary). Technical `getBusinessProfileForAgents` is SPEC S3.M3 — allowed in code.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY product-facing examples:**

| Prefer | _Evitar_ |
|--------|----------|
| **Ficha viva** / Living profile (EN UI) | Business Profile, perfil de negocio |
| **Entrevista inicial** / Initial interview | onboarding interview, cuestionario |
| **Cliente** | prestador (as product role), dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Preferencias de producción visual** | avatar mode, visual preferences (as entity name), modo único global |
| **Modalidad de producción** (per slot) | production mode, slot visual type |
| **Consentimiento de avatar** | consent ledger (in product copy) |

Note (not a US-2.3 PREP veto): parent `plan/USER_STORIES.md` still uses “Business Profile” / “business profile” / legacy “visual mode” phrasing — do not copy into product strings or this story’s later gates. No FE in this story → FE SIGNOFF N/A is correct.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. Proceed to SECURITY.

| Item | Blocks? | Guidance |
|------|---------|----------|
| Helper name / server-only / path | **Resolved for SPEC** (**ALIGNED**) | Keep SPEC name; `import "server-only"`; distinct from Cliente helper. |
| Trusted callers / no public HTTP / no FE | **Resolved for SPEC** (**ALIGNED**) | SECURITY freezes IDOR + whether helper asserts beyond trusted caller. FE SIGNOFF N/A. |
| Zod DTO: 7 fields + version + `visualModeSummary: null` | **Resolved for SPEC** (**ALIGNED**) | CONTRACT freezes exact TypeScript/Zod names; optional `clientId` / `updatedAt` if SECURITY OK. |
| `{ exists: false }` on missing | **Resolved for SPEC** (**ALIGNED**) | Soft typed empty; no throw; no HTTP 404 surface. |
| Omit consent / raw interview / `source_interview_id` | **Resolved for SPEC** (**ALIGNED**) | Minimal strip list in CONTRACT; never return session blobs. |
| Soft “used by agents” without LLM wiring | **No SPEC block** | Export + MUST-import + tests; US-4.1+ call sites. |
| `requireActive` inside helper | **No SPEC block** (PO lean: no) | System jobs lack Cliente session — ALIGNED. SECURITY may require alternate trusted-caller assert. |
| Corrupt fields failure class | **No SPEC block** | Prefer distinct soft failure; never invent data. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

**Defaults aligned?** Yes — all orchestrator/PREP defaults listed above are **ALIGNED** with SPEC S3.M3 / CONTEXT / ADRs / US-2.1–2.2 continuity. No SPEC amendment. No CONFLICT. No DRIFT that requires veto of the stated defaults.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. Export **`getBusinessProfileForAgents(clientId)`** only from an `import "server-only"` module; path lean `lib/profile/get-business-profile-for-agents.ts` (or CONTRACT equivalent).
2. Zod agent DTO in `lib/contracts/…`: when exists → seven validated `fields` + positive `version` + **`visualModeSummary: null`** (key present); when missing → **`{ exists: false }`** (or equivalent typed empty — no throw).
3. Always omit: consent internals, raw Entrevista session blobs, `source_interview_id` (unless SECURITY later mandates a non-PII trace — PO lean omit), tokens, `role`, `auth_user_id`, `updated_by`.
4. Callers: trusted server orchestration only; **no** public Route Handler; **no** browser / query / Cliente Server Action tenant arg as authority.
5. Keep **`getBusinessProfileForClient`** separate (arity 0); never client-bundle the agents module.
6. File header / export comment: Content Strategy, Video Script, Caption, QA **MUST** import this helper only (no raw interview SELECT, no Cliente DTO for prompts).
7. DB: verify-only `neuramark_business_profiles`; no Preferencias columns; no `profile_versions`.
8. FE: none; SIGNOFF **N/A**.
9. Explicit out of scope: Preferencias / Consentimiento editors; LLM agent job wiring (US-4.x+); auth redesign; public HTTP by UUID; merge helpers; history table.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
