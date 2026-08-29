# Security Design Review — US-3.3

**Story:** US-3.3 — Upload avatar reference assets (own avatar)  
**Date:** 2026-08-29  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-3.3 `[SEC]`), `plan/SECURITY_BASELINE.md` §3 (shared upload validation stack), `plan/stories/US-3.3/README.md`, `TASKS.md`, `SPEC-REVIEW.md` (ALIGNED), `plan/stories/US-3.2/SECURITY.md` (Consentimiento gate carry-forward), SPEC §3 S3.M4 / §6 NFRs  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.

---

## Verdict: APPROVE WITH CONDITIONS

The story shape is correct and SPEC-aligned: ship **referencias de avatar propio** as **`neuramark_media_assets`** rows scoped by server-resolved **`client_id`** + **`asset_type = 'avatar_reference'`**; persist bytes via a server-only **`MediaStorage`** interface (**`LocalDiskStorage`** now, **`S3Storage`** stub later); enforce a **shared upload validation stack** (size → magic-byte MIME allowlist → server-generated relative **`storage_key`** → put outside **`public/`** → ownership-checked serve); gate **every upload** on live **`hasActiveAvatarConsent`** (US-3.2, version-aware — never Preferencias alone); list / preview / delete for the session Cliente only; export **`hasOwnAvatarReferenceAssets(clientId)`** stub for US-8 job gates; RLS deny-by-default + service-role Node only; no browser Supabase; no storage credentials client-side.

No REDESIGN. No veto of SPEC-REVIEW / PO leans on: no Preferencias FK, **`avatar_reference` only** (no B-roll), retain assets on consent revoke (block new uploads only), Preferencias-page upload UI, hard delete on user action, defer productized virus scanning. Orchestrator may proceed to **CONTRACT.md** after freezing the items below.

**Inherited floors (US-1.x / US-2.2 / US-2.3 / US-3.1 / US-3.2 / US-14.5 — do not weaken):** identity only via `getCurrentUser()` / `requireActive()`; strip/reject browser `client_id`; Preferencias upsert continues to reject `own_avatar` without active consent (US-3.1 + US-3.2); Ficha viva PATCH still rejects Preferencias / consent / asset keys (US-2.2); agents helper remains `import "server-only"` and must **omit raw storage keys, filesystem paths, and unauthenticated serve URLs** (US-2.3); parameterized SQL; no `@supabase/supabase-js` in Client Components; filenames / metadata rendered as React text — no `dangerouslySetInnerHTML`; gated settings off `isPublicPath` with `Cache-Control: no-store`.

**This story owns:** `neuramark_media_assets` migration; **`MediaStorage`** + **`LocalDiskStorage`**; **`S3Storage`** interface stub; shared upload validator module (exported for US-8.3 / US-9.2); upload + list + delete endpoints; ownership-checked serve Route Handler; consent gate on upload; **`hasOwnAvatarReferenceAssets`** helper + unit tests.

**This story does not own:** US-3.4 QA / disclosure UI; US-8.x full job create / provider enqueue / Operator job UI; US-8.3 manual video upload surface; US-9.2 logo upload surface; B-roll **fotos de trabajo** asset type; productized AV (ClamAV, async quarantine); Preferencias allowlist schema reopen; Ficha viva asset metadata editors; auth redesign; browser Supabase; anonymous/public serve without ownership check.

**Terminology:** **Avatar propio autorizado** · **Consentimiento de avatar** · **Preferencias de producción visual** · **referencias** · **Cliente** · **Operator** · **Ficha viva**. Technical tokens (`own_avatar`, `avatar_reference`, `neuramark_media_assets`, `storage_key`) OK in code/DB/engineering docs only — never primary UI headlines. Do not use CONTEXT _Evitar_ terms (esp. “media_assets” as product label) in CONTRACT product copy or EN/ES headlines.

---

