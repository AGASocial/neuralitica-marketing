Reviewed by FE: yes — 2026-08-29

# API Contract — US-3.3 Upload avatar reference assets (referencias de avatar propio)

**Story:** US-3.3  
**Status:** **Frozen** — 2026-08-29  
**Security:** `plan/stories/US-3.3/SECURITY.md` (APPROVE WITH CONDITIONS — binding freeze; do not reopen)  
**Spec review:** `plan/stories/US-3.3/SPEC-REVIEW.md` (ALIGNED — `avatar_reference` only; shared upload stack; consent gate; helper stub for US-8)  
**Depends on:** US-3.2 CONTRACT (frozen) — `hasActiveAvatarConsent` version-aware probe · US-3.1 CONTRACT (frozen) — Preferencias `/settings/preferences`, soft asset empty-state · US-14.5 — `getCurrentUser()` / `requireActive()` · US-2.2 — Ficha viva PATCH stays asset-blind · US-2.3 — agents DTO omits storage keys / unauthenticated URLs  
**Identity seam:** `lib/auth/get-current-user.ts` / `requireActive()` (US-14.5 — unchanged)  
**Error envelope style:** same class as Preferencias / consent / profile / auth (`ok: true` vs `{ ok: false, error: { code, fields?, messageKey? } }`); Route Handler serve uses HTTP status + minimal body on error

**This document is CONTRACT ONLY.** Do not implement loaders, Server Actions, Route Handlers, Zod in code, or migrations until FE signoff. Zod below is a documentation sketch for the future BUILD files (`lib/contracts/media-assets.ts`, media server modules).

**Terminology:** **referencias** (portrait photos/clips for **Avatar propio autorizado**). **Consentimiento de avatar** · **Preferencias de producción visual**. Role: **Cliente** / **Operator**. Technical tokens (`own_avatar`, `avatar_reference`, `neuramark_media_assets`, `storage_key`) OK in code/DB only — never primary UI headlines. Do **not** use CONTEXT _Evitar_ terms (esp. “media_assets” as product label, consent ledger, avatar mode / visual preferences as entity names, Business Profile, admin / staff) in this file’s product-facing strings, fixtures’ UI labels, or i18n headlines.

**Residual malware risk (V1):** uploads rely on size caps + magic-byte allowlist + explicit SVG/GIF/HTML deny — **no** productized virus scanner. Optional `afterValidate?(buffer)` hook in shared validator for future AV integration. US-8/US-9 pipelines must treat stored bytes as untrusted input.

---

## Overview

An authenticated, activated Cliente uploads portrait photos or short clips as **referencias** for **Avatar propio autorizado** on the Preferencias settings page. The server:

1. Resolves identity via `requireActive("page"|"handler")` / `getCurrentUser().id` only.
2. Lists own `avatar_reference` assets (arity 0 loader) for Preferencias UI — minimal DTO; preview via authenticated serve path.
3. **Uploads** only when live **`hasActiveAvatarConsent(user.id)`** is true (US-3.2 version-aware probe — never Preferencias flag alone).
4. Runs the **shared upload validation stack**: count cap → size (image vs video class) → magic-byte MIME allowlist → server-generated relative **`storage_key`** → **`MediaStorage.put`** outside **`public/`** → INSERT **`neuramark_media_assets`**.
5. **Serves** bytes via ownership-checked **`GET /api/media/assets/[assetId]`** — session + row `id AND client_id = session`; stream via storage interface; **`Cache-Control: private, no-store`**.
6. **Deletes** own assets (hard delete): remove storage object **and** DB row; block when future job references exist (stub when jobs table absent).
7. Exports **`hasOwnAvatarReferenceAssets(clientId)`** stub for US-8 job gates (unit-tested; no job table writes).
8. On consent **revoke**: **retain** existing assets; **block new uploads** until re-consent; list / serve / delete of **own** retained assets still allowed in V1.
9. **Never** enqueues jobs, calls providers, or writes Preferencias / Ficha viva from upload/delete.

**Surfaces**

| # | Surface | Kind | New vs reused |
|---|---------|------|---------------|
| 1 | `/settings/preferences` referencias section | RSC + Client upload/list UI embed | **Extend** US-3.1 / US-3.2 Preferencias page — **not** dedicated `/settings/avatar-references` in V1 |
| 2 | `getAvatarReferenceAssetsForClient` | RSC server helper | **New** — arity 0 list load |
| 3 | `uploadAvatarReferenceAsset` | Server Action (`FormData`) | **New** — only upload writer |
| 4 | `deleteAvatarReferenceAsset` | Server Action | **New** — only delete writer |
| 5 | `GET /api/media/assets/[assetId]` | Route Handler | **New** — ownership-checked stream serve |
| 6 | `hasActiveAvatarConsent` | Server-only helper (US-3.2) | **Reuse** — upload gate only; import; do not duplicate |
| 7 | `hasOwnAvatarReferenceAssets` | Server-only helper | **New** — US-8 stub; unit-tested |
| 8 | Shared upload validator | Server-only module | **New** — exported for US-8.3 / US-9.2 later |
| 9 | `MediaStorage` + `LocalDiskStorage` + `S3Storage` stub | Server-only storage | **New** |
| 10 | `getVisualPreferencesForClient` / Consentimiento loaders | RSC helpers (US-3.1 / 3.2) | **Continuity** — page composes consent flag + asset list |

No anonymous serve. No presigned URLs in Client Components. No `POST` upload Route Handler in V1 (Server Action + FormData frozen). No B-roll / `work_photo` asset type. No job UI.

**Frontend consumers**

