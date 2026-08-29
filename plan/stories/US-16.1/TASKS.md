# US-16.1 — Curate evergreen Reel format catalog (Playbook)

**Priority:** P0  
**Depends on:** Fase 1 complete — US-1.3 ✅ · US-2.3 ✅ · US-3.4 ✅ · US-14.5 ✅ (`requireOperator()`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-16.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** + **content-agents-engineer** (`docs/development/AGENT-ROSTER.md` PLAN Fase 2). DB migration under BE. `getPlaybookForAgents()` contract owned by content-agents-engineer with BE module placement.  
**Canonical terms:** **Playbook de formatos** · **Formato de Reel** · **Operator**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-16.2** weekly Snapshot de tendencias UI/API/seed (`cold-open-mejor-toma`).
- **US-4.1+** Content Strategy / Script / Caption LLM jobs and weekly brief UI.
- **Cliente** read surfaces for Playbook (Strategy brief shows formato labels later).
- Trend scraping agent or auto-published snapshots.
- Per-client Playbook overrides (global Operator catalog in V1).
- Provider catalog / cost policy (US-X.4, US-7.x).

## Scope split

| Concern | Owner |
|---------|--------|
| Playbook table + seed formatos | **US-16.1** (this story) |
| Trend snapshots + `getTrendSnapshotForWeek` | **US-16.2** |
| Strategy picks `formato_playbook_slug` | **US-4.1** |
| Script applies `guion_hints` / `editing_hints` | **US-5.1** / **US-9.x** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table name | **`neuramark_content_playbooks`** (SPEC). Logical `content_playbooks` in story table = same with `neuramark_` prefix. |
| Versioning | **PO lean:** row-level `version` integer increments on each successful update; `slug` immutable after create. CONTRACT may add `payload` jsonb vs normalized columns — prefer jsonb + Zod for flexibility. |
| Archive vs delete | **Archive** (`archived_at` / `active = false`); no hard delete in V1. Archived slugs excluded from `getPlaybookForAgents()`. |
| Operator route | **PO lean:** `/operator/playbook` under `(app)` with `requireOperator()` on RSC + mutations. Exact path freezes in CONTRACT. |
| Mutation surface | Prefer **Server Actions** with `requireOperator("handler")`. No public `/api/…` without operator gate. |
| Seed slugs | Migration seeds five formatos with stable slugs (e.g. `tip-rapido`, `antes-despues`, `objecion`, `oferta-local`, `mito-vs-realidad`) — CONTRACT freezes exact slugs and minimal payload shape. |
| Agent DTO | `getPlaybookForAgents()` returns `{ formats: [...] }` active only; strips `ejemplo_referencia`; server-only module. |
| `modalidades_recomendadas` | Enum tokens `own_avatar` \| `generic_avatar` \| `faceless` — validated server-side; empty array = no restriction (CONTRACT confirms). |
| `rubros` | Empty array = all rubros (SPEC). |
| i18n | EN + ES for Operator UI chrome; formato `titulo` / `explicacion` may be Spanish-first in seed — CONTRACT defines locale strategy for catalog content. |
| Identity | Operator mutations use session only; no `client_id` on playbook rows in V1 (global catalog). |

## Carry-forwards / reuse (do not reinvent)

- Operator gate: same `requireOperator()` pattern as other Operator-only stories (US-14.5).
- Agent helper pattern: mirror `getBusinessProfileForAgents` (server-only, Zod output, minimal DTO).
- Migrations: `neuramark_` prefix; RLS deny-by-default; service-role Node only.
- PrimeReact for Operator tables/forms.

---

## FE checklist

Concrete BE consumers: Operator Server Actions for list/create/update/archive; RSC loader for Playbook list/detail.

- [x] **Operator Playbook list** page (CONTRACT path): table/cards of formatos with slug, titulo, active/archived status, version.
- [x] **Create / edit form** for all SPEC fields (beats editor for `estructura`, arrays for hints/rubros/modalidades).
- [x] **Archive action** with confirm; archived rows visually distinct; cannot archive if CONTRACT defines constraints.
- [x] **Slug read-only** on edit (immutable after create).
- [x] **Loading / empty / error / success** states on list and forms.
- [x] **EN + ES strings** in `messages/en.json` / `es.json` for Operator chrome (not necessarily translating seed catalog content unless CONTRACT says so).
- [x] **No Supabase in Client Components**; no bypass of Operator gate in client routing.
- [x] Do **not** build Trend UI (US-16.2) or Strategy brief UI (US-4.1).

---

## BE checklist

Concrete FE consumers: Operator Playbook pages; future US-4.1/US-5.1 via `getPlaybookForAgents()` only.

- [x] **Migration** `neuramark_content_playbooks` (CONTRACT freezes columns: `slug` UNIQUE, `version`, payload jsonb, `active`, timestamps, `archived_at`).
- [x] **Zod schemas** for Formato de Reel (create/update/read/agent DTO variants).
- [x] **Seed migration** with five V1 formatos (TASKS.md list).
- [x] **Server Actions** (CONTRACT names): list, getBySlug, create, update, archive — all `requireOperator("handler")`.
- [x] **[SEC] Server-side Zod** on every write; reject unknown `hook_type` / modalidad enum values.
- [x] **[SEC] Slug immutability** enforced in update handler.
- [x] **`getPlaybookForAgents()`** server-only helper: active formatos, validated output, no Operator-only fields.
- [x] Parameterized queries; service-role Node only; never log full payloads unnecessarily.
- [x] `revalidatePath` for Operator Playbook routes after mutations.
- [x] Automated tests: CRUD happy path; duplicate slug rejected; archive excludes from agent helper; non-operator gets 403; agent DTO omits `ejemplo_referencia`.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] Create **`neuramark_content_playbooks`** per CONTRACT (jsonb payload or normalized — freeze in CONTRACT).
- [x] UNIQUE on `slug`; index on `active` / `archived_at` if needed for list queries.
- [x] **Seed** five formatos with stable slugs and minimal valid payloads.
- [x] RLS: zero policies / deny-by-default (match Fase 1 pattern).
- [x] **Do not** create `neuramark_trend_snapshots` here (US-16.2).
- [x] **Do not** create `neuramark_content_strategies` here (US-4.1).

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian — Playbook schema vs SPEC §3; Operator-only; no Strategy jobs)
- [ ] SECURITY.md (security-architect — Operator gate; server-only agent helper; no client leakage of `ejemplo_referencia`)
- [ ] CONTRACT.md authored (nextjs-backend) + FE signoff — "Reviewed by FE" line
- [ ] BUILD (FE + BE + DB + content-agents-engineer for agent helper)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** PREP. Next gate: **SPEC-REVIEW** after PO handoff to orchestrator.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Payload shape** — Single `payload jsonb` vs normalized columns for beats/hints? **PO lean:** jsonb + Zod; easier seeding and agent DTO mapping.
2. **Catalog i18n** — Are `titulo` / `explicacion` monolingual (ES) in V1 or bilingual fields? **PO lean:** monolingual ES in seed; Operator UI bilingual chrome only; revisit if US-4.1 Cliente brief needs EN.
3. **Operator route** — `/operator/playbook` vs nested under existing dashboard? **PO lean:** dedicated `/operator/playbook` path.
4. **Version history** — Full history table (P1) vs integer `version` only? **PO lean:** integer only in V1; no `profile_versions`-style table unless SECURITY requires audit.
5. **`hook_type` enum** — Closed list in Zod vs free text? **PO lean:** closed enum frozen in CONTRACT; extend via migration when needed.
6. **Archive + slug reuse** — Can a new formato reuse an archived slug? **PO lean:** no — slug permanently reserved once created.

No SPEC amendment assumed in PREP: SPEC §3 Content Playbook already defines schema and Operator curation. Spec-guardian confirms alignment with TASKS.md Fase 2 checklist.
