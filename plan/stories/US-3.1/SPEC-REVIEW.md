## Spec Review — US-3.1

### Verdict: ALIGNED

US-3.1 (Cliente **Preferencias de producción visual**: multi-selección allowlist of Avatar propio autorizado · Avatar genérico profesional · Video sin rostro / B-roll; settings UI EN/ES; persist `neuramark_visual_preferences`; soft consent gate for `own_avatar`; `faceless_style`; no human recording; no silent regenerate) matches SPEC §3 Avatar / Visual Mode Selector (**S3.M4**), Flujo S4.1 (preferencias slice), SPEC §2 Cliente role, SPEC §5–§6 NFRs, CONTEXT **Preferencias de producción visual** / modalities, and PLAN Fase 1.

PO PREP correctly treats **SPEC as authority** over singular `visual_mode` / single-column wording in parent `USER_STORIES.md`. Continuity with US-2.1 / US-2.2 / US-2.3 is correct: Preferencias are a **separate** surface and store; Ficha viva PATCH must not write them; agents DTO may gain a minimal `visualModeSummary` from the allowlist when a row exists. Sibling US-3.2 / 3.3 / 3.4 and per-slot **Modalidad de producción** (US-4.x) stay out. No ADR breach, no SC-2 / publish path, no V1 out-of-scope creep.

**No SPEC amendment required** before SECURITY / CONTRACT. Verdict is **ALIGNED** (not GAPS / CONFLICT).

---

### Scope split vs S3.M4 / siblings — confirm

| Concern | PO scope (US-3.1) | SPEC mapping | Verdict |
|---------|-------------------|--------------|---------|
| Preferencias allowlist (multi) | Cliente selects one or more modalities | S3.M4: multi-selección; menú permitido | **ALIGNED** |
| Persist store | `neuramark_visual_preferences` | S3.M4 table name | **ALIGNED** |
| Consent gate | Soft reject `own_avatar` without active consent; no ledger UI | S3.M4: rechaza sin consent; Consentimiento = US-3.2 | **ALIGNED** |
| Assets | Copy only; no upload | S3.M4 uploads + US-3.3 | **ALIGNED** (out) |
| Disclosure / QA | Optional server `must_disclose_not_owner` stub; no QA UI | S3.M4 + US-3.4 | **ALIGNED** (stub OK) |
| Modalidad por slot | Out — Strategy later | S3.M4 regla clave + Content Strategy | **ALIGNED** (out) |
| Ficha viva PATCH | Do not reopen US-2.2 | S3.M3: PATCH sin modo visual | **ALIGNED** |
| Agent summary | Optional populate `visualModeSummary` from allowlist | US-2.3 stub → US-3.x; omit consent | **ALIGNED** |
| No recording / no silent regen | Explicit PREP + AC | S3.M4 + §6 hard rules | **ALIGNED** |

Do not amend SPEC. Do not check off USER_STORIES AC here.

---

### Open questions (TASKS.md) — SPEC resolution