| Consumer | Route | Contract surface |
|----------|-------|------------------|
| Referencias upload / list / delete UI | `app/(app)/settings/preferences/page.tsx` (+ Client section) | Load `getAvatarReferenceAssetsForClient()` + existing consent status; Upload → `uploadAvatarReferenceAsset(formData)`; Delete → `deleteAvatarReferenceAsset({ assetId })`; Preview `<img>` / `<video>` src → `/api/media/assets/{id}` (same-origin cookie auth) |
| Consent gate UX | Same section | Hide/disable upload when `ownAvatarConsentActive === false` (from Preferencias / consent loader); server still rejects upload without consent |
| Empty / cap UX | Same section | Soft copy when zero assets; disable upload at max **10** assets |
| Success / error feedback | Client section | Upload/delete `{ ok: true }` → await + toast (EN/ES); recoverable errors for size/MIME/consent/cap/network |

**Server-only modules (planned BUILD)**

| Module | Purpose |
|--------|---------|
| `lib/contracts/media-assets.ts` | Zod + types for list DTO, upload/delete results, metadata shape |
| `lib/media/upload-validation.ts` | `import "server-only"`; shared stack (consent → count → size → magic bytes → key) — **export for US-8.3 / US-9.2** |
| `lib/media/storage/media-storage.ts` | `import "server-only"`; `MediaStorage` interface |
| `lib/media/storage/local-disk-storage.ts` | `LocalDiskStorage` — root outside `public/` |
| `lib/media/storage/s3-storage.ts` | `S3Storage` stub — same interface; no prod creds in 3.3 |
| `lib/media/get-avatar-reference-assets-for-client.ts` | Arity-0 list loader |
| `lib/media/upload-avatar-reference-asset.ts` | `"use server"` `uploadAvatarReferenceAsset` |
| `lib/media/delete-avatar-reference-asset.ts` | `"use server"` `deleteAvatarReferenceAsset` |
| `lib/media/has-own-avatar-reference-assets.ts` | Stub helper for US-8 |
| `app/api/media/assets/[assetId]/route.ts` | `GET` serve handler |
| `lib/visual-preferences/has-active-avatar-consent.ts` | **Import** (US-3.2) — do not fork |
| Migration | **Yes** — create `neuramark_media_assets` |

---

## Frozen decisions (from SECURITY.md + SPEC-REVIEW + PO TASKS)

Do not reopen.

| # | Topic | Freeze |
|---|-------|--------|
| 1 | **UI placement** | Referencias upload block **on Preferencias page** `/settings/preferences` — below Consentimiento / Avatar propio section. **Not** a new dedicated route in V1 |
| 2 | **Table** | **`neuramark_media_assets`**: `id`, `client_id` FK → `neuramark_clients`, `asset_type` (`avatar_reference` V1 only), `storage_key` (relative — story name `path`), `metadata` jsonb, `created_at`. Hard delete. **No** Preferencias FK. RLS deny-by-default; service-role Node only |
| 3 | **Link to Preferencias** | **Logical only** — scope by `client_id` + `asset_type = 'avatar_reference'`. **No** column on `neuramark_visual_preferences` |
| 4 | **Upload transport** | **`uploadAvatarReferenceAsset(formData: FormData)`** Server Action — field name **`file`**. CSRF via Next.js Server Action origin check. **No** `POST /api/media/assets` Route Handler in V1 |
| 5 | **Delete transport** | **`deleteAvatarReferenceAsset({ assetId })`** Server Action — Zod `.strict()` body |
| 6 | **List loader** | **`getAvatarReferenceAssetsForClient()`** arity **0** — separate helper; Preferencias page composes with existing loaders |
| 7 | **Serve route** | **`GET /api/media/assets/[assetId]`** — `requireActive("handler")`; ownership query; stream; **`private, no-store`**; foreign/missing → **404** |
| 8 | **Consent gate** | Upload **requires** `hasActiveAvatarConsent(user.id) === true` (version-aware, fail-closed). **Not** required for list / serve / delete of **own** retained assets after revoke |
| 9 | **Revoke behavior** | Retain bytes + rows on consent revoke; block **new** uploads until re-consent; existing assets listable/servable/deletable |
| 10 | **Size limits (env defaults)** | Images ≤ **10 MiB** (`NEURAMARK_MEDIA_MAX_IMAGE_BYTES`); video ≤ **50 MiB** (`NEURAMARK_MEDIA_MAX_VIDEO_BYTES`); max **10** `avatar_reference` rows per client (`NEURAMARK_MEDIA_MAX_AVATAR_REFERENCES`) |
| 11 | **Video duration** | ≤ **30 s** when cheaply probeable server-side — **optional V1**; if skipped in BUILD, document deferral to US-8 ingest; do not block CONTRACT |
| 12 | **Magic-byte allowlist** | **`image/jpeg`**, **`image/png`**, **`image/webp`**, **`video/mp4`**, **`video/quicktime`** only — from **file content** via `file-type` (or successor). **Explicit deny:** SVG, GIF, HTML, `text/*`, `application/javascript`, untrusted `application/octet-stream`. **Ignore** client `Content-Type` and extension for trust |
| 13 | **`storage_key`** | Server UUID v4 + `.` + safe ext from **detected** MIME map (`jpg`/`jpeg`, `png`, `webp`, `mp4`, `mov`). Regex: **`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$`**. Original filename **metadata only** |
| 14 | **Storage root** | **`LocalDiskStorage`** root from `NEURAMARK_MEDIA_ROOT` (default e.g. `var/media/`) — resolved absolute; **must not** be under `public/` or project web root. **`S3Storage`** stub implements same interface |
| 15 | **Delete semantics** | Hard delete storage + row for **own** asset. Foreign id → **404**. When `neuramark_video_jobs` **absent** → delete always allowed for own assets. When jobs table **exists** and references asset → **`ASSET_REFERENCED_BY_JOB`** (no delete). “Before first generation” AC satisfied |
| 16 | **Production helper** | **`hasOwnAvatarReferenceAssets(clientId)`** → `true` iff ≥1 `avatar_reference` row for client; unit-tested; US-8 **must** call later — no job writes in 3.3 |
| 17 | **IDOR** | All queries `WHERE client_id = user.id`; foreign `assetId` → **404** (not 403); reject/strip browser `client_id` |
| 18 | **DTO safety** | Client-facing DTOs **omit** `storage_key`, absolute paths, bucket names, internal roots |
| 19 | **Preview URL** | Relative path **`/api/media/assets/{id}`** in list DTO as `previewUrl` — FE uses as same-origin src (cookie session) |
| 20 | **No silent side effects** | Upload/delete → persistence + `revalidatePath("/settings/preferences")` only — no jobs / providers |
| 21 | **XSS** | Filenames/metadata as React text — **no** `dangerouslySetInnerHTML` |
| 22 | **No human recording** | Never prompt camera/mic capture — file picker only |
| 23 | **Out of scope** | B-roll `work_photo`; US-3.4 QA UI; US-8 job UI/enforcement; US-8.3 / US-9.2 upload surfaces; productized AV; Preferencias schema reopen; auth redesign; browser Supabase; anonymous public serve |