### Threat Summary (US-3.3–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Unauthenticated / cross-tenant access to likeness media** | Highest — biometric-adjacent portrait/clips leaked | Serve + delete + list scoped `WHERE client_id = $server`; foreign `assetId` → **404**; `requireActive("handler")`; no public static URLs |
| **Upload without Consentimiento** | Legal likeness storage without authorization | Upload path **rejects** unless `hasActiveAvatarConsent(user.id)` true (version-aware, fail-closed — same helper as US-3.2); UI disable/hide when inactive |
| **MIME spoofing / polyglot / HTML-SVG-GIF disguised as image** | XSS, server-side gadget, pipeline abuse | Magic-byte detection from **file content**; explicit denylist (SVG, GIF, HTML, `text/*`, `application/*` except allowed video); **ignore** client `Content-Type` and extension for trust |
| **Oversized / resource-exhaustion uploads** | DoS, disk fill, runaway cost | Configurable max bytes per detected class; max asset count per client; optional video duration cap; reject before full buffer persist where streaming allows |
| **Path traversal via client filename or storage key** | Read/write arbitrary server paths | **`storage_key`** = server UUID + safe extension from **detected** MIME only; original filename **metadata only**; validate key shape (no `..`, no absolute paths, no leading `/`); storage root resolved server-side |
| **Serving from `public/` or leaking filesystem paths** | Irreversible public URLs; path disclosure | **`LocalDiskStorage`** root **outside** web root; **`storage_key`** relative; serve streams via Route Handler only; DTOs omit absolute paths |
| **IDOR on delete** | Victim likeness media destroyed or enumerated | Delete loads row by id **and** `client_id = session`; parameterized queries; 404 for foreign ids |
| **Client-side storage credentials / presigned URLs** | Bucket takeover, exfiltration | **`MediaStorage`** server-only; no env vars, bucket names, or presign logic in Client Components; FE uses authenticated serve URL or blob from same-origin fetch |
| **Stale consent / Preferencias flag bypass** | Upload after revoke | Upload gate reads **live** ledger via `hasActiveAvatarConsent` — never cached Preferencias flag or “once consented” client state |
| **SQL injection / RLS bypass via service role** | Cross-tenant row access | Parameterized queries; RLS enabled **zero policies**; service-role Node only; never browser Supabase |
| **XSS via filename or preview** | Script in list UI | Escape filenames in React text nodes; previews via authenticated serve or blob — no raw HTML inject |
| **Malware in uploaded clips (residual)** | Server-side processing risk in US-8/US-9 | Magic bytes + size + type denylist for V1; **productized virus scan deferred** — documented residual risk + optional hook point only |

**Residual risk accepted:** Productized AV scanning (ClamAV, async quarantine) is **deferred** — magic-byte allowlist + size caps + explicit SVG/GIF/HTML deny reduce but do not eliminate malware risk; US-8/US-9 pipelines must treat stored bytes as untrusted input. Full job-time “≥1 asset” enforcement is **stub** (`hasOwnAvatarReferenceAssets` + unit tests) until US-8.x — same phased pattern as US-3.2 job stubs. Hardcoded local user via `getCurrentUser()` until auth stories land is sanctioned, not a finding. Assets **retained** on consent revoke (no auto-delete) — upload blocked until re-consent; existing files remain deletable by Cliente. V1 **`LocalDiskStorage`** on Vercel is acceptable for internal/dev; production should migrate to same-region object storage per SPEC §6 — **`S3Storage`** stub must preserve interface swap without client changes.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Uploaded portrait photos / short clips | **Highest** — likeness / biometric-adjacent | Browser multipart → server validator → storage; never `public/` |
| `neuramark_media_assets` rows | **Highest** — maps Cliente → storage keys + metadata | Service-role Node; RLS deny-by-default |
| `storage_key` (relative) | High — indirect path to bytes | Server-generated only; never client-writable |
| `metadata` jsonb (`originalFilename`, `detectedMime`, `sizeBytes`, …) | Medium–High — PII-adjacent | Server-written after validation; original filename never used for I/O |
| Serve stream bytes | Highest | Authenticated Route Handler + ownership query |
| `MediaStorage` root / future S3 credentials | Critical | Server env only; never Client Components |
| Active Consentimiento probe (adjacent) | Highest — upload gate | US-3.2 `hasActiveAvatarConsent`; fail-closed |
| `client_id` / `CurrentUser.id` | High — tenancy key | Only from `getCurrentUser()` / `requireActive` |
| Session cookie | High — US-14.5 | Unchanged; CSRF via Server Action / same-origin fetch |
| Service-role key | Critical | Node only |

**Boundaries:**

