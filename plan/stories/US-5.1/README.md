# US-5.1 — Generate Reel script package per slot

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 3 Medium, 3 Low; CLOSE yes). Build agents `a12cbc7` · BE `aa1c13e` · FE `18abc7e`.

**As a** System, **I want** each planned Reel to get hook, script, voiceover text, on-screen text, and CTA, **so that** video production has complete instructions.

Ship **Video Script Agent V1 (Operator-triggered)**: Operator triggers **Generate scripts** for an **approved** Estrategia semanal (batch all slots) or **Regenerate this Reel** for a single `slot_index`; server job composes inputs from `getApprovedStrategyForWeek`, `getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`, and `getProviderCatalog` + `resolveProvider({ assetRole: 'llm', llmVariant: 'fallback' })`; LLM output is schema-validated and persisted in `neuramark_reel_scripts`. Operator views script list per week with expandable hook/body/CTA/on-screen/VO and copy-to-clipboard. **`strategyHasScripts`** wired so US-4.2 lock-after-scripts engages. **Readability warnings (US-5.2), captions (US-6.x), weekly cycle automation, and Cliente script view** stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-5.1 (checked on CLOSE).

**This folder:** [`plan/stories/US-5.1/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-5.1-reel-scripts`

**Depends on:** [US-4.2](../US-4.2/) ✅ approve + `getApprovedStrategyForWeek` · [US-3.4](../US-3.4/) ✅ `visualModeSummary.mustDiscloseNotOwner` · [US-X.4](../US-X.4/) ✅ `llmVariant: 'fallback'` → `siliconflow_qwen` · [US-16.1](../US-16.1/) ✅ `getPlaybookForAgents()` · [US-16.2](../US-16.2/) ✅ `getTrendSnapshotForWeek()` · [US-14.5](../US-14.5/) ✅ `requireOperator()`.

**Unblocks:** [US-5.2](../../USER_STORIES.md) (on-screen/VO length warnings) · [US-6.1](../../USER_STORIES.md) (captions per script) · [US-7.1](../../USER_STORIES.md) (cost policy per Reel) · [US-9.x](../../USER_STORIES.md) (assembly consumes scripts).

---

## Close verdicts

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | ALIGNED (gaps closed in CONTRACT) |
| SECURITY | APPROVE WITH CONDITIONS |
| CONTRACT | Frozen 2026-08-30; Reviewed by FE (BUILD `18abc7e`) |
| BUILD | agents `a12cbc7` · BE `aa1c13e` · FE `18abc7e` |
| VALIDATION | PASS WITH NOTES (`f387659`) |
| QA | APPROVE WITH NOTES (0 Critical, 0 High, 3 Medium, 3 Low; CLOSE yes) |

**QA handoff (non-blocking, post-CLOSE):** M1 — rate limit fail-open on DB errors; M2 — batch partial-failure transaction alignment; M3 — `loadApprovedStrategyForScriptJob` week mismatch test gap; L1–L3 — logger mocks, IDOR edge tests, ops polish. **Next:** **US-5.2** preview script readability for vertical video.

---

## Scope in

| Area | What US-5.1 adds |
|------|------------------|
| **FE** | Operator-only **Scripts** workspace: `/operator/scripts` with `weekStart` picker; master list of Reels (title/tema, day, duration target, status); expand row or detail panel for hook, body, CTA, on-screen text, voiceover; copy-to-clipboard per field; **Generate scripts** (batch) when approved strategy exists; **Regenerate this Reel** per slot; empty/error/pending states; link or CTA from Strategy page when `approved`; EN/ES product copy (**Paquete de guion** / **guion**). |
| **BE** | Operator-gated Server Actions: batch generate all slots; single-slot regenerate; RSC loader for scripts list per week; server-only Video Script agent in `lib/agents/content/`; Zod script package schema; persist `neuramark_reel_scripts`; **[SEC]** verify strategy `approved` + `client_id` tenancy before agent; inject `mustDiscloseNotOwner` from profile only; wire `strategyHasScripts`; `requireOperator()` on trigger + reads. |
| **DB** | `neuramark_reel_scripts` (`strategy_id`, `slot_index`, `hook`, `body`, `cta`, `on_screen_text`, `voiceover_text`, `target_duration_sec`, audit timestamps); UNIQUE `(strategy_id, slot_index)`; FK `strategy_id` → `neuramark_content_strategies`; RLS deny-by-default. |
| **content-agents-engineer** | Agent prompt + I/O contract (`lib/contracts/reel-script.ts`); per-slot orchestration from approved brief slot + playbook `guion_hints` / `editing_hints` + trend táctica hints; LLM via `llmVariant: 'fallback'`; prompt-injection containment; reject malformed output before UPSERT. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-5.2** on-screen char warnings / VO word-count vs duration | Separate story; FE may show raw fields only in 5.1. |
| **US-6.x** captions | Downstream; no `neuramark_reel_captions` in this story. |
| **US-7.1** budget block before script generation | Use catalog tier + resolve only; no pre-job cost gate yet. |
| **Weekly cycle auto-script** | integrations-engineer (ADR-0001) — manual Operator trigger only in 5.1; system path documents dual-path deferral. |
| **Cliente script read** | Operator-only V1 per sprint slice; Cliente sees scripts in Approval flow (US-11.x). |
| **Operator free-text script edit** | Generated output read-only; regenerate per slot replaces row. |
| **B-roll beat columns / cold-open notes in DB** | SPEC mentions assembly hints; V1 DB columns frozen to USER_STORIES AC; hints inform prompt only. |
| **Video / TTS / assembly jobs** | US-8.x / US-9.x. |
| **Hard delete of script rows** | Regenerate UPSERTs same `(strategy_id, slot_index)`; history not required in V1. |

## Canonical terms (CONTEXT)

Use **Paquete de guion**, **Estrategia semanal**, **Formato de Reel**, **Modalidad de producción**, **Táctica de tendencia**, **Operator**, **Ficha viva**.  
_Evitar:_ content template, viral playbook, multichannel plan, generic "script doc".

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-4.1 | `neuramark_content_strategies`, brief schema, slot shape (`formatoPlaybookSlug`, `modalidad`, `tacticaTendenciaSlug`, `ctaHint`, `angle`, `tema`, `goal`). |
| US-4.2 | `getApprovedStrategyForWeek`, `strategyHasScripts` stub, `STRATEGY_LOCKED` error codes, dual-path approval gate doc, `isStrategyLockAfterScriptsEnabled()`. |
| US-3.4 | `getBusinessProfileForAgents` → `visualModeSummary.mustDiscloseNotOwner`; optional `buildGenericDisclosurePromptHint`. |
| US-16.1 | `getPlaybookForAgents()` — resolve `guion_hints`, `editing_hints`, `duracion_ideal_seg` per `formatoPlaybookSlug`. |
| US-16.2 | `getTrendSnapshotForWeek(weekStart)` — resolve táctica hints when `tacticaTendenciaSlug` set on slot. |
| US-X.4 | `resolveProvider(..., { assetRole: 'llm', llmVariant: 'fallback' })` → `siliconflow_qwen`. |
| US-4.1 agent pattern | `lib/agents/content/generate-weekly-strategy.ts` + orchestrator in `lib/content-strategy/` — mirror for reel scripts. |

**US-5.1 adds Video Script agent job + `neuramark_reel_scripts` persistence + Operator scripts UI** — no captions, no video jobs, no readability validation UI.

## PO decisions frozen (2026-08-30)

1. **Approval gate (Operator path):** Batch and single-slot actions require an **approved** strategy for `(clientId, weekStart)` via `getApprovedStrategyForWeek`; load row by `strategyId` and re-verify `status === 'approved'` and `client_id === session clientId` (defense-in-depth). Reject with `STRATEGY_NOT_APPROVED` when missing or draft-only.
2. **Dual-path (system/cron):** ADR-0001 auto-script path **deferred** to integrations-engineer; US-5.1 BUILD implements **Operator manual trigger only**. CONTRACT documents future `invokedBy: 'system'` gate without implementing cron.
3. **Table:** `neuramark_reel_scripts` with columns per USER_STORIES AC plus `id` (uuid PK), `client_id` (FK, denormalized for tenancy queries), `created_at`, `updated_at`. **UNIQUE `(strategy_id, slot_index)`**.
4. **Persistence:** **UPSERT** per slot on generate/regenerate (one row per slot per strategy). Batch generates **all** slots in approved `brief.slots[]`. Single-slot regenerate targets one `slotIndex` only.
5. **Duration:** `target_duration_sec` integer **15–45** inclusive (Zod + DB CHECK); agent prompt uses playbook `duracion_ideal_seg` as hint when present.
6. **Script fields (V1):** `hook`, `body`, `cta`, `on_screen_text`, `voiceover_text` — non-empty strings with CONTRACT max lengths; no HTML; plain text only.
7. **`must_disclose_not_owner`:** Read **`visualModeSummary.mustDiscloseNotOwner`** from `getBusinessProfileForAgents(clientId)` server-side; optional `buildGenericDisclosurePromptHint`; **never** accept from client body or trust LLM output for this flag.
8. **LLM routing:** `resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'fallback' })` per US-X.4 CONTRACT.
9. **Playbook/trend hints:** Per slot, resolve active formato from `formatoPlaybookSlug` and optional táctica from `tacticaTendenciaSlug`; inject `guion_hints` + `editing_hints` into prompt as untrusted delimited blocks (assembly consumes `editing_hints` later — not stored as separate DB columns in 5.1).
10. **`strategyHasScripts`:** Implement `EXISTS (SELECT 1 FROM neuramark_reel_scripts WHERE strategy_id = $1)`; enables US-4.2 brief lock when `NEURAMARK_STRATEGY_LOCK_AFTER_SCRIPTS !== 'false'` (default locked).
11. **Operator route:** **`/operator/scripts`** with `weekStart` query (ISO Monday); nav link in Operator shell. Strategy page shows CTA to scripts when approved strategy + scripts exist or pending generate.
12. **Auth:** `requireOperator("handler")` on generate actions; `requireOperator("page")` on scripts route. V1 session `clientId` only (no multi-client body `clientId`).
13. **Rate limit:** Per `client_id` debounce on batch generate — **PO lean:** reuse pattern from strategy (CONTRACT freezes window; lean 60s or shared agent rate-limit table).
14. **Idempotency:** Re-running batch **UPSERTs all slots** (refreshes every script). Single-slot regenerate UPSERTs one row only.
15. **Empty profile:** Reject script generation when `getBusinessProfileForAgents` returns `exists: false` or `visualModeSummary === null` (same as US-4.1).