### Strip vs reject (upload FormData / delete body)

| Keys | Behavior |
|------|----------|
| `file` (FormData — upload) | **Accept** — single file part; required |
| `assetId` (delete body) | **Accept** — UUID of own asset |
| Unknown FormData parts / delete keys | **Reject** → `VALIDATION_ERROR` / `FORBIDDEN_FIELDS` |
| `client_id`, `clientId`, `as_client_id` | **Reject** on delete body; **ignore/strip** if smuggled in FormData — never used in `WHERE` |
| `storage_key`, `storageKey`, `path`, `asset_type`, `assetType`, `metadata` | **Reject** — server-owned |
| `role`, `active`, `auth_user_id`, `authUserId` | **Reject** → `FORBIDDEN_FIELDS` |
| Query `?client_id=` on serve | **Forbidden** as identity — session only |

**Upload FormData:** exactly one file field named **`file`**. No JSON body on upload action.

---

## Route — `/settings/preferences` (**extend** — referencias section)

| Rule | Detail |
|------|--------|
| Path | **`/settings/preferences`** (frozen — same as US-3.1 / US-3.2) |
| Layout | Embed referencias upload + list below Consentimiento / Avatar propio block |
| Auth | `requireActive("page")`; off `isPublicPath` |
| Cache | `force-dynamic` / `Cache-Control: no-store` |
| Not on | Dedicated `/settings/avatar-references` in V1; not `/profile` edit |
| Nav | Existing Preferencias nav only |

---

## Route — `GET /api/media/assets/[assetId]` (**new** — serve)

| Rule | Detail |
|------|--------|
| Path | **`/api/media/assets/[assetId]`** (frozen) |
| Method | **GET** only |
| Auth | `requireActive("handler")` before load |
| Authz | `SELECT` row `WHERE id = assetId AND client_id = session AND asset_type = 'avatar_reference'` |
| Success | Stream body via `MediaStorage.readStream(storage_key)`; `Content-Type: metadata.detectedMime`; `Cache-Control: private, no-store`; `Content-Disposition: inline` (preview). Optional `Content-Disposition: inline; filename="sanitized-original"` from metadata — sanitize for HTTP header |
| Missing / foreign | **404** — uniform (no 403 enumeration) |
| Unauthenticated | **401** / redirect per US-14.5 layout — no stream |
| Forbidden | Inactive account → **403**; no stream |
| Never | Redirect to filesystem path; static `public/` mapping; expose `storage_key` in URL beyond opaque UUID id |

**File (BUILD):** `app/api/media/assets/[assetId]/route.ts`

**Why Route Handler (not Server Action):** binary stream response for `<img>` / `<video>` src; explicit HTTP caching headers.

---

## Config constants (**frozen env names**)

| Env var | Default | Purpose |
|---------|---------|---------|
| `NEURAMARK_MEDIA_ROOT` | `var/media` (relative to project root — resolve absolute at runtime) | `LocalDiskStorage` root — **outside** `public/` |
| `NEURAMARK_MEDIA_MAX_IMAGE_BYTES` | `10485760` (10 MiB) | Max upload when detected MIME is image class |
| `NEURAMARK_MEDIA_MAX_VIDEO_BYTES` | `52428800` (50 MiB) | Max upload when detected MIME is video class |
| `NEURAMARK_MEDIA_MAX_AVATAR_REFERENCES` | `10` | Max rows per `client_id` where `asset_type = 'avatar_reference'` |
| `NEURAMARK_MEDIA_MAX_VIDEO_DURATION_SEC` | `30` | Optional probe — enforce when implemented |

**MIME → extension map (storage_key only):**

| Detected MIME | Extension |
|---------------|-----------|
| `image/jpeg` | `jpg` |
| `image/png` | `png` |
| `image/webp` | `webp` |
| `video/mp4` | `mp4` |
| `video/quicktime` | `mov` |

---

## Shared upload validator — `validateAndPrepareMediaUpload` (**new** — export)

**File (BUILD):** `lib/media/upload-validation.ts` (`import "server-only"`)  
**Consumers:** `uploadAvatarReferenceAsset`; future US-8.3 / US-9.2 import same module with different `assetType` + allowlist branch — **do not fork validation**.

**Signature (frozen export surface):**

```ts
export type MediaUploadAssetType = "avatar_reference"; // V1; extend in siblings

export type ValidatedMediaUpload = {
  detectedMime: string;
  sizeBytes: number;
  storageKey: string;
  metadata: {
    originalFilename: string;
    detectedMime: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationSec?: number;
  };
  buffer: Buffer; // or stream handle — BUILD picks; must not persist before validation completes
};

/**
 * Shared SECURITY_BASELINE §3 pipeline.
 * @throws or returns Result — upload action maps to error envelope.
 */
export async function validateAndPrepareMediaUpload(input: {
  userId: string;
  assetType: MediaUploadAssetType;
  file: File | Buffer;
  originalFilename: string;
  existingAssetCount: number;
}): Promise<
  | { ok: true; prepared: ValidatedMediaUpload }
  | { ok: false; error: { code: MediaUploadErrorCode; messageKey?: string } }
>;
```