| # | Question | Spec-guardian | Blocks SECURITY? |
|---|----------|---------------|------------------|
| 1 | **Allowlist (SPEC) vs single `visual_mode` (USER_STORIES)** | **Resolved ALIGNED.** Implement **allowlist** (set of enum tokens). SPEC S3.M4 + CONTEXT win. AC “Three modes selectable” = Cliente can enable **any of** the three in Preferencias — not a single rigid account mode. **No USER_STORIES rewrite required** for this gate; optional later parent DB/BE line cleanup (allowlist columns) is backlog hygiene, not a SPEC amendment. | **No** |
| 2 | Table / column names | **Resolved.** Table = **`neuramark_visual_preferences`**. CONTRACT freezes allowlist representation (`allowed_modes` text[] / jsonb / equivalent) + `faceless_style` / `generic_avatar_id` / optional `rules`. Story shorthand `visual_preferences` / singular `mode` must not ship as product schema without `neuramark_` + allowlist shape. | **No** |
| 3 | Settings route | **Not a SPEC decision.** PO lean `/settings/preferences` under `(app)`, separate from `/profile`, is compatible with Flujo S4.1 and S3.M3/M4 split. Exact path + nav = CONTRACT. | **No** |
| 4 | `faceless_style` shape | **Not a SPEC decision.** SPEC requires Video sin rostro / B-roll as a modality; AC requires voice + text + stock/B-roll preference. Structured jsonb with constrained enums = CONTRACT + SECURITY. | **No** |
| 5 | Consent check pre–US-3.2 | **SPEC-aligned fail-closed.** S3.M4: rechaza avatar propio sin consent. Missing consent table/row → treat as **no consent** (never default true). Helper name/behavior = SECURITY. Full ledger = US-3.2. | **No** (SECURITY confirms) |
| 6 | Prove no silent regenerate | **SPEC-aligned.** S3.M4: cambiar preferencias no regenera en silencio. Evidence = CONTRACT non-goals + tests (no job/strategy/script enqueue). Not a SPEC gap. | **No** |
| 7 | `generic_avatar_id` null | **ALIGNED** stub until catalog/assets exist. Do not invent catalog UX. | **No** |
| 8 | `visualModeSummary` populate | **ALIGNED** to populate **minimal allowlist summary** when Preferencias row exists; keep `null` if absent; **omit** Consentimiento internals (US-2.3 strip list intact). Exact DTO = CONTRACT (may widen `z.null()` → optional summary type). Soft follow-up in same BUILD OK. | **No** |
| 9 | EN/ES copy | **Not a SPEC block.** Product labels must use CONTEXT terms; FE drafts OK. | **No** |
| 10 | Unavailable beyond consent | **ALIGNED** for V1 of this story: hard-disable **only** missing Consentimiento for Avatar propio; soft note that references come in US-3.3. Job-time reject without assets remains later (S3.M4 / providers) — do not conflate selection persistence with job eligibility. | **No** |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-1 (Cliente never grabs themselves) and Flujo S4.1 preferencias step. Does not touch Aprobación, Publicación IG, Ciclo semanal cron, Playbook, Trend, or slot modality. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; hard rules; Flujo S4.1; PLAN Fase 1 | None. Do not add IG, Stories, ads, generation jobs, or Strategy. |
| Info | Roles unchanged: **Cliente** configures Preferencias; **System** persists allowlist + validates enum/consent gate; **Operator** not required for this flow. Identity via `getCurrentUser()` / `requireActive`. | SPEC §2; §3 S3.M4 + Authentication | CONTRACT: arity-0 tenant; reject browser `client_id`. |
| Info | **Preferencias vs Modalidad de producción** cut is correct. This story owns Cliente allowlist only; weekly per-slot assignment stays Content Strategy (US-4.x). | SPEC S3.M4 regla clave; CONTEXT terms | CONTRACT non-goals: no slot modality UI/API. |
| Info | Parent AC “Mode stored on profile” is **story shorthand**, not permission to write Preferencias into `neuramark_business_profiles.fields`. Canonical store is `neuramark_visual_preferences`; “shown in settings” = settings surface. | SPEC S3.M3 vs M4; US-2.2 strip | CONTRACT: separate table; do not reopen Ficha viva PATCH allowlist. |
| Info | Parent BE/DB still say singular `visual_mode` / `mode`. **SPEC wins** — CONTRACT uses allowlist. AC checkbox text can stay; validator interprets “mode(s)” as Preferencias modalities. | SPEC S3.M4; CONTEXT Preferencias | Optional USER_STORIES wording sync later; not required before SECURITY. |
| Info | NFR / stack: Next.js App Router; i18n EN+ES; `neuramark_*`; multi-tenant `client_id` server-only; secrets server-only; not ADR-0003 long work (stays on Vercel app). | SPEC §5–§6 | No auth redesign; no browser Supabase. |
| Info | ADRs 0001–0003 untouched: no cron orchestration, no IG Graph publish, no FFmpeg/Fly. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: US-3.2 ledger UI/API; US-3.3 uploads; US-3.4 QA disclosure UI (stub rules OK); per-slot modality; talking-head/B-roll jobs; RBAC; Stories IG; multicanal; ads. | SPEC §1 Fuera; §3 S3.M4 siblings | Implementers must not expand soft gates into sibling stories. |
| Low | Parent `USER_STORIES.md` title “Choose visual production mode” / FE “Mode selector” / “Client” / DB `visual_preferences` without prefix — CONTEXT _Evitar_ risk if copied into UI. PREP README/TASKS use canonical Preferencias terms. | CONTEXT Preferencias; Cliente; enum _Evitar_ in copy | Do not propagate singular “mode” / raw enums / “visual preferences” as entity names into CONTRACT product copy or i18n headlines. |
| Low | USER_STORIES [SEC] still says “`visual_mode` value” singular — security intent (enum validate + reject `own_avatar` without consent) remains; apply to **each** allowlist member / set membership. | USER_STORIES US-3.1 [SEC]; S3.M4 | SECURITY: validate set ⊆ enum; reject if `own_avatar` ∈ set without active consent. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-3.1/README.md` or `TASKS.md`. Canonical use is correct: **Preferencias de producción visual**, **Cliente**, **Operator**, **Avatar propio autorizado**, **Avatar genérico profesional**, **Video sin rostro** / **B-roll / sin presencia**, **Consentimiento de avatar**, **Ficha viva**, **Modalidad de producción** (future only). Enums `own_avatar` \| `generic_avatar` \| `faceless` correctly scoped to code/DB.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY product strings:**

| Prefer | _Evitar_ |
|--------|----------|
| **Preferencias de producción visual** | avatar mode, visual preferences (as entity name), visual mode selector, single mode, modo único global |
| **Modalidad de producción** (per slot — later) | production mode, slot visual type |
| **Avatar propio autorizado** | own_avatar (in product copy) |
| **Avatar genérico profesional** | generic_avatar (in product copy) |
| **Video sin rostro** / **B-roll / sin presencia** | faceless (in product copy, except technical) |
| **Consentimiento de avatar** | consent ledger (in product copy) |
| **Cliente** | prestador (as product role), dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Ficha viva** | Business Profile, perfil de negocio |

Hard rule (product + UX): **never** require or prompt the Cliente to record video or audio.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. **SECURITY can proceed.**

| Item | Blocks? | Guidance |
|------|---------|----------|
| Allowlist vs singular story AC | **Resolved for SPEC** (allowlist **ALIGNED**) | CONTRACT: Preferencias = set of modalities; AC interpretation above. Optional parent rewrite later. |
| Table name | **Resolved** (`neuramark_visual_preferences`) | CONTRACT freezes columns. |
| Settings path | **No SPEC block** | CONTRACT freezes `/settings/preferences` (or equivalent) off `isPublicPath`; `no-store`. |
| `faceless_style` schema | **No SPEC block** | CONTRACT + Zod; required when `faceless` ∈ allowlist. |
| Consent fail-closed | **Resolved for SPEC** | SECURITY: `hasActiveAvatarConsent` false if table/row missing; never invent consent. |
| No silent regenerate | **Resolved for SPEC** | SECURITY/CONTRACT: mutation = upsert Preferencias + revalidate only; tests forbid job tables / generation modules. |
| `visualModeSummary` | **Resolved for SPEC** (populate minimal OK) | CONTRACT: extend US-2.3 DTO carefully; omit consent; keep key present. |
| Assets hard-disable | **Resolved for SPEC** (consent-only hard-disable V1) | Soft US-3.3 messaging OK; job gates later. |
| User / product decision needed? | **No** | All critical Qs resolved against SPEC; remaining freezes are SECURITY/CONTRACT. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

**SPEC amendments needed?** **No.**

**Defaults aligned?** Yes — PO leans in TASKS.md (allowlist, SPEC table name, fail-closed consent, no silent regen, no recording, separate settings surface, optional agent summary, stub `generic_avatar_id` / rules) are **ALIGNED** with SPEC S3.M4 / CONTEXT / ADRs / US-2.x continuity. No CONFLICT. No GAPS in SPEC coverage for this story’s slice.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. Surface: gated settings page under `(app)` (PO lean `/settings/preferences`); **not** Ficha viva `/profile` edit chrome; Server Action upsert; `requireActive("handler"|"page")`; `Cache-Control: no-store`; off `isPublicPath`.
2. Table: **`neuramark_visual_preferences`** — UNIQUE `client_id` → `neuramark_clients`; allowlist column(s) for modalities; `faceless_style` jsonb; nullable `generic_avatar_id`; `updated_at`; optional server-owned `rules`; RLS deny-by-default; service-role Node only.
3. Enum tokens (code/DB only): `own_avatar` \| `generic_avatar` \| `faceless`; Zod validates set ⊆ enum; reject unknown.
4. Consent: reject persist if `own_avatar` ∈ allowlist and no active Consentimiento (fail closed if ledger absent); UI disable is not authority.
5. When `faceless` ∈ allowlist: require structured `faceless_style` (voice + on-screen text + B-roll / stock axes — CONTRACT keys).
6. Rules stub: if `generic_avatar` selected, server may set `must_disclose_not_owner: true`; **not** client-writable.
7. Mutation: upsert Preferencias + `revalidatePath` only — **no** job enqueue, strategy/script/media regenerate, or provider calls.
8. UX/copy: Preferencias labels per CONTEXT; no recording prompts; EN + ES; enums never primary headlines.
9. Optional: `getBusinessProfileForAgents` `visualModeSummary` from allowlist when row exists; else `null`; never consent internals.
10. Explicit out of scope: US-3.2 ledger UI/API; US-3.3 uploads; US-3.4 QA UI; Modalidad por slot; Ficha viva Preferencias writes; auth redesign; browser Supabase; public Route Handler with tenant ids.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
