Reviewed by FE: **approved**

# API Contract — US-8.9 Operator B-roll generate UI (P1)

**Story:** US-8.9  
**Status:** Frozen — 2026-08-31 (Spec Guardian)  
**Security:** `plan/stories/US-8.9/SECURITY.md` (APPROVE WITH CONDITIONS — reconciled below; **10** conditions)  
**Spec review:** `plan/stories/US-8.9/SPEC-REVIEW.md` (ALIGNED — High/Medium BUILD blockers closed below)  
**Depends on:** US-8.5 ✅ `createBrollVideoJobs` + Wan · US-8.8 ✅ LTX high tier · US-8.4 ✅ `/operator/scripts` + job refresh · US-8.7 ✅ `HeygenGenerateControl` / `HeygenGenerateConfirmDialog` pattern · US-7.1 ✅ budget · US-7.2 ✅ tier routing · US-5.1 ✅ `broll_beats` / faceless  
**ADR:** ADR-0001 (no cron change) · ADR-0002 (no IG publish) · ADR-0003 (no FFmpeg / long poll on Vercel — create/enqueue only; Fly poller unchanged)  
**Feature branch:** `feature/US-8.9-broll-operator-generate-ui`

**This document is CONTRACT ONLY.** Zod mirrors live in `lib/contracts/video-job.ts` (extend preview success `providerKey`). **Single-phase BUILD** ships `previewBrollVideoJobsEstimate` + FE control/dialog + EN/ES i18n + security tests. **No** adapter changes. **No** orchestrator logic fork (shared-helper extraction only). **No** DB migrations.

**Terminology:** **provider adapter** · **provider key** · **provider tier** · **asset role (`broll`)** · **graceful degrade** · **needs_broll** · **Job de generación** · **B-roll / sin presencia** · **Video sin rostro** · **Operator** · **Cliente** · **Paquete de guion** · **Política de costo**. Technical enums (`faceless`, `siliconflow_wan21_turbo`, `ltx_broll_high`, `queued`) OK in code. Do **not** use CONTEXT _Evitar_ terms in product-facing strings (`admin`, `faceless` in ES UI, `generation job`, etc.).

---

## SPEC-REVIEW blocking gaps closed

| # | Gap | Resolution |
|---|-----|------------|
| 1 | No US-8.9 CONTRACT.md | This document |
| 2 | Preview action unimplemented; Wan-only `providerKey` | § Preview action + § Zod — union Wan \| LTX |
| 3 | In-flight detection open | § In-flight — preview queries server-side; hide via `blockedReasonKey` |
| 4 | Blocked vs hidden | § Visibility — **default hide** when `blockedReasonKey` or `!needsBroll` |
| 5 | Partial skip toast | § Create success handling + FE toast |
| 6 | i18n `referenceStillMissing` gap | § i18n key table |
| 7 | Do not copy HeyGen create body | § Create path — `{ reelScriptId, clientId }` only (no `confirmEstimateCents`) |
| 8 | Shared estimate vs duplicate math | § Shared preview helper |
| 9 | FE props / placement | § FE contract |
| 10 | SECURITY 10 conditions | § SECURITY reconciliation |

---

## SECURITY reconciliation (binding — 10 conditions)

| # | SECURITY condition | **Frozen in this contract** |
|---|-------------------|----------------------------|
| 1 | Anti–non-operator-abuse | `requireOperator("handler")` first on preview; create regression intact; Cliente **403** |
| 2 | Anti–authority-smuggling | `findForbiddenVideoJobKeys` + `.strict()` preview/create; add `operatorClientId` / `operator_client_id` to forbidden set if missing; FE submit narrow body only |
| 3 | Anti–IDOR | Preview + create: `clientId === operator.id`; scoped `loadReelScriptForVideoJob` → `NOT_FOUND` |
| 4 | Anti–client-cost-authority | Estimate + `providerKey` from preview DTO only; create re-runs gates |
| 5 | Anti–preview-over-exposure | Closed success schema; no prompts / still URLs / vendor secrets; i18n `blockedReasonKey` only |
| 6 | Anti–tier-floor-bypass | Preview `providerKey` via `resolveProviderForJob` + `isAllowedBrollProviderPair`; low → Wan only; high → LTX when active |
| 7 | Anti–in-flight-bypass | Preview detects broll `queued`/`processing`; FE hides |
| 8 | Anti–orchestrator-fork | Shared estimate/policy helper with `createBrollVideoJobs` — no duplicate FE math |
| 9 | Anti–create-surface-expansion | `createBrollVideoJobs` action signature unchanged; no browser `options` |
| 10 | Anti–module-leak | `"use server"` / `server-only` helpers; security test matrix |