### Pipeline order (binding)

1. `requireActive("handler")` — caller responsibility before invoke; validator assumes authenticated `userId`.
2. **`hasActiveAvatarConsent(userId)`** — if false → `{ ok: false, error: { code: "OWN_AVATAR_CONSENT_REQUIRED" } }` (fail closed).
3. **Count cap** — if `existingAssetCount >= NEURAMARK_MEDIA_MAX_AVATAR_REFERENCES` → `ASSET_LIMIT_REACHED`.
4. Read upload into buffer/stream chunk for detection (enforce max bytes **during** read — do not write full oversize object to disk).
5. **Magic-byte detect** (`file-type` or successor) → allowlist only; ambiguous → `INVALID_FILE_TYPE`.
6. **Size class** — apply image vs video max from detected MIME.
7. **Optional duration probe** — if implemented and over `NEURAMARK_MEDIA_MAX_VIDEO_DURATION_SEC` → `VIDEO_TOO_LONG`.
8. **Generate `storageKey`** — UUID + ext from map; validate against regex; reject traversal patterns.
9. **Sanitize `originalFilename`** for metadata — max length (e.g. 255), strip control chars; never use for I/O path.
10. Return prepared payload — caller runs `MediaStorage.put` then DB INSERT.

**Optional hook (V1):** `afterValidate?(buffer: Buffer): Promise<void>` — no-op default; extension point for future AV — **not required for BUILD**.

**Do not:** trust client `Content-Type`, extension, or filename for storage path or MIME trust.

---

## `MediaStorage` interface (**new**)

**File (BUILD):** `lib/media/storage/media-storage.ts` (`import "server-only"`)

```ts
export interface MediaStorage {
  put(
    key: string,
    data: Buffer | ReadableStream,
    meta: { contentType: string; sizeBytes: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  readStream(key: string): Promise<ReadableStream>;
  /** Assert key matches frozen regex before any I/O */
  assertSafeKey(key: string): void;
}
```

### `LocalDiskStorage`

**File (BUILD):** `lib/media/storage/local-disk-storage.ts`

| Rule | Detail |
|------|--------|
| Root | From `NEURAMARK_MEDIA_ROOT`; resolve absolute at init |
| Guard | Startup assert root is **not** under `public/` or Next.js static dir |
| Key layout | `{root}/{storage_key}` — flat or sharded by first UUID char (BUILD choice); key always validated |
| Permissions | Process-only; not web-served |

### `S3Storage` (stub)

**File (BUILD):** `lib/media/storage/s3-storage.ts`

| Rule | Detail |
|------|--------|
| V1 | Implements interface; methods may `throw new Error("S3Storage not configured")` or no-op behind feature flag |
| Production target | Same-region object storage per SPEC §6 — swap adapter only; serve Route Handler unchanged |
| Client | **Never** receives bucket, region, presign PUT/GET, or keys |

**Factory (BUILD):** e.g. `getMediaStorage(): MediaStorage` — returns `LocalDiskStorage` in V1.

---

## Server helper — `getAvatarReferenceAssetsForClient` (**new**)

**File (BUILD):** `lib/media/get-avatar-reference-assets-for-client.ts` (`import "server-only"`)  
**Frontend consumer:** `/settings/preferences` RSC — referencias list section.

**Signature (frozen):**

```ts
export async function getAvatarReferenceAssetsForClient(): Promise<AvatarReferenceAssetsForClientResult>;
```

**Auth:** `requireActive("page")` inside helper (or page — BUILD must not accept tenant args).

### Return shape

```ts
/** BUILD: lib/contracts/media-assets.ts */

export const avatarReferenceAssetItemSchema = z
  .object({
    id: z.string().uuid(),
    assetType: z.literal("avatar_reference"),
    createdAt: z.string().datetime({ offset: true }),
    metadata: z
      .object({
        originalFilename: z.string().max(255),
        detectedMime: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/quicktime",
        ]),
        sizeBytes: z.number().int().positive(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        durationSec: z.number().positive().optional(),
      })
      .strict(),
    /** Same-origin authenticated serve path — not a public CDN URL */
    previewUrl: z.string().regex(/^\/api\/media\/assets\/[0-9a-f-]{36}$/),
  })
  .strict();

export const avatarReferenceAssetsForClientSchema = z
  .object({
    assets: z.array(avatarReferenceAssetItemSchema),
    maxAssets: z.literal(10),
    canUpload: z.boolean(), // true iff consent active AND count < maxAssets
    ownAvatarConsentActive: z.boolean(), // echo for UX — not upload authority alone
  })
  .strict();

export type AvatarReferenceAssetsForClientResult = z.infer<
  typeof avatarReferenceAssetsForClientSchema
>;
```

**Query:** parameterized SELECT on `neuramark_media_assets` `WHERE client_id = $server AND asset_type = 'avatar_reference' ORDER BY created_at ASC` (or DESC — BUILD picks one; CONTRACT prefers **newest last** in UI = **ASC** for stable “add to end” UX).

**Compute `canUpload`:** `ownAvatarConsentActive && assets.length < maxAssets` where `ownAvatarConsentActive = await hasActiveAvatarConsent(user.id)`.

**Do not:** return `storage_key`, absolute paths, other tenants’ rows, or presigned URLs.

---

## Server Action — `uploadAvatarReferenceAsset` (**new**)

**File (BUILD):** `lib/media/upload-avatar-reference-asset.ts` — `"use server"`  
**Frontend consumer:** Preferencias referencias Client section — file picker + progress.

**Signature (frozen):**

```ts
/**
 * Upload one avatar reference file (photo or short clip).
 * FormData field name: "file" (single part).
 * No tenant id arguments — identity only via requireActive("handler").
 */
export async function uploadAvatarReferenceAsset(
  formData: FormData,
): Promise<UploadAvatarReferenceAssetResult>;
```

**Auth:** `requireActive("handler")` **before** read/consent/validator.

