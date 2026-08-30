# Integration Report — PLAN Fase 2

**Date:** 2026-08-29  
**Branch reviewed:** `main` (US-16.1 + US-16.2 CLOSED)  
**Checker:** integration-checker  
**Flow scope:** Operator Playbook CRUD · Trend snapshot publish/edit · agent read contracts · US-16.2→US-16.1 slug validation handoff · Fase 1 auth/modality integration

---

## Verdict: CONNECTED

Fase 2 modules hand off correctly through shared contracts, `requireOperator()` gates, RLS deny-by-default tables, and server-only agent helpers. US-16.1 and US-16.2 both report **PASS WITH NOTES** with **0 validation blockers**. The Playbook→Trend slug validation path uses `getPlaybookForAgents()` as the sole allowlist source. Residual gaps are expected partial-MVP items (no Strategy agent yet, no provider catalog DB, no live E2E) or non-blocking quality notes. **Phase 3 may start.**

| Metric | Value |
|--------|-------|
| **Verdict** | CONNECTED |
| **Blocking gaps** | 0 |
| **Non-blocking / expected gaps** | 6 |
| **Phase 3 ready** | Yes (start with US-X.4) |

---

## Deliverable claimed vs observed

| PLAN Fase 2 deliverable | Observed |
|-------------------------|----------|
| Catálogo inicial de Formatos de Reel (seed) | **Yes.** Migration seeds five formatos: `tip-rapido`, `antes-despues`, `objecion`, `oferta-local`, `mito-vs-realidad` (`supabase/migrations/20260829240000_neuramark_content_playbooks.sql`). |
| Al menos una Táctica de tendencia semilla (`cold-open-mejor-toma`) | **Yes.** Seed at `week_start` `2026-01-05` with cold-open + rewind `editing_hints`; references playbook slugs `antes-despues`, `tip-rapido` (`supabase/migrations/20260829250000_neuramark_trend_snapshots.sql`). |
| UI Operator para CRUD | **Yes.** `/operator/playbook` (list/create/edit/archive) and `/operator/trends` (week list/publish/edit entries/deactivate). Nav gated by `user.role === "operator"` in `AppHeader.tsx`. |
| `getPlaybookForAgents()` + `getTrendSnapshotForWeek()` ready for agents | **Yes.** Both `import "server-only"`; active-only filters; `ejemplo_referencia` stripped; no Client Component imports. |

---

## Flow traces

### Happy path — Operator Playbook CRUD

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Route gate | Operator session required; inactive denied | `app/(app)/layout.tsx` `requireActive("page")` → `app/(app)/operator/layout.tsx` `requireOperator("page")` | nextjs-backend |
| 2. List formatos | All rows incl. archived; Operator DTO | `loadPlaybookListForOperator` → `app/(app)/operator/playbook/page.tsx` → `PlaybookListView` | nextjs-backend / nextjs-frontend |
| 3. Create formato | Zod strict; slug unique; version 1 | `createPlaybookFormato` → `neuramark_content_playbooks` INSERT | nextjs-backend |
| 4. Edit formato | Slug immutable; `expectedVersion` concurrency | `updatePlaybookFormato` → version bump; `VERSION_CONFLICT` on stale | nextjs-backend |
| 5. Archive formato | `active=false`, `archived_at` set; no DELETE | `archivePlaybookFormato`; idempotent | nextjs-backend |
| 6. Cache revalidation | List + detail paths | `revalidatePath` on create/update/archive | nextjs-backend |
| 7. Agent read | Active non-archived only; strip Operator fields | `getPlaybookForAgents()` → `mapPlaybookRowsForAgents` | content-agents-engineer |

### Happy path — Operator Trend snapshot publish/edit

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Route gate | Same Operator triple gate | `requireOperator` on layout + loaders + mutations | nextjs-backend |
| 2. Week list | Published weeks with metadata | `loadTrendWeekListForOperator` → `/operator/trends` | nextjs-backend / nextjs-frontend |
| 3. Publish week | Upsert by `week_start`; Monday normalization | `publishOrUpdateSnapshot` + `normalize-week-start.ts` | nextjs-backend |
| 4. Add entry | Full táctica schema; `fuente: "manual"` forced | `addTrendEntry` → `mergeTrendEntryCreate` | nextjs-backend |
| 5. Edit entry | Slug immutable; version via snapshot replace | `updateTrendEntry` | nextjs-backend |
| 6. Deactivate entry | `activo=false`; excluded from agent read | `deactivateTrendEntry` | nextjs-backend |
| 7. Agent read | Active entries only; safe empty on missing week | `getTrendSnapshotForWeek(weekStart)` | content-agents-engineer |

### Handoff — US-16.2 → US-16.1 slug validation

