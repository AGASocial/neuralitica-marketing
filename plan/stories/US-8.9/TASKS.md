# US-8.9 — Operator B-roll generate UI (P1)

**Priority:** P1  
**Depends on:** US-8.5 ✅ `createBrollVideoJobs` + Wan · US-8.8 ✅ LTX high tier · US-8.4 ✅ Operator scripts + job UI · US-8.7 ✅ HeyGen generate pattern · US-7.1 ✅ budget · US-7.2 ✅ tier routing · US-5.1 ✅ `broll_beats` / faceless. **Pattern:** `HeygenGenerateControl` · `HeygenGenerateConfirmDialog`.  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.9 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-frontend** (primary) + **nextjs-backend** (`CONTRACT.md`, preview action, tests) per `docs/development/AGENT-ROSTER.md`.  
**Canonical terms:** **provider key** · **provider tier** · **asset role (`broll`)** · **graceful degrade** · **needs_broll** · **faceless**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **Wan / LTX adapters** — US-8.5 ✅ · US-8.8 ✅.
- **`createBrollVideoJobs` orchestrator logic changes** — call existing action only.
- **New DB migrations** — reuse `neuramark_video_jobs`.
- **B-roll job status panel / list for `asset_role = broll`** — defer; primary job panel unchanged acceptable for CLOSE.
- **Assembly / stitch UI** — US-9.1 ✅.
- **Client-facing B-roll trigger** — Operator-only.
- **PLAN F7 cron** — separate backlog item.

## Scope split

| Concern | Owner |
|---------|--------|
| `BrollGenerateConfirmDialog` + `BrollGenerateControl` | **FE** |
| Wire control into `ScriptsPageView` on `/operator/scripts` | **FE** |
| EN/ES `scripts.broll.generate.*` (+ `scripts.broll.failure.referenceStillMissing` from US-8.5 gap) | **FE** |
| `previewBrollVideoJobsEstimate` Server Action | **BE** |
| Extend `previewBrollVideoJobsEstimateSuccessSchema` (`ltx_broll_high` provider key) | **BE** |
| Preview + action unit tests | **BE** |
| Reuse `createBrollVideoJobs` Server Action (no signature change) | **BE** ✅ exists |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-8.9-broll-operator-generate-ui`** |
| Page | **`/operator/scripts`** — `ScriptsPageView` per Reel row |
| Pattern | Mirror **`HeygenGenerateControl`** / **`HeygenGenerateConfirmDialog`** |
| Create action | Existing **`createBrollVideoJobs`** — `{ reelScriptId, clientId }` only |
| Preview action | New **`previewBrollVideoJobsEstimate`** — operator-gated |
| Providers shown | **`siliconflow_wan21_turbo`** (low) · **`ltx_broll_high`** (high) — policy-selected |
| Visibility | Faceless + `needs_broll` + active provider + no broll jobs in flight |
| Partial success | Surface `createdCount` / `skippedCount` + localized skip reasons |
| DB | **None** |

### Trigger matrix (CONTRACT freezes)

| Condition | Show generate button? |
|-----------|----------------------|
| Faceless + B-roll beats + policy resolves Wan (low) | **Yes** |
| Faceless + B-roll beats + policy resolves LTX (high, active) | **Yes** |
| Non-faceless / no beats / `needs_broll` false | **No** |
| B-roll job `queued` or `processing` for script | **No** (in-flight) |
| Preview returns `blockedReasonKey` (budget, no still, provider inactive) | **No** (or disabled with message — CONTRACT chooses) |
| Non-operator session | **No** (403 on preview/create) |

---

## FE checklist

Concrete consumer: **`/operator/scripts`** Operator Reel row (`ScriptsPageView`).

- [ ] **`components/scripts/BrollGenerateConfirmDialog.tsx`** — PrimeReact Dialog; props mirror HeyGen dialog (no portrait/consent); loads preview on open; confirm calls `createBrollVideoJobs`.
- [ ] **`components/scripts/BrollGenerateControl.tsx`** (or export from dialog module) — eligibility `useEffect` calling `previewBrollVideoJobsEstimate`; hides when ineligible.
- [ ] **Integrate in `ScriptsPageView`** — pass `reelScriptId`, `clientId`, `locale`, copy, refresh callbacks; placement near HeyGen control.
- [ ] **Loading / error / pending / success states** — spinner while preview loads; localized errors; disable while pending.
- [ ] **Partial skip UX** — when `skippedCount > 0`, show non-blocking message (budget exceeded, provider unavailable).
- [ ] **i18n EN/ES** — `scripts.broll.generate.*` keys; add `scripts.broll.failure.referenceStillMissing` (US-8.5 gap).
- [ ] **Provider label copy** — Wan vs LTX tier path strings (mirror `pathHighTier` HeyGen pattern where useful).
- [ ] **No `"use client"` boundary expansion** — keep client island minimal (control + dialog only).

**Reviewed by FE:** _(pending CONTRACT signoff)_

---

## BE checklist

Concrete consumers: **`BrollGenerateControl`** (preview) · **`BrollGenerateConfirmDialog`** (create).

- [ ] **`lib/video-jobs/actions/preview-broll-video-jobs-estimate.ts`** — `"use server"`; `requireOperator`; parse `previewBrollVideoJobsEstimateRequestSchema`; IDOR (`clientId === operator.id`); delegate to shared estimate helper (extract from orchestrator or thin wrapper — CONTRACT freezes).
- [ ] **Extend `previewBrollVideoJobsEstimateSuccessSchema`** — `providerKey: z.enum(["siliconflow_wan21_turbo", "ltx_broll_high"]).optional()`; keep `needsBroll`, `blockedReasonKey`, cost fields.
- [ ] **B-roll in-flight check** — preview returns blocked/hidden signal when broll jobs queued/processing (CONTRACT freezes query).
- [ ] **Re-export / barrel** — export preview action from video-jobs actions index if pattern exists.
- [ ] **Tests** — preview: faceless eligible Wan; high tier LTX; ineligible non-faceless; non-operator 403; forbidden fields; in-flight hides.
- [ ] **No changes to `createBrollVideoJobs` core** unless preview extraction requires shared helper refactor (minimal).

---

## DB checklist

- [ ] **None** — reuse existing `neuramark_video_jobs` (`asset_role = broll`).

---

## Contract-first gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md (nextjs-backend — preview DTO, visibility rules, FE copy keys; **Reviewed by FE**)
- [ ] BUILD
- [ ] VALIDATION.md
- [ ] QA.md
- [ ] CLOSE (product-owner — check AC in USER_STORIES.md)

---

## Open questions (resolve in CONTRACT)

1. **In-flight detection:** Query latest broll job per `reel_script_id` in preview, or pass broll job snapshot from server component props? **PO lean:** preview action queries server-side (single source of truth).
2. **Blocked vs hidden:** When preview returns `blockedReasonKey` (e.g. reference still missing), hide button vs show disabled + tooltip? **PO lean:** hide (match HeyGen ineligible) unless CONTRACT prefers surfaced blocked state for Operator debugging.
3. **Refresh after success:** Reuse existing `onHeygenGenerateSuccess` router refresh pattern — name parallel `onBrollGenerateSuccess` callback.
4. **Clip count display:** Show beat count from preview `clipCount` — server clamped (max 8).

No SPEC amendment assumed in PREP: Operator-triggered B-roll create is implied by US-8.5 orchestrator + deferred FE row; this story closes the gap without new product modules.
