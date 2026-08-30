# US-4.1 — Generate weekly Instagram content strategy

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 3 Low; CLOSE yes). Build BE `af998d9` · FE `dcbd15a` · agents `bbd159d`.

**As a** Operator, **I want** the system to propose weekly pillars, themes, and sequence, **so that** we deliver 3 Reels with coherent messaging.

Ship **Content Strategy Agent V1 (generate + read draft only)**: Operator triggers **Generate strategy** for a selected client + ISO week; server job composes inputs from `getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`, and `getProviderCatalog` + `resolveProvider({ assetRole: 'llm', llmVariant: 'default' })`; LLM output is schema-validated and persisted as a new **`draft`** row in `neuramark_content_strategies` with monotonic **`version`** per `(client_id, week_start)`. Operator views the latest draft brief (pillars, themes, ≥3 Reel slots). **Edit, approve, Cliente read, and weekly cycle automation** stay **out** (US-4.2 / integrations).

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-4.1 (checked on CLOSE).

**This folder:** [`plan/stories/US-4.1/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-4.1-content-strategy` *(orchestrator sets on BUILD)*

**Depends on:** [US-2.3](../US-2.3/) ✅ `getBusinessProfileForAgents()` · [US-3.1](../US-3.1/) ✅ visual mode / Preferencias (allowlist via US-3.4) · [US-16.1](../US-16.1/) ✅ `getPlaybookForAgents()` · [US-16.2](../US-16.2/) ✅ `getTrendSnapshotForWeek()` · [US-X.4](../US-X.4/) ✅ `getProviderCatalog()` + `resolveProvider()` · [US-14.5](../US-14.5/) ✅ `requireOperator()` gate.

**Unblocks:** [US-4.2](../../USER_STORIES.md) (edit/approve brief) · [US-5.1](../../USER_STORIES.md) (Video Script consumes approved strategy — gated on US-4.2).

---

## Close verdicts

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | ALIGNED (gaps closed in CONTRACT) |
| SECURITY | APPROVE WITH CONDITIONS |
| CONTRACT | Frozen 2026-08-30; Reviewed by FE (BUILD `dcbd15a`) |
| BUILD | BE `af998d9` · FE `dcbd15a` · content-agents-engineer `bbd159d` |
| VALIDATION | PASS WITH NOTES (`239e598`) |
| QA | APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 3 Low; CLOSE yes) |

**QA handoff (non-blocking, post-CLOSE):** M1 — rate-limit fail-closed on DB errors; M2 — atomic in-flight acquire; L1 — logger mock test; L2 — EN `clientLabel` typo; L3 — export `maxDuration` on generate action. **Next:** **US-4.2** review and approve strategy before scripting.

---

## Scope in

| Area | What US-4.1 adds |
|------|------------------|
| **FE** | Operator-only Strategy surface: client selector + `week_start` picker; **Generate strategy** primary action; loading/pending while job runs; read-only **draft** brief view (pillars, themes, Reel slot rows: day, tema, `formato_playbook_slug`, modalidad, optional `tactica_tendencia_slug`, goal tag); version indicator when regenerated; empty/error states; EN/ES product copy (**Estrategia semanal** / **brief**). |
| **BE** | Operator-gated Server Action to trigger generation; server-only Content Strategy agent job in `lib/agents/content/`; Zod brief schema; persist `neuramark_content_strategies`; load latest draft for Operator read; rate-limit generate per `client_id`; `requireOperator()` on trigger + Operator reads. |
| **DB** | `neuramark_content_strategies` (`client_id`, `week_start`, `brief` jsonb, `status` default `draft`, `version`, timestamps); UNIQUE `(client_id, week_start, version)`; RLS deny-by-default. |
| **content-agents-engineer** | Agent prompt + I/O contract (`lib/contracts/content-strategy.ts`); orchestration wiring to existing helpers; LLM call via resolved `llm` provider; prompt-injection containment; reject malformed output before INSERT. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-4.2** edit / approve strategy | Editable fields, `draft` → `approved`, approval metadata, lock rules — separate story. US-4.1 writes **`draft` only**. |
| **Cliente brief read** | SPEC notes Cliente read in V1; **deferred** to US-4.2 or a thin follow-up — US-4.1 is **Operator-only** per sprint slice. |
| **US-5.1+** Video Script / Caption jobs | Downstream consumers; no script rows in this story. |
| **Weekly cycle automation** | integrations-engineer (US-12.x / ciclo semanal) — manual Operator trigger only in 4.1. |
| **US-7.2** policy engine / job cost logging | Use `getDefaultCostPolicy()` tier + `resolveProvider` only; no pre-job budget block yet. |
| **Multichannel output** | Instagram Reels only (roadmap hard rule). |
| **Operator edit of brief fields** | Read-only view; regeneration = new version row. |
| **Hard delete of strategy history** | Regenerate **appends** version; approved rows (future) must never be deleted by regenerate. |

## Canonical terms (CONTEXT)

Use **Estrategia semanal**, **brief**, **Formato de Reel**, **Modalidad de producción**, **Táctica de tendencia**, **Operator**, **Cliente**, **Ficha viva**.  
_Evitar:_ content template, viral playbook, multichannel plan, generic "strategy doc".

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-2.3 | `getBusinessProfileForAgents(clientId)` — **only** profile path for agent prompts; includes `visualModeSummary` allowlist (US-3.4). |
| US-3.1 / US-3.4 | Modalidad enum `own_avatar` \| `generic_avatar` \| `faceless`; per-slot modalidad must ⊆ `visualModeSummary.allowedModes`. |
| US-16.1 | `getPlaybookForAgents()` — active formatos; slot `formato_playbook_slug` must reference active slug. |
| US-16.2 | `getTrendSnapshotForWeek(weekStart)` — optional `tactica_tendencia_slug` per slot; empty snapshot OK. |
| US-X.4 | `getProviderCatalog()` + `getDefaultCostPolicy()` + `resolveProvider(catalog, { assetRole: 'llm', tier, llmVariant: 'default' })`. |
| US-14.5 | `requireOperator()` on Operator Strategy UI + generate action. |
| US-16.1 / US-16.2 | Operator route pattern under `/operator/*`; `Cache-Control: no-store` carry-forward. |

**US-4.1 adds strategy generation job + draft persistence + Operator generate/read UI** — no approval workflow, no script generation.
