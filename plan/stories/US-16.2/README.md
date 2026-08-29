# US-16.2 — Publish weekly trend snapshot (manual)

**Status:** PREP — story folder scaffolded; gates not started.

**As an** Operator, **I want** to publish and edit a weekly **Snapshot de tendencias**, **so that** Strategy and Script agents can attach prioritized **Tácticas de tendencia** per Reel slot when relevant.

Ship **Trend Intelligence manual V1**: Operator curates a weekly **Snapshot de tendencias** in `neuramark_trend_snapshots` with schema-validated **Táctica de tendencia** entries, Operator-only publish/edit UI (EN/ES), seed táctica `cold-open-mejor-toma`, and a server-only `getTrendSnapshotForWeek(weekStart)` contract for downstream agents. Content Strategy jobs (US-4.1), scraping-based Trend (P1), and auto-activation stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-16.2 (unchecked until CLOSE).

**This folder:** [`plan/stories/US-16.2/`](./) — `README.md` · `TASKS.md` (PREP) · [`SPEC-REVIEW.md`](./SPEC-REVIEW.md) (ALIGNED). `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — **not yet authored**.

**Branch:** `feature/US-16.2-trend-snapshot`

**Depends on:** [US-16.1](../US-16.1/) ✅ CLOSED — `getPlaybookForAgents()` for `formatos_playbook_compatibles[]` slug validation · Fase 1 complete — [US-14.5](../US-14.5/) ✅ (`requireOperator()` gate). Runtime identity via `getCurrentUser()` / `requireActive()`.

**Unblocks:** [US-4.1](../../USER_STORIES.md) (Strategy attaches optional `tactica_tendencia_slug` per slot) · [US-5.1](../../USER_STORIES.md) (Script applies trend `guion_hints` / `editing_hints`) · [US-9.x](../../USER_STORIES.md) (Assembly applies `editing_hints` e.g. cold open + rewind).

---

## Gates (orchestrator)

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | ALIGNED |
| SECURITY | Pending |
| CONTRACT | Pending |
| BUILD | Pending |
| VALIDATION | Pending |
| QA | Pending |

**Sprint 2b milestone:** **US-16.2 closes Trend half of Sprint 2b** (Playbook = US-16.1 ✅). After CLOSE: Phase 2 integration report, then **US-4.1** Content Strategy.

---

## Scope in

| Area | What 16.2 adds |
|------|----------------|
| **FE** | Operator-only Trend admin: pick `week_start` (ISO week); list/add/edit/deactivate **Tácticas de tendencia** within the snapshot; structured form for SPEC fields including `prioridad_semana` (1–5), `formatos_playbook_compatibles[]` multi-select from active Playbook slugs; empty/loading/error; EN/ES product copy using **Snapshot de tendencias** / **Táctica de tendencia** (CONTEXT). |
| **BE** | Zod schemas + Operator-gated Server Actions for publish/update snapshot; enforce one row per `week_start`; validate `formatos_playbook_compatibles[]` against active Playbook via `getPlaybookForAgents()`; `getTrendSnapshotForWeek(weekStart)` server-only helper (active entries only, no `ejemplo_referencia` in agent DTO); `requireOperator()` on all mutations and Operator reads. |
| **DB** | `neuramark_trend_snapshots` (`week_start` UNIQUE, `entries` JSON array, `published_at`, `updated_at`); seed migration for canonical `cold-open-mejor-toma` entry; RLS deny-by-default (service-role Node only). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-4.1 Strategy agent** | LLM job, weekly brief, slot assignment — consumes Trend via `getTrendSnapshotForWeek()` only. |
| **US-5.1 / US-9.x Script & Assembly** | Applying trend hints at generation time — downstream; this story owns snapshot + contract. |
| **Trend scraping agent** | TASKS.md fase posterior; same schema later — V1 writes `fuente: manual` only. |
| **Auto-activation rules** | Operator manually publishes and toggles `activo`; no cron or scraping pipeline. |
| **Cliente-facing Trend UI** | V1 Operator-only per SPEC; Cliente sees táctica labels on strategy brief later (US-4.1). |
| **Auth redesign** | Unchanged; Operator gate via `requireOperator()`. |

## Canonical terms (CONTEXT)

Use **Snapshot de tendencias**, **Táctica de tendencia**, **Operator**, **Playbook de formatos** (for `formatos_playbook_compatibles[]` references only).  
_Evitar:_ trend report, weekly trends dump, trend tip, viral hack (as entity names).

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-16.1 | `neuramark_content_playbooks`, five seed formatos, `getPlaybookForAgents()` — **reuse for slug validation**; do not duplicate Playbook CRUD. |
| US-14.5 | `requireOperator()` for Operator-only surfaces; deny-by-default routing. |
| US-2.3 | Pattern for server-only agent helpers (`getBusinessProfileForAgents`) — mirror for `getTrendSnapshotForWeek`. |
| US-3.x | `modalidades_recomendadas` values align with Preferencias enum tokens (`own_avatar` \| `generic_avatar` \| `faceless`). |

**US-16.2 adds Trend snapshot persistence + Operator publish/edit UI + agent read contract** — no generation jobs.