---

## Overview — BUILD scope

| # | Surface | Kind | Owner |
|---|---------|------|-------|
| 1 | `previewBrollVideoJobsEstimate` Server Action | New | **BE** |
| 2 | Shared B-roll estimate helper (extract/thin-wrap from orchestrator) | New / minimal refactor | **BE** |
| 3 | Extend `previewBrollVideoJobsEstimateSuccessSchema` `providerKey` union | Modified | **BE** |
| 4 | Optionally add `operatorClientId` to forbidden authority keys | Modified | **BE** |
| 5 | `BrollGenerateControl` + `BrollGenerateConfirmDialog` | New | **FE** |
| 6 | Wire into `ScriptsPageView` + `onBrollGenerateSuccess` | Modified | **FE** |
| 7 | EN/ES `scripts.broll.generate.*` + failure keys | Modified | **FE** |
| 8 | Preview + create regression tests | New / modified | **BE** |

**Forbidden surfaces (BUILD veto):**

- New Wan / LTX adapter logic or catalog migrations.
- Expanding `createBrollVideoJobs` request body (`confirmEstimateCents`, `options`, `provider_key`, `clipCount`, prompts, still ids).
- Cliente-facing B-roll trigger or routes.
- B-roll job status panel / list for `asset_role = broll` (defer).
- Assembly / stitch UI changes (US-9.1 ✅).
- PLAN F7 cron / weekly automation.
- FFmpeg / long poll on Vercel (ADR-0003).
- IG publish paths (ADR-0002).
- Client-side cost math or provider picker.
- Preview DTO fields: prompts, beat text, reference still id/url, vendor raw errors, API keys.

---

## Frozen decisions (do not reopen)

| # | Topic | Freeze |
|---|-------|--------|
| 1 | Page | `/operator/scripts` — `ScriptsPageView` per Reel row |
| 2 | Pattern | Mirror `HeygenGenerateControl` / `HeygenGenerateConfirmDialog` structure — **not** HeyGen submit fields |
| 3 | Preview action | `previewBrollVideoJobsEstimate` — Operator-only |
| 4 | Create action | Existing `createBrollVideoJobs` — **unchanged** `{ reelScriptId, clientId }` |
| 5 | Providers | Policy-only: `siliconflow_wan21_turbo` (low) · `ltx_broll_high` (high, active) |
| 6 | Visibility | Show iff preview `needsBroll && providerKey && !blockedReasonKey` |
| 7 | Blocked UX | **Hide** control (match HeyGen ineligible) — no disabled+tooltip in V1 |
| 8 | In-flight | Preview queries `neuramark_video_jobs` server-side — not SC props |
| 9 | Cost confirm | Preview display only — **no** `confirmEstimateCents` on create |
| 10 | Clip count | Server `clampWanClipCount` / same max **8** as US-8.5 |
| 11 | Unit costs | Wan **21¢**/clip · LTX **126¢**/clip (catalog / constants) |
| 12 | Partial success | Toast created vs skipped; non-blocking; primary untouched |
| 13 | Consent | **Not** required for B-roll |
| 14 | DB | None |
| 15 | i18n | `scripts.broll.generate.*` + `scripts.broll.failure.referenceStillMissing` + `scripts.broll.blocked.*` |

---

## Preview action — `previewBrollVideoJobsEstimate`