### Success / error result

```ts
export const uploadAvatarReferenceAssetSuccessSchema = z
  .object({
    ok: z.literal(true),
    asset: avatarReferenceAssetItemSchema,
  })
  .strict();

export const mediaUploadErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "MISSING_FILE",
  "INVALID_FILE_TYPE",
  "FILE_TOO_LARGE",
  "VIDEO_TOO_LONG",
  "ASSET_LIMIT_REACHED",
  "OWN_AVATAR_CONSENT_REQUIRED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export const uploadAvatarReferenceAssetErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z
    .object({
      code: mediaUploadErrorCodeSchema,
      fields: z.record(z.string(), z.array(z.string())).optional(),
      messageKey: z.string().optional(),
    })
    .strict(),
});

export type UploadAvatarReferenceAssetResult =
  | z.infer<typeof uploadAvatarReferenceAssetSuccessSchema>
  | z.infer<typeof uploadAvatarReferenceAssetErrorEnvelopeSchema>;
```

### Server algorithm (frozen)

1. `requireActive("handler")` → resolve `user`. Fail → `UNAUTHENTICATED` / `FORBIDDEN`; no write.
2. Extract `formData.get("file")` — must be `File`. Missing / wrong type → `MISSING_FILE` / `VALIDATION_ERROR`.
3. Reject forbidden smuggled fields if present as FormData keys (`client_id`, etc.) → `FORBIDDEN_FIELDS`.
4. Count existing rows for `user.id` + `avatar_reference`.
5. Call **`validateAndPrepareMediaUpload`** with `assetType: "avatar_reference"`.
6. On validator failure → map code to error envelope; **no** partial persist.
7. `MediaStorage.put(prepared.storageKey, buffer, { contentType, sizeBytes })`.
8. Parameterized **INSERT** (service-role Node only):

```ts
.from("neuramark_media_assets")
.insert({
  client_id: user.id,
  asset_type: "avatar_reference",
  storage_key: prepared.storageKey,
  metadata: prepared.metadata,
})
.select("id, asset_type, storage_key, metadata, created_at")
.single();
```

9. On INSERT failure after successful put → attempt compensating `MediaStorage.delete(storageKey)`; log; return `INTERNAL_ERROR`.
10. `revalidatePath("/settings/preferences")`.
11. Return `{ ok: true, asset: /* map to item DTO with previewUrl */ }`.

### Explicit non-behavior

On success or failure, **must not**:

- Enqueue jobs / call providers / regenerate strategy or scripts  
- INSERT/UPDATE Preferencias or consent ledger  
- Write under `public/`  
- Return `storage_key` in client DTO  

### Outcome matrix

| Case | Result | FE |
|------|--------|-----|
| Valid file + active consent + under cap | `{ ok: true, asset }` | Refresh list; show preview |
| No consent | `OWN_AVATAR_CONSENT_REQUIRED` | Show consent CTA; disable upload |
| At cap (10) | `ASSET_LIMIT_REACHED` | Disable upload; explain max |
| Oversize | `FILE_TOO_LARGE` | Recoverable error + retry |
| Bad magic bytes / SVG / GIF | `INVALID_FILE_TYPE` | Recoverable error + hints |
| Video too long (if probed) | `VIDEO_TOO_LONG` | Recoverable error |
| Missing file part | `MISSING_FILE` | Validation message |
| Unauthenticated | `UNAUTHENTICATED` | Auth gate |

---

## Server Action — `deleteAvatarReferenceAsset` (**new**)

**File (BUILD):** `lib/media/delete-avatar-reference-asset.ts` — `"use server"`  
**Frontend consumer:** Preferencias referencias list — delete + confirm dialog.

**Signature (frozen):**

```ts
/**
 * Hard-delete one own avatar reference asset (storage + DB row).
 * Consent not required for delete of own retained assets.
 */
export async function deleteAvatarReferenceAsset(
  input: DeleteAvatarReferenceAssetInput,
): Promise<DeleteAvatarReferenceAssetResult>;
```

### Input

```ts
export const deleteAvatarReferenceAssetInputSchema = z
  .object({
    assetId: z.string().uuid(),
  })
  .strict();

export type DeleteAvatarReferenceAssetInput = z.infer<
  typeof deleteAvatarReferenceAssetInputSchema
>;
```

### Success / error result

```ts
export const deleteAvatarReferenceAssetSuccessSchema = z
  .object({
    ok: z.literal(true),
    deletedAssetId: z.string().uuid(),
  })
  .strict();

export const deleteAvatarReferenceAssetErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "FORBIDDEN_FIELDS",
  "NOT_FOUND",
  "ASSET_REFERENCED_BY_JOB",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INTERNAL_ERROR",
]);

export type DeleteAvatarReferenceAssetResult =
  | z.infer<typeof deleteAvatarReferenceAssetSuccessSchema>
  | { ok: false; error: { code: DeleteAvatarReferenceAssetErrorCode; messageKey?: string } };
```

### Server algorithm (frozen)

1. `requireActive("handler")` → resolve `user`.
2. Zod-parse `input` — unknown keys → `VALIDATION_ERROR` / `FORBIDDEN_FIELDS`.
3. Load row: `WHERE id = assetId AND client_id = user.id AND asset_type = 'avatar_reference'`.  
   - Not found → **`NOT_FOUND`** (404 semantics in envelope — same as foreign id).
4. **Job reference check (stub):** if `neuramark_video_jobs` exists and references this asset id → **`ASSET_REFERENCED_BY_JOB`**. If table absent → skip check (delete allowed).
5. `MediaStorage.delete(row.storage_key)`.
6. DELETE row (parameterized). If DB delete fails after storage delete → log; return `INTERNAL_ERROR` (compensating policy documented in BUILD).
7. `revalidatePath("/settings/preferences")`.
8. Return `{ ok: true, deletedAssetId }`.

**Consent:** **not** required for delete — Cliente may remove retained assets after revoke.

