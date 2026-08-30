# Validation Report — US-9.2 (Phase A)

**Story:** US-9.2 — Add subtitles, logo, and cover  
**Branch:** `feature/US-9.2-subtitles-logo-cover`  
**Build refs:** worker `7518bc5` · BE `36e9dd3` · FE `a15921b`  
**Validator:** requirements-validator  
**Date:** 2026-08-30  
**Scope:** Phase A only (ASS burn-in + logo overlay + cover @ 1s; equal beat split; auto-chain; Operator panel; Ficha logo/defaults)

### Verdict: FAIL

Phase A delivers the branding worker pipeline, DDL, Ficha logo/defaults UI, Operator panel, auto-chain hook, subtitle sanitizer, and most SECURITY/CONTRACT surfaces. **Manual Operator branding is blocked:** `applyBrandingForAssembly` Server Action is still a stub returning `INTERNAL_ERROR` and does not delegate to the implemented `applyBrandingForAssemblyInner` orchestrator. Auto-chain after assembly `completed` can still enqueue jobs, but **Apply branding** / **Re-brand** in `/operator/scripts` cannot succeed until the action is wired.

---

## Test execution

```bash
npx tsx --test \
  lib/branding/*.test.ts \
  lib/assembly/branding-jobs.test.ts \
  lib/assembly/assembly-jobs.test.ts \
  lib/profile/get-business-profile-for-client.test.ts
```

| Metric | Result |
|--------|--------|
| Suites | 25 |
| Tests | **49 pass / 0 fail** |
| Duration | ~279 ms |

**Coverage highlights:** golden FFmpeg branding args (subtitles+logo, subtitles-only, logo-only, cover-only copy path); ASS equal-split timings + typography constants; subtitle sanitizer injection fail-closed; forbidden branding keys; Cliente `FORBIDDEN` on inner orchestrator; cross-tenant worker fail-without-spawn; mocked full `runBrandingJob` pipeline; fingerprint stability; assembly grep guards (no `neuramark_assembled_reels` UPDATE outside `lib/assembly` + `lib/branding`).

**Not run (explicit out of scope):** live FFmpeg on Fly, manual Operator E2E (Assemble → Apply branding → preview → Download cover), logo upload MIME integration tests.

---

## Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Subtitles readable on mobile safe zone | **PASS (code)** | Frozen typography: DejaVu Sans Bold 48px, `PlayResY: 1920`, `MarginV: 640` (lower-third ~y 1280–1520), alignment 2 (`lib/branding/constants.ts:4–13`, `lib/branding/build-ass-from-beats.ts:68–80`). Burn-in via ASS + `subtitles=` filter with path-only argv (`lib/branding/build-reel-v1-branding-args.ts:31–33, 84–95`). **Note:** no visual/mobile QA in CI. |
| Logo optional; default template if missing | **PASS** | Skip overlay when `logo_asset_id` null or `logoEnabled: false` — no placeholder watermark (`lib/branding/run-branding-job.ts:116–127`, `overlayLogo: overlayLogo && Boolean(logoPath)` at L202). CONTRACT binding interpretation documented in `plan/stories/US-9.2/CONTRACT.md:21`. |
| Cover image exported for manual IG upload | **PASS (code)** | `extractCoverFrameArgs` + JPEG upload + `cover_frame` INSERT (`lib/branding/run-branding-job.ts:211–243`, `lib/branding/insert-branded-media-assets.ts`). Operator **Download cover** link (`components/scripts/OperatorAssemblyPanel.tsx:825–833`). Serve route for `cover_frame` (`app/api/media/assets/[assetId]/route.ts:151–171`). |
| [SEC] Logo upload uses shared upload validation stack (US-3.3) | **PASS** | `validateClientLogoUpload` in shared module: magic bytes jpeg/png/webp, 2 MiB cap, server key `neuramark/{clientId}/logo-{uuid}.{ext}` (`lib/media/upload-validation.ts:174–231`). `uploadClientLogo` calls `validateAndPrepareMediaUpload({ assetType: "client_logo" })` + `requireActive` (`lib/profile/actions/upload-client-logo.ts:76–125`). **Note:** no automated SVG/oversize upload tests. |
| [SEC] Subtitle text escaped/sanitized before renderer | **PASS** | `sanitizeSubtitleBeats`: control-char strip, ASS escape, fail-closed on override residue (`lib/branding/sanitize-subtitle-beats.ts:22–74`). Beats in temp `.ass` only — never in argv (`lib/branding/run-branding-job.ts:187–203`, `build-reel-v1-branding-args.test.ts` `assertNoRawBeatText`). Tests include `{\fs999}` fixture (`sanitize-subtitle-beats.test.ts`). |

---

## CONTRACT surface verification