**File (BUILD):** `lib/video-jobs/actions/preview-broll-video-jobs-estimate.ts` (`"use server"`)  
**Core (optional split):** `lib/video-jobs/preview-broll-video-jobs-estimate.ts` (`import "server-only"`) — same pattern as HeyGen re-export from `actions/create-heygen-talking-head-video-job.ts`.

**Export name:** `previewBrollVideoJobsEstimate(rawInput: unknown)`

### Gate order (binding)

| Step | Action |
|------|--------|
| 1 | `requireOperator("handler")` first → `UNAUTHENTICATED` / `FORBIDDEN` |
| 2 | `findForbiddenVideoJobKeys(rawInput)` → any hit → `FORBIDDEN_FIELDS` |
| 3 | Parse `previewBrollVideoJobsEstimateRequestSchema` (`.strict()`) → fail → `VALIDATION_ERROR` |
| 4 | `input.clientId !== operator.id` → `FORBIDDEN` (**IDOR — stricter than HeyGen preview; required here**) |
| 5 | `loadReelScriptForVideoJob({ reelScriptId, clientId })` → miss → `NOT_FOUND` |
| 6 | Shared estimate helper (below) |
| 7 | In-flight broll check (below) |
| 8 | Return closed success DTO via `previewBrollVideoJobsEstimateSuccessSchema.parse(...)` |

Preview is **presentation-only**. Create **must not** trust preview as a capability token — `createBrollVideoJobs` re-executes policy, still, budget, provider availability.

### Request (frozen)

```ts
previewBrollVideoJobsEstimateRequestSchema = z
  .object({
    reelScriptId: z.string().uuid(),
    clientId: z.string().uuid(),
  })
  .strict();
```

**Forbidden on request (non-exhaustive — full set via `findForbiddenVideoJobKeys`):**  
`provider_key` / `providerKey` / `tier` / `providerTier` / `prompt` / `clipCount` / `estimatedCostCents` / `operatorClientId` / `operator_client_id` / still URLs / absolute `image_url` / cost drivers.

**BUILD:** Ensure `operatorClientId` and `operator_client_id` are in the forbidden scan set used by preview (and create regression) so they yield **`FORBIDDEN_FIELDS`**, not only Zod `VALIDATION_ERROR`.

### Success schema (extend — binding)

```ts
previewBrollVideoJobsEstimateSuccessSchema = z
  .object({
    ok: z.literal(true),
    estimatedCostCents: z.number().int().nonnegative(),
    unitCostCentsPerClip: z.number().int().nonnegative(),
    clipCount: z.number().int().nonnegative(),
    needsBroll: z.boolean(),
    providerKey: z
      .enum(["siliconflow_wan21_turbo", "ltx_broll_high"])
      .optional(),
    blockedReasonKey: z.string().optional(),
  })
  .strict();
```

| Field | Rule |
|-------|------|
| `estimatedCostCents` | `unitCostCentsPerClip * clipCount` from adapter/catalog path — **0** when blocked / `!needsBroll` |
| `unitCostCentsPerClip` | Wan **21** or LTX **126** from shared constants / adapter estimate for 1 clip |
| `clipCount` | Same clamp as orchestrator (max **8**); **0** when `!needsBroll` or blocked before count |
| `needsBroll` | Same `isFacelessNeedsBroll` rule as `createBrollVideoJobs` |
| `providerKey` | Present only when eligible (policy + allowlist OK); omit when blocked / not needed |
| `blockedReasonKey` | i18n key string only — see catalog below |

**Never in success DTO:** prompts, beat text, reference still id/url, vendor error bodies, env key names, stack traces, `eligible` / `eligibilityPath` (HeyGen-specific — do not invent parallel path enum for B-roll).

### Error envelope

Reuse `videoJobMutationErrorSchema` / `videoJobMutationError` — same as HeyGen preview.