1. **Browser → upload endpoint** — Untrusted: file bytes, original filename, client `Content-Type`, extension. Trusted only after server validation. `requireActive("handler")` before consent check + validator. Identity never from body/query.
2. **Browser → serve Route Handler** — Untrusted: `assetId` path param. Handler resolves session → loads row `id = $param AND client_id = $server` → streams via `MediaStorage.readStream`. `Cache-Control: private, no-store`. Correct `Content-Type` from stored **`detectedMime`** (metadata), not re-sniffing untrusted bytes on every GET unless CONTRACT specifies.
3. **Browser → delete endpoint** — Same ownership as serve; removes DB row **and** storage object; foreign id → **404**.
4. **Browser → list loader (RSC)** — Arity 0; returns own assets minimal DTO (id, type, safe metadata, preview URL path) — omit `storage_key`, absolute paths, other tenants.
5. **Next.js → Postgres** — Parameterized INSERT/SELECT/DELETE where `client_id = user.id`. Service-role; RLS enabled, **zero** named policies on `neuramark_media_assets`.
6. **Next.js → filesystem / future S3** — Only through **`MediaStorage`**; keys validated; root outside web root.
7. **Consent gate** — Upload boundary **requires** live `hasActiveAvatarConsent(user.id)`; revoke does not delete assets but **blocks new uploads** until re-consent (PO lean — APPROVED).
8. **US-2.2 PATCH / US-2.3 agents** — Must not expose raw keys or unauthenticated URLs; do not reopen for asset metadata writes.
9. **Auth** — Reuse US-14.5. Serve/upload/delete on gated paths; not on `isPublicPath`.

---

## Abuse Cases Considered

- *As a malicious actor, I upload a 500 MB file or 10,000 files to fill disk* → **Blocked:** configured max bytes per class; max **10** `avatar_reference` rows per `client_id`; reject before persist where possible.
- *As a malicious actor, I POST `Content-Type: image/jpeg` with an HTML/SVG/polyglot payload* → **Blocked:** magic-byte allowlist; explicit SVG/GIF/HTML/`text/*` deny; extension ignored for trust.
- *As a malicious actor, I set filename `../../etc/passwd` or craft `storage_key` in body* → **Blocked:** server UUID key only; original name metadata-only; key validation rejects `..`, absolute paths, separators outside allowed pattern.
- *As a malicious actor, I guess `/public/uploads/victim.jpg` or static path from `storage_key`* → **Blocked:** no writes under `public/`; serve only via auth Route Handler.
- *As a malicious actor, I GET `/api/media/assets/{victimAssetId}` or DELETE another Cliente’s asset* → **Blocked:** ownership query; foreign id → **404** (not 403 enumeration); parameterized SQL.
- *As a malicious actor, I upload after revoking Consentimiento but still have `own_avatar` in Preferencias* → **Blocked:** upload re-checks live `hasActiveAvatarConsent`; Preferencias flag is not authority.
- *As a malicious actor, I upload without ever granting Consentimiento* → **Blocked:** consent gate fail-closed; UI disabled when inactive.
- *As a malicious actor, I pass `{ client_id: victim }` on upload/delete/list* → **Blocked:** reject/strip tenant ids; all queries `WHERE client_id = $server`.
- *As a malicious actor, I obtain S3 keys or `NEURAMARK_MEDIA_ROOT` from client bundle* → **Blocked:** no storage creds or roots in Client Components; env server-only.
- *As a malicious actor, I embed `<script>` in filename and trigger XSS in list* → **Blocked:** React text nodes; no `dangerouslySetInnerHTML` for filenames.
- *As a malicious actor, I CSRF upload/delete from evil.example* → **Blocked:** Server Actions / Route Handlers with session + Next.js origin checks; `requireActive("handler")`.
- *As a malicious actor, I call upload unauthenticated* → **Blocked:** `requireActive` → **401** / **403**; no write.
- *As a malicious actor, I delete assets referenced by a queued job to break pipeline* → **Mitigated (V1):** delete allowed when jobs table absent or no referencing row; when `neuramark_video_jobs` exists, block delete if referenced — stub check OK in 3.3.
- *As a malicious actor, I rely on cached serve response after revoke* → **Mitigated:** serve checks ownership each request; consent not required for **read** of already-uploaded own assets (retained on revoke — PO lean); new uploads blocked. Job-time consumption must re-check consent in US-8 (out of scope here).
- *As an Operator, I cross-tenant read/delete Cliente referencias* → **Blocked:** no Operator bypass; own `client_id` only for Cliente upload flows.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-3.3 are binding. Items marked **(added)** are new in this review — paste into USER_STORIES when the PO next edits. Do not drop or weaken existing `[SEC]` lines. Do not check boxes in USER_STORIES from this gate.

**Inherited (still binding on adjacent surfaces — do not weaken):**