---

## Stub — `hasOwnAvatarReferenceAssets` (**new**)

**File (BUILD):** `lib/media/has-own-avatar-reference-assets.ts` (`import "server-only"`)  
**Consumers:** **US-8.x / US-10.x** job create (mandatory call site — document in JSDoc). This story: unit tests only; **no** job table writes.

**Signature (frozen):**

```ts
/**
 * True iff Cliente has ≥1 avatar_reference row.
 * US-8 job create MUST call this + hasActiveAvatarConsent + assertActiveAvatarConsentForJobs
 * before own-avatar production — never Preferencias allowlist alone.
 */
export async function hasOwnAvatarReferenceAssets(
  clientId: string,
): Promise<boolean>;
```

**Algorithm:** parameterized `COUNT(*)` or `EXISTS` on `neuramark_media_assets` `WHERE client_id = $clientId AND asset_type = 'avatar_reference'`. Invalid empty `clientId` → **`false`**. Query error → **`false`** (fail closed for gate purposes).

**Do not:** write job tables; treat Preferencias as authority.

---

## FE — Referencias UX (binding)

| Rule | Detail |
|------|--------|
| Placement | On `/settings/preferences` — section below Consentimiento / Avatar propio |
| Upload | File picker (PrimeReact FileUpload or native input); field maps to FormData **`file`**; show allowed formats + max size hints (EN/ES) |
| Consent | Hide/disable upload when `ownAvatarConsentActive === false`; explain need for **Consentimiento de avatar** |
| List | Show safe metadata (filename, type, date, size); preview via `previewUrl` / serve route |
| Delete | Confirm dialog; await action; recoverable error toast |
| Empty state | Explain referencias needed before own-avatar **production** (soft — does not hard-disable Preferencias `own_avatar`) |
| Cap | At 10 assets — disable upload + explain limit |
| Progress | Show upload in-flight / pending; recoverable errors allow retry without full reload |
| XSS | Filenames as React text — no `dangerouslySetInnerHTML` |
| Identity | No `client_id` in URL/body for tenancy |
| No recording | Never prompt camera/mic — upload only |
| i18n | `messages/en.json` + `es.json` — **referencias** / **Avatar propio autorizado**; avoid CONTEXT _Evitar_ |

---

## Database

Logical name in USER_STORIES: `media_assets`. Physical: **`neuramark_media_assets`**. Story column `path` → physical **`storage_key`**.

### Migration — **YES** (US-3.3 create)

```sql
-- US-3.3: Avatar reference media (referencias de avatar propio)
-- Product copy uses CONTEXT labels; technical columns only below.

CREATE TYPE public.neuramark_media_asset_type AS ENUM (
  'avatar_reference'
  -- future: 'work_photo', 'logo', 'voiceover', ... in sibling stories
);

CREATE TABLE public.neuramark_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  asset_type public.neuramark_media_asset_type NOT NULL,
  storage_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_media_assets_storage_key_nonempty_chk
    CHECK (char_length(trim(storage_key)) > 0),
  CONSTRAINT neuramark_media_assets_storage_key_relative_chk
    CHECK (
      storage_key !~ '^/' AND
      storage_key !~ '\\' AND
      storage_key !~ '\.\.' AND
      storage_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|mp4|mov)$'
    )
);

CREATE INDEX neuramark_media_assets_client_id_asset_type_idx
  ON public.neuramark_media_assets (client_id, asset_type);

CREATE INDEX neuramark_media_assets_client_id_created_at_idx
  ON public.neuramark_media_assets (client_id, created_at);

ALTER TABLE public.neuramark_media_assets ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).

COMMENT ON TABLE public.neuramark_media_assets IS
  'Cliente-owned media assets; US-3.3 ships avatar_reference only. storage_key is relative opaque key — never absolute path.';
COMMENT ON COLUMN public.neuramark_media_assets.storage_key IS
  'Server-generated relative key (UUID + safe ext). Story/AC name path. Never client-supplied.';
COMMENT ON COLUMN public.neuramark_media_assets.metadata IS
  'Server-written jsonb: originalFilename, detectedMime, sizeBytes, optional width/height/durationSec.';
```

| Rule | Detail |
|------|--------|
| PK | `id` uuid |
| FK | `client_id` → `neuramark_clients(id)` `ON DELETE CASCADE` |
| V1 enum | **`avatar_reference` only** |
| Hard delete | User delete removes row + blob — no soft-delete column V1 |
| RLS | Enabled; **zero** named policies; service-role Node only |
| Preferencias | **No FK** — logical link via `client_id` |
| Jobs | **Do not** create `neuramark_video_jobs` in this story |

Suggested filename (BUILD): `supabase/migrations/YYYYMMDDHHMMSS_neuramark_media_assets.sql`.

---

## Enums and state transitions

### Asset row lifecycle (V1)

```text
[no row]
  --uploadAvatarReferenceAsset (consent active, validation OK)-->  [row + blob exist]

[row + blob]
  --deleteAvatarReferenceAsset (own, not job-referenced)-->  [removed]

[row + blob]
  --consent revoke-->  [row + blob retained; new uploads blocked]
  --deleteAvatarReferenceAsset-->  [removed]  (still allowed)

[row + blob]
  --future: job references asset-->  delete blocked → ASSET_REFERENCED_BY_JOB
```

### Upload gate

```text
may_upload ⇔ hasActiveAvatarConsent(user.id) === true
           AND count(avatar_reference) < 10
(Preferencias own_avatar in allowlist is NOT sufficient)
```

### Production eligibility (US-8 — stub only in 3.3)

```text
may_start_own_avatar_production ⇔ hasActiveAvatarConsent(clientId)
                                  AND hasOwnAvatarReferenceAssets(clientId)
(full enforcement = US-8.x — helper + tests only here)
```

---

## Caching / revalidation

