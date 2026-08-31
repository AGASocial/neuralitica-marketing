# QA Report — US-8.5 Wan B-roll adapter

**Story:** US-8.5 — Wan B-roll adapter (low tier, P0)  
**Scope:** Phase A (real `siliconflow_wan21_turbo` adapter + registry) + Phase B (`createBrollVideoJobs`, per-clip budget, graceful degrade, retry parity)  
**Branch:** `feature/US-8.5-wan-broll-adapter`  
**Commit reviewed:** `f7cf726` — US-8.5: Wan B-roll adapter + orchestrator + graceful degrade  
**Prior validation:** PASS WITH NOTES (`plan/stories/US-8.5/VALIDATION.md`)  
**Reviewer:** qa-engineer  
**Date:** 2026-08-31  
**Sources:** `VALIDATION.md`, `SECURITY.md`, `CONTRACT.md`, `lib/providers/video/siliconflow-wan21-turbo-adapter.ts`, `lib/video-jobs/create-broll-video-jobs.ts`, `lib/contracts/siliconflow-wan21-turbo.ts`, `lib/media/get-broll-reference-still-asset-for-client.ts`, `lib/video-jobs/actions/{create-broll-video-jobs,retry-video-job}.ts`

### Verdict: APPROVE WITH CONDITIONS

**Severity counts:** Critical **0** · High **1** · Medium **2** · Low **3**

Adapter + orchestrator meet CONTRACT/SECURITY floors for keys, SSRF allowlist, normalizers, per-clip budget, `asset_role = broll` tenancy, and primary independence. **Merge/CLOSE blocked on H1** (Server Action auth-gate bypass). Fix H1 before production exposure of `createBrollVideoJobs`.

---

## Findings

### High

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **H1** | `lib/video-jobs/actions/create-broll-video-jobs.ts:1-3` + `create-broll-video-jobs.ts:97-99` | Thin `"use server"` re-export exposes the full `createBrollVideoJobs(rawInput, options?)` signature. A client can pass `options.operatorClientId` and **skip `requireOperator()`**, then satisfy `input.clientId === operator.id` with the same UUID. | Elevates US-8.4’s Low “options skip requireOperator” pattern: that path was only reachable from already-authenticated `retryVideoJob`. Here the bypass is a **callable Server Action**, enabling non-operators (and any caller who knows a `clientId` + `reelScriptId`) to create paid Wan jobs and burn `SILICONFLOW_API_KEY` quota / Reel budget. Violates SECURITY conditions 7/12 and CONTRACT gate order step 1. | Wrap a **narrow** Server Action that accepts only `{ reelScriptId, clientId }`, always calls `requireOperator("handler")`, and never forwards client-supplied `options`. Keep `options` on an internal (non-exported) helper used only by `retry-video-job.ts`. Optionally assert `requireOperator().id === options.operatorClientId` on any remaining internal skip. |

### Medium

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **M1** | `lib/media/get-broll-reference-still-asset-for-client.ts:25-28` | `_reelScriptId` is unused; resolver never prefers script-linked / package still (CONTRACT priority 1). Falls through to client-wide `cover_frame` → `client_logo` → `avatar_reference`. | Contract divergence: wrong still may be sent to Wan I2V (brand mismatch). Fail-closed still works when no owned image MIME exists. | Resolve script/package cover still for `reelScriptId` first (parameterized `(client_id, reel_script_id)`), then fall back to current priority list. |
| **M2** | `lib/video-jobs/create-broll-video-jobs.ts:266-318` | Per-clip flow is not atomic: `adapter.createJob` (vendor spend) → DB INSERT → `recordReelSpendEvent`. Insert or spend failure after successful `createJob` leaves orphaned SiliconFlow work and/or a job row without a spend event. | Ledger / budget drift; silent vendor spend without Operator-visible job. Graceful degrade still holds for primary. | Prefer insert-queued-then-create, or compensating mark + spend reconciliation; at minimum log `externalJobId` on insert failure and avoid counting success. |

### Low

| ID | Location | Issue | Why it matters | Fix direction |
|----|----------|-------|----------------|---------------|
| **L1** | `lib/providers/normalize-provider-response.ts:83-117` | `validateProviderOutputUrl` relies on allowlist only; no explicit reject of IP-literals / `localhost` / `.local` called out in CONTRACT. | Defense-in-depth only — current `WAN_ALLOWED_OUTPUT_HOSTS` does not include those hosts, so practical SSRF risk is low. | Add explicit hostname checks before allowlist match (shared helper used by all adapters). |
| **L2** | `WAN_REFERENCE_STILL_MISSING_MESSAGE_KEY` / `messages/*.json` | `scripts.broll.failure.referenceStillMissing` is returned but **missing** from EN/ES message catalogs (VALIDATION note). | Non-blocking while FE is N/A; Operator UI will show a raw key when preview lands. | Add EN/ES keys when FE surfaces B-roll errors. |
| **L3** | `get-broll-reference-still-asset-for-client.ts:27`; adapter `_kind` | ESLint unused-param warnings on US-8.5 files (`--max-warnings 0` fails). | Hygiene / CI noise; not a security defect. | Prefix-only is already used; silence via omit or void, or wire `reelScriptId` (see M1). |

---

## SECURITY control verification (12 conditions)

