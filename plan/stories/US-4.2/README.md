# US-4.2 — Review and adjust strategy before scripting

**Status:** CONTRACT — SPEC-REVIEW, SECURITY, and CONTRACT frozen; awaiting FE signoff before BUILD.

**As a** Operator, **I want** to edit the weekly brief, **so that** human judgment can correct AI planning.

Ship **Operator review workflow on top of US-4.1**: on `/operator/strategy`, Operator edits human-judgment fields on the **latest draft row** (themes, slot angles, CTA hints), **saves in place** (UPDATE same `version` — no new version on edit), then **Approves strategy** (`draft` → `approved` with `approved_by` / `approved_at`). Saves re-run Zod + playbook/trend/modalidad allowlist validation. **Generate / Regenerate** remains INSERT-only versioning per US-4.1. **Lock-after-scripts** deferred until `neuramark_reel_scripts` exists (US-5.1). **Cliente read** remains out of this sprint slice.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-4.2 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-4.2/`](./) — `README.md` · `TASKS.md` · *(gates: SPEC-REVIEW · SECURITY · CONTRACT · VALIDATION · QA)*.

**Branch:** `feature/US-4.2-strategy-approve` *(orchestrator sets on BUILD)*

**Depends on:** [US-4.1](../US-4.1/) ✅ generate + read draft · `neuramark_content_strategies` · `lib/contracts/content-strategy.ts` · `validateBriefAgainstAllowlists` · `/operator/strategy` · [US-14.5](../US-14.5/) ✅ `requireOperator()`.

**Unblocks:** [US-5.1](../../USER_STORIES.md) (Video Script Agent requires `approved` strategy row).

---

## Scope in

| Area | What US-4.2 adds |
|------|------------------|
| **FE** | Extend `/operator/strategy`: inline-editable **themes**, per-slot **angle**, per-slot **ctaHint** when latest row is `draft`; **Save changes** + **Approve strategy** CTAs; status badge (`draft` / `approved`); approval caption ("Approved by {name} · {date}"); field-level validation errors from server; disable edit/approve when latest row is `approved`; EN/ES copy. |
| **BE** | Operator-gated Server Actions: **update brief** (UPDATE `brief` jsonb on existing row by `strategyId`); **approve strategy** (state machine `draft` → `approved` only); `requireOperator("handler")` on all mutations; re-validate full brief (Zod + allowlists) before UPDATE; expose `approvedBy` / `approvedAt` (+ display name) on read; helper for US-5.1 to resolve approved row per `(clientId, weekStart)`. |
| **DB** | Migration: `approved_by uuid NULL FK neuramark_clients`, `approved_at timestamptz NULL` on `neuramark_content_strategies`; nullable until approved. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **New version on manual edit** | Edit = UPDATE same row; only **Generate / Regenerate** INSERTs `version + 1` (US-4.1 frozen). |
| **Edit approved rows** | `approved` rows immutable; Operator regenerates to create new `draft` if plan changes. |
| **Lock after scripts generated** | Requires `neuramark_reel_scripts` (US-5.1). **Deferred:** document hook point; no lock enforcement in US-4.2 V1. |
| **Cliente read-only brief** | SPEC mentions Cliente visibility; **deferred** to follow-on — this story is Operator edit/approve only. |
| **US-5.1** script generation | Downstream consumer; US-4.2 only gates it via `approved` status + lookup helper. |
| **Editable structural slot fields** | `formatoPlaybookSlug`, `modalidad`, `tacticaTendenciaSlug`, `goal`, `dayOfWeek`, `tema`, `pillars` — read-only in V1 edit UI; Operator regenerates or a future story expands edit surface. |
| **Strategy history list UI** | Latest row only (carry-forward US-4.1); history list optional follow-on. |
| **Hard delete / un-approve** | No `approved` → `draft` rollback in V1. |
| **Multichannel** | Instagram Reels only. |

## Canonical terms (CONTEXT)

Use **Estrategia semanal**, **brief**, **Operator**, **Cliente**, **Formato de Reel**, **Modalidad de producción**, **Táctica de tendencia**.  
_Evitar:_ content template, viral playbook, multichannel plan, generic "strategy doc".

## What US-4.1 already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-4.1 | `neuramark_content_strategies` table; `contentStrategyBriefSchema`; generate INSERT `status = draft`; latest-row read; `/operator/strategy` read-only brief view; rate limits on generate only. |
| US-4.1 CONTRACT | Regenerate = INSERT new version; never DELETE; `approved` enum value reserved; state machine sketch (`draft` → `approved` = US-4.2). |
| `lib/content-strategy/` | `validateBriefAgainstAllowlists`, `loadLatestStrategyRow`, `generateContentStrategy`, `getLatestContentStrategy`. |
| US-14.5 | `requireOperator()` on Operator routes and handlers. |

**US-4.2 adds in-place draft edit + approve transition + approval metadata** — no new agent job, no script rows.

## PO decisions frozen (2026-08-30)

1. **Edit target:** Latest row for `(clientId, weekStart)` when `status = 'draft'`; reject UPDATE if row is `approved` or not found / wrong tenancy.
2. **Edit persistence:** `UPDATE neuramark_content_strategies SET brief = $1, updated_at = now() WHERE id = $strategyId AND status = 'draft'` — **same `version`**, no INSERT.
3. **Editable fields (V1):** `brief.themes[]`, `brief.slots[].angle`, `brief.slots[].ctaHint` only. Server merges submitted partial into stored brief or accepts full brief envelope — CONTRACT freezes shape; server always validates **full** brief post-merge.
4. **Approve:** Separate Server Action; atomically `status = 'approved'`, `approved_by = getCurrentUser().id`, `approved_at = now()`; only when current status is `draft`; client cannot pass `status` in body.
5. **Read:** Extend latest-strategy view with `approvedBy` (id + displayName), `approvedAt` when `status = 'approved'`.
6. **Route:** Extend existing `/operator/strategy` — no new top-level route in V1.
7. **Regenerate vs approve:** If latest is `draft` v2 and v1 is `approved`, Operator may edit/approve v2; v1 remains historical. US-5.1 must consume **an** approved row for the week (CONTRACT defines: highest-version `approved`, or explicit `strategyId` — PO lean: latest row with `status = 'approved'` ORDER BY `version` DESC).
8. **Lock-after-scripts:** **Out of scope V1** — no `neuramark_reel_scripts` yet. SECURITY/CONTRACT note deferral to US-5.1+; optional config flag placeholder OK, enforcement not required.
9. **Identity:** Hardcoded dev operator (`Gabriel Vega`) satisfies AC "who approved" via `getCurrentUser().displayName`.