| Code | When |
|------|------|
| `UNAUTHENTICATED` / `FORBIDDEN` | Non-operator / forged `clientId` |
| `FORBIDDEN_FIELDS` | Authority keys on body |
| `VALIDATION_ERROR` | Schema fail |
| `NOT_FOUND` | Unknown / cross-tenant reel |
| `INTERNAL_ERROR` | Unexpected |

Provider/still/budget soft blocks return **success** with `blockedReasonKey` (hide control) — not hard mutation errors — so FE can silently hide without error toast on eligibility poll.

---

## Shared preview helper (anti–orchestrator-fork)

**Preferred location:** extract shared pieces used by both `createBrollVideoJobs` and preview into `lib/video-jobs/broll-estimate-shared.ts` (`import "server-only"`), **or** export thin wrappers from `create-broll-video-jobs.ts` without changing create behavior.

**Must reuse (same semantics as create):**

| Concern | Source of truth |
|---------|-----------------|
| `needsBroll` | `isFacelessNeedsBroll({ visualMode, modalidad, brollBeatCount })` |
| Beat texts / clip count | `resolveBeatTexts` + `clampWanClipCount` (max 8) |
| Provider | `resolveProviderForJob({ assetRole: "broll", productionContext: { needsBroll: true, … } })` |
| Pair allowlist | `isAllowedBrollProviderPair(providerKey, providerTier)` |
| Reference still | `getBrollReferenceStillAssetForClient` — null → blocked |
| Unit cost | Adapter `estimateCost` for 1 clip **or** `WAN_UNIT_COST_CENTS_PER_CLIP` / `LTX_UNIT_COST_CENTS_PER_CLIP` matching create defaults |
| Total estimate | `unitCostCentsPerClip * clipCount` |

**Preview must not:** call `adapter.createJob`, INSERT jobs, record spend, or enqueue poll.

**Minimal create refactor allowed:** extract shared functions only — no behavior change to create success/skip paths.

---

## In-flight broll detection

**Where:** inside preview action / shared helper (server) — **not** Server Component props as sole authority.

**Query (binding):**

```ts
// neuramark_video_jobs
.eq("client_id", clientId)
.eq("reel_script_id", reelScriptId)
.eq("asset_role", "broll")
.in("status", ["queued", "processing"])
.limit(1)
```

| Result | Preview behavior |
|--------|------------------|
| ≥1 row | Success with `blockedReasonKey: "scripts.broll.blocked.jobInFlight"`; omit `providerKey` or leave estimate optional zeros; FE **hides** |
| 0 rows | Continue eligibility |

FE may also pass a soft `brollJobInFlight` prop later — **non-authoritative**; preview remains source of truth.

**Create race:** TOCTOU accepted (SECURITY residual). Orchestrator per-clip budget + clip cap remain authoritative. FE disables confirm while `pending`.

---

## Visibility matrix (FE + preview)

| Condition | Show “Generate B-roll”? |
|-----------|-------------------------|
| Faceless / needs_broll + policy Wan (low) + still OK + no in-flight | **Yes** (`providerKey: siliconflow_wan21_turbo`) |
| Faceless / needs_broll + policy LTX (high, active) + still OK + no in-flight | **Yes** (`providerKey: ltx_broll_high`) |
| `needsBroll: false` | **No** (silent) |
| In-flight broll `queued`/`processing` | **No** (`jobInFlight`) |
| Missing reference still | **No** (`referenceStillMissing`) |
| Provider unavailable / inactive / disallowed pair | **No** (`providerUnavailable`) |
| Optional: budget cannot fund **any** clip (1× unit) | **No** (`budgetExceeded`) — soft check; create still authoritative |
| Preview mutation error (403/404/…) | **No** (hide; no eligibility toast) |
| Non-operator session | **No** (page gated; preview/create **403**) |

**Show rule (code):**

```ts
result.ok &&
result.needsBroll === true &&
result.providerKey != null &&
result.blockedReasonKey == null
```

---

## `blockedReasonKey` catalog (i18n keys only)