| Event | Action |
|-------|--------|
| `uploadAvatarReferenceAsset` success | `revalidatePath("/settings/preferences")` |
| `deleteAvatarReferenceAsset` success | `revalidatePath("/settings/preferences")` |
| Preferencias page | `force-dynamic` / `Cache-Control: no-store` |
| Serve GET | `Cache-Control: private, no-store` per response |

---

## Fixtures (FE mock)

### 1. List loader — empty (consent active)

```json
{
  "assets": [],
  "maxAssets": 10,
  "canUpload": true,
  "ownAvatarConsentActive": true
}
```

### 2. List loader — one image asset

```json
{
  "assets": [
    {
      "id": "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      "assetType": "avatar_reference",
      "createdAt": "2026-08-29T22:00:00.000Z",
      "metadata": {
        "originalFilename": "portrait.jpg",
        "detectedMime": "image/jpeg",
        "sizeBytes": 204800,
        "width": 800,
        "height": 1200
      },
      "previewUrl": "/api/media/assets/a1b2c3d4-e5f6-4789-a012-3456789abcde"
    }
  ],
  "maxAssets": 10,
  "canUpload": true,
  "ownAvatarConsentActive": true
}
```

### 3. Upload — success response

```json
{
  "ok": true,
  "asset": {
    "id": "b2c3d4e5-f6a7-4890-b123-456789abcdef",
    "assetType": "avatar_reference",
    "createdAt": "2026-08-29T22:05:00.000Z",
    "metadata": {
      "originalFilename": "clip.mov",
      "detectedMime": "video/quicktime",
      "sizeBytes": 5242880,
      "durationSec": 12
    },
    "previewUrl": "/api/media/assets/b2c3d4e5-f6a7-4890-b123-456789abcdef"
  }
}
```

### 4. Upload — no consent

```json
{
  "ok": false,
  "error": {
    "code": "OWN_AVATAR_CONSENT_REQUIRED",
    "messageKey": "preferences.errors.ownAvatarConsentRequired"
  }
}
```

### 5. Upload — file too large

```json
{
  "ok": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "messageKey": "preferences.references.errors.fileTooLarge"
  }
}
```

### 6. Upload — invalid type (SVG disguised as JPEG)

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_FILE_TYPE",
    "messageKey": "preferences.references.errors.invalidFileType"
  }
}
```

### 7. Upload — asset limit reached

```json
{
  "ok": false,
  "error": {
    "code": "ASSET_LIMIT_REACHED",
    "messageKey": "preferences.references.errors.assetLimitReached"
  }
}
```

### 8. Delete — success

**Request:**

```json
{
  "assetId": "a1b2c3d4-e5f6-4789-a012-3456789abcde"
}
```

**Response:**

```json
{
  "ok": true,
  "deletedAssetId": "a1b2c3d4-e5f6-4789-a012-3456789abcde"
}
```

### 9. Delete — not found (foreign or unknown id)

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "messageKey": "preferences.references.errors.notFound"
  }
}
```

### 10. Delete — referenced by job (future)

```json
{
  "ok": false,
  "error": {
    "code": "ASSET_REFERENCED_BY_JOB",
    "messageKey": "preferences.references.errors.referencedByJob"
  }
}
```

### 11. Serve — foreign assetId

**Request:** `GET /api/media/assets/00000000-0000-4000-8000-000000000099`  
**Response:** **404** (empty or minimal JSON — BUILD choice; no stream)

### 12. List — consent inactive (retained assets still listed)

```json
{
  "assets": [
    {
      "id": "a1b2c3d4-e5f6-4789-a012-3456789abcde",
      "assetType": "avatar_reference",
      "createdAt": "2026-08-28T10:00:00.000Z",
      "metadata": {
        "originalFilename": "portrait.jpg",
        "detectedMime": "image/jpeg",
        "sizeBytes": 204800
      },
      "previewUrl": "/api/media/assets/a1b2c3d4-e5f6-4789-a012-3456789abcde"
    }
  ],
  "maxAssets": 10,
  "canUpload": false,
  "ownAvatarConsentActive": false
}
```

### 13. Helper stub — false

```json
false
```

(from `hasOwnAvatarReferenceAssets(clientId)` when zero rows)

### 14. Helper stub — true

```json
true
```

### 15. Upload — smuggled client_id in FormData

**Behavior:** reject `FORBIDDEN_FIELDS` or ignore field — **must not** write to foreign tenant. No victim row created.

### 16. Unauthenticated upload

```json
{
  "ok": false,
  "error": { "code": "UNAUTHENTICATED" }
}
```

---

## Automated tests (security-relevant — BUILD)

- Upload happy path with active consent → row + file on disk outside `public/`.
- Oversize image/video → `FILE_TOO_LARGE`; no persist.
- Bad magic bytes / SVG / GIF → `INVALID_FILE_TYPE`; no persist.
- No consent → `OWN_AVATAR_CONSENT_REQUIRED`; no persist.
- Consent revoked → upload reject; **retained** asset still in list + serve 200 for own id.
- At cap (10) → `ASSET_LIMIT_REACHED`.
- Delete own asset → row gone + storage file gone.
- Delete foreign assetId → `NOT_FOUND`; victim unchanged.
- Serve foreign assetId → 404.
- Serve own asset → 200 stream; `private, no-store`; correct `Content-Type`.
- `storage_key` not in client DTOs.
- Path traversal filename / smuggled key rejected.
- `hasOwnAvatarReferenceAssets` true/false counts.
- Strip/ignore foreign `client_id` on upload/delete.
- Unauthenticated upload/delete/serve rejected.
- `LocalDiskStorage` root not under `public/` (config test).
- No job/strategy inserts from upload/delete success path.
- Shared validator export path stable for US-8.3 / US-9.2 import (smoke import test).

---

## Out of scope (do not implement)

