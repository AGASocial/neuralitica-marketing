# US-3.3 — Upload avatar reference assets (own avatar)

**Status:** PREP — `README.md` + `TASKS.md` only. Gates (SPEC-REVIEW · SECURITY · CONTRACT · BUILD · VALIDATION · QA) **not started**.

**As a** Cliente, **I want** to upload photos or clips for my avatar, **so that** generated videos resemble me when authorized.

Ship **referencias de avatar propio**: Cliente uploads portrait photos or short clips as likeness reference media for **Avatar propio autorizado**, with format/size hints, list + preview, recoverable upload errors, and delete-before-first-generation. All uploads gated on live **Consentimiento de avatar** (`hasActiveAvatarConsent`). Files persist via a **storage interface** (local disk now, S3 later) with magic-byte MIME validation, server-generated keys, storage outside `public/`, and ownership-checked serving route. Export a small **“at least one reference asset”** helper for later US-8 job gates — **no** full video-job creation or generation enforcement in this story.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-3.3 (unchecked until VALIDATION CLOSE).

**This folder:** [`plan/stories/US-3.3/`](./) — `README.md` · `TASKS.md` · *(SPEC-REVIEW · SECURITY · CONTRACT · VALIDATION · QA — pending gates)*.

**Branch:** `feature/US-3.3-avatar-assets`

**Depends on:** [US-3.2](../US-3.2/) ✅ CLOSED — `neuramark_avatar_consents`, hardened `hasActiveAvatarConsent`, Consentimiento UI on Preferencias. Runtime identity: [US-14.5](../US-14.5/) (`getCurrentUser()` / `requireActive()`). Continuity: [US-3.1](../US-3.1/) ✅ Preferencias at `/settings/preferences`; `own_avatar` still consent-gated (assets are **additional** gate for production, not for Preferencias selection in V1).

**Unblocks:** US-8.x talking-head jobs (reference assets required) · US-8.3 manual upload (shared validation stack) · US-9.2 logo upload (shared validation stack) · downstream “reject avatar propio without assets” at job time (full enforcement US-8 / US-10 — stub helper only here).

**Carry-forward (SECURITY_BASELINE):** shared upload validation stack (size → magic-byte allowlist → server key → storage outside web root → ownership-checked serve) must be designed as one server module reused by US-8.3 / US-9.2 later — US-3.3 **authors** the module; siblings **consume** it in their stories.

---

## Scope in

| Area | What 3.3 adds |
|------|----------------|
| **FE** | Upload UI on Preferencias surface (PO lean): file picker, format/size hints, preview/thumbnail, upload progress, asset list, delete with confirm; disabled/hidden when no active Consentimiento; recoverable error states; EN/ES. |
| **BE** | `neuramark_media_assets` migration; storage interface (`LocalDiskStorage` now, `S3Storage` stub/interface later); shared upload validator (size + magic bytes); upload + delete Server Actions or Route Handler (CONTRACT freezes); list loader; ownership-checked serve Route Handler; gate uploads on `hasActiveAvatarConsent`; export `hasOwnAvatarReferenceAssets(clientId)` (or equivalent) for US-8 stub. |
| **DB** | **`neuramark_media_assets`**: `client_id`, `asset_type`, `storage_key` (relative path/key — story `path`), `metadata` jsonb (original filename, mime, size, dimensions/duration if probed), timestamps; indexes for list-by-client + type. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **S3 production credentials in client** | Storage interface is server-only; no bucket names, keys, or presigned URL construction in Client Components. S3 adapter may ship as interface + no-op/stub until infra story. |
| **Virus scanner productization** | Heavy AV integration (ClamAV service, async scan queues) — **out**. **PO lean:** size + magic-byte allowlist + extension denylist sufficient for V1; document residual risk in SECURITY; optional lightweight hook point only if SECURITY mandates. |
| **US-3.4** | Generic disclosure / QA agent / `must_disclose_not_owner` enforcement — unchanged. |
| **US-8 full generation gate** | Job create blocking, provider calls, cost policy — **out**. Only export **helper** “≥1 avatar reference asset exists” callable by US-8; unit-test helper; no job table writes. |
| **US-8.3 / US-9.2 upload surfaces** | Manual video / logo uploads reuse validation module later — not built here beyond shared module extraction. |
| **B-roll / fotos de trabajo** | SPEC mentions work photos for faceless/B-roll — **separate asset type / later story**; this story **`avatar_reference` only**. |
| **Preferencias allowlist schema reopen** | Do not add FK columns on `neuramark_visual_preferences` unless CONTRACT + SECURITY require; **PO lean:** link by `client_id` + `asset_type` only. |
| Auth redesign / browser Supabase | Unchanged. Serve route off `isPublicPath` but **authenticated** + ownership-checked — not anonymous CDN. |

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-3.1 | Preferencias at `/settings/preferences`; copy states own-avatar uses uploaded references; no upload UI yet. |
| US-3.2 | Consentimiento grant/revoke; `hasActiveAvatarConsent` version-aware; uploads **must** re-check same helper — never Preferencias flag alone. |
| US-2.2 / US-2.3 | Ficha viva / agents DTO must not expose raw storage paths or serve URLs without auth. |
| Auth US-14.5 | `requireActive` / `getCurrentUser()` for all mutations and serve route. |

**US-3.3 adds reference media persistence + upload UX** — highest-sensitivity Cliente data after consent ledger; design keys for S3 swap per story security note.

## Canonical terms (CONTEXT)

Use **Avatar propio autorizado**, **Consentimiento de avatar**, **Preferencias de producción visual**, **referencias** (portrait photos/clips), **Cliente**, **Operator**, **likeness** (legal sense only).  
_Evitar:_ media_assets (in product copy), own_avatar (in product copy — OK as enum), avatar mode / visual preferences (as entity names), consent ledger, Business Profile / perfil de negocio, admin / staff.
