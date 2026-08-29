# Validation Report — US-3.3

**Story:** Upload avatar reference assets (referencias de avatar propio)  
**Validator:** requirements-validator  
**Date:** 2026-08-29  
**Branch:** `feature/US-3.3-avatar-assets`  
**Commits reviewed:** `ca18258` (FE — Preferencias referencias UI), `63c8c64` (BE/DB — media module + migration + serve route)  
**Contract:** Frozen, Reviewed by FE (2026-08-29)  
**SPEC-REVIEW:** ALIGNED (`avatar_reference` only; shared upload stack; consent gate)  
**SECURITY:** APPROVE WITH CONDITIONS (binding `[SEC]` floors)  
**Tests re-run:** `npx tsx --test lib/media/media-assets.test.ts` → **20/20 pass**  
**Live browser / DB E2E:** **Not run** this gate (code + unit evidence only)

---

### Verdict: PASS WITH NOTES

All nine USER_STORIES acceptance criteria (including six `[SEC]` rows) and the SECURITY.md binding floors for US-3.3 are met within the frozen CONTRACT scope. Upload/list/delete/serve, shared validator, `MediaStorage` adapters, consent gate, and Preferencias embed UX are implemented and covered by automated tests. Production-time “≥1 asset” enforcement is correctly delivered as **`hasOwnAvatarReferenceAssets`** stub + unit tests — full job gate wiring remains US-8.x (explicit out-of-scope).

On PASS, the product-owner — not this validator — checks the story’s acceptance criteria in `plan/USER_STORIES.md`.

**QA can proceed:** **Yes** (blocker count: **0**).

---

### Acceptance Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| At least one reference asset required before own-avatar production | **PASS** (stub per CONTRACT) | `hasOwnAvatarReferenceAssets(clientId)` exported with fail-closed semantics and JSDoc US-8 call site (`lib/media/has-own-avatar-reference-assets.ts` 4–48). Unit tests true/false counts (`media-assets.test.ts` 473–503). FE empty copy explains need before production (`messages/en.json` 406; `AvatarReferencesSection.tsx` 392–394). **Note:** runtime job create blocking is US-8.x — not a 3.3 gap. |
| Assets listed and deletable before first generation | **PASS** | Arity-0 list loader (`get-avatar-reference-assets-for-client.ts` 25–70). Delete removes storage + DB row (`delete-avatar-reference-asset.ts` 77–132). Job-reference stub allows delete when jobs table absent (`is-asset-referenced-by-job.ts` 8–12). FE list + confirm delete + optimistic update (`AvatarReferencesSection.tsx` 245–291, 396–523). |
| Failed upload shows recoverable error | **PASS** | Server error envelope codes mapped to i18n (`media-errors.ts`; `AvatarReferencesSection.tsx` 105–133, 237). Banner on failure without full reload; user can retry via file picker (`AvatarReferencesSection.tsx` 203–242, 344–346). Tests: oversize, bad MIME, no consent, cap, forbidden fields (`media-assets.test.ts` 364–460, 580–586). |
| **[SEC]** Upload rejects oversize files and MIME outside allowlist; type verified from magic bytes, not client Content-Type/extension | **PASS** | `file-type` magic-byte detect + allowlist (`upload-validation.ts` 146–154). Size caps by detected class (`upload-validation.ts` 157–168; `media-config.ts` 8–12, 33–52). SVG/GIF/HTML rejected in tests (`media-assets.test.ts` 388–415). Client `Content-Type` never used for trust. |
| **[SEC]** Server-generated storage keys (UUID + safe ext); original filename metadata only | **PASS** | `randomUUID()` + MIME→ext map (`upload-validation.ts` 172–190). `STORAGE_KEY_REGEX` + DB CHECK (`lib/contracts/media-assets.ts` 18–19; migration 19–25). `sanitizeOriginalFilename` for metadata only (`media-helpers.ts` 66–73). Path traversal key rejected (`media-assets.test.ts` 334–345). |
| **[SEC]** Files outside web root; served via ownership-checked route; `storage_key` relative | **PASS** | `LocalDiskStorage` root from `NEURAMARK_MEDIA_ROOT` default `var/media` (`media-config.ts` 64–69; `get-media-storage.ts` 10–15). `assertRootOutsidePublic` rejects under `public/` (`local-disk-storage.ts` 91–106). `GET /api/media/assets/[assetId]` ownership query + stream (`app/api/media/assets/[assetId]/route.ts` 29–118). DTOs omit `storage_key` (`media-helpers.ts` 92–117; test 264–280). `/var/media/` gitignored (`.gitignore` 24). |
| **[SEC]** Uploads only with active (non-revoked) avatar consent | **PASS** | Validator calls imported `hasActiveAvatarConsent(userId)` fail-closed (`upload-validation.ts` 104–110). Upload action does not duplicate consent logic. UI disables upload when consent inactive (`AvatarReferencesSection.tsx` 186–187, 348–354). Test: no consent → `OWN_AVATAR_CONSENT_REQUIRED` (`media-assets.test.ts` 441–458). |
| **[SEC]** Delete removes DB row and stored file; own user only | **PASS** | Delete: load `id + client_id + asset_type`, storage delete then DB delete (`delete-avatar-reference-asset.ts` 77–132). Foreign id → `NOT_FOUND` (`media-assets.test.ts` 685–707). Happy path removes disk file (`media-assets.test.ts` 626–679). |
| **[SEC]** Storage layer behind server-side interface (local now, S3 later); no client credentials | **PASS** | `MediaStorage` interface (`lib/media/storage/media-storage.ts`). `LocalDiskStorage` + `S3Storage` stub (`local-disk-storage.ts`; `s3-storage.ts` 11–33). All modules `import "server-only"`. No bucket/root env in Client Components. Factory `getMediaStorage()` server-only (`get-media-storage.ts`). |