| Topic | Owner |
|-------|--------|
| B-roll / fotos de trabajo (`work_photo`) | Sibling story |
| US-3.4 QA / disclosure UI | US-3.4 |
| Full job create / generation gate enforcement | US-8.x / US-10.x (helper stub only here) |
| US-8.3 manual video upload surface | US-8.3 (imports validator) |
| US-9.2 logo upload surface | US-9.2 (imports validator) |
| Productized virus scanning (ClamAV) | Deferred — optional hook only |
| Preferencias FK / schema reopen | Forbidden |
| Ficha viva asset metadata PATCH | Forbidden (US-2.2) |
| Dedicated `/settings/avatar-references` route | Out for V1 |
| `POST /api/media/assets` multipart Route Handler | Out for V1 (Server Action frozen) |
| Anonymous / signed public CDN URLs | Forbidden |
| Auth redesign / browser Supabase | Forbidden |
| Auto-delete assets on consent revoke | Forbidden in 3.3 |

---

## AC mapping (for validator — do not check USER_STORIES here)

| Acceptance criterion | Satisfied by |
|----------------------|--------------|
| At least one reference asset required before own-avatar production | `hasOwnAvatarReferenceAssets` export + unit tests; US-8 wiring later |
| Assets listed and deletable before first generation | List loader + delete action; job-reference stub when table absent |
| Failed upload shows recoverable error | Error envelope codes + messageKeys; FE retry UX |
| [SEC] Size + MIME allowlist via magic bytes | Shared validator + tests |
| [SEC] Server-generated storage keys | UUID + ext from detected MIME; metadata-only original filename |
| [SEC] Storage outside web root + ownership serve | `LocalDiskStorage` + `GET /api/media/assets/[assetId]` |
| [SEC] Upload only with active consent | `hasActiveAvatarConsent` on upload path |
| [SEC] Delete removes DB + file; own user only | Delete action + tests |
| [SEC] Storage behind server interface | `MediaStorage` + adapters; no client credentials |

---

## Disputes with SECURITY / SPEC

| Topic | Status |
|-------|--------|
| Table `neuramark_media_assets` / `storage_key` / no Preferencias FK | **No dispute** — SPEC ALIGNED; SECURITY APPROVE; frozen |
| Limits 10 MiB / 50 MiB / 10 assets | **No dispute** — SECURITY frozen defaults |
| Magic-byte allowlist + denylist | **No dispute** — SECURITY hard |
| Upload = Server Action + FormData (not POST Route Handler) | **No dispute** — SECURITY allowed either; **frozen Server Action** per PO + user request |
| Serve = `GET /api/media/assets/[assetId]` | **No dispute** — SECURITY APPROVE |
| Consent gate upload-only; retain on revoke | **No dispute** — SPEC + SECURITY APPROVE |
| Delete when jobs absent | **No dispute** — stub OK until US-8 |
| Video duration 30s probe optional V1 | **Condition** — SECURITY allows deferral to US-8; documented |
| Virus scan deferred | **Condition** — residual risk note in CONTRACT header |
| UI on Preferencias page | **No dispute** — PO lean + SECURITY APPROVE |
| `file-type` dependency | **No dispute** — SECURITY sanctioned |
| B-roll fotos de trabajo out of scope | **Tracked gap** (SPEC-REVIEW) — not a CONTRACT conflict |
| Local disk V1 vs SPEC §6 same-region S3 | **No dispute** — `S3Storage` stub + migration path; production adapter later |

No SECURITY vetoes triggered. No SPEC amendment required.

---

## CONTRACT checklist (pre-BUILD)

- [x] Surfaces: Preferencias embed; `uploadAvatarReferenceAsset` FormData; `deleteAvatarReferenceAsset`; `getAvatarReferenceAssetsForClient`; `GET /api/media/assets/[assetId]`; `no-store`; off `isPublicPath`
- [x] Table: `neuramark_media_assets`; enum `avatar_reference` V1; indexes; RLS deny-by-default; no Preferencias FK
- [x] Limits + env names; magic-byte allowlist + denylist; `file-type`
- [x] `storage_key` regex + MIME→ext map; metadata-only original filename
- [x] Shared validator module export; pipeline order; consent inside validator
- [x] `MediaStorage` + `LocalDiskStorage` outside `public/`; `S3Storage` stub
- [x] Upload/delete error envelopes; strip list; recoverable codes
- [x] Serve ownership; 404 foreign; stream headers
- [x] Helper `hasOwnAvatarReferenceAssets`; US-8 call site documented
- [x] Consent: import US-3.2; revoke retains assets; block new uploads
- [x] Fixtures + automated tests listed
- [x] Residual malware risk note
- [x] Non-goals: B-roll; US-8 job UI; US-8.3/9.2 surfaces; virus scanner; anonymous serve
- [x] **Frozen** — 2026-08-29
- [x] **Reviewed by FE:** yes — 2026-08-29

---

## FE signoff prompts

When reviewing, confirm:

1. Referencias section on `/settings/preferences` (not dedicated route) enough? **Yes** — matches US-3.1 / US-3.2 Preferencias embed pattern  
2. `getAvatarReferenceAssetsForClient()` + existing consent loaders composition OK? **Yes** — arity-0 + `canUpload` / `ownAvatarConsentActive` echo  
3. Upload via `uploadAvatarReferenceAsset(formData)` with field **`file`** OK for PrimeReact FileUpload / native input? **Yes** — native input or FileUpload `customUpload` → FormData  
4. Preview via relative `previewUrl` → `/api/media/assets/{id}` as `<img>` / `<video>` src OK? **Yes** — same-origin cookie session  
5. Delete body `{ assetId }` + confirm dialog OK? **Yes**  
6. Error codes (`FILE_TOO_LARGE`, `INVALID_FILE_TYPE`, `ASSET_LIMIT_REACHED`, `OWN_AVATAR_CONSENT_REQUIRED`, `NOT_FOUND`) enough for recoverable UX? **Yes**  
7. Empty state + cap-at-10 copy OK? **Yes**  
8. Upload disabled when consent inactive but list/delete retained assets OK? **Yes**

**Signoff:** `Reviewed by FE: yes — 2026-08-29`