- [ ] **[SEC] Interview sessions / profiles are loaded only for the client resolved via server-side `getCurrentUser()`;** no `client_id` accepted from the request body or query string *(Cliente paths)*
- [ ] **[SEC] PATCH accepts an explicit allowlist of editable fields; consent flags, `visual_mode` rules, asset paths, and system fields cannot be modified through Ficha viva PATCH even if present in the payload** *(US-2.2)*
- [ ] **[SEC] `getBusinessProfileForAgents` is a server-only module** and **contract output excludes raw storage keys, filesystem paths, and unauthenticated media URLs** *(US-2.3)*
- [ ] **[SEC] Preferencias modality values are validated server-side against the enum; selecting / persisting `own_avatar` is rejected server-side when no active consent exists**, independent of UI disabling *(US-3.1 + US-3.2)*
- [ ] **[SEC] Uploads are only accepted when an active (non-revoked, current-version) avatar consent exists** — same `hasActiveAvatarConsent` as US-3.2; **never** Preferencias allowlist or client cache alone *(US-3.2 carry-forward)*
- [ ] **[SEC] Free-text / filename strings are stored as data and always rendered escaped;** never interpolated into HTML, SQL, or shell

**US-3.3 story `[SEC]` (existing — binding interpretations below):**

- [ ] **[SEC] Upload endpoint rejects files over a configured size limit and any MIME type outside an image/video allowlist; type is verified from file content (magic bytes), not the client-supplied Content-Type or extension**
- [ ] **[SEC] Stored filenames are server-generated (UUID + safe extension); the original client filename is stored as metadata only and never used to build the storage path (path traversal guard)**
- [ ] **[SEC] Files are stored outside the web root / `public` directory and served through a route that checks the asset belongs to the current user; `storage_key` values are relative keys, not absolute filesystem paths**
- [ ] **[SEC] Uploads are only accepted when an active (non-revoked) avatar consent exists for the client**
- [ ] **[SEC] Delete removes both the DB row and the stored file, and is only allowed for assets owned by the server-resolved current user**
- [ ] **[SEC] Storage layer is behind a small server-side interface (local disk now, S3 later) so credentials and paths never appear client-side**

**Added in this review:**

