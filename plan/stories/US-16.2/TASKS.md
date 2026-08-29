# US-16.2 — Publish weekly trend snapshot (manual)

**Priority:** P0  
**Depends on:** US-16.1 ✅ CLOSED (`plan/stories/US-16.1/`) · Fase 1 complete — US-14.5 ✅ (`requireOperator()`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-16.2 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** + **nextjs-frontend** + **content-agents-engineer** (`docs/development/AGENT-ROSTER.md` PLAN Fase 2). DB migration under BE. `getTrendSnapshotForWeek()` contract owned by content-agents-engineer with BE module placement.  
**Canonical terms:** **Snapshot de tendencias** · **Táctica de tendencia** · **Operator**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-4.1+** Content Strategy / Script / Caption LLM jobs and weekly brief UI.
- **Trend scraping agent** or auto-published snapshots (`fuente: scraping` / `operator_review` writes deferred).
- **Cliente** read surfaces for Trend (Strategy brief shows táctica labels later).
- Per-client Trend overrides (global Operator snapshot in V1).
- Playbook CRUD or `getPlaybookForAgents()` changes beyond import for slug validation (US-16.1).
- Provider catalog / cost policy (US-X.4, US-7.x).

## Scope split

| Concern | Owner |
|---------|--------|
| Playbook catalog + `getPlaybookForAgents()` | **US-16.1** (done) |
| Trend snapshots + `getTrendSnapshotForWeek` | **US-16.2** (this story) |
| Strategy picks `tactica_tendencia_slug` per slot | **US-4.1** |
| Script applies trend `guion_hints` / `editing_hints` | **US-5.1** / **US-9.x** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table name | **`neuramark_trend_snapshots`** (SPEC). Logical `trend_snapshots` in story table = same with `neuramark_` prefix. |
| Row model | **One row per `week_start`**; UNIQUE on `week_start`; `entries` jsonb array holds all tácticas for that week. |
| `week_start` | **PO lean:** ISO week Monday as `date` (`YYYY-MM-DD`); UI week picker normalizes to Monday; server rejects non-Monday dates. |
| Entry identity | Each entry includes `slug` + `week_start` (denormalized in entry for agent DTO); **slug unique within snapshot**; same slug may appear in different weeks. |
| `activo` | Soft deactivate within `entries[]` (`activo: false`); no hard delete of entry history in V1. Agent helper filters `activo = true`. |
| `fuente` | Enum `manual` \| `scraping` \| `operator_review` — **V1 writes `manual` only**; other values reserved for fase posterior. |
| `prioridad_semana` | Integer **1–5** inclusive; multiple entries may share the same priority (no uniqueness constraint). |
| `duracion_ideal_seg` | **Object** shape per SPEC e.g. `{ cold_open: 2, total: 25 }` — distinct from Playbook scalar `duracion_ideal_seg`. |
| `formatos_playbook_compatibles[]` | Array of Playbook slugs; validate on write against **active** slugs from `getPlaybookForAgents()`; reject unknown/archived slugs. |
| `hook_type` / `rubros` / `modalidades_recomendadas` | **PO lean:** reuse closed enums from US-16.1 playbook contract (`playbookHookTypeSchema`, `playbookRubroSchema`, `visualModalitySchema`) — CONTRACT confirms import vs duplicate. |
| Operator route | **PO lean:** `/operator/trends` under `(app)` with `requireOperator()` on RSC + mutations; week detail at `/operator/trends/[weekStart]`. Exact paths freeze in CONTRACT. |
| Mutation surface | Prefer **Server Actions** with `requireOperator("handler")`. No public `/api/…` without operator gate. |
| `published_at` | Set on **first publish** for that `week_start`; retained on subsequent updates. `updated_at` on every successful write. |
| Seed | Migration seeds one snapshot row with **`cold-open-mejor-toma`** táctica including cold-open + rewind `editing_hints`; `formatos_playbook_compatibles` references compatible Playbook slugs (e.g. `antes-despues`, `tip-rapido`) — CONTRACT freezes exact payload and seed `week_start`. |
| Agent DTO | `getTrendSnapshotForWeek(weekStart)` returns `{ weekStart, entries: [...] }` or safe empty `{ weekStart, entries: [] }`; strips `ejemplo_referencia`; server-only module. |
| `rubros` | Empty array = all rubros (SPEC). |
| i18n | EN + ES for Operator UI chrome; táctica `titulo` / `explicacion` may be Spanish-first in seed — CONTRACT defines locale strategy for catalog content. |
| Identity | Operator mutations use session only; no `client_id` on trend rows in V1 (global snapshot). |

## Carry-forwards / reuse (do not reinvent)

- Operator gate: same `requireOperator()` pattern as US-16.1 Playbook and US-14.5.
- Agent helper pattern: mirror `getPlaybookForAgents` / `getBusinessProfileForAgents` (server-only, Zod output, minimal DTO, `loadFailed` safe state).
- Playbook slug validation: import `getPlaybookForAgents()` — never duplicate Playbook SELECT in Trend modules.
- Migrations: `neuramark_` prefix; RLS deny-by-default; service-role Node only.
- PrimeReact for Operator tables/forms (mirror Playbook list/form patterns).

---

## FE checklist

Concrete BE consumers: Operator Server Actions for publish/update snapshot and entry CRUD within week; RSC loader for Trend week list/detail.

- [x] **Operator Trend hub** page (CONTRACT path): week picker or list of published `week_start` values; link to edit snapshot for selected week.
- [x] **Week snapshot editor**: list entries with `prioridad_semana`, `activo`, `titulo`, `slug`; add/edit/deactivate táctica forms.
- [x] **Táctica form** for all SPEC fields (beats editor for `estructura`, arrays for hints, `duracion_ideal_seg` object fields, `formatos_playbook_compatibles[]` multi-select from active Playbook slugs).
- [x] **Deactivate action** with confirm; inactive entries visually distinct; agent consumption excludes them.
- [x] **Slug read-only** on edit (immutable after create within snapshot).
- [x] **Loading / empty / error / success** states on list and forms (including empty week with publish CTA).
- [x] **EN + ES strings** in `messages/en.json` / `es.json` for Operator chrome.
- [x] **No Supabase in Client Components**; no bypass of Operator gate in client routing.
- [x] Do **not** build Strategy brief UI (US-4.1) or scraping admin.

---

## BE checklist

Concrete FE consumers: Operator Trend pages; future US-4.1 via `getTrendSnapshotForWeek()` only.

- [x] **Migration** `neuramark_trend_snapshots` (CONTRACT freezes columns: `week_start` UNIQUE `date`, `entries` jsonb, `published_at`, `updated_at`).
- [x] **Zod schemas** for Snapshot row + Táctica de tendencia (create/update/read/agent DTO variants).
- [x] **Seed migration** with `cold-open-mejor-toma` in canonical week (TASKS.md / CONTRACT).
- [x] **Server Actions** (CONTRACT names): list weeks, getByWeekStart, publishOrUpdateSnapshot, addEntry, updateEntry, deactivateEntry — all `requireOperator("handler")`.
- [x] **[SEC] Server-side Zod** on every write; `prioridad_semana` bounded 1–5; `fuente` forced to `manual` in V1 writes.
- [x] **[SEC] Slug immutability** enforced in entry update handler.
- [x] **Playbook slug validation** on write via `getPlaybookForAgents()` active slugs.
- [x] **`getTrendSnapshotForWeek(weekStart)`** server-only helper: snapshot for week or empty state; `activo = true` entries only; no Operator-only fields.
- [x] Parameterized queries; service-role Node only; never log full payloads unnecessarily.
- [x] `revalidatePath` for Operator Trend routes after mutations.
- [x] Automated tests: publish/update happy path; duplicate `week_start` upsert semantics; unknown playbook slug rejected; deactivate excludes from agent helper; non-operator gets 403; agent DTO omits `ejemplo_referencia`; empty week returns safe empty state.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] Create **`neuramark_trend_snapshots`** per CONTRACT (`week_start` UNIQUE, `entries` jsonb, timestamps).
- [x] **Seed** one snapshot with `cold-open-mejor-toma` and valid `formatos_playbook_compatibles` referencing US-16.1 seed slugs.
- [x] RLS: zero policies / deny-by-default (match Fase 1 / US-16.1 pattern).
- [x] **Do not** create `neuramark_content_strategies` here (US-4.1).
- [x] **Do not** alter `neuramark_content_playbooks` (US-16.1).

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — Trend schema vs SPEC §3; Operator-only; no Strategy jobs) — ALIGNED
- [ ] SECURITY.md (security-architect — Operator gate; server-only agent helper; no client leakage of `ejemplo_referencia`; untrusted-input note for US-4.1+)
- [ ] CONTRACT.md authored (nextjs-backend) + FE signoff
- [ ] BUILD (FE + BE + DB + content-agents-engineer for agent helper)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** PREP (2026-08-29). SPEC-REVIEW ALIGNED. AC remain unchecked in `plan/USER_STORIES.md`. **Next gate:** SECURITY (security-architect).

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Seed `week_start`** — Fixed canonical date (e.g. `2026-01-05`) vs migration-relative “current ISO week”? **PO lean:** fixed reference Monday in migration so dev/staging/prod share the same seed row; Operator can publish other weeks via UI.
2. **Entry slug scope** — Unique per snapshot only vs globally unique across all weeks? **PO lean:** unique within `(week_start, entries[])`; `cold-open-mejor-toma` may repeat in future weeks as separate entry objects.
3. **`duracion_ideal_seg` object schema** — Required keys `cold_open` + `total` only, or extensible? **PO lean:** `{ cold_open: number, total: number }` strict; seed `cold-open-mejor-toma` uses `{ cold_open: 2, total: 25 }`.
4. **Hook / rubro enums** — Import playbook Zod enums vs trend-specific subset? **PO lean:** reuse `playbookHookTypeSchema` and `playbookRubroSchema` from `lib/contracts/playbook.ts` to avoid drift.
5. **Operator route** — `/operator/trends` vs `/operator/trend-snapshots`? **PO lean:** `/operator/trends` (shorter; parallel `/operator/playbook`).
6. **Upsert semantics** — Single `publishOrUpdateSnapshot` action vs separate create/update? **PO lean:** upsert by `week_start` (insert or replace `entries` + bump `updated_at`; set `published_at` only on insert).
7. **Week list UX** — Show all historical weeks vs only weeks with rows? **PO lean:** list only persisted `week_start` values; “Publish new week” flow creates next/edited week.
8. **Clone prior week** — Operator copies last week's entries into a new week? **PO lean:** out of V1 — manual re-entry; P1 convenience if Operator requests.
9. **Catalog i18n** — Monolingual ES táctica content in seed like Playbook? **PO lean:** yes — Operator UI bilingual chrome only.
10. **`editing_hints` vocabulary** — Free-text strings vs structured tokens for cold open/rewind? **PO lean:** free-text strings (mirror Playbook); seed includes explicit cold-open and rewind phrases for `cold-open-mejor-toma`.

No SPEC amendment assumed in PREP: SPEC §3 Trend Intelligence already defines schema and Operator manual V1. Spec-guardian confirms alignment with TASKS.md Fase 2 checklist.
