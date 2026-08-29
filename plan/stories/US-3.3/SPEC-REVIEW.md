## Spec Review — US-3.3

### Verdict: ALIGNED

US-3.3 (Cliente uploads **referencias de avatar propio** — portrait photos or short clips for **Avatar propio autorizado**; list + preview + delete; recoverable upload errors; all uploads gated on live **Consentimiento de avatar** via `hasActiveAvatarConsent`; shared server upload validation stack; storage outside `public/` behind ownership-checked serve route; `MediaStorage` interface local-now/S3-later; export `hasOwnAvatarReferenceAssets` stub for US-8 job gates) matches SPEC §3 Avatar / Visual Mode Selector (**S3.M4**), SPEC §2 Cliente role, SPEC §6 NFRs (likeness server-only, i18n EN/ES, `neuramark_*`, multi-tenant `client_id`), CONTEXT canonical terms, PLAN Fase 1 (Avatar / Visual Mode Selector — “assets subidos”), Flujo S4.1 (preferencias + assets slice), and SECURITY_BASELINE §3 (shared upload validation stack authored here).

Continuity with **US-3.1 CLOSED** and **US-3.2 CLOSED** is correct: Preferencias at `/settings/preferences`; consent-only hard-disable for Avatar propio in Preferencias (assets are an **additional** production gate, not a Preferencias allowlist hard-disable in V1); uploads **must** re-check the same version-aware `hasActiveAvatarConsent` — never a Preferencias flag alone. Ficha viva PATCH (US-2.2) and agents DTO (US-2.3) must not expose raw storage paths or unauthenticated serve URLs. Siblings US-3.4 (generic disclosure/QA), B-roll **fotos de trabajo** upload surface, US-8.x full job enforcement, US-8.3 manual video upload, and US-9.2 logo upload stay out. No ADR breach (uploads/serving on Vercel app layer; no cron, no IG publish, no FFmpeg/Fly worker). No SC-2 / publish path; no V1 out-of-scope creep (Stories IG, multicanal, ads, RBAC UI).

**No SPEC amendment required** before SECURITY / CONTRACT. Verdict is **ALIGNED** (not GAPS / CONFLICT). One **tracked gap** (non-blocking): S3.M4 also mentions **fotos de trabajo** for B-roll — correctly deferred out of this story; schedule a sibling story before claiming full S3.M4 upload coverage.

---

### Scope split vs S3.M4 / siblings — confirm