---

### SECURITY.md `[SEC]` floors (added / inherited relevant to US-3.3)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **[SEC] (inherited)** Identity via `getCurrentUser()` / `requireActive()`; strip browser `client_id` | **PASS** | Upload/delete: `requireActive("handler")` (`upload-avatar-reference-asset.ts` 70; `delete-avatar-reference-asset.ts` 47). List: `requireActive("page")` (`get-avatar-reference-assets-for-client.ts` 26). Forbidden key lists + tests (`media-helpers.ts` 8–64; `media-assets.test.ts` 241–254, 580–586). |
| **[SEC] (inherited)** `getBusinessProfileForAgents` omits storage keys / unauthenticated URLs | **PASS** | No media/storage references in agents helper (grep clean on `get-business-profile-for-agents.ts`). |
| **[SEC] (added)** Table `neuramark_media_assets`; RLS deny-by-default; index `(client_id, asset_type)`; no Preferencias FK | **PASS** | Migration matches CONTRACT (`supabase/migrations/20260829230000_neuramark_media_assets.sql`). Test asserts RLS + no `visual_preferences` FK (`media-assets.test.ts` 843–855). |
| **[SEC] (added)** Frozen limits 10 MiB / 50 MiB / 10 assets (env-configurable) | **PASS** | `media-config.ts` defaults + env readers; documented in `.env.example` 29–33. Tests enforce oversize + cap. |
| **[SEC] (added)** Shared validator export for US-8.3 / US-9.2 | **PASS** | `validateAndPrepareMediaUpload` exported from `upload-validation.ts`; smoke test (`media-assets.test.ts` 462–470). |
| **[SEC] (added)** Serve route ownership; 404 foreign; `private, no-store` | **PASS** | `app/api/media/assets/[assetId]/route.ts` 65–118; tests 764–841. Route not public (`media-assets.test.ts` 300–304). |
| **[SEC] (added)** Consent revoke: retain assets; block new uploads; list/serve/delete retained still allowed | **PASS** | Upload gated on live consent; list/delete not gated (`delete-avatar-reference-asset.ts` 136–137). List test with `ownAvatarConsentActive: false` still returns assets (`media-assets.test.ts` 711–752). |
| **[SEC] (added)** XSS bar; no camera/mic | **PASS** | Filenames as React text (`AvatarReferencesSection.tsx` 477–479). File input only (`AvatarReferencesSection.tsx` 374–381). No `dangerouslySetInnerHTML`. |
| **[SEC] (added)** No silent job enqueue from upload/delete | **PASS** | Static source assert (`media-assets.test.ts` 615–623). `revalidatePath("/settings/preferences")` only on success. |
| **[SEC] (added)** Residual malware risk documented | **PASS** | CONTRACT header + optional `afterValidate` hook (`upload-validation.ts` 54–56, 192–194). No productized AV (approved deferral). |
| **[SEC] (added)** Automated security tests cover listed cases | **PASS** | 20/20 re-run (see header). |

---

### Convention Compliance