| Surface | Status | Evidence |
|---------|--------|----------|
| Migration DDL + storage_key CHECK | **PASS** | `supabase/migrations/20260830900000_neuramark_branding_us_9_2.sql` matches CONTRACT (profile columns, assembly branding columns, `client_logo`/`cover_frame` enums, idempotency index, regex extensions). |
| `lib/contracts/branding-job.ts` | **PASS** | Schemas, forbidden keys, env defaults, DTO fields frozen. |
| `createBrandingJobForAssembly` orchestrator | **PASS** | Operator gate on `operator_manual`; tenancy; sanitize; fingerprint; idempotency; enqueue (`lib/assembly/create-branding-job-for-assembly.ts:96–231`). |
| **`applyBrandingForAssembly` Server Action** | **FAIL** | Stub returns `{ ok: false, error: { code: "INTERNAL_ERROR" } }` always (`lib/assembly/actions/apply-branding-for-assembly.ts:12–18`). Real logic exists as `applyBrandingForAssemblyInner` in `create-branding-job-for-assembly.ts:233–253` but is **not** exported through the `"use server"` action consumed by FE. |
| `onAssemblyJobCompleted` auto-chain | **PASS** | Hook in `applyAssemblyJobUpdate` → `onAssemblyJobCompleted` → `createBrandingJobForAssembly({ source: "auto_chain" })` (`lib/assembly/apply-assembly-job-update.ts:117–118`, `lib/assembly/on-assembly-job-completed.ts:9–15`). |
| `uploadClientLogo` / `removeClientLogo` / `updateAssemblyConfigDefaults` | **PASS** | Dedicated Server Actions with `requireActive`; replace-on-upload; strict Zod on defaults (`lib/profile/actions/*.ts`). |
| Subtitle resolver + sanitizer | **PASS** | `resolve-subtitle-beats.ts`, `sanitize-subtitle-beats.ts` + unit tests. |
| `buildReelV1BrandingArgs` + `buildAssFromBeats` + `extractCoverFrameArgs` | **PASS** | Pure functions + golden tests (`lib/branding/build-reel-v1-branding-args.ts`, `build-ass-from-beats.ts`, `extract-cover-frame-args.ts`). |
| `runBrandingJob` + worker poll | **PASS** | Full mocked pipeline test; `worker/branding-jobs.ts` entry; `poll-branding-jobs.ts`. |
| Media serve (`client_logo`, `cover_frame`, branded `assembled_reel`) | **PASS** | Auth + ownership per type (`app/api/media/assets/[assetId]/route.ts:129–240`). Branded reel remains Operator-only. |
| Operator batch DTO branding fields | **PASS** | `mapOperatorAssemblyJobDto` (`lib/assembly/map-operator-assembly-job-dto.ts:51–78`). |
| Cliente `/profile` Brand section | **PASS** | `ProfileBrandingSection` in `LivingProfileView` (`components/profile/LivingProfileView.tsx:162`). EN/ES `profile.branding.*` + `scripts.branding.*` (`messages/en.json`, `messages/es.json`). |
| Operator `/operator/scripts` branding panel | **PASS (UI)** / **FAIL (trigger)** | Panel, toggles, preview, download cover, poll (`components/scripts/OperatorAssemblyPanel.tsx`). Apply/Re-brand call broken stub action. |

---

## SECURITY floors

| Floor | Status | Evidence |
|-------|--------|----------|
| Pointer-only trigger `{ assemblyJobId, subtitlesEnabled?, logoEnabled? }` | **PASS** | `applyBrandingForAssemblyRequestSchema` + `findForbiddenBrandingKeys` (`lib/contracts/branding-job.ts`, `lib/assembly/find-forbidden-branding-keys.ts`). Test: forbidden keys → `FORBIDDEN_FIELDS`. |
| `requireOperator("handler")` on manual apply | **PASS (inner)** / **FAIL (action)** | Enforced in `createBrandingJobForAssembly` when `source: "operator_manual"` (L105–116). **Not reachable** from browser until Server Action wired. |
| `requireActive` on logo/defaults mutations | **PASS** | `upload-client-logo.ts:76`, `update-assembly-config-defaults.ts:34`. |
| Shared `client_logo` upload validator (2 MiB, magic bytes, server key) | **PASS** | `validateClientLogoUpload` (`lib/media/upload-validation.ts:174–231`). |
| Subtitle sanitizer fail-closed | **PASS** | Injection residue → job `failed` / orchestrator error (`sanitize-subtitle-beats.ts:65–70`). |
| `spawn` args-array, `shell: false` | **PASS** | Reuses `runFfmpeg` (`lib/assembly/run-ffmpeg.ts`); branding tests assert array + `shell: false`. |
| No raw beat text in argv | **PASS** | Golden tests (`build-reel-v1-branding-args.test.ts:24–27`). |
| Storage SDK only — no URL fetch in branding | **PASS** | `run-branding-job.ts` uses `getMediaStorage().readStream`. No `fetch(` under `lib/branding/`. **Note:** grep guard only scans `lib/assembly/**` (`assembly-jobs.test.ts:417+`). |
| Closed branding status write surface | **PASS** | `apply-branding-job-update.ts` + orchestrator `writeBrandingQueuedState`; grep excludes `lib/branding/**`. |
| Worker tenancy re-check | **PASS** | `clientId` match before download (`run-branding-job.ts:110–125`); test: mismatch → `failed` without spawn. |
| Media serve auth matrix | **PASS** | `client_logo`/`cover_frame`: `requireActive` + ownership; `assembled_reel`: `requireOperator` (`route.ts:129–240`). |
| DTO excludes paths/keys/ASS/argv | **PASS** | `mapBrandingConfigForDto` strips server-only fields (`map-operator-assembly-job-dto.ts:11–22`). |
| Ficha PATCH cannot set `logo_asset_id` / `assembly_config` | **PASS (code)** | `updateBusinessProfileInputSchema` strict seven interview keys only — smuggled keys rejected (`lib/profile/update-business-profile.test.ts:85–107`). **Note:** no explicit `logo_asset_id` test. |
| SECURITY automated test matrix (full) | **PARTIAL** | Missing: logo SVG/HTML rejected; logo oversize; foreign `assemblyJobId` 404; foreign logo/cover serve 404; explicit Ficha `logo_asset_id` test; grep `fetch(` in `lib/branding/**`. |