- [ ] **[SEC] (added) Table `neuramark_media_assets`:** `id` PK, `client_id` FK → `neuramark_clients`, `asset_type` (V1: **`avatar_reference` only**), `storage_key` (relative key — never absolute path), `metadata` jsonb (at minimum `originalFilename`, `detectedMime`, `sizeBytes`; optional `width`/`height`/`durationSec` if probed server-side), `created_at`. **RLS enabled, deny-by-default, zero named policies;** service-role Node only; parameterized queries; `neuramark_` prefix. Index `(client_id, asset_type)` for list + count helper. **No FK** on `neuramark_visual_preferences` (logical link via `client_id`)
- [ ] **[SEC] (added) Frozen size / count limits (env-configurable, defaults):** images ≤ **10 MiB**; video clips ≤ **50 MiB**; max **10** `avatar_reference` rows per `client_id`; reject upload when at cap. Video duration ≤ **30 s** when cheaply probeable server-side — if not probed in V1, document in CONTRACT and enforce at US-8 ingest instead
- [ ] **[SEC] (added) Frozen magic-byte allowlist:** **`image/jpeg`**, **`image/png`**, **`image/webp`**, **`video/mp4`**, **`video/quicktime`** only. **Explicit deny:** SVG, GIF, HTML, `text/*`, `application/javascript`, generic `application/octet-stream` unless matched to allowed signatures. Detection library (e.g. `file-type`) reads **initial buffer / stream** — not client headers. Mismatch → reject with recoverable error; **no** partial persist
- [ ] **[SEC] (added) Server-generated `storage_key`:** `{uuid}.{ext}` where `ext` is derived from **detected** MIME via fixed map (e.g. `jpg`, `png`, `webp`, `mp4`, `mov`) — never from client extension. Validate key with allowlist regex (e.g. `^[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|mov)$` — CONTRACT freezes exact pattern). Reject `..`, `/`, `\`, NUL, URL-encoded traversal
- [ ] **[SEC] (added) Shared upload validator module** (SECURITY_BASELINE §3): single server-only export used by upload path; US-8.3 / US-9.2 **import same module** later — no duplicate validation logic. Pipeline: `requireActive` → consent gate → size → magic bytes → key generation → `MediaStorage.put` → DB insert
- [ ] **[SEC] (added) `MediaStorage` interface** (`import "server-only"`): `put(key, buffer|stream, meta)`, `delete(key)`, `readStream(key)` (or equivalent). **`LocalDiskStorage`:** root from env e.g. `NEURAMARK_MEDIA_ROOT`, resolved absolute, **must not** be under `public/` or project web root. **`S3Storage`:** stub implementing interface; no production creds required in 3.3 BUILD; **no** client exposure of bucket/region/keys
- [ ] **[SEC] (added) Upload endpoint** (CONTRACT name): `requireActive("handler")`; **`hasActiveAvatarConsent(user.id)`** or reject (**403** / domain error — fail closed); run shared validator; insert row; return minimal DTO (id, assetType, createdAt, safe metadata — **no** `storage_key`). Reject/strip `client_id`, `storage_key`, `asset_type` override from client unless CONTRACT defines server-only enum validation
- [ ] **[SEC] (added) Serve Route Handler** (PO lean **`GET /api/media/assets/[assetId]`** — CONTRACT freezes path): `requireActive("handler")`; load by `id` **and** `client_id = session`; stream via `MediaStorage.readStream(storage_key)`; `Content-Type` from stored `detectedMime`; **`Cache-Control: private, no-store`**; **`Content-Disposition: inline`** for preview (CONTRACT may add `filename*` from sanitized metadata). Foreign / missing → **404**. Never redirect to raw filesystem or unsigned public URL
- [ ] **[SEC] (added) Delete endpoint** (CONTRACT name): `requireActive("handler")`; ownership `id + client_id = session`; delete storage object then DB row (or compensating order documented — if DB delete fails after storage delete, log + fail closed). Foreign id → **404**. **Before first generation:** allow delete when `neuramark_video_jobs` absent or no row references asset; when jobs table exists, reject delete if referenced (**409** or domain error). Hard delete V1 (no soft-delete column required)
- [ ] **[SEC] (added) List loader arity 0:** returns own `avatar_reference` assets ordered by `created_at`; minimal DTO; preview URL may be relative serve path — **omit** `storage_key`, internal roots, other tenants
- [ ] **[SEC] (added) IDOR / tenancy:** all SELECT/INSERT/DELETE `WHERE client_id = user.id`; parameterized queries; never trust browser `client_id`, `assetId` in body as authority for another tenant; UUID `assetId` only as lookup key **after** session bind
- [ ] **[SEC] (added) Consent revoke behavior:** on revoke, **retain** existing assets; **block new uploads** until re-consent; list/delete/serve of **own** retained assets still allowed in V1 (PO lean). US-8 job create must re-check consent + assets — not implemented in 3.3 beyond helper export
- [ ] **[SEC] (added) Production helper stub:** export **`hasOwnAvatarReferenceAssets(clientId)`** → `true` iff ≥1 `avatar_reference` row for client; unit-tested; documented mandatory US-8 call site; **no** job table writes in 3.3
- [ ] **[SEC] (added) UI:** upload section on gated Preferencias surface (PO lean `/settings/preferences`); hide/disable upload when consent inactive; EN+ES hints for allowed formats + max size; recoverable errors; **no** camera/mic / recording prompts; previews via authenticated serve or same-origin blob — no third-party CDN URLs with raw keys
- [ ] **[SEC] (added) XSS bar:** filenames and metadata in React text nodes — **no** `dangerouslySetInnerHTML`; no `eval`
- [ ] **[SEC] (added) Residual malware risk documented:** V1 relies on magic bytes + size + denylist — **no** productized virus scanner. Optional extension hook in validator OK; do not block BUILD on ClamAV. US-8/US-9 must treat file bytes as untrusted
- [ ] **[SEC] (added) No silent job enqueue / provider calls from upload or delete** — persistence + revalidate only
- [ ] **[SEC] (added) Automated security tests cover at least:** upload happy path with consent; oversize reject; bad magic bytes reject; SVG/GIF reject; no consent reject; consent revoked → upload reject (retained asset still listable/servable); delete removes row + storage file; serve foreign asset → 404; delete foreign asset → 404; path traversal key rejected; max count cap; helper true/false; strip foreign `client_id`; unauthenticated upload/serve/delete rejected; no `storage_key` in client-facing DTO; settings/serve routes not public + `no-store`

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Shared upload validation stack — **APPROVE (hard, SECURITY_BASELINE §3)**

| Step | Rule |
|---|---|
| 1 | `requireActive("handler")` |
| 2 | `hasActiveAvatarConsent(user.id)` → else reject (fail closed) |
| 3 | Enforce max count per client |
| 4 | Enforce max bytes (image vs video class from detected MIME) |
| 5 | Magic-byte detect → allowlist only |
| 6 | Generate `storage_key` = UUID + safe ext from detected MIME |
| 7 | `MediaStorage.put` outside `public/` |
| 8 | INSERT `neuramark_media_assets` with server metadata |

Client `Content-Type`, extension, and `originalFilename` are **never** used for storage path or trust decisions.

#### 2. Magic-byte MIME — **APPROVE (hard)**

| Allowed (detected) | Denied (non-exhaustive) |
|---|---|
| `image/jpeg`, `image/png`, `image/webp` | SVG, GIF, WebP-with-script polyglots that fail signature, HTML, `text/*` |
| `video/mp4`, `video/quicktime` | All other `video/*`, `application/*`, executable signatures |

Use a maintained detector (PO lean: `file-type` or successor). Read from upload stream/buffer — minimum bytes per library. On ambiguous detect → **reject**.

#### 3. Size / count limits — **APPROVE WITH CONDITIONS (frozen defaults)**

| Limit | Default |
|---|---|
| Image max | **10 MiB** (`NEURAMARK_MEDIA_MAX_IMAGE_BYTES`) |
| Video max | **50 MiB** (`NEURAMARK_MEDIA_MAX_VIDEO_BYTES`) |
| Max assets per client | **10** (`NEURAMARK_MEDIA_MAX_AVATAR_REFERENCES`) |
| Video duration | **30 s** when probed — optional V1; if skipped, CONTRACT documents and US-8 must probe |

Enforce **before** writing full object to disk when using streaming upload.

#### 4. Server-generated keys + path traversal — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Key shape | UUID v4 + `.` + allowlisted extension from **detected** MIME |
| Original filename | `metadata.originalFilename` only — sanitize for display (length cap, strip control chars) |
| Forbidden in keys | `..`, absolute paths, `\`, leading `/`, URL-encoded traversal |
| DB column | `storage_key` relative — story name `path` |

#### 5. Storage outside web root + `MediaStorage` — **APPROVE (hard)**

| Component | Requirement |
|---|---|
| `LocalDiskStorage` | Root e.g. `var/media/` or `NEURAMARK_MEDIA_ROOT`; verified not under `public/` |
| `S3Storage` | Interface-compatible stub; same-region object storage target for production per SPEC §6 |
| Client | No bucket names, roots, presigned PUT/GET construction, or service keys |

Migrating local → S3 must be a **backend adapter swap** — serve Route Handler and DTO shapes unchanged.

#### 6. Ownership-checked serve route — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Path | PO lean `GET /api/media/assets/[assetId]` — CONTRACT freezes |
| Auth | Session cookie + `requireActive("handler")` |
| Authz | Row `id = assetId AND client_id = session` |
| Response | Stream body; `private, no-store`; `Content-Type` from `metadata.detectedMime` |
| Forbidden | Static mapping under `public/`; unsigned permanent URLs; exposing `storage_key` in URL |

Signed short-lived URLs are **not** required V1; may be added inside `S3Storage` later without client credential exposure.

#### 7. Consent gate (US-3.2 carry-forward) — **APPROVE (hard)**

| Rule | Detail |
|---|---|
| Upload | Requires `hasActiveAvatarConsent(user.id) === true` (version-aware, fail-closed) |
| Not sufficient | Preferencias `own_avatar` in allowlist; client “I consented” flag; cached loader state without re-check on mutation |
| Revoke | Block **new** uploads; retain existing bytes (PO lean — no auto-delete in 3.3) |
| Re-consent | Upload allowed again when probe true |

Import **`hasActiveAvatarConsent`** from US-3.2 module — **do not duplicate** consent logic.

#### 8. IDOR on delete (and serve/list) — **APPROVE (hard)**

| Operation | Query |
|---|---|
| Serve | `WHERE id = $1 AND client_id = $session` |
| Delete | Same; then `MediaStorage.delete(storage_key)` + DELETE row |
| List | `WHERE client_id = $session AND asset_type = 'avatar_reference'` |
| Foreign id | **404** (consistent — avoid 403 enumeration) |

#### 9. RLS `neuramark_media_assets` — **APPROVE (hard)**

- RLS **ENABLED**
- **Zero** named policies (deny-by-default for anon/authenticated Supabase clients)
- All access via service-role Node in Next.js server code
- Matches US-3.2 ledger pattern

#### 10. Delete semantics — **APPROVE WITH CONDITIONS**

| Case | Behavior |
|---|---|
| Own asset, no job reference | Hard delete storage + row |
| Foreign asset | **404** |
| Job table absent (V1) | Delete always allowed for own assets |
| Job references asset (future) | Reject delete — CONTRACT freezes error code |

“Before first generation” AC satisfied for V1 when jobs table missing; stub reference check when table lands.

#### 11. Virus scanning — **APPROVE deferral (condition)**

Productized AV is **out of scope**. Condition: SECURITY residual risk note in CONTRACT + optional `afterValidate?(buffer)` hook in shared module. Do **not** require ClamAV for BUILD approval.

#### 12. UI placement — **APPROVE (PO lean)**

Upload block on `/settings/preferences` below Consentimiento / Avatar propio is acceptable. Dedicated route also OK if FE prefers — both gated + `no-store`. No security veto.

---

### Required implementation constraints

1. Media modules under server-only paths (`import "server-only"` for storage, validator, actions, serve handler).
2. Author shared validator **first** — US-8.3 / US-9.2 will import; keep surface stable.
3. Do **not** weaken US-2.2 strip of asset/consent keys on Ficha viva PATCH.
4. Do **not** dump `storage_key` or media URLs into `getBusinessProfileForAgents`.
5. Do **not** add Preferencias FK column unless SECURITY amends (current decision: **no FK**).
6. Migrations via Supabase only; `neuramark_` prefix; no ad-hoc SQL.
7. **New package justification:** `file-type` (or successor) for magic bytes — sanctioned in SECURITY_BASELINE dependency guidance. No browser Supabase. No shell-out to `ffmpeg` on upload path unless SECURITY amends (PO lean: no ffmpeg in 3.3).
8. **Tests (security-relevant):** magic bytes; size; count cap; consent gate; IDOR serve/delete; path traversal key; storage outside public (config assertion); DTO omits keys; helper stub; unauthenticated rejected.

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Trust client `Content-Type`, extension, or filename for storage path or MIME | **REJECT** |
| Write uploads under `public/` or serve via static file mapping | **REJECT** |
| Accept upload without live `hasActiveAvatarConsent` (or duplicate/weaken consent logic) | **REJECT** |
| Accept `client_id` / `as_client_id` from browser as read/write authority | **REJECT** |
| Return **403** on foreign asset id (enumerating existence) instead of uniform **404** where feasible | **REJECT** (prefer 404) |
| Expose `storage_key`, absolute paths, bucket names, or presign secrets to Client Components / DTOs | **REJECT** |
| Skip `MediaStorage` abstraction and read/write disk directly from Route Handlers with client-influenced paths | **REJECT** |
| Store absolute filesystem paths in `storage_key` | **REJECT** |
| Delete DB row without deleting storage object (or vice versa) without documented compensation + tests | **REJECT** |
| Allow delete of another Cliente’s asset | **REJECT** |
| Ship RLS with permissive policies or browser Supabase access to `neuramark_media_assets` | **REJECT** |
| Render filenames via `dangerouslySetInnerHTML` | **REJECT** |
| Add anonymous/public serve without ownership check | **REJECT** |
| Enqueue jobs / call providers on upload/delete | **REJECT** |
| Expand scope to B-roll `work_photo`, US-8 job UI, or productized AV under 3.3 BUILD | **REJECT** (siblings) |

None of the SPEC-REVIEW / PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **US-8.x / US-10.x** job create **must** call **`hasOwnAvatarReferenceAssets`** + **`hasActiveAvatarConsent`** (and assert helper from US-3.2) — never Preferencias alone.
- **US-8.3 / US-9.2** **must** import the **same** shared upload validator — extend allowlists per asset type in module, do not fork validation.
- **S3 migration:** `storage_key` remains opaque relative key; serve Route Handler becomes thin wrapper over `MediaStorage.readStream` / future signed-URL generator **server-side**; Client Components still never see bucket credentials.
- **Multi-tenancy / RLS:** deny-by-default + server `client_id` remains IDOR defense; tenant policies later are additive.
- **Consent revoke + retained assets:** US-8 must re-check consent at job time even if assets exist; optional future story may auto-purge on revoke — not required in 3.3.
- **B-roll / fotos de trabajo:** separate `asset_type` + story — do not overload `avatar_reference` validator without explicit allowlist branch.
- **Do not** later serve likeness media from `public/` “for performance” — irreversible URL leakage (SECURITY_BASELINE near-REDESIGN condition).

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-3.3/CONTRACT.md` exists, verify before coding proceeds:

- [ ] Table: `neuramark_media_assets`; columns; index `(client_id, asset_type)`; RLS deny-by-default; service-role Node only; no Preferencias FK
- [ ] Frozen limits: 10 MiB image / 50 MiB video / 10 assets / optional 30 s video — env names
- [ ] Magic-byte allowlist + denylist; detector choice; ignore client Content-Type/extension for trust
- [ ] `storage_key` generation + validation regex; metadata-only original filename
- [ ] Shared validator module export path; pipeline order; consent gate inside validator or upload handler
- [ ] `MediaStorage` + `LocalDiskStorage` root outside `public/`; `S3Storage` stub
- [ ] Upload endpoint: names, error codes, minimal DTO, strip list
- [ ] Serve: `GET /api/media/assets/[assetId]`; ownership; headers; 404 foreign
- [ ] Delete: ownership; storage+DB; job-reference rule; 404 foreign
- [ ] List loader: arity 0; minimal DTO
- [ ] Helper: `hasOwnAvatarReferenceAssets`; US-8 call site documented
- [ ] Consent: import US-3.2 helper; revoke retains assets; block new uploads
- [ ] Surfaces: Preferencias placement; `no-store`; off `isPublicPath`; EN+ES; no recording prompts
- [ ] Non-goals: B-roll; US-8 job UI; US-8.3/9.2 surfaces; virus scanner; browser Supabase
- [ ] Residual malware risk note; optional validator hook
- [ ] Automated tests listed for SEC rows above

---

## CONTRACT freeze list (binding summary)

1. **Table:** `neuramark_media_assets` — `avatar_reference` V1; `storage_key` relative; RLS deny-by-default; index `(client_id, asset_type)`; no Preferencias FK.  
2. **Limits:** 10 MiB images / 50 MiB video / max 10 assets per client (env-configurable).  
3. **Validator:** shared module — consent → size → magic bytes → UUID key → put → insert; jpeg/png/webp/mp4/mov only; SVG/GIF/HTML deny.  
4. **Storage:** `MediaStorage` + `LocalDiskStorage` outside `public/`; `S3Storage` stub; no client credentials.  
5. **Serve:** authenticated ownership-checked Route Handler; `private, no-store`; no `public/` static URLs.  
6. **Delete:** ownership; remove DB + blob; 404 foreign; job-reference rule per V1 stub.  
7. **Consent gate:** live `hasActiveAvatarConsent` on every upload; retain assets on revoke; block new uploads.  
8. **IDOR:** session-bound `client_id` only; reject/strip browser tenant ids.  
9. **Helper:** `hasOwnAvatarReferenceAssets` + unit tests; US-8 mandatory later.  
10. **Residual AV risk:** documented; no ClamAV required for BUILD.

---

## Open questions — SECURITY resolutions

| # | Question (TASKS.md) | Resolution |
|---|---|---|
| 1 | Table shape | **APPROVE PO lean:** `neuramark_media_assets`, `storage_key`, hard delete, `metadata` jsonb, no soft-delete V1 |
| 2 | Size limit / count / duration | **Frozen defaults above** — env-configurable in CONTRACT |
| 3 | MIME allowlist | **Frozen allowlist + denylist above** |
| 4 | Serve route path | **APPROVE PO lean** `GET /api/media/assets/[assetId]` — CONTRACT freezes |
| 5 | Link to Preferencias vs table-only | **APPROVE no FK** — logical `client_id` scope |
| 6 | UI placement | **APPROVE PO lean** Preferencias page section; dedicated route also OK |
| 7 | Magic-bytes library | **APPROVE** `file-type` or equivalent mainstream detector — CONTRACT names package |
| 8 | Upload transport | **No security veto** — Server Action or `POST` Route Handler OK if consent + validator enforced server-side; CONTRACT freezes one pattern |
| 9 | Delete before first generation | **APPROVE PO lean** — allow when jobs absent/unreferenced; stub when jobs land |
| 10 | Virus scanning | **Defer productized AV** — APPROVE WITH CONDITIONS; document residual risk |
| 11 | Revoke consent vs assets | **APPROVE retain + block new uploads** — no auto-delete in 3.3 |
| 12 | Thumbnail generation | **APPROVE FE preview via serve route** — no server thumb required V1 |

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE SIGNOFF required after CONTRACT (upload UI on Preferencias).

**CONTRACT may proceed:** **Yes.**

**Conditions (non-blocking for CONTRACT start):** document residual malware risk; optional video duration probe may slip to US-8 if not cheap in V1; `S3Storage` remains stub until infra story — local root must still satisfy “outside web root + ownership serve” invariant.