| # | Condition | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Anti–API-key-leakage | **PASS** | Key via `process.env[WAN_ENV_KEY_NAME]` only in adapter (`siliconflow-wan21-turbo-adapter.ts:82-90`); Bearer header; degrade logs use `sanitizeProviderErrorMessage` (`create-broll-video-jobs.ts:328-334`); tests adapter #2/#6, create-broll #12 |
| 2 | Anti–SSRF (output) | **PASS** | `WAN_ALLOWED_OUTPUT_HOSTS` + `validateProviderOutputUrl` in `getJobStatus` / `fetchAsset` / download redirects; adapter test #5 |
| 3 | Anti–SSRF (input) | **PASS** | Owned UUID still → `resolveMediaAssetUrlForProvider` (tenant + MIME); client `image_url` ∈ forbidden keys; no absolute image URL posted from client body |
| 4 | Anti–untrusted-response | **PASS** | `normalizeVideoJobStatusResult(..., WAN_ALLOWED_OUTPUT_HOSTS)`; `parseExternalJobId`; status aliases include Wan vendor strings |
| 5 | Anti–CDN-as-canonical | **PASS** | `fetchAsset` → `uploadGeneratedVideoBuffer` flat `{uuid}.mp4`; poller passes job context (`persist-video-job-output.ts:12-16`) |
| 6 | Anti–budget-bypass | **PASS** | `estimateCost` 21¢/`per_clip`; `assertReelBudgetAllowsEstimatedSpend` before each `createJob`; max 8 clips; tests #3/#5/#6 |
| 7 | Anti–provider smuggling | **PASS** *(boundary)* / **FAIL** *(action)* | Request schema strict `{ reelScriptId, clientId }` + `FORBIDDEN_VIDEO_JOB_AUTHORITY_KEYS` — **but** H1 bypasses Operator gate via Server Action `options` |
| 8 | Anti–prompt authority | **PASS** | `buildWanBrollPrompt` + beat delimiters; `prompt` forbidden on request; adapter requires non-empty server prompt |
| 9 | Anti–degrade primary coupling | **PASS** | Clip failures → `skipped`; never updates primary; tests #6/#7/#10 |
| 10 | Anti–degrade secret leak | **PASS** | Sanitized log + closed skip codes; test #12 |
| 11 | Anti–`asset_role` / tenancy | **PASS** | INSERT `asset_role: "broll"` + `client_id`; adapter `videoAssetRole: "broll"`; retry inherits broll + Wan (`retry-video-job.ts:265-284`); test #8/#11 |
| 12 | Anti–module-leak | **PASS** *(modules)* / **CONDITIONAL** *(action)* | `import "server-only"` on adapter + orchestrator; registry real adapter (no stub id); poll-only (no webhook). **H1** undermines Operator-only write surface |

---

## CONTRACT compliance (summary)

| Item | Status |
|------|--------|
| Real Wan adapter; registry estimate **21**; no stub production path | **PASS** |
| SiliconFlow submit/status URLs, model id, Bearer, duration clamp 3–5s | **PASS** |
| Phase B `createBrollVideoJobs`; N `broll` jobs; clip cap 8 | **PASS** |
| Poller status query not primary-only | **PASS** (`poll-video-job-until-terminal.ts:84-89`) |
| Retry unlock for broll parents | **PASS** |
| Flat storage keys | **PASS** |
| Reference still priority 1 (script-linked) | **PARTIAL** — see **M1** |
| FE preview / stitch / webhook / `ltx_broll_high` | **N/A** (out of scope) |

---

## Back-door / leakage sweep

| Check | Result |
|-------|--------|
| Hardcoded credentials beyond sanctioned local user | **None** |
| `NEXT_PUBLIC_*` SiliconFlow / adapter secrets | **None** |
| `@supabase/supabase-js` in Client Components for this story | **None** |
| Undocumented Wan webhook Route Handler | **None** |
| `eval` / dynamic code in Wan path | **None** |
| Stub still imported by production registry | **None** (file may remain on disk; unused) |

---

## Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/providers/video/siliconflow-wan21-turbo-adapter.test.ts lib/video-jobs/create-broll-video-jobs.test.ts lib/providers/provider-adapters.test.ts` | **39 pass / 0 fail** |
| `npx eslint` on US-8.5 source files (`--max-warnings 0`) | **Fail** — 2 unused-param warnings (L3) |
| `npx tsc --noEmit` | **Pre-existing** errors in unrelated test files (agents/assembly); no new Wan-adapter type errors observed in reviewed files |
| Manual review vs SECURITY 12 conditions + CONTRACT gate order | Completed (see tables) |

---

## What Was Not Covered

- Live SiliconFlow HTTP (CONTRACT: mocked CI only).
- Fly worker poller E2E with a real Wan job row + CDN host observation (allowlist may need extension after first live delivery).
- Concurrent multi-clip create races under real Supabase.
- FE Operator preview (deferred; Reviewed by FE: N/A).
- Full `npm run build` (tsc already noisy from unrelated suites).

---

## Must-fix before CLOSE

1. **H1** — Do not re-export `createBrollVideoJobs` with client-reachable `options`. Narrow Server Action + always `requireOperator`.

## Recommended follow-ups (non-blocking for H1)

2. **M1** — Honor script-scoped reference still priority.  
3. **M2** — Harden create/insert/spend failure recovery.  
4. **L2** — Add EN/ES for `scripts.broll.failure.referenceStillMissing` when FE lands.

---

## Gate summary

| Field | Value |
|-------|--------|
| **Verdict** | **APPROVE WITH CONDITIONS** |
| **Critical / High** | 0 Critical · **1 High (H1)** |
| **Close / merge** | **No** until H1 fixed |
| **Next** | Implementer fixes H1 → quick QA re-check of Server Action wrapper → then CLOSE |