| Concern | PO scope (US-3.3) | SPEC mapping | Verdict |
|---------|-------------------|--------------|---------|
| Avatar reference upload / list / delete | Portrait photos + short clips; `avatar_reference` only | S3.M4: subir referencias de retrato (avatar propio) | **ALIGNED** |
| Consent gate on upload | Reject unless `hasActiveAvatarConsent` true | S3.M4 + US-3.2 continuity; SECURITY_BASELINE §2 | **ALIGNED** |
| ≥1 asset before production | Export `hasOwnAvatarReferenceAssets` helper; unit-test; no job writes | S3.M4: rechaza avatar propio sin consent/**assets**; USER_STORIES AC | **ALIGNED** (stub OK — same phased pattern as US-3.2 job stubs) |
| Shared upload validation stack | Single server module: size → magic bytes → server key → storage outside web root → ownership serve | SECURITY_BASELINE §3; USER_STORIES [SEC] | **ALIGNED** |
| Storage interface | `MediaStorage`; `LocalDiskStorage` now; `S3Storage` stub; no client credentials | USER_STORIES [SEC]; S3.M4 server persistence | **ALIGNED** |
| Preferencias link | No FK on `neuramark_visual_preferences`; scope by `client_id` + `asset_type` | S3.M4 (no FK mandated); USER_STORIES “link” = logical | **ALIGNED** |
| Preferencias hard-disable for missing assets | **No** — consent-only hard-disable persists; soft empty-state copy | US-3.1 SPEC Q10; S3.M4 job-time reject | **ALIGNED** |
| B-roll / fotos de trabajo | **Out** — separate asset type / later story | S3.M4 also lists fotos de trabajo | **GAP tracked** (out of 3.3 scope; not a CONFLICT) |
| Virus scanner productization | **Out** — size + magic-byte allowlist; document residual risk | USER_STORIES BE shorthand “virus/size” | **ALIGNED** (SECURITY gate confirms deferral) |
| US-3.4 / QA / disclosure | Out | S3.M4 siblings | **ALIGNED** (out) |
| US-8.3 / US-9.2 upload surfaces | Consume shared validator later | SECURITY_BASELINE §3 | **ALIGNED** (out) |
| Modalidad por slot | Out | S3.M4 regla clave + US-4.x | **ALIGNED** (out) |
| No recording / no silent regen | Upload UI only; no capture/recording prompts | S3.M4 + §6 hard rules | **ALIGNED** |

Do not amend SPEC. Do not check off USER_STORIES AC here.

---

### Open questions (TASKS.md) — SPEC resolution

| # | Question | Spec-guardian | Blocks SECURITY? |
|---|----------|---------------|------------------|
| 1 | **Table shape — `neuramark_media_assets`** | **Resolved ALIGNED with PO lean.** Table **`neuramark_media_assets`**: `id`, `client_id` FK → `neuramark_clients`, `asset_type` (V1 enum value **`avatar_reference` only**), `storage_key` (relative key — story/AC name `path`), `metadata` jsonb, `created_at`. Hard delete on user action (no soft-delete required V1). `updated_at` optional — not mandated by SPEC. RLS deny-by-default; service-role Node only. Index `(client_id, asset_type)` for list + helper count. | **No** |
| 2 | **Size limit / count / duration** | **Not a SPEC decision.** SPEC requires validation; exact caps (PO lean: 10 MB images, 50 MB video, max 10 assets, video ≤ 30 s) are **SECURITY/CONTRACT** freezes. Reasonable defaults; no SPEC block. | **No** (SECURITY confirms numbers) |
| 3 | **MIME allowlist** | **Resolved ALIGNED with PO lean.** Image + video allowlist verified from **file content (magic bytes)**, not client `Content-Type`/extension. PO lean jpeg/png/webp + mp4/mov; explicit SVG/GIF/HTML deny — compatible with USER_STORIES [SEC] and SECURITY_BASELINE abuse cases. Exact enum list = CONTRACT + SECURITY. | **No** |
| 4 | **Serve route path** | **Not a SPEC decision.** PO lean `GET /api/media/assets/[assetId]` with session cookie + ownership query + `Cache-Control: private, no-store` is SPEC-compatible (authenticated serve, never `public/` static mapping). CONTRACT freezes exact path. Signed short-lived URLs not required by SPEC for V1. | **No** |
| 5 | **Link to Preferencias vs table-only** | **Resolved ALIGNED with PO lean (no FK).** USER_STORIES BE “link to `visual_preferences`” is **logical** scoping (same Cliente onboarding journey), not a schema FK requirement. SPEC S3.M4 does not mandate a FK column on `neuramark_visual_preferences`. Relationship = `client_id` + `asset_type = 'avatar_reference'`. Optional parent USER_STORIES wording cleanup later — backlog hygiene, not SPEC amendment. | **No** |
| 6 | **UI placement** | **Not a SPEC decision.** PO lean upload section on **`/settings/preferences`** below Consentimiento / Avatar propio block is compatible with Flujo S4.1 and US-3.2 continuity. Dedicated route also compatible. CONTRACT (+ FE) freezes chrome. | **No** |
| 7 | **Magic-bytes library** | **Not a SPEC decision.** Implementation choice (`file-type` or equivalent) = CONTRACT. SPEC intent: detected MIME from content. | **No** |
| 8 | **Upload transport** | **Not a SPEC decision.** Server Action `FormData` vs `POST` Route Handler for multipart/streaming = CONTRACT. Both compatible if consent gate + validation stack enforced server-side. | **No** |
| 9 | **“Before first generation” delete rule** | **Resolved ALIGNED with PO lean + AC.** USER_STORIES: assets **deletable before first generation**. Interpret: delete allowed while no `neuramark_video_jobs` row references the asset; if jobs table absent in V1, delete always allowed; when jobs land (US-8), block delete if referenced — stub/check in 3.3 OK. Full job coupling = US-8/US-10. | **No** |
| 10 | **Virus scanning** | **Not a SPEC requirement.** PO lean defer productized AV (ClamAV, async quarantine) — document residual risk in SECURITY. Magic bytes + size + type denylist satisfy SPEC/USER_STORIES security **intent** for this story slice; SECURITY may APPROVE WITH CONDITIONS. Not a SPEC amendment. | **No** (SECURITY gate decides APPROVE vs CONDITIONS) |
| 11 | **Revoke consent vs retained assets** | **Resolved ALIGNED with PO lean.** SPEC S3.M4: revocación cancela cola own-avatar + rechaza sin consent — does **not** require auto-delete of stored reference files on revoke. **Retain** assets on revoke; **block new uploads** until re-consent; existing files remain deletable by Cliente per delete rules. Optional future cleanup story out of scope. | **No** |
| 12 | **Thumbnail generation** | **Not a SPEC decision.** PO lean FE preview via authenticated serve route / blob URL; server thumbnail in metadata = optional PERFORMANCE follow-up. | **No** |

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-1 (Cliente never records; likeness via uploaded **referencias** only when **Consentimiento** active) and PLAN Fase 1 deliverable (“assets subidos” for avatar references). Does not touch Aprobación, Publicación IG, Ciclo semanal cron, Playbook, Trend, or slot modality. No publish path → SC-2 intact. | SPEC §1 SC-1..SC-4; PLAN Fase 1; Flujo S4.1 | None. Do not add IG, Stories, ads, generation jobs, or Strategy. |
| Info | Roles unchanged: **Cliente** uploads/deletes own referencias; **System** validates, stores, serves with ownership check; **Operator** not required for upload flow. Identity via `getCurrentUser()` / `requireActive`. | SPEC §2; §3 S3.M4 | CONTRACT: no tenant id from browser; parameterized ownership queries. |
| Info | Consent + assets layering is correct. US-3.2 owns Consentimiento ledger; US-3.3 owns reference media persistence; upload gate reads live ledger (US-3.2 SECURITY carry-forward). Preferencias allowlist unchanged; missing assets do **not** hard-disable Avatar propio in Preferencias (US-3.1 continuity). | S3.M4; US-3.1 SPEC Q10; US-3.2 SPEC | CONTRACT: upload reject without consent; helper for job-time asset gate; soft empty-state on Preferencias. |
| Info | Production eligibility stub (`hasOwnAvatarReferenceAssets`) matches phased enforcement pattern: S3.M4 “rechaza … sin assets” is **System** behavior at Job create — stub + unit tests sufficient for 3.3; full block = US-8.x / US-10.x. | S3.M4; US-3.2 job stub precedent | SECURITY must require helper + tests; do not mark full job AC done without jobs. |
| Info | Shared upload validation stack authorship aligns with SECURITY_BASELINE §3 — US-8.3 and US-9.2 **consume** later, not expand scope here. | SECURITY_BASELINE §3 | Extract module under e.g. `lib/media/`; CONTRACT names export surface. |
| Info | Parent USER_STORIES DB shorthand `media_assets` / `path` → physical **`neuramark_media_assets`** / **`storage_key`**. Parent title “Client” / “own avatar” → **Cliente** / **Avatar propio autorizado** in product copy. | SPEC §1 prefix; CONTEXT | CONTRACT uses `neuramark_` + CONTEXT labels in i18n. |
| Info | NFR / stack: Next.js App Router; i18n EN+ES; `neuramark_*`; multi-tenant `client_id` server-only; likeness media server-only; not ADR-0003 long work (stays on Vercel app). | SPEC §5–§6 | No auth redesign; no browser Supabase; no storage creds in Client Components. |
| Info | ADRs 0001–0003 untouched: no cron orchestration, no IG Graph publish, no FFmpeg/Fly for this story. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: US-3.4 QA UI; B-roll fotos de trabajo; US-8 job create/cancel UI; US-8.3/9.2 upload surfaces; Preferencias schema reopen; Ficha viva asset metadata; RBAC; Stories IG; multicanal; ads; virus scanner productization. | SPEC §1 Fuera; S3.M4 siblings | Implementers must not expand into sibling stories. |
| Low | **Tracked gap (non-blocking):** S3.M4 lists both retrato references **and** fotos de trabajo (B-roll). US-3.3 correctly ships **avatar_reference only**. Full S3.M4 upload surface needs a follow-up story for work-photo asset type before Fase 1 can claim complete B-roll asset onboarding. | S3.M4 Cliente actions; PLAN Fase 1 | Backlog: sibling story (e.g. US-3.x) for `work_photo` / B-roll assets — not a US-3.3 scope expansion. |
| Low | SPEC §6 asset residency notes Supabase Storage same region (`us-east-1`). PO lean `LocalDiskStorage` for V1 internal is compatible if SECURITY accepts; **`S3Storage` / production adapter should target same-region object storage** (Supabase Storage or S3) without client exposure — infra choice at SECURITY/CONTRACT, not SPEC conflict. | SPEC §6 S6.Q2 | SECURITY/CONTRACT: document V1 local root + migration path; align eventual adapter with §6 residency. |
| Low | USER_STORIES BE “virus/size validation” — interpret as **size + content-validated type** in 3.3; productized virus scan deferred per PO lean. | USER_STORIES US-3.3; SECURITY_BASELINE | SECURITY: APPROVE WITH CONDITIONS if residual upload risk documented. |
| Low | USER_STORIES AC “At least one reference asset required before own-avatar production” — satisfied by **helper export + tests** in 3.3; live job enforcement evidence = US-8 validator, not 3.3 BUILD alone. | USER_STORIES US-3.3; S3.M4 | VALIDATION later: stub evidence + US-8 wiring plan. |

---

### Terminology violations (CONTEXT)

**None that block** in `plan/stories/US-3.3/README.md` or `TASKS.md`. Canonical use is correct: **Avatar propio autorizado**, **Consentimiento de avatar**, **Preferencias de producción visual**, **referencias**, **Cliente**, **Operator**. Enums / table names correctly scoped to code/DB. PREP correctly flags _Evitar_ terms (`media_assets`, `own_avatar`, `consent ledger`, etc.) for product copy.

**Forbidden in UI / domain copy / later CONTRACT & SECURITY product strings:**

| Prefer | _Evitar_ |
|--------|----------|
| **Avatar propio autorizado** | own_avatar (in product copy) |
| **Consentimiento de avatar** | consent ledger (in product copy) |
| **Preferencias de producción visual** | avatar mode, visual preferences (as entity name), visual mode selector |
| **referencias** (portrait photos/clips) | media_assets (in product copy) |
| **Cliente** | prestador (as product role), dueño, usuario final, Client (parent USER_STORIES shorthand) |
| **Operator** | admin, administrador, staff |
| **Ficha viva** | Business Profile, perfil de negocio |
| **B-roll / sin presencia** | faceless (in product copy) |

Hard rule (product + UX): **never** require or prompt the Cliente to record video or audio. Own-avatar likeness uses **uploaded referencias** + active **Consentimiento** — not camera/mic capture.

---

### Blockers for SECURITY / CONTRACT

**SPEC blockers:** none. **SECURITY can proceed.**

| Item | Blocks? | Guidance |
|------|---------|----------|
| Table name / columns | **Resolved** (`neuramark_media_assets`, `storage_key`, `avatar_reference` V1) | CONTRACT freezes columns, indexes, constraints. |
| No Preferencias FK | **Resolved for SPEC** | Logical link via `client_id`; optional parent USER_STORIES wording sync later. |
| Consent gate on upload | **Resolved for SPEC** | Same `hasActiveAvatarConsent` as US-3.2; never Preferencias flag alone. |
| Asset production helper | **Resolved for SPEC** (stub OK) | SECURITY: `hasOwnAvatarReferenceAssets` + unit tests; US-8 mandatory call site documented. |
| B-roll fotos de trabajo | **Tracked gap, not block** | Out of 3.3; sibling story for full S3.M4 upload coverage. |
| Size/MIME/count caps | **No SPEC block** | SECURITY/CONTRACT freeze env/config values. |
| Serve route / upload transport | **No SPEC block** | CONTRACT freezes paths and handler pattern. |
| Virus scan deferral | **No SPEC block** | SECURITY may APPROVE WITH CONDITIONS. |
| Revoke → retain assets | **Resolved for SPEC** | Block new uploads; no auto-delete required. |
| UI placement | **No SPEC block** | CONTRACT: Preferencias page section (PO lean) or dedicated route. |
| Local disk vs Supabase Storage | **No SPEC block** | SECURITY/CONTRACT: V1 storage root + §6 migration alignment. |
| User / product decision needed? | **No for SPEC** | B-roll work-photo story is backlog scheduling, not a user blocker for 3.3 SECURITY/CONTRACT. |

---

### Recommended action

Proceed to **SECURITY.md** (security-architect). Orchestrator **may** proceed to the SECURITY gate.

**SPEC amendments needed?** **No.**

**Defaults aligned?** Yes — PO leans in TASKS.md (table shape, no Preferencias FK, consent-gated uploads, shared validation stack, storage interface, ownership serve route, helper stub, avatar_reference-only scope, retain assets on revoke, delete-before-generation semantics, defer virus scanner, Preferencias page placement) are **ALIGNED** with SPEC S3.M4 / CONTEXT / ADRs / US-3.1–3.2 continuity / SECURITY_BASELINE §3. No CONFLICT. One **tracked gap**: B-roll fotos de trabajo uploads remain for a sibling story.

CONTRACT freeze items (non-negotiable for alignment; freeze later, not in this file):

1. Table: **`neuramark_media_assets`** — `id`, `client_id` FK → `neuramark_clients`, `asset_type` (`avatar_reference` V1), `storage_key` (relative), `metadata` jsonb, `created_at`; RLS deny-by-default; service-role Node only; index `(client_id, asset_type)`.
2. **No FK** on `neuramark_visual_preferences`; assets scoped by `client_id` + `asset_type`.
3. Upload gate: **`hasActiveAvatarConsent`** (US-3.2, version-aware) on every upload — fail closed; UI disable/hide when inactive.
4. Shared validator module: max size → magic-byte MIME allowlist → server-generated `storage_key` (UUID + safe ext) → storage put outside `public/` → metadata only for original filename.
5. **`MediaStorage` interface** + `LocalDiskStorage` (root outside web root) + `S3Storage` stub; **no** storage credentials or presigned logic in Client Components.
6. Serve route: authenticated + ownership (`client_id = session`); stream via storage interface; `Cache-Control: private, no-store`; never expose absolute filesystem paths.
7. Delete: ownership check; remove DB row **and** storage object; “before first generation” rule per open Q9 (allow when jobs absent/unreferenced).
8. Helper: **`hasOwnAvatarReferenceAssets(clientId)`** → true iff ≥1 `avatar_reference` row; unit-tested; US-8 call site documented — **no** job table writes in 3.3.
9. UX/copy: **referencias** / **Avatar propio autorizado**; no recording prompts; EN + ES; previews via authenticated serve or safe blob URLs only.
10. Continuity: extend Preferencias page (PO lean); do not reopen Ficha viva PATCH; do not dump storage keys into agents DTO; settings off `isPublicPath` + `no-store`.
11. Explicit out of scope: B-roll fotos de trabajo; US-3.4 QA UI; US-8 job UI/enforcement; US-8.3/9.2 upload surfaces; virus scanner productization; Preferencias schema reopen; auth redesign; browser Supabase; anonymous public serve.

Do not write application code, CONTRACT.md, or SECURITY.md in this gate. Do not check off USER_STORIES acceptance criteria.