| Step | Expected | Found | Owner |
|------|----------|-------|-------|
| 1. Write path invokes validation | Every trend write validates `formatos_playbook_compatibles[]` | `validateEntryPlaybookSlugs` called from `publish-or-update-snapshot.ts`, `add-trend-entry.ts`, `update-trend-entry.ts` | content-agents-engineer |
| 2. Allowlist source | MUST use `getPlaybookForAgents()`, not direct SELECT | `validate-playbook-slugs.ts` imports `getPlaybookForAgents` only; test asserts boundary | content-agents-engineer |
| 3. Unknown slug rejected | `INVALID_PLAYBOOK_SLUG` envelope | `trend.test.ts` add-entry rejects unknown slug | nextjs-backend |
| 4. Archived slug excluded | Archived formatos not in allowlist | `getPlaybookForAgents` filters `active=true` AND `archived_at IS NULL` — new trend writes referencing archived slugs fail validation (correct) | content-agents-engineer |
| 5. Seed cross-reference | Seed trend references active playbook slugs | `cold-open-mejor-toma` → `["antes-despues", "tip-rapido"]` both in playbook seed | content-agents-engineer |

### Handoffs table (contracts / boundaries)

| From → To | Contract / entrypoint | Schema alignment | Status |
|-----------|----------------------|------------------|--------|
| Fase 1 auth → Operator modules | `requireOperator()` chains `requireActive()` first | `lib/auth/require-user.ts`; role never from request body | OK |
| Fase 1 preferencias → Playbook/Trend | Shared `visualModalitySchema` (`own_avatar` \| `generic_avatar` \| `faceless`) | `lib/contracts/visual-preferences.ts` imported by `playbook.ts` + `trend.ts` | OK |
| Playbook (Operator) → Playbook (agents) | Separate DTOs; shared payload core | `PlaybookFormatoView` vs `PlaybookForAgentsFormato`; agent omits `ejemplo_referencia` | OK |
| Playbook (agents) → Trend validation | `getPlaybookForAgents().formats[].slug` allowlist | `validateFormatosPlaybookCompatibles` | OK |
| Trend (Operator) → Trend (agents) | Separate DTOs; `activo` filtered server-side | `TrendEntryAgentDto` omits `ejemplo_referencia`, `activo` | OK |
| Playbook + Trend → Strategy (Fase 3) | `getPlaybookForAgents()` + `getTrendSnapshotForWeek()` | SPEC §3 M5; US-4.1 depends on US-16.1, US-16.2, US-X.4 | **Deferred** (expected — no US-4.1 yet) |
| Profile (agents) → Strategy (Fase 3) | `getBusinessProfileForAgents` + `visualModeSummary` | Fase 1 CONNECTED per PHASE-1.md | OK (upstream ready) |

### SPEC §4 error paths — Fase 2 scope

S4.1–S4.5 end-to-end flows (ciclo semanal, aprobación, IG publish) are **out of Fase 2 scope** — no Strategy/Script jobs, QA gate, or IG modules exist yet. **Correct deferral.**

S4.Q1 generation/QA/IG/ciclo-parcial error paths are likewise deferred.

In-scope error paths verified in code + unit tests:

| Error path | Expected behavior | Found |
|------------|-------------------|-------|
| Unauthenticated Operator access | Redirect login / 401 envelope | `requireActive` → `requireOperator` chain |
| Inactive user (incl. inactive operator) | `/pending` or 403; no mutations | `requireActive` before role check |
| Non-operator on `/operator/*` | Page 403; mutation `FORBIDDEN` | `failOperatorForbidden`; tests on create/publish |
| Playbook duplicate slug | `DUPLICATE_SLUG`; no insert | `create-playbook-formato.ts` PG unique handling |
| Playbook stale version | `VERSION_CONFLICT` | `update-playbook-formato.ts` |
| Playbook archive on archived row | `ALREADY_ARCHIVED` / idempotent | `archive-playbook-formato.ts` |
| Trend non-Monday `week_start` | Validation error | `trendWeekStartSchema` + publish rejection |
| Trend duplicate entry slug | `DUPLICATE_SLUG` | `hasDuplicateSlug` in mutation helpers |
| Trend unknown playbook slug | `INVALID_PLAYBOOK_SLUG` | `validateEntryPlaybookSlugs` |
| Trend smuggled slug on update | `FORBIDDEN_FIELDS` | `update-trend-entry.ts` |
| Agent helper load failure | Soft empty / `loadFailed`; no throw to client | `getPlaybookForAgents`, `getTrendSnapshotForWeek` |
| Invalid stored payload at read time | Row skipped / soft-fail | `mapPlaybookRowsForAgents`, `mapTrendEntryToAgentDto` |

---

## VALIDATION.md sample (Fase 2 stories)

| Story | Verdict | Integration-relevant notes |
|-------|---------|----------------------------|
| US-16.1 Playbook | PASS WITH NOTES | Operator CRUD + `getPlaybookForAgents` wired; RLS deny-by-default; 23 playbook tests pass |
| US-16.2 Trend snapshot | PASS WITH NOTES | Publish/edit/deactivate + `getTrendSnapshotForWeek` wired; slug validation via `getPlaybookForAgents`; 17 trend tests pass |