| Key | When |
|-----|------|
| `scripts.broll.blocked.jobInFlight` | B-roll job queued/processing |
| `scripts.broll.blocked.referenceStillMissing` | Still resolver null (alias ok with failure key for create errors) |
| `scripts.broll.blocked.providerUnavailable` | Policy/allowlist/adapter fail |
| `scripts.broll.blocked.budgetExceeded` | Soft: cannot fund 1 clip |

Create path continues to return `BROLL_REFERENCE_STILL_MISSING` with `messageKey: scripts.broll.failure.referenceStillMissing` (US-8.5) — FE maps both blocked + failure keys.

---

## Create path — unchanged `createBrollVideoJobs`

**Action:** `lib/video-jobs/actions/create-broll-video-jobs.ts` — **no signature change**.

**FE submit body (only):**

```json
{
  "reelScriptId": "<uuid>",
  "clientId": "<uuid>"
}
```

**Do not send:** `confirmEstimateCents`, `provider_key`, `tier`, `clipCount`, `prompt`, still ids, `options`, `operatorClientId`, duration.

**Success handling (FE):**

| Field | UX |
|-------|-----|
| `createdCount > 0` && `skippedCount === 0` | Toast `scripts.broll.generate.toastSuccess` (with count if desired) |
| `createdCount > 0` && `skippedCount > 0` | Toast success + non-blocking warn with localized skip reasons |
| `createdCount === 0` && `skippedCount > 0` | Error/warn toast — localized from `skipped[].reasonCode` / `messageKey` |
| `skippedNoNeedsBroll: true` | Should not happen if button shown; treat as hide + soft message |

**Skip reason → copy map:**

| `reasonCode` | Prefer `messageKey` else copy |
|--------------|-------------------------------|
| `BUDGET_EXCEEDED` | `scripts.broll.generate.errors.budgetExceeded` / skip toast |
| `PROVIDER_UNAVAILABLE` | `scripts.broll.generate.errors.providerUnavailable` |
| `VALIDATION_ERROR` | `scripts.broll.generate.errors.validation` |
| `INTERNAL_ERROR` | `scripts.broll.generate.errors.internal` |

After success: call `onBrollGenerateSuccess` — mirror `onHeygenGenerateSuccess` (router refresh / reload video jobs).

---

## FE contract — Reviewed by FE required

**Host:** `/operator/scripts` expand row in `ScriptsPageView` / Reel detail panel.

**Placement (binding):** After voiceover panel and **`HeygenGenerateControl`**, before **`OperatorVideoJobSummaryPanel`** (primary job summary). Only meaningful for faceless + B-roll beats — visibility still server-driven.

### Components

| File | Role |
|------|------|
| `components/scripts/BrollGenerateConfirmDialog.tsx` | PrimeReact `Dialog`; load preview on open; confirm → `createBrollVideoJobs` |
| `components/scripts/BrollGenerateControl.tsx` | Eligibility `useEffect` → preview; hide when ineligible; opens dialog |

May colocate both in one module (HeyGen pattern: control + dialog in `HeygenGenerateConfirmDialog.tsx`) — either is fine if exports match.

### `BrollGenerateConfirmCopy` (props shape)

```ts
export type BrollGenerateConfirmCopy = {
  button: string;
  title: string;
  confirm: string;
  cancel: string;
  loading: string;
  loadError: string;
  estimated: string;
  clipCount: string;       // label for clip count row
  providerLabel: string;   // "Provider" label
  providerWan: string;     // display for siliconflow_wan21_turbo
  providerLtx: string;     // display for ltx_broll_high
  ineligible: string;
  toastSuccess: string;
  toastPartial: string;    // created + skipped
  toastSkippedAll: string;
  errors: {
    unauthenticated: string;
    forbidden: string;
    notFound: string;
    validation: string;
    forbiddenFields: string;
    budgetExceeded: string;
    providerUnavailable: string;
    referenceStillMissing: string;
    brollUnavailable: string; // BROLL_PROVIDER_UNAVAILABLE / BROLL_REFERENCE_STILL_MISSING
    internal: string;
  };
};
```

