# US-10.1 — Run automated QA on script, caption, and video

**Status:** CONTRACT frozen (2026-08-30) — awaiting FE signoff; BUILD not started. Do **not** check off AC in `plan/USER_STORIES.md`.

**As a** System, **I want** compliance checks before client review, **so that** risky content is flagged early.

Ship **QA/Compliance Agent V1**: after branded Ensamblado is ready (`branding_status = completed`), run automated checks on the **Paquete de guion**, **caption de Instagram**, and production metadata for the linked Reel; persist a server-owned **Veredicto QA** in `neuramark_qa_reports`; surface pass/fail + severity on **`/operator/scripts`**; expose a DB-backed gate helper for **US-11.1** (approval reads status from DB only). Operator override UI / `qa_overrides` stay in **US-10.2**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-10.1 (do **not** check off in PREP).

**This folder:** [`plan/stories/US-10.1/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · [`CONTRACT.md`](./CONTRACT.md) (frozen; FE signoff pending).

**Branch:** `feature/US-10.1-automated-qa`

**Depends on:** [US-9.2](../US-9.2/) ✅ branded `assembled_reel` + `branding_status` · [US-6.1](../US-6.1/) ✅ `neuramark_reel_captions` · [US-3.4](../US-3.4/) ✅ `evaluateGenericAvatarNotOwnerCheck` + `QA_CHECK_SEVERITY` · [US-X.4](../US-X.4/) ✅ `resolveProvider` / `llm` catalog · [US-14.5](../US-14.5/) ✅ `requireOperator()` · [US-7.1](../US-7.1/) ✅ budget gate helpers (LLM spend).

**Upstream contracts:** [US-9.2 CONTRACT](../US-9.2/CONTRACT.md) (assembly row + branding handoff) · [US-6.1 CONTRACT](../US-6.1/CONTRACT.md) (caption row) · [US-3.4 CONTRACT](../US-3.4/CONTRACT.md) (generic-avatar check stub) · [US-X.4 CONTRACT](../US-X.4/CONTRACT.md) (LLM resolve) · [US-7.1](../US-7.1/) (`assertReelBudgetAllowsEstimatedSpend` / spend events).

**Unblocks:** [US-10.2](../../USER_STORIES.md) Operator override · [US-11.1](../../USER_STORIES.md) approval package gate (DB QA status only).

---

## Scope in

| Area | What US-10.1 BUILD adds |
|------|-------------------------|
| **FE (Operator)** | Extend **`/operator/scripts`** detail panel with a **QA** tab/panel: overall Veredicto QA badge; per-check pass/fail rows; **blocking** vs **overridable** severity badges; evidence / message keys (EN/ES); **Run QA** / **Re-run QA** action; pending/running/empty states. No override modal. |
| **BE** | Operator-gated **`runQaForAssembledReel({ assembledReelId })`** (CONTRACT freezes exact name); load script + caption + profile + assembly/branding prerequisites; orchestrate deterministic checks + LLM QA pass; persist `neuramark_qa_reports`; **no** client-supplied pass flag; export **`getQaGateStatusForAssembledReel(assembledReelId)`** (or CONTRACT name) for US-11.1 — reads DB only. |
| **DB** | **`neuramark_qa_reports`**: lean schema — `assembled_reel_id`, `checks` JSON, `status`, `created_at` (+ `id`, denormalized `client_id`, `updated_at` per house pattern). RLS deny-by-default. |
| **content-agents-engineer** | QA agent prompt + Zod I/O in `lib/agents/content/` (+ `lib/contracts/qa-report.ts` extend); LLM via **`resolveProvider({ assetRole: 'llm', llmVariant: 'default' })`**; delimited untrusted blocks; merge LLM check results with deterministic stubs. |
| **Implementers** | **content-agents-engineer** (LLM QA + check merge) + **nextjs-backend** (DDL, orchestration, gate helper, spend) + **nextjs-frontend** (Operator QA panel). **No** media-pipeline-engineer · **No** integrations-engineer in default BUILD. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-10.2** override modal, reason, `neuramark_qa_overrides`, append-only audit UI | Soft downstream — Phase A ships classification + fails that *would* be overridable; override handler rejects `blocking` in 10.2. |
| **US-11.1** Cliente approval package / decision UI | Consumes gate helper + report status only; no approval table writes here. |
| **Weekly cycle auto-QA cron** | integrations-engineer (ADR-0001) — document `invokedBy: 'system'` seam; V1 ships Operator trigger + auto-chain after branding. |
| **Vision / frame-level video LLM** | V1 “video” QA = branded assembly prerequisite + modality/consent/disclosure metadata — **no** frame OCR/vision model. |
| **New Operator route** | Extend `/operator/scripts` only (same pattern as Caption / branding panels). |
| **Cliente QA panel** | Operator-only V1; Cliente sees disclosure/gate outcomes in US-11.1. |
| **Client-editable check catalog** | Classification is code/config only ([SEC] AC). |
| **RBAC** beyond `requireOperator()` | Unchanged. |

## Canonical terms (CONTEXT)

Use **Veredicto QA**, **Ensamblado**, **Paquete de guion**, **caption de Instagram**, **Aprobación**, **Operator**, **Cliente**, **Avatar genérico profesional**, **disclosure**.  
_Evitar:_ “QA verdict” as product noun (use Veredicto QA); impersonation in Cliente copy; admin/staff.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-9.2 | `neuramark_assembled_reels` with `branding_status`, branded `output_media_asset_id`, `reel_script_id` FK — QA input when **`branding_status = completed`**. |
| US-6.1 | `neuramark_reel_captions` via `reel_script_id`; Caption tab on `/operator/scripts`. |
| US-5.1 | `neuramark_reel_scripts` package (hook, body, CTA, VO, on_screen_text, modalidad). |
| US-3.4 | `lib/qa/checks/generic-avatar-not-owner.ts` · `QA_CHECK_SEVERITY` · `lib/contracts/qa.ts` stub — **import, do not fork**. |
| US-3.2 | Consent ledger — deterministic **`own_avatar_consent`** check re-reads live consent when modalidad is own avatar. |
| US-X.4 | `resolveProvider(..., { assetRole: 'llm', llmVariant: 'default' })` → DeepSeek (same as strategy/caption). |
| US-7.1 | `assertReelBudgetAllowsEstimatedSpend` (+ spend event pattern) before LLM call. |
| US-2.3 | `getBusinessProfileForAgents` → `mustDiscloseNotOwner`. |
| US-8.3 | Manual upload still goes through QA — no special bypass. |

**US-10.1 adds Veredicto QA persistence + Operator panel + approval gate seam** — not override, not Cliente Aprobación UI.

---

## Phased BUILD (PO)

| Phase | Scope | Closes |
|-------|-------|--------|
| **A (US-10.1 BUILD — ship first)** | DDL `neuramark_qa_reports` · check catalog + severity map (code) · deterministic checks (consent, generic-avatar-not-owner, CTA presence, AI-disclosure flag, assembly prerequisite) · LLM checks (dangerous_claims, tone, clarity, ai_disclosure text, CTA quality assist) · Operator run + auto-chain after branding complete · QA panel on `/operator/scripts` · gate helper for US-11.1 · budget gate on LLM · [SEC] server-only verdicts | USER_STORIES § US-10.1 AC rows |
| **B (US-10.2 — explicit story)** | Override modal · `neuramark_qa_overrides` · reject `blocking` overrides · audit display on approval | USER_STORIES § US-10.2 |

**VALIDATION note (binding):** Phase A closes US-10.1 without shipping override. Failed **overridable** checks leave report `status` such that US-11.1 gate returns **not ready** until US-10.2 override or a re-run that passes. Failed **blocking** checks leave report **blocked** / failed with no Operator escape until content/consent is fixed and QA re-run.

---

## Upstream / downstream handoffs

| Direction | Artifact | Rule |
|-----------|----------|------|
| **From US-9.2** | `neuramark_assembled_reels.id` where `status = completed` **and** `branding_status = completed` | QA runs on **branded** output only |
| **From US-5.1 / US-6.1** | Script package + caption row via `reel_script_id` | Text + CTA inputs; missing caption → fail CTA / clarity-related checks or reject run (CONTRACT freezes) |
| **From US-3.4** | `evaluateGenericAvatarNotOwnerCheck` | Import stub; severity always `blocking` |
| **From US-X.4 / US-7.1** | Catalog LLM row + budget assert | Spend counted against Reel cumulative budget |
| **To US-10.2** | Report id + per-check `checkKey` + `severity` | Override targets one check on one report |
| **To US-11.1** | `getQaGateStatusForAssembledReel` → `{ ready, status, blockingFailures, … }` from **DB only** | Never accept client `passed` |

---

## PO decisions frozen (2026-08-30)

| # | Topic | Decision |
|---|-------|----------|
| 1 | **Check catalog keys (V1)** | Exact keys (code constants): `dangerous_claims`, `tone`, `clarity`, `ai_disclosure`, `cta_presence`, `generic_avatar_not_owner`, `own_avatar_consent`. USER_STORIES “avatar misuse” **=** `generic_avatar_not_owner` (US-3.4) — do not add a second key. |
| 2 | **Severity: `blocking`** | Legal / non-overridable (US-10.2 will 403): **`own_avatar_consent`** (missing/revoked when modalidad is own avatar), **`generic_avatar_not_owner`** (US-3.4). Classification lives in **`lib/qa/check-catalog.ts`** (or extend `check-classes.ts`) — **not** editable via any endpoint. |
| 3 | **Severity: `overridable`** | `dangerous_claims`, `tone`, `clarity`, `ai_disclosure`, `cta_presence`. Failures block Aprobación until pass on re-run **or** US-10.2 override. |
| 4 | **Hybrid check execution** | **Deterministic (no LLM):** `own_avatar_consent`, `generic_avatar_not_owner`, `cta_presence` (caption selected CTA or non-empty `cta_variants` / script CTA field — CONTRACT freezes exact input), assembly/branding prerequisite. **LLM-assisted:** `dangerous_claims`, `tone`, `clarity`, `ai_disclosure` (text evidence in script/caption/on_screen_text when synthetic avatar or TTS used). Agent may also propose CTA/clarity notes; server merges and re-applies severity from catalog. |
| 5 | **“Video” QA meaning** | **No vision model.** Video coverage = branded Ensamblado exists + modality/TTS/consent metadata. Frame OCR deferred out of V1. |
| 6 | **When QA runs** | **(a)** Operator **`runQaForAssembledReel({ assembledReelId })`** · **(b)** **Auto-chain** when branding transitions to `completed` (mirror US-9.2 auto-chain). Weekly cron deferred. Prerequisite fail → typed error / report not written as passed. |
| 7 | **UI surface** | **`/operator/scripts` QA panel** (TabView or Production/QA section in expand row) — **not** a new route. EN/ES `scripts.qa.*`. |
| 8 | **Schema lean** | **`neuramark_qa_reports`**: `id` uuid PK · `assembled_reel_id` FK (UNIQUE latest or one-row-per-run — **PO lean: one current report per assembled_reel via UNIQUE + UPSERT/replace on re-run**; history optional Phase B) · `client_id` denormalized · `checks` jsonb (array of `{ checkKey, status, severity, evidence? }`) · `status` text · `created_at` / `updated_at`. CONTRACT freezes enum: `pending` \| `running` \| `passed` \| `failed` \| `blocked`. **`blocked`** = any **blocking** check failed; **`failed`** = only overridable failures; **`passed`** = all checks pass. |
| 9 | **LLM routing** | `resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'default' })` — DeepSeek path (US-X.4 / US-6.1). |
| 10 | **Budget** | Before LLM call: **`assertReelBudgetAllowsEstimatedSpend`** (or sibling) using catalog cost model; record spend event on success; budget block → no partial “passed” report. Deterministic-only re-run path may skip LLM if CONTRACT allows cache — **PO lean: full re-run always re-invokes LLM** for simplicity unless SECURITY prefers fingerprint idempotency. |
| 11 | **Idempotency (PO lean)** | Re-run replaces current report row for `assembled_reel_id` (UPSERT). Optional fingerprint of inputs deferred; always allow Operator re-run. |
| 12 | **US-11.1 gate** | Helper reads **latest** `neuramark_qa_reports.status` (+ blocking/failed detail) from DB. **Ready for Aprobación** only when `status = 'passed'` **or** (future US-10.2) all failing overridable checks have valid overrides and no blocking failures. Phase A: ready **iff** `passed`. No request body may set QA status. |
| 13 | **Phase A vs US-10.2** | **10.1:** run, store, display, classify, gate helper. **10.2:** override mutation + audit table + approval-screen override visibility. Do not ship override endpoints in 10.1. |
| 14 | **Auth** | `requireOperator("handler")` on run QA + Operator reads. V1 session `clientId` only — no body `clientId`. |
| 15 | **Rate limit** | Reuse `neuramark_agent_rate_limits` with `agent_key: 'qa_run'` (CONTRACT name); mirror caption/script window. |
| 16 | **Module placement** | Agent: `lib/agents/content/run-reel-qa.ts` (or `generate-qa-report.ts`). Orchestration: `lib/qa/` (extend existing). Contracts: extend `lib/contracts/qa.ts` + report schemas. |
| 17 | **Implementers** | **content-agents-engineer** + **nextjs-backend** + **nextjs-frontend**. |

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian) — **GAPS** (intent aligned; SECURITY clear; CONTRACT freezes listed)
- [x] SECURITY.md (security-architect) — **APPROVE WITH CONDITIONS**
- [x] CONTRACT.md (nextjs-backend — frozen; Zod `lib/contracts/qa-report.ts`; **Reviewed by FE: pending**)
- [ ] BUILD (content-agents-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md

**Next gate:** FE reviews CONTRACT → “Reviewed by FE: yes” → BUILD.

---

## Open questions (for SECURITY / CONTRACT — not PO blockers)

| # | Question | PO lean |
|---|----------|---------|
| 1 | One report row UPSERT vs append-only history | **UPSERT one current** per `assembled_reel_id`; US-10.2 audit is override ledger, not full QA history. |
| 2 | Caption missing at QA time | **Reject run** with `CAPTION_REQUIRED` (or fail `cta_presence` + clarity) — CONTRACT picks one; prefer hard reject so Operator regenerates caption first. |
| 3 | Auto-chain failure UX | Branding stays `completed`; QA enqueue failure sets Operator-visible report `failed`/`pending` + log — does not revert branding. |
| 4 | LLM returns severity | **Ignore agent severity** — server overwrites from check catalog (code). |

---

## SPEC alignment / blockers for spec-guardian

| Item | Assessment |
|------|------------|
| SPEC S3.M11 post-ensamblado → QA → Aprobación | **Aligned** — trigger after branding complete. |
| SPEC auto en ciclo | **Soft gap** — V1 Operator + auto-chain; weekly cron = integrations later (same pattern as 6.1/9.2). Not a PREP blocker. |
| SPEC checks (tono, claims, claridad, CTA, disclosure IA, avatar) | **Aligned** via frozen keys; consent added as legal blocking (SECURITY_BASELINE / US-10.2). |
| Vision QA on video frames | **Out** — escalate only if product insists on frame LLM; PO freezes metadata + text. |
| Override | **US-10.2** — no SPEC conflict. |
