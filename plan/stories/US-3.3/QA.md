# QA Report — US-3.3 Upload avatar reference assets

**Story:** US-3.3 — Upload avatar reference assets (referencias de avatar propio)  
**Branch:** `feature/US-3.3-avatar-assets`  
**Commits reviewed:** `ca18258` (FE), `63c8c64` (BE/DB)  
**Date:** 2026-08-29  
**Reviewer:** qa-engineer  
**Contract:** Frozen (2026-08-29)  
**SECURITY:** APPROVE WITH CONDITIONS (binding)  
**VALIDATION:** PASS WITH NOTES (2026-08-29)

---

## Verdict: APPROVE WITH CONDITIONS

Implementation meets US-3.3 security bar: magic-byte validation, size/count caps, live consent gate on upload, ownership-checked serve/delete (404 for foreign ids), server-generated keys with path traversal guards, storage outside `public/` via `MediaStorage`, no client-side storage secrets, and DTOs omit `storage_key`. Automated media tests pass 20/20. Residual V1 malware and deferred video-duration probe are documented accepted risks per CONTRACT/SECURITY — not blockers.

**Conditions (non-blocking, track as follow-up):** align list-loader `maxAssets`/`canUpload` with env override helper; optional hardening for concurrent upload cap race and delete partial-failure UX.

**CLOSE:** **Yes** — no Critical/High findings; story may close after PO AC checkoff.

---

## Severity counts

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 3 |

---

## Findings

### Low — List loader ignores env override for asset cap

**File:** `lib/media/get-avatar-reference-assets-for-client.ts:28–63`

**What:** `getAvatarReferenceAssetsForClient()` hardcodes `maxAssets` to `DEFAULT_MAX_AVATAR_REFERENCES` (10) and computes `canUpload` from that constant. Upload validation uses `getMaxAvatarReferences()` which reads `NEURAMARK_MEDIA_MAX_AVATAR_REFERENCES`.

**Why it matters:** If ops lowers the cap via env (e.g. 5), the UI may show “3/10” and enable upload while the server rejects with `ASSET_LIMIT_REACHED`. Not an IDOR or cross-tenant issue, but CONTRACT expects env-configurable limits to be reflected in the list DTO.

**Fix direction:** Import `getMaxAvatarReferences()` from `media-config.ts` and use it for `maxAssets` and `canUpload`.

---

### Low — TOCTOU race on per-client asset count cap

**Files:** `lib/media/upload-avatar-reference-asset.ts:99–122`, `lib/media/upload-validation.ts:112–118`

**What:** Upload reads `existingAssetCount` then validates/inserts without a transaction or advisory lock. Two concurrent uploads when at count 9 could both pass the cap check.

**Why it matters:** Could briefly exceed the configured max (e.g. 11 rows). Blast radius is small (self-tenant only, no cross-client access).

**Fix direction:** Optional V1.1: DB constraint or serializable transaction around count + insert; or accept documented race for dev V1.

---

### Low — Delete partial failure leaves DB row after storage removal

**File:** `lib/media/delete-avatar-reference-asset.ts:105–128`

**What:** Storage object is deleted before the DB row. If the subsequent DELETE fails, the row remains but serve returns 404 (missing file).

**Why it matters:** User sees a broken preview until manual cleanup or retry delete. Fail-closed (`INTERNAL_ERROR`) is correct; no cross-tenant exposure.

**Fix direction:** Document ops runbook; optional compensating re-insert or delete-before-storage with documented trade-off per CONTRACT BUILD notes.

---

## Security focus review (requested)

| Area | Result | Evidence |
|------|--------|----------|
| Magic bytes | **Pass** | `file-type` on buffer; allowlist jpeg/png/webp/mp4/mov; SVG/GIF/HTML rejected in tests (`upload-validation.ts:146–154`; `media-assets.test.ts:388–415`) |
| Size limits | **Pass** | Class caps 10 MiB / 50 MiB; hard read cap; oversize test (`upload-validation.ts:120–168`; test 417–425) |
| Consent gate | **Pass** | `hasActiveAvatarConsent` fail-closed in validator; UI disables upload; no-consent test (`upload-validation.ts:104–110`; test 441–458) |
| IDOR serve | **Pass** | `WHERE id AND client_id AND asset_type`; foreign → 404 (`route.ts:65–95`; test 814–836) |
| IDOR delete | **Pass** | Same ownership query; foreign → `NOT_FOUND` (`delete-avatar-reference-asset.ts:78–97`; test 700–704) |
| Path traversal | **Pass** | Server UUID keys; `STORAGE_KEY_REGEX`; `LocalDiskStorage.assertSafeKey` + resolved-path guard; metadata-only filename sanitize (`local-disk-storage.ts:36–57`; migration CHECK; test 334–345) |
| Storage outside public | **Pass** | `NEURAMARK_MEDIA_ROOT` default `var/media`; `assertRootOutsidePublic`; `.gitignore` entry; test rejects root under `public/` |
| MediaStorage abstraction | **Pass** | Interface + `LocalDiskStorage` + `S3Storage` stub; factory server-only (`get-media-storage.ts`) |
| No client secrets | **Pass** | No `@supabase` in `components/**`; no `NEURAMARK_MEDIA_*` or `storage_key` in client bundle; FE uses `/api/media/assets/{id}` preview URLs only |
| DTO safety | **Pass** | `mapMediaAssetRowToItem` omits `storage_key`; upload success JSON assert (`media-helpers.ts:92–117`; test 569–571) |
| Routes gated | **Pass** | Serve + `/settings/preferences` off `isPublicPath` (test 300–303) |
| Residual malware | **Accepted** | No AV productization; optional `afterValidate` hook documented (CONTRACT/SECURITY condition) |
| Video duration ≤30s | **Deferred** | CONTRACT-approved; US-8 ingest |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/media/media-assets.test.ts` | **20/20 pass** |
| `npm run lint` | **Exit 0** with warnings; 3 ESLint errors in `media-assets.test.ts` (`no-require-imports` — test harness only, pre-existing pattern) |
| `npm run build` | **Failed** — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local `.env` config; **not introduced by US-3.3**) |
| Manual browser E2E (Preferencias upload/preview/delete) | **Not run** |
| Live Supabase migration apply | **Not verified** in this gate |

---

## What was not covered

- Live browser upload/preview/delete on `/settings/preferences` with real consent + Supabase
- Unauthenticated **serve** route test (upload unauth covered; serve relies on same `requireActive` pattern — code review only)
- Concurrent upload race reproduction
- Production build with sanitized env (blocked by `AUTH_DEV_FALLBACK` in reviewer `.env`)
- WebP/MP4/MOV binary fixtures beyond JPEG/PNG smoke (magic-byte path shared; PNG test present)
- Vercel ephemeral disk / S3 adapter (stub only; expected out of scope)

---

## Recommended follow-ups (post-close)

| Priority | Action | Owner |
|----------|--------|-------|
| Low | Use `getMaxAvatarReferences()` in list loader | nextjs-backend |
| Low | Add unauthenticated serve → 401 test for parity | nextjs-backend |
| Ops | Apply `20260829230000_neuramark_media_assets.sql` to dev/staging | nextjs-backend |
| US-8 | Wire `hasOwnAvatarReferenceAssets` at job create | integrations-engineer |
