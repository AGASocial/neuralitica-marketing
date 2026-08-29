# US-3.3 — Upload avatar reference assets (own avatar)

**Priority:** P0  
**Depends on:** US-3.2 ✅ CLOSED (`plan/stories/US-3.2/`) · US-3.1 ✅ CLOSED (Preferencias surface `/settings/preferences`) · runtime US-14.5 (`getCurrentUser()` / `requireActive()`, `(app)` layout) · hardened `hasActiveAvatarConsent` + Consentimiento UI  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-3.3 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-frontend** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md`). DB migration under BE/DB. Shared upload module authored here for later US-8.3 / US-9.2 reuse — no media-pipeline-engineer unless CONTRACT expands scope.  
**Canonical terms:** **Avatar propio autorizado** · **Consentimiento de avatar** · **Preferencias de producción visual** · **referencias** · **Cliente** / **Operator**. Technical tokens (`own_avatar`, `avatar_reference`, table/column names) OK in code/DB only. Avoid CONTEXT _Evitar_ list in product-facing docs/copy.

## Out of scope (do not implement here)

- **S3 production credentials or bucket config in client** — server-side storage interface only; no env vars or presigned logic in Client Components.
- **Virus scanner productization** — no ClamAV daemon, async scan workers, or quarantine UI. **PO lean:** document residual risk; optional extension hook only if SECURITY blocks without it.
- **US-3.4** QA agent, generic disclosure UI, impersonation checks.
- **US-8.x / US-10.x full generation gate** — no job create, provider enqueue, or Operator job UI. Export **`hasOwnAvatarReferenceAssets(clientId)`** (or CONTRACT name) only; unit-test; document US-8 call site.
- **US-8.3 manual video upload** and **US-9.2 logo upload** surfaces — consume shared validator later, not in this BUILD.
- **B-roll / fotos de trabajo** asset type — `avatar_reference` only in V1 of this story.
- Reopening Preferencias allowlist schema or Ficha viva PATCH for asset metadata.
- Auth redesign; browser Supabase; anonymous/public serve without ownership check.

## Scope split

| Concern | Owner |
|---------|--------|
| Preferencias + consent gate | **US-3.1 / US-3.2** (done — consume `hasActiveAvatarConsent`) |
| Avatar reference upload / list / delete / serve | **US-3.3** (this story) |
| Generic disclosure / QA | **US-3.4** |
| Job-time asset + consent enforcement (full) | **US-8.x / US-10.x** (helper stub only here) |
| Manual video / logo uploads | **US-8.3 / US-9.2** (shared validator module) |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table name | **`neuramark_media_assets`** (story shorthand `media_assets` + `neuramark_` prefix). Core columns: `id`, `client_id` (FK → `neuramark_clients`), `asset_type` (V1: `avatar_reference` only), `storage_key` (relative key — story AC `path`; never absolute filesystem path), `metadata` jsonb (`originalFilename`, `detectedMime`, `sizeBytes`, optional `width`/`height`/`durationSec`), `created_at`. RLS deny-by-default; service-role Node only. |
| Link to Preferencias | **PO lean:** **no FK on `neuramark_visual_preferences`**. Assets scoped by `client_id` + `asset_type = 'avatar_reference'`. Preferencias row unchanged; production eligibility = consent **and** ≥1 asset (helper). Escalate if SECURITY wants explicit FK. |
| Storage interface | **`MediaStorage` server interface**: `put(key, buffer, meta)`, `delete(key)`, `readStream(key)` (or equivalent). **`LocalDiskStorage`** under configured root **outside** `public/` (e.g. `var/media/` or env `NEURAMARK_MEDIA_ROOT`). **`S3Storage`** implements same interface — stub or feature-flagged; **no client exposure**. |
| Upload validation stack | Single server module (SECURITY_BASELINE #3): (1) max size config env, (2) magic-byte MIME allowlist image + video, (3) reject client `Content-Type`/extension for trust, (4) server-generated `storage_key` = UUID + safe extension from detected MIME, (5) `originalFilename` metadata only, (6) deny path traversal in keys. |
| Consent gate | Upload Server Action / handler **rejects** unless `hasActiveAvatarConsent(user.id)` true (same version-aware probe as US-3.2). UI hides/disables upload when consent inactive. |
| Serve route | **PO lean:** authenticated Route Handler e.g. `GET /api/media/assets/[assetId]` (exact path CONTRACT freezes): `requireActive("handler")`; load row by id **and** `client_id = session`; stream via storage interface; `Cache-Control: private, no-store`; correct `Content-Type` from stored metadata. Never map `storage_key` to static `public/` URL. |
| Delete semantics | Delete Server Action: ownership check; remove DB row **and** storage object; allowed only for session user's assets. **“Before first generation”:** **PO lean:** deletable while no `neuramark_video_jobs` row references asset (or always deletable in V1 if job table absent — CONTRACT freezes detection rule). |
| Production helper stub | Export `hasOwnAvatarReferenceAssets(clientId)` → `true` iff ≥1 non-deleted `avatar_reference` row for client. US-8 job create **must** call this + consent helper later; unit-test only in 3.3. |
| UI placement | **PO lean:** upload section **on `/settings/preferences`** below Consentimiento / Avatar propio block — same settings journey. Alternate: `/settings/avatar-references` — SECURITY/FE may veto. |
| Identity | `requireActive("page"|"handler")`; all queries `WHERE client_id = $server`. Reject/strip browser `client_id`. |
| i18n | EN + ES; hints for allowed formats and max size; recoverable error copy. |
| XSS | Previews via blob/object URLs from authenticated serve or inline from validated uploads only; no `dangerouslySetInnerHTML` for filenames. |

## Carry-forwards / reuse (do not reinvent)

- **`hasActiveAvatarConsent`** — import from US-3.2; never duplicate consent logic; uploads AND consent probe on every upload.
- Preferencias page shell + Consentimiento block — extend, do not rewrite US-3.2 flows.
- Migrations: `neuramark_` prefix; Supabase migrations only; no ad-hoc SQL.
- SECURITY_BASELINE shared upload stack — implement once under e.g. `lib/media/upload-validation.ts` + `lib/media/storage/` for US-8.3 / US-9.2 import.
- Prefer PrimeReact FileUpload or native input + progress per existing settings patterns.

---

## FE checklist

Concrete BE consumers: upload Server Action or multipart Route Handler (CONTRACT names); list loader for avatar references on Preferencias page; delete Server Action; authenticated preview URL via serve route.

- [x] **Upload UI** on Preferencias surface (CONTRACT placement — PO lean: `/settings/preferences`): pick photo/clip; show allowed formats + max size hints; upload progress; success refreshes list.
- [x] **Asset list** with preview/thumbnail (via serve route or blob); show metadata safe fields (type, date — not internal storage key).
- [x] **Delete** control with confirm dialog; recoverable error on failure; list updates after delete.
- [x] **Disable/hide upload** when `hasActiveAvatarConsent` false (match US-3.2 consent status from loader).
- [x] **Recoverable upload errors** — size/MIME/consent/network; retry without full page reload where possible.
- [x] Loading / empty states (no assets yet — explain need for references before production).
- [x] EN + ES in `messages/en.json` / `es.json`. Canonical product terms; avoid CONTEXT _Evitar_.
- [x] No Supabase in Client Components; no storage credentials; no `client_id` in URL/body for identity.
- [x] Do **not** build US-3.4 QA UI, US-8 job screens, or B-roll work-photo upload.

**AC satisfied by FE (for validator):** Failed upload shows recoverable error; assets listed and deletable (UI); consent-gated upload UX; EN/ES. Production helper + SEC storage remain BE.

---

## BE checklist

Concrete FE consumers: Preferencias RSC loader extended with avatar reference list + consent flag; upload/delete actions; serve route for preview/download.

- [x] **Migration** `neuramark_media_assets` (CONTRACT freezes columns, indexes, constraints).
- [x] **`MediaStorage` interface** + **`LocalDiskStorage`** implementation (root outside `public/`); **`S3Storage`** stub implementing interface (no prod creds required in this story).
- [x] **Shared upload validator** module: size limit, magic-byte MIME allowlist, server-generated key, metadata capture — export for US-8.3 / US-9.2.
- [x] **Upload endpoint** (CONTRACT name — Server Action with FormData or Route Handler): `requireActive("handler")`; consent gate; run validator; storage put; insert row; return safe DTO.
- [x] **List loader** (arity 0): avatar references for `getCurrentUser().id` ordered by `created_at`.
- [x] **Delete endpoint** (CONTRACT name): ownership check; delete storage + DB row; enforce “before first generation” rule per CONTRACT.
- [x] **Serve Route Handler** (CONTRACT path): session + ownership; stream from storage interface; never expose raw filesystem paths.
- [x] **`hasOwnAvatarReferenceAssets(clientId)`** helper + unit tests (US-8 stub — no job writes).
- [x] **[SEC] Magic bytes** — detected MIME from file content, not client headers/extensions.
- [x] **[SEC] Server-generated keys** — UUID + safe extension; original filename metadata only.
- [x] **[SEC] Storage outside web root** — `storage_key` relative; no `public/` writes.
- [x] **[SEC] Consent gate** on upload only when active consent exists.
- [x] **[SEC] IDOR** — foreign asset id → 404; parameterized queries; service-role Node only.
- [x] `revalidatePath` for Preferencias after upload/delete.
- [x] Automated tests: upload happy path; oversize reject; bad MIME reject; no consent reject; delete removes file + row; serve rejects other user's asset; helper true/false counts.

**AC mapping (for validator later):** ≥1 asset before production (helper); list + delete before generation; recoverable upload error; all `[SEC]` rows in USER_STORIES § US-3.3.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] Create **`neuramark_media_assets`**: `client_id`, `asset_type`, `storage_key`, `metadata` jsonb, `created_at`, PK `id`. Index `(client_id, asset_type)` for list + count helper.
- [x] RLS: zero policies / deny-by-default; access only via service-role server.
- [x] **Do not** add Preferencias FK column unless CONTRACT amends (PO lean: client_id only).
- [x] **Do not** create `neuramark_video_jobs` or generation tables here.
- [x] **Do not** store absolute filesystem paths in `storage_key`.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — avatar references only; shared upload stack; consent gate; no B-roll scope creep)
- [x] SECURITY.md (security-architect — magic bytes; storage outside web root; serve ownership; consent gate; S3 interface; virus scan lean)
- [x] CONTRACT.md authored (nextjs-backend) + FE signoff — Reviewed by FE: yes — 2026-08-29
- [x] BUILD (FE + BE + DB)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** BUILD (2026-08-29). FE + BE/DB slices complete. AC remain unchecked in `plan/USER_STORIES.md` until VALIDATION CLOSE.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Table shape — `neuramark_media_assets`** — Confirm columns: `asset_type` enum (`avatar_reference` only V1?), `storage_key` vs story name `path`, soft-delete column vs hard delete, `updated_at` needed? **PO lean:** hard delete on user action; `storage_key` column name in DB; `metadata` jsonb for extensibility; no soft-delete in V1.
2. **Size limit** — Max bytes per file? Max count per client? Max video duration for clips? **PO lean:** 10 MB images, 50 MB video clips, max 10 assets per client, video ≤ 30 s (probe duration in validator if cheap) — SECURITY confirm.
3. **MIME allowlist** — Exact detected types: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`? Reject SVG/GIF/HTML disguised as image? **PO lean:** jpeg/png/webp + mp4/mov only; explicit SVG/GIF deny.
4. **Serve route path** — `GET /api/media/assets/[assetId]` vs `/api/clients/me/media/[assetId]` vs signed short-lived token pattern. **PO lean:** `/api/media/assets/[assetId]` with session cookie auth + ownership query; no long-lived public URLs.
5. **Link to Preferencias vs table-only** — Story work table says “link to `visual_preferences`”. **PO lean:** **no FK** — relationship implicit via `client_id`; optional denormalized count in loader only. Amend USER_STORIES wording if spec-guardian requires.
6. **UI placement** — Upload block on `/settings/preferences` vs dedicated route. **PO lean:** same page under Avatar propio / Consentimiento section (continuity with US-3.2).
7. **Magic-bytes library** — `file-type` (npm), `@tokenizer/` + custom sniff, or `sharp`/`ffmpeg` probe? **PO lean:** `file-type` (or successor) for images + mp4/mov; no shell-out to `ffmpeg` in upload path for V1 unless SECURITY requires video duration probe.
8. **Upload transport** — Server Action `FormData` vs dedicated `POST` Route Handler for multipart. **PO lean:** Route Handler `POST /api/media/assets` for streaming/size enforcement + Server Action wrapper optional; CONTRACT freezes one pattern.
9. **“Before first generation” delete rule** — Block delete when any job references asset, or when any completed generation exists, or always allow delete in V1 (no jobs table)? **PO lean:** allow delete whenever `neuramark_video_jobs` absent or no FK from jobs to asset; when jobs exist later, block delete if referenced — stub check in 3.3 if table missing.
10. **Virus scanning** — Required for APPROVE or defer? **PO lean:** defer productized scanner; document in SECURITY; magic bytes + size + type denylist sufficient for V1 APPROVE WITH CONDITIONS.
11. **Revoke consent vs assets** — On consent revoke, delete assets automatically or retain until Cliente deletes? **PO lean:** retain files but **block new uploads** until re-consent; optional future cleanup story — upload gate only in 3.3.
12. **Thumbnail generation** — Server-side resize on upload vs FE full preview via serve route. **PO lean:** FE preview from serve route / object URL; optional server thumbnail jsonb in metadata as follow-up if PERFORMANCE needs.

No SPEC amendment assumed in PREP: SPEC §3 S3.M4 already requires reference uploads, consent/assets rejection at job time, and no human recording. Spec-guardian confirms scope = avatar references only (not B-roll work photos in this story).
