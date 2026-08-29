# US-16.1 — Curate evergreen Reel format catalog (Playbook)

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 3 Low non-blocking; no fix loop). Builds FE `d78a699` · BE `5792a63` · agents `bab3047`.

**As an** Operator, **I want** to create and maintain a versioned catalog of **Formatos de Reel**, **so that** Strategy, Script, and Assembly agents use consistent structure and hints instead of ad-hoc prompts.

Ship **Playbook de formatos** (manual V1): Operator curates an evergreen catalog of **Formatos de Reel** in `neuramark_content_playbooks` with schema-validated payloads, Operator-only CRUD UI (EN/ES), seed formatos for V1 (tip rápido, antes/después, objeción, oferta local, mito vs realidad), and a server-only `getPlaybookForAgents()` contract for downstream agents. Weekly **Snapshot de tendencias** (US-16.2), Content Strategy jobs (US-4.1), and scraping-based Trend (P1) stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-16.1 (checked on CLOSE).

**This folder:** [`plan/stories/US-16.1/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · [`CONTRACT.md`](./CONTRACT.md) (frozen) · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-16.1-content-playbook`

**Depends on:** Fase 1 complete — [US-1.3](../US-1.3/) ✅ · [US-2.3](../US-2.3/) ✅ · [US-3.4](../US-3.4/) ✅ · [US-14.5](../US-14.5/) ✅ (`requireOperator()` gate). Runtime identity via `getCurrentUser()` / `requireActive()`.

**Unblocks:** [US-16.2](../US-16.2/) (Trend `formatos_playbook_compatibles[]` slug validation) · [US-4.1](../../USER_STORIES.md) (Strategy picks `formato_playbook_slug` per slot) · [US-5.1](../../USER_STORIES.md) (Script consumes `guion_hints` / `editing_hints`).

---

## Close verdicts

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | ALIGNED |
| SECURITY | APPROVE WITH CONDITIONS |
| CONTRACT | Frozen, Reviewed by FE (2026-08-29) |
| BUILD | FE `d78a699` · BE `5792a63` · agents `bab3047` |
| VALIDATION | PASS WITH NOTES |
| QA | APPROVE WITH NOTES (0 Critical, 0 High, 3 Low; CLOSE yes) |

**QA handoff (non-blocking):** add `/operator` + `/operator/:path*` `Cache-Control: no-store` in `next.config.ts`; isolated loader test for non-operator page gate; optional ESLint policy for `*.test.ts` `require()` mocks. Live Operator CRUD smoke against staging Supabase recommended before production deploy.

**Sprint 2b milestone:** **US-16.1 closes Playbook half of Sprint 2b.** Next: **US-16.2** — Publish weekly trend snapshot (manual).

---

## Scope in

| Area | What 16.1 adds |
|------|----------------|
| **FE** | Operator-only Playbook admin: list formatos; create/edit/archive; structured form for beats, hints, rubros, modalidades; empty/loading/error; EN/ES product copy using **Formato de Reel** / **Playbook de formatos** (CONTEXT). |
| **BE** | Zod schemas + Server Actions (or Route Handlers) for Operator CRUD; slug immutability; version bump on update; `getPlaybookForAgents()` minimal DTO (active only, no `ejemplo_referencia`); `requireOperator()` on all mutations and Operator reads. |
| **DB** | `neuramark_content_playbooks` with versioned JSON payload, `active` / `archived_at`; seed migration for five V1 formatos; RLS deny-by-default (service-role Node only). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-16.2 Trend snapshot** | Weekly tácticas, `getTrendSnapshotForWeek`, `cold-open-mejor-toma` seed — separate story. |
| **US-4.1 Strategy agent** | LLM job, weekly brief, slot assignment — consumes Playbook via `getPlaybookForAgents()` only. |
| **US-5.1 / US-9.x Script & Assembly** | Applying hints at generation time — downstream; this story owns catalog + contract. |
| **Trend scraping agent** | TASKS.md fase posterior; same schema later — not V1. |
| **Cliente-facing Playbook UI** | V1 Operator-only per SPEC; Cliente sees formato names on strategy brief later (US-4.1). |
| **Auth redesign** | Unchanged; Operator gate via `requireOperator()`. |

## Canonical terms (CONTEXT)

Use **Playbook de formatos**, **Formato de Reel**, **Operator**, **Cliente**, **Modalidad de producción** (referenced in `modalidades_recomendadas` only — assignment per slot is US-4.x).  
_Evitar:_ viral playbook, template library, trend tip, content template (as entity names).

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-14.5 | `requireOperator()` for Operator-only surfaces; deny-by-default routing. |
| US-2.3 | Pattern for server-only agent helpers (`getBusinessProfileForAgents`) — mirror for `getPlaybookForAgents`. |
| US-3.x | `modalidades_recomendadas` values align with Preferencias enum tokens (`own_avatar` \| `generic_avatar` \| `faceless`) — technical tokens in DB/JSON only. |

**US-16.1 adds Playbook persistence + Operator CRUD + agent read contract** — no generation jobs.