**Cross-cutting validation note:** No sampled story ran live browser + Supabase E2E this gate. Unit coverage is strong (**40/40** pass across playbook + trend suites).

---

## Fase 1 integration check

| Fase 1 seam | Fase 2 usage | Status |
|-------------|--------------|--------|
| `requireActive()` on `(app)/*` | Operator routes inherit `(app)/layout.tsx` gate before `requireOperator` | OK |
| `requireOperator()` (US-14.5) | Layout + all loaders + mutations | OK |
| `visualModalitySchema` (US-3.1) | Playbook `modalidades_recomendadas`; Trend `modalidades_recomendadas` | OK |
| `getBusinessProfileForAgents` (US-2.3) | Not called by Playbook/Trend (correct — global catalog) | OK (no conflict) |
| Service-role Supabase only | Playbook/Trend tables RLS enabled, zero policies | OK |
| No browser Supabase SDK | Grep clean under `components/playbook/`, `components/trend/` | OK |

---

## Gaps (blocks next phase)

**None.**

---

## Non-blocking gaps / expected partial MVP

| # | Gap | Severity | Owner | Notes |
|---|-----|----------|-------|-------|
| 1 | **No live E2E Operator CRUD walk** | Low | QA / nextjs-frontend | Validators PASS on static + unit evidence only. Recommend manual smoke: create formato → archive → confirm agent exclusion; publish trend week → add entry → deactivate. |
| 2 | **Agent call sites absent** | Expected | content-agents-engineer | `getPlaybookForAgents` consumed only by `validate-playbook-slugs.ts` + tests; `getTrendSnapshotForWeek` has zero production importers. US-4.1 will wire both. |
| 3 | **US-X.4 provider catalog DB not seeded** | Expected (blocks US-4.1) | nextjs-backend | `lib/providers/provider-adapters.ts` + `lib/contracts/providers.ts` exist; no `neuramark_provider_catalog` migration. US-4.1 depends on US-X.4 per `USER_STORIES.md`. |
| 4 | **No `Cache-Control: no-store` for `/operator/*`** | Low | nextjs-frontend | Carried from US-16.1 note; mitigated by `force-dynamic` on all Operator routes. |
| 5 | **Isolated non-operator loader gate tests missing** | Low | nextjs-backend | Mutations tested; loader 403 relies on shared `requireOperator` (US-14.5). |
| 6 | **`TASKS.md` Fase 2 checkboxes unchecked** | Doc drift | product-owner | Stories CLOSED but root `TASKS.md` still shows `[ ]` for Fase 2 — tracking only, not a code gap. |

---

## Recommended fixes (by agent)

| Agent | Action |
|-------|--------|
| **nextjs-backend** | Implement **US-X.4** (provider catalog migration + `resolveProvider` seed) before US-4.1 — P0 blocker per `USER_STORIES.md` Sprint 3 ordering. |
| **content-agents-engineer** | Begin **US-4.1** Content Strategy Agent after US-X.4; MUST-import `getPlaybookForAgents`, `getTrendSnapshotForWeek`, `getBusinessProfileForAgents`. |
| **QA / nextjs-frontend** | Run one Operator E2E: playbook CRUD + trend publish flow against staging Supabase. |
| **nextjs-frontend** | Optional: add `/operator/:path*` `Cache-Control: no-store` to `next.config.ts`. |
| **product-owner** | Sync `TASKS.md` Fase 2 checkboxes; advance `SPRINT-STATE.md` phase_status to complete after sign-off. |

---

## Recommended next phase entry

**First Fase 3 work item (per `PLAN.md` + `USER_STORIES.md` dependency graph):**

> **US-X.4 — Seed provider catalog and tier defaults** (`neuramark_provider_catalog` + `neuramark_cost_policies`; `resolveProvider(assetRole, tier)`)

Then:

> **US-4.1 — Generate weekly Instagram content strategy** (consumes Playbook slugs + Trend snapshot + Ficha viva + visual allowlist)

`USER_STORIES.md` Sprint 3 order: `US-X.4` → `US-4.1` → `US-4.2` → `US-5.1` → …

**Rationale:** US-4.1 explicitly depends on US-16.1, US-16.2, **and US-X.4**. Provider catalog is the only missing Fase 2/3 prerequisite; Playbook + Trend agent contracts are ready.

---

## Automated check summary

```
npx tsx --test \
  lib/playbook/playbook.test.ts \
  lib/playbook/get-playbook-for-agents.test.ts \
  lib/trend/trend.test.ts
→ 40/40 pass
```

---

## Sign-off

| Question | Answer |
|----------|--------|
| Can Phase 3 start? | **Yes** (with US-X.4 first) |
| Blocking gap count | **0** |
| Fase 2 Playbook + Trend chain connected? | **Yes** |
| US-16.2→US-16.1 slug handoff correct? | **Yes** (`getPlaybookForAgents` sole allowlist) |
| `requireOperator()` + RLS deny-by-default? | **Yes** |
| Fase 1 auth/modality integration intact? | **Yes** |