### `BrollGenerateControl` props

```ts
type BrollGenerateControlProps = {
  reelScriptId: string;
  clientId: string;
  locale: string;
  copy: BrollGenerateConfirmCopy;
  disabled: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
  /** Soft hint only — preview remains authoritative. */
  brollJobInFlight?: boolean;
};
```

**No** `targetDurationSec`, `voiceoverAssetId`, `portraitAssetId`, `confirmEstimateCents` — those are HeyGen-only.

### Dialog display (from preview DTO only)

When eligible and preview loaded:

1. Provider label from `providerKey` → `copy.providerWan` \| `copy.providerLtx` (never raw key in product copy if avoidable; Operator may see technical key in diagnostics only — V1: localized labels).
2. Clip count: `clipCount`.
3. Estimated total: `formatCentsForDisplay(estimatedCostCents, locale)`.

Confirm enabled when: preview ok, `needsBroll`, `providerKey` set, no `blockedReasonKey`, not `pending`/`loading`.

### Control eligibility poll

Mirror HeyGen `useEffect`: call `previewBrollVideoJobsEstimate({ reelScriptId, clientId })`; `setShowButton` per visibility rule; on throw → hide.

### `ScriptsPageView` wiring

- Pass `clientId`, `locale`, `copy.broll` (or `copy.brollGenerate`).
- `onBrollGenerateSuccess` parallel to `onHeygenGenerateSuccess`.
- Keep `"use client"` island minimal (control + dialog only).

---

## i18n key table (EN + ES)

Namespace under `scripts` in `messages/en.json` / `messages/es.json`:

| Key | Purpose |
|-----|---------|
| `scripts.broll.generate.button` | Button label |
| `scripts.broll.generate.title` | Dialog title |
| `scripts.broll.generate.confirm` | Confirm CTA |
| `scripts.broll.generate.cancel` | Cancel |
| `scripts.broll.generate.loading` | Preview loading |
| `scripts.broll.generate.loadError` | Preview load failure |
| `scripts.broll.generate.estimated` | Cost label |
| `scripts.broll.generate.clipCount` | Clip count label |
| `scripts.broll.generate.providerLabel` | Provider label |
| `scripts.broll.generate.providerWan` | “Wan (low tier)” / ES equivalent |
| `scripts.broll.generate.providerLtx` | “LTX B-roll (high tier)” / ES |
| `scripts.broll.generate.ineligible` | Generic ineligible |
| `scripts.broll.generate.toastSuccess` | All clips queued |
| `scripts.broll.generate.toastPartial` | Some created, some skipped |
| `scripts.broll.generate.toastSkippedAll` | None created |
| `scripts.broll.generate.errors.*` | Mirror copy.errors keys above |
| `scripts.broll.blocked.jobInFlight` | In-flight |
| `scripts.broll.blocked.referenceStillMissing` | Still missing (blocked) |
| `scripts.broll.blocked.providerUnavailable` | Provider blocked |
| `scripts.broll.blocked.budgetExceeded` | Budget blocked |
| `scripts.broll.failure.referenceStillMissing` | **US-8.5 gap** — create `messageKey` |

Product copy prefers **B-roll / sin presencia**, **Operator**, **Job de generación** — avoid CONTEXT _Evitar_.

---

## Zod / modules (mirrors)

| Module | Change |
|--------|--------|
| `lib/contracts/video-job.ts` | Extend `providerKey` enum on preview success; optional forbidden-key additions |
| `lib/video-jobs/actions/preview-broll-video-jobs-estimate.ts` | New `"use server"` action |
| `lib/video-jobs/broll-estimate-shared.ts` (or exports from create module) | Shared estimate / needsBroll / clip count |
| `lib/video-jobs/actions/create-broll-video-jobs.ts` | **Unchanged** public API |
| `components/scripts/BrollGenerate*.tsx` | New FE |
| `messages/en.json` · `messages/es.json` | New keys |

---

## Fixtures

**Eligible preview (Wan):**