| Topic | Status | Evidence |
|-------|--------|----------|
| English + Spanish user-facing strings | **PASS** | `messages/en.json` + `messages/es.json` → `preferences.references.*` (402–444 both locales). |
| Server Components by default; minimal `"use client"` | **PASS** | RSC page loads data (`app/(app)/settings/preferences/page.tsx` 33–118). Client boundary only for upload/delete interactivity (`AvatarReferencesSection.tsx` 1). |
| PrimeReact-first UI | **PASS** | `Button`, `Message`, `ProgressBar`, `ConfirmDialog`, `Toast` (`AvatarReferencesSection.tsx` 5–9). Native hidden file input per CONTRACT (PrimeReact FileUpload optional). |
| Loading / empty / error / pending states | **PASS** | Empty state (`AvatarReferencesSection.tsx` 392–394). Load failed (`page.tsx` 73–86; `loadFailed` banner). Upload pending ProgressBar (`364–370`). Delete loading on button (`518`). Error banner recoverable (`344–346`, 237). |
| Auth: `requireActive` / no browser Supabase | **PASS** | No `@supabase` in `components/**`. Session via server actions + serve route. |
| Endpoints serve concrete FE consumer | **PASS** | All surfaces consumed by Preferencias referencias section on `/settings/preferences` (`PreferencesEditor.tsx` 360–365). |
| `neuramark_` DB prefix | **PASS** | `neuramark_media_assets`, enum, indexes, constraints (migration). |
| Dependency US-3.2 satisfied | **PASS** | Reuses `hasActiveAvatarConsent` from US-3.2 module — not duplicated (`upload-validation.ts` 25, 104). Consent UI above referencias section (`PreferencesEditor.tsx` 352–365). |

---

### CONTRACT compliance

| Topic | Status | Evidence |
|-------|--------|----------|
| Surfaces frozen (Server Actions + serve GET; no POST upload RH) | **PASS** | `uploadAvatarReferenceAsset(formData)` (`upload-avatar-reference-asset.ts` 194). `deleteAvatarReferenceAsset({ assetId })` (`delete-avatar-reference-asset.ts` 140). `GET /api/media/assets/[assetId]`. |
| List loader arity 0 + DTO shapes | **PASS** | `getAvatarReferenceAssetsForClient()` (`get-avatar-reference-assets-for-client.ts`). Zod schemas in `lib/contracts/media-assets.ts`. |
| Error envelopes + messageKeys | **PASS** | `media-errors.ts` maps codes to CONTRACT messageKeys. |
| UI placement on Preferencias (not dedicated route) | **PASS** | Below Consentimiento block (`PreferencesEditor.tsx` 352–365). |
| Video duration ≤30s probe optional V1 | **PASS** (deferred) | Comment + env constant only (`upload-validation.ts` 170; `media-config.ts` 14–15). CONTRACT-approved deferral to US-8 ingest. |
| `maxAssets` schema | **NOTE** | CONTRACT sketch used `z.literal(10)`; implementation uses `z.number().int().positive()` to allow env override — intentional, matches frozen env names. |

---

### Gaps (what blocks PASS)

**None.** Stub-only production gate and deferred video-duration probe are explicit CONTRACT/SECURITY allowances, not missing work for US-3.3.

---

### Scope Creep

**None identified.** Out-of-scope items correctly absent:

- No B-roll / `work_photo` asset type
- No `POST /api/media/assets` Route Handler
- No US-8 job UI or provider enqueue
- No Preferencias FK column
- No productized virus scanner
- No dedicated `/settings/avatar-references` route

**Justified additions:** `file-type` dependency (SECURITY-sanctioned magic-byte detection).

---

### Recommended Next Actions

| Action | Owner |
|--------|--------|
| PO checks AC boxes in `plan/USER_STORIES.md` § US-3.3 | product-owner |
| QA manual pass: upload JPEG/PNG on Preferencias with active consent; verify preview serve; delete; consent-off upload disabled; oversize/SVG error copy EN+ES | qa-engineer |
| US-8.x: wire `hasOwnAvatarReferenceAssets` + consent helpers at job create | integrations-engineer / media-pipeline-engineer |
| Optional: add `npm test` script invoking `npx tsx --test lib/**/*.test.ts` for CI parity | nextjs-backend |
| Apply migration to dev/staging Supabase if not already applied | nextjs-backend |

---

### Notes for QA

1. **Migration required:** `20260829230000_neuramark_media_assets.sql` must be applied before upload/list works against real DB.
2. **Local storage:** uploads land under `var/media/` (gitignored); ensure writable on dev host.
3. **Consent prerequisite:** upload requires active avatar consent (US-3.2); grant consent first on same page.
4. **Production gate:** empty references do not block saving Preferencias with `own_avatar` — only future production (US-8) will enforce ≥1 asset.