---

## Convention Compliance

| Convention | Status | Notes |
|------------|--------|-------|
| EN + ES user-facing strings | **PASS** | `profile.branding.*`, `scripts.branding.*` in both locale files. |
| Server Components default; minimal `"use client"` | **PASS** | Profile page Server Component; `ProfileBrandingSection` + `OperatorAssemblyPanel` client for interactivity. |
| PrimeReact-first UI | **PASS** | `Button`, `InputSwitch`, `ConfirmDialog`, `Message`, `ProgressBar`, `Toast`. |
| Loading / empty / error / pending states | **PASS** | Profile: upload/removing progress, empty logo, error toasts (`ProfileBrandingSection.tsx`). Operator: assembly + branding pending, poll, preview error, failure banners (`OperatorAssemblyPanel.tsx`). |
| Supabase only on server | **PASS** | No client Supabase imports in branding surfaces. |
| `getCurrentUser()` / `requireActive` / `requireOperator` | **PASS** | Per CONTRACT gates on implemented paths. |

---

## Phase A / deferred items (per CONTRACT VALIDATION note)

| Item | Status |
|------|--------|
| Equal beat split (not VO-proportional) | **Intentional Phase A** — `target_duration_sec / beatCount` (`build-ass-from-beats.ts:52`). USER_STORIES BE row mentions VO timing; CONTRACT Phase B defers. |
| US-9.1 Phase B B-roll / `editing_hints` | **Deferred** — not US-9.2 scope. |
| Weekly auto-brand (ADR-0001) | **Deferred** — auto-chain post-assembly only. |
| VO-synced subtitle timing | **Deferred Phase B** |
| Operator per-reel `coverFrameSec` override | **Deferred Phase B** |
| Cliente branded video preview | **Out of scope** — US-11.1 |
| Live FFmpeg E2E in CI | **Out of scope** |

---

## Gaps (what blocks PASS)

1. **BLOCKER — `applyBrandingForAssembly` Server Action stub** (`lib/assembly/actions/apply-branding-for-assembly.ts`): Operator **Apply branding** / **Re-brand** always fail with `INTERNAL_ERROR`. Wire to `applyBrandingForAssemblyInner` (or inline orchestrator call) with `"use server"` boundary preserved.

---

## Scope Creep

None identified. Implementation stays within US-9.2 Phase A + frozen CONTRACT surfaces.

---

## Recommended Next Actions

| Priority | Action | Agent |
|----------|--------|-------|
| P0 | Wire `applyBrandingForAssembly` → `applyBrandingForAssemblyInner`; verify Operator apply/re-brand E2E | **nextjs-backend** |
| P1 | Add SECURITY matrix tests: logo SVG/oversize rejection; foreign `assemblyJobId` 404; serve IDOR 404; explicit Ficha `logo_asset_id` smuggle test | **nextjs-backend** |
| P1 | Extend grep guard: `fetch(` scan includes `lib/branding/**` | **nextjs-backend** |
| P2 | QA manual: Assemble → auto-chain branding → preview → Download cover; Ficha logo upload/remove/toggles | **qa-engineer** |
| After VALIDATION + QA CLOSE | PO checks AC in `plan/USER_STORIES.md` | **product-owner** |

---

## QA blockers (for qa-engineer)

1. **Cannot test Operator manual Apply branding / Re-brand** until Server Action stub is fixed.
2. No automated logo upload rejection tests — manual SVG/oversize checks advised.
3. No live FFmpeg / Fly worker E2E — validate branded output and cover JPEG in staging with real assembly job.
4. Subtitle safe-zone readability requires visual check on device (constants only in unit tests).