```json
{
  "ok": true,
  "estimatedCostCents": 63,
  "unitCostCentsPerClip": 21,
  "clipCount": 3,
  "needsBroll": true,
  "providerKey": "siliconflow_wan21_turbo"
}
```

**Eligible preview (LTX):**

```json
{
  "ok": true,
  "estimatedCostCents": 378,
  "unitCostCentsPerClip": 126,
  "clipCount": 3,
  "needsBroll": true,
  "providerKey": "ltx_broll_high"
}
```

**No needs broll:**

```json
{
  "ok": true,
  "estimatedCostCents": 0,
  "unitCostCentsPerClip": 0,
  "clipCount": 0,
  "needsBroll": false
}
```

**In-flight:**

```json
{
  "ok": true,
  "estimatedCostCents": 0,
  "unitCostCentsPerClip": 0,
  "clipCount": 0,
  "needsBroll": true,
  "blockedReasonKey": "scripts.broll.blocked.jobInFlight"
}
```

**Create body:**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222"
}
```

**Forbidden preview/create body → `FORBIDDEN_FIELDS`:**

```json
{
  "reelScriptId": "11111111-1111-4111-8111-111111111111",
  "clientId": "22222222-2222-4222-8222-222222222222",
  "provider_key": "ltx_broll_high",
  "clipCount": 99,
  "operatorClientId": "33333333-3333-4333-8333-333333333333"
}
```

---

## Automated tests (BE)

| # | Case |
|---|------|
| 1 | Preview non-operator → **403** / `FORBIDDEN` |
| 2 | Preview forbidden `provider_key` → `FORBIDDEN_FIELDS` |
| 3 | Preview forged `clientId` → `FORBIDDEN` |
| 4 | Preview unknown reel → `NOT_FOUND` |
| 5 | Low tier + needsBroll → `providerKey: siliconflow_wan21_turbo`; estimate = 21 × N |
| 6 | High tier + needsBroll + active LTX → `providerKey: ltx_broll_high`; estimate = 126 × N |
| 7 | Low tier never returns `ltx_broll_high` |
| 8 | Non-faceless / no beats → `needsBroll: false`; no `providerKey` |
| 9 | In-flight broll → `blockedReasonKey` jobInFlight |
| 10 | Missing still → blocked `referenceStillMissing` (success hide, not vendor leak) |
| 11 | Create still rejects forbidden fields (regression) |
| 12 | Preview success `.strict()` / parse rejects extra secret-like fields in fixtures |
| 13 | Shared helper: preview estimate matches create unit costs for same script fixture |

---

## TASKS open questions — frozen

| Q | Freeze |
|---|--------|
| 1 In-flight detection | **Preview queries server-side** (this CONTRACT) |
| 2 Blocked vs hidden | **Hide** when `blockedReasonKey` or ineligible |
| 3 Refresh after success | **`onBrollGenerateSuccess`** mirror HeyGen |
| 4 Clip count display | Server `clipCount` (max 8) |

---

## Out of scope (explicit)

- Wan / LTX adapter changes (US-8.5 ✅ / US-8.8 ✅)
- `createBrollVideoJobs` orchestrator behavior changes beyond shared-helper extract
- DB migrations / new tables
- B-roll job list / status panel for `asset_role = broll`
- Assembly / stitch UI (US-9.1 ✅)
- Cliente B-roll trigger
- PLAN F7 cron
- Expanding create body with HeyGen-style `confirmEstimateCents`
- Stories IG / multicanal / ads / RBAC UI

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-31 | Initial freeze — Spec Guardian; preview action + extended Wan\|LTX schema + FE control/dialog + SECURITY 10 conditions; **Reviewed by FE: pending** |

---

## Gate status

| Gate | Status |
|------|--------|
| SPEC-REVIEW | ALIGNED |
| SECURITY | APPROVE WITH CONDITIONS (encoded above) |
| CONTRACT | **Frozen** — FE stamp pending |
| BUILD | **Unblocked after** `Reviewed by FE: approved` stamp at top of this file |
