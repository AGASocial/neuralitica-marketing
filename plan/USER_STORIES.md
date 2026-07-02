# Neuralitica V1 — User Stories (from MODULES_ROADMAP v1.1)

> **Source:** `plan/MODULES_ROADMAP_v1.1.html`  
> **Goal:** 3 AI Reels/week per client · Instagram only · No human recording required · Cheap API first  
> **Agents:** Each story is tagged **FE**, **BE**, or **DB** so frontend and backend work can run in parallel where dependencies allow.

---

## Conventions

| Field | Meaning |
|-------|---------|
| **ID** | Stable reference (`US-{phase}.{seq}`) |
| **Priority** | P0 = MVP blocker · P1 = post-MVP |
| **Depends on** | Stories or modules that must exist first |
| **Owner** | Primary implementing agent |

**Roles**

- **Client** — local service provider (plumber, barber, etc.)
- **Operator** — internal user running production (can be same hardcoded user in local dev)
- **System** — automated agents and pipelines

**Story format**

```
As a [role], I want [capability], so that [outcome].
```

**Stack and database naming**

- Stack: Next.js (FE + BE) · Supabase (Postgres) as database · Vercel for deployment.
- Supabase is accessed ONLY by the Next.js backend (Server Actions, Route Handlers, server helpers). The frontend never imports Supabase clients or sees Supabase keys; all FE data access — including future auth — goes through Next.js endpoints.
- Table names in the **DB** rows below are *logical* names. Every physical object in Supabase — tables, triggers, indexes, functions, enums, policies — MUST carry the `neuramark_` prefix.
  - Example: `interview_sessions` → table `neuramark_interview_sessions`, index `neuramark_interview_sessions_client_id_idx`, trigger `neuramark_interview_sessions_set_updated_at`.
- Schema changes go through Supabase migrations, never ad-hoc dashboard edits.

---

## Phase 1 — Base del cliente

### Module: Interview Builder (P0)

#### US-1.1 — Start guided business interview
**As a** Client, **I want** a step-by-step interview about my business, **so that** I can onboard without writing marketing copy myself.

| Owner | Work |
|-------|------|
| **FE** | Multi-step interview UI (services, zone, tone, offers, objections, style, restrictions); progress indicator; validation per step; empty/error states; EN/ES copy |
| **BE** | `GET/POST` interview session endpoints or Server Actions; schema validation; persist draft answers |
| **DB** | `interview_sessions` (client_id, status, current_step, answers JSON, created_at, updated_at) |

**Acceptance criteria**
- [ ] Client can complete all interview sections in one sitting or save and resume (US-1.2)
- [ ] Answers are stored as structured JSON, not free-form blobs only
- [ ] Invalid or incomplete required fields block advance with clear messages
- [ ] Copy exists in English and Spanish
- [ ] [SEC] All interview answers are re-validated server-side against a typed schema (Zod); client-side validation is presentation only
- [ ] [SEC] Interview sessions are created and loaded only for the client resolved via server-side `getCurrentUser()`; no `client_id` accepted from the request body or query string
- [ ] [SEC] Total `answers` JSON payload rejected above a configured size limit (e.g. 64 KB) with a 413/400, preventing storage abuse
- [ ] [SEC] Free-text answers are stored as data and always rendered escaped; they are never interpolated into HTML, SQL, or shell commands

**Depends on:** none  
**Output:** structured interview answers

---

#### US-1.2 — Save and resume interview
**As a** Client, **I want** to pause the interview and continue later, **so that** I am not forced to finish in one session.

| Owner | Work |
|-------|------|
| **FE** | "Save & continue later" action; resume entry on dashboard; show last completed step |
| **BE** | Upsert draft; load draft by client; mark `completed` when submitted |
| **DB** | `interview_sessions.status` enum: `draft` \| `completed` |

**Acceptance criteria**
- [ ] Returning client sees incomplete interview prompt on dashboard
- [ ] Draft survives page refresh and new browser session
- [ ] Completed interviews are read-only unless operator reopens
- [ ] [SEC] Read-only enforcement for `completed` sessions happens server-side: mutation endpoints/Server Actions reject writes to completed sessions regardless of what the UI allows
- [ ] [SEC] Resume loads the draft by the server-resolved current user only; a session ID supplied by the client is validated to belong to that user (IDOR guard for future multi-tenancy)

**Depends on:** US-1.1

---

#### US-1.3 — Submit interview for profile generation
**As a** System, **I want** a completed interview to trigger business profile creation, **so that** downstream agents have canonical context.

| Owner | Work |
|-------|------|
| **FE** | Success confirmation screen; redirect to Business Profile review |
| **BE** | On submit: validate completeness → enqueue or invoke profile builder → link session → profile |
| **DB** | FK `business_profiles.source_interview_id` |

**Acceptance criteria**
- [ ] Submitting a complete interview creates exactly one business profile (or updates draft profile)
- [ ] Incomplete submit returns 400 with field-level errors
- [ ] Event is idempotent on double-submit
- [ ] [SEC] Completeness is verified server-side at submit time; a client cannot mark a session `completed` by flipping a status field in the request
- [ ] [SEC] Idempotency is enforced with a DB-level constraint (e.g. unique `business_profiles.source_interview_id`), not only application logic

**Depends on:** US-1.1, US-2.1

---

### Module: Business Profile (P0)

#### US-2.1 — View canonical business profile
**As a** Client, **I want** to see a living summary of my business, **so that** I can confirm the system understood me correctly.

| Owner | Work |
|-------|------|
| **FE** | Profile page: services, zone, tone, offers, objections, brand notes, restrictions; read-only default |
| **BE** | `GET` profile by client; map interview answers → normalized profile shape |
| **DB** | `business_profiles` (client_id, fields JSON, version, updated_at) |

**Acceptance criteria**
- [ ] Profile renders all core fields from interview
- [ ] Profile loads on dashboard as default post-onboarding view
- [ ] Missing profile shows onboarding CTA, not empty crash
- [ ] [SEC] Profile is fetched by the server-resolved current user; the endpoint does not accept an arbitrary `client_id` parameter from the browser

**Depends on:** US-1.3

---

#### US-2.2 — Edit business profile
**As a** Client, **I want** to update my business profile, **so that** agents use current information without redoing the full interview.

| Owner | Work |
|-------|------|
| **FE** | Inline or form edit for allowed fields; save/cancel; optimistic or explicit success toast |
| **BE** | `PATCH` profile; validation; version bump; audit `updated_at` |
| **DB** | Optional `profile_versions` for history (P1 nice-to-have) |

**Acceptance criteria**
- [ ] Edits persist and appear on next agent run
- [ ] Restricted fields (e.g. legal consents) require explicit re-confirmation
- [ ] Concurrent edits last-write-wins with timestamp visible
- [ ] [SEC] PATCH accepts an explicit allowlist of editable fields; consent flags, `visual_mode` rules, and system fields cannot be modified through this endpoint even if present in the payload
- [ ] [SEC] Every edit records who changed it (server-resolved user) and bumps `version`, so agent runs can be traced to the profile version they consumed

**Depends on:** US-2.1

---

#### US-2.3 — Expose profile to agents (API contract)
**As a** System, **I want** a stable profile contract for all agents, **so that** strategy, script, and QA agents do not re-parse raw interview data.

| Owner | Work |
|-------|------|
| **FE** | — |
| **BE** | `getBusinessProfileForAgents(clientId)` server helper; typed schema (Zod or equivalent); include visual mode summary when set |
| **DB** | — |

**Acceptance criteria**
- [ ] Single server function used by Content Strategy, Video Script, Caption, QA agents
- [ ] Contract documented in code types
- [ ] Returns 404-safe empty state for pre-onboarding clients
- [ ] [SEC] `getBusinessProfileForAgents` is a server-only module (never imported into client bundles) and is the only path agents use to read profile data
- [ ] [SEC] Contract output excludes fields agents do not need (no consent record internals, no raw interview blobs) — minimal response shape by design

**Depends on:** US-2.1

---

### Module: Avatar / Visual Mode Selector (P0)

#### US-3.1 — Choose visual production mode
**As a** Client, **I want** to pick how my Reels will look (own avatar, generic avatar, or faceless), **so that** content matches my comfort and brand rules.

| Owner | Work |
|-------|------|
| **FE** | Mode selector with explanations and examples; disable unavailable modes; EN/ES |
| **BE** | Persist `visual_mode`: `own_avatar` \| `generic_avatar` \| `faceless`; attach mode rules |
| **DB** | `visual_preferences` (client_id, mode, generic_avatar_id, faceless_style, updated_at) |

**Acceptance criteria**
- [ ] Three modes selectable with clear product copy per roadmap rules
- [ ] Mode stored on profile and shown in settings
- [ ] Changing mode does not silently regenerate in-flight content
- [ ] No mode ever requires the client to record video or audio; own-avatar uses uploaded reference assets only (roadmap hard rule: no human recording)
- [ ] Faceless mode captures a style preference (voice + text + stock/B-roll) stored in `faceless_style`
- [ ] [SEC] `visual_mode` value is validated server-side against the enum; selecting `own_avatar` is rejected server-side when no active consent exists, independent of UI disabling (defense in depth with US-3.2)

**Depends on:** US-2.1

---

#### US-3.2 — Capture consent for own avatar
**As a** Client, **I want** to explicitly authorize use of my likeness, **so that** own-avatar mode is legally and ethically enabled.

| Owner | Work |
|-------|------|
| **FE** | Consent checkbox + disclosure text; block own-avatar until signed; timestamp display |
| **BE** | Store consent record (who, when, text version); reject video jobs without consent |
| **DB** | `avatar_consents` (client_id, consented_at, consent_version, revoked_at) |

**Acceptance criteria**
- [ ] Own avatar cannot be selected without consent
- [ ] Consent version string stored for audit
- [ ] Revoking consent blocks new own-avatar generations
- [ ] [SEC] Consent records are append-only: revocation sets `revoked_at` on the existing row; consent rows are never updated in place or deleted, preserving a full audit trail
- [ ] [SEC] The exact disclosure text version shown at consent time (`consent_version`) is stored with the record; changing the disclosure text requires re-consent under a new version
- [ ] [SEC] Consent status is re-checked server-side at video-job creation time (not only at mode selection), so a revocation between selection and generation still blocks the job
- [ ] [SEC] Consent can only be granted via an explicit affirmative action recorded with server timestamp; no endpoint or Server Action can set consent as a side effect of another operation
- [ ] [SEC] Revocation takes effect immediately for new jobs and cancels queued (not yet submitted) own-avatar jobs; in-flight provider jobs are flagged for operator review

**Security note:** likeness consent is the legal backbone of own-avatar mode — treat `avatar_consents` as an immutable ledger, and make US-8.x/US-10.x enforcement read from it live, never from a cached flag.

**Depends on:** US-3.1

---

#### US-3.3 — Upload avatar reference assets (own avatar)
**As a** Client, **I want** to upload photos or clips for my avatar, **so that** generated videos resemble me when authorized.

| Owner | Work |
|-------|------|
| **FE** | File upload UI; format/size hints; preview; upload progress |
| **BE** | Store files (local/S3 later); link to `visual_preferences`; virus/size validation |
| **DB** | `media_assets` (client_id, type, path, metadata JSON) |

**Acceptance criteria**
- [ ] At least one reference asset required before own-avatar production
- [ ] Assets listed and deletable before first generation
- [ ] Failed upload shows recoverable error
- [ ] [SEC] Upload endpoint rejects files over a configured size limit and any MIME type outside an image/video allowlist; type is verified from file content (magic bytes), not the client-supplied Content-Type or extension
- [ ] [SEC] Stored filenames are server-generated (e.g. UUID + safe extension); the original client filename is stored as metadata only and never used to build the storage path (path traversal guard)
- [ ] [SEC] Files are stored outside the web root / `public` directory and served through a route that checks the asset belongs to the current user; `media_assets.path` values are relative keys, not absolute filesystem paths
- [ ] [SEC] Uploads are only accepted when an active (non-revoked) avatar consent exists for the client
- [ ] [SEC] Delete removes both the DB row and the stored file, and is only allowed for assets owned by the server-resolved current user
- [ ] [SEC] Storage layer is behind a small server-side interface (local disk now, S3 later) so credentials and paths never appear client-side

**Security note:** likeness reference media is the most sensitive data in the system; design storage keys and the serving route so migrating to S3 with signed URLs is a swap, not a rewrite.

**Depends on:** US-3.2

---

#### US-3.4 — Enforce generic avatar representation rules
**As a** System, **I want** generic avatars to never impersonate the business owner, **so that** we avoid misleading local customers.

| Owner | Work |
|-------|------|
| **FE** | Warning copy on generic mode; disclosure preview on approval screen |
| **BE** | Rule flags on profile: `must_disclose_not_owner`; pass to Script + QA agents |
| **DB** | `visual_preferences.rules JSON` |

**Acceptance criteria**
- [ ] Generic mode sets `must_disclose_not_owner = true`
- [ ] QA agent fails scripts that claim generic avatar is the owner
- [ ] Approval UI shows required disclosure when applicable
- [ ] [SEC] `must_disclose_not_owner` is set server-side as a consequence of mode selection and is not client-writable through any endpoint
- [ ] [SEC] The impersonation check in QA (US-10.1) is classified as a non-overridable legal block, same class as missing consent (US-10.2)

**Depends on:** US-3.1

---

## Phase 2 — Estrategia y guiones

### Module: Content Strategy Agent (P0)

#### US-4.1 — Generate weekly Instagram content strategy
**As a** Operator, **I want** the system to propose weekly pillars, themes, and sequence, **so that** we deliver 3 Reels with coherent messaging.

| Owner | Work |
|-------|------|
| **FE** | "Generate strategy" action; loading state; strategy brief view (pillars, themes, daily slots) |
| **BE** | Agent job: input profile + visual mode → output weekly brief; store result |
| **DB** | `content_strategies` (client_id, week_start, brief JSON, status) |

**Acceptance criteria**
- [ ] Brief includes at least 3 Reel slots aligned to trust, education, local sale, and inbound-message (DM) goals
- [ ] Uses `getBusinessProfileForAgents` only, not raw interview
- [ ] Regenerate creates new version without deleting approved history
- [ ] Strategy targets Instagram Reels only in V1 — no multichannel output (roadmap hard rule: Instagram first)
- [ ] [SEC] Agent job runs server-side only; LLM provider keys are read from server env and never reach the client or the DB
- [ ] [SEC] Client-authored profile text is passed to the LLM as clearly delimited data, and agent output is validated against a typed brief schema before storage (prompt-injection containment: malformed or out-of-schema output is rejected, not stored)
- [ ] [SEC] "Generate strategy" is rate-limited/debounced server-side per client to prevent runaway LLM spend from repeated clicks or scripted calls

**Depends on:** US-2.3, US-3.1

---

#### US-4.2 — Review and adjust strategy before scripting
**As a** Operator, **I want** to edit the weekly brief, **so that** human judgment can correct AI planning.

| Owner | Work |
|-------|------|
| **FE** | Editable fields for themes, angles, CTAs; approve strategy CTA |
| **BE** | `PATCH` strategy; status `draft` → `approved`; lock after scripts generated (configurable) |
| **DB** | `content_strategies.status` |

**Acceptance criteria**
- [ ] Edits saved and used as input to Video Script Agent
- [ ] Approved strategy required before batch script generation
- [ ] Shows who approved and when (hardcoded user OK in local dev)
- [ ] [SEC] Status transitions (`draft` → `approved`) are enforced server-side as a state machine; the client cannot set an arbitrary status value, and script generation endpoints verify `approved` status themselves rather than trusting the caller

**Depends on:** US-4.1

---

### Module: Video Script Agent (P0)

#### US-5.1 — Generate Reel script package per slot
**As a** System, **I want** each planned Reel to get hook, script, voiceover text, on-screen text, and CTA, **so that** video production has complete instructions.

| Owner | Work |
|-------|------|
| **FE** | Script list per week; expand row for hook/body/CTA/on-screen/VO; copy-to-clipboard |
| **BE** | Agent: strategy + profile + visual mode → `reel_scripts` records; respect duration target (e.g. 15–45s) |
| **DB** | `reel_scripts` (strategy_id, slot_index, hook, body, cta, on_screen_text, voiceover_text, target_duration_sec) |

**Acceptance criteria**
- [ ] One script package per Reel slot in approved strategy
- [ ] Scripts adapt tone to profile and constraints (no false owner claims in generic mode)
- [ ] Regenerate single slot without regenerating entire week
- [ ] [SEC] Script generation verifies server-side that the referenced strategy is `approved` and belongs to the current client before invoking the agent
- [ ] [SEC] Agent output is schema-validated (hook/body/CTA/on-screen/VO fields, duration bounds) before persistence; rule flags like `must_disclose_not_owner` are injected from the server-side profile, never from request input

**Depends on:** US-4.2, US-3.4

---

#### US-5.2 — Preview script readability for vertical video
**As a** Operator, **I want** on-screen text length validated, **so that** subtitles fit 9:16 Reels.

| Owner | Work |
|-------|------|
| **FE** | Character/line warnings on on-screen text fields |
| **BE** | Validation rules on save; optional agent self-check pass |
| **DB** | — |

**Acceptance criteria**
- [ ] Warn when on-screen text exceeds configured max chars per beat
- [ ] Voiceover word count estimate shown vs target duration

**Depends on:** US-5.1

---

### Module: Caption Agent (P0)

#### US-6.1 — Generate Instagram caption per Reel
**As a** System, **I want** captions, hashtags, and local keywords for each script, **so that** posts are ready for review alongside video.

| Owner | Work |
|-------|------|
| **FE** | Caption tab per Reel; hashtag chips; character count |
| **BE** | Agent: strategy + script + profile → caption record; Instagram length limits |
| **DB** | `reel_captions` (reel_script_id, caption, hashtags JSON, keywords JSON, cta_variants JSON) |

**Acceptance criteria**
- [ ] Caption generated for each script in approved strategy
- [ ] Includes local/geo keywords when profile has zone
- [ ] Hashtag count within configured max
- [ ] [SEC] Caption/hashtag/keyword output is schema-validated and length-bounded before storage; captions are rendered as plain text everywhere (never as HTML)

**Depends on:** US-5.1, US-4.2

---

#### US-6.2 — CTA variants for caption testing
**As a** Operator, **I want** multiple CTA variants, **so that** the client can pick the best conversion line.

| Owner | Work |
|-------|------|
| **FE** | Radio/select among CTA variants; preview in context |
| **BE** | Store variants; persist `selected_cta_index` on approval |
| **DB** | `reel_captions.selected_cta_index` |

**Acceptance criteria**
- [ ] At least 2 CTA variants per Reel
- [ ] Selected CTA flows to Approval Flow and final export
- [ ] [SEC] `selected_cta_index` is validated server-side to be within the stored variants array bounds; free-text CTA substitution via this field is not possible

**Depends on:** US-6.1

---

## Phase 3 — Costo y proveedores

### Module: Cost Policy Engine (P0)

#### US-7.1 — Configure max budget per Reel
**As a** Operator, **I want** a maximum cost per Reel before generation, **so that** margin is protected.

| Owner | Work |
|-------|------|
| **FE** | Settings: max cost per Reel, default provider tier; display estimates |
| **BE** | `cost_policies` resolver: duration, visual mode, b-roll flag → provider + estimate |
| **DB** | `cost_policies` (client_id or global, max_cost_cents, min_quality_tier, rules JSON) |

**Acceptance criteria**
- [ ] Generation blocked if estimate exceeds max without override
- [ ] Policy considers avatar required vs faceless
- [ ] Estimate shown before user confirms generation
- [ ] Budget check counts cumulative cost of all attempts for the same Reel (retries + B-roll + TTS), not just the current attempt (controls failed-regeneration margin risk)
- [ ] [SEC] The budget check runs server-side inside the job-creation path; a direct call to the generation endpoint with a crafted payload cannot skip it (the client never sends the estimate or the policy — both are resolved server-side)
- [ ] [SEC] `max_cost_cents` and policy rules are editable only by the Operator role (hardcoded user OK locally), through a dedicated settings endpoint with validated bounds (positive integers, sane ceiling)
- [ ] [SEC] Every budget-exceeded block and every override is recorded (who, when, estimate vs cap) so margin decisions are auditable

**Depends on:** US-3.1, US-5.1

---

#### US-7.2 — Select provider by economics and quality floor
**As a** System, **I want** automatic provider recommendation per piece, **so that** we default to cheapest acceptable option.

| Owner | Work |
|-------|------|
| **FE** | Show recommended provider + rationale (read-only in V1) |
| **BE** | Policy engine ranks: HeyGen, LTX/Wan, MuseTalk, manual; output `provider_key` + `estimated_cost_cents` |
| **DB** | `provider_catalog` (key, capabilities JSON, cost_model JSON, active) |

**Acceptance criteria**
- [ ] Faceless + B-roll may route to LTX/Wan; talking head to HeyGen or MuseTalk per rules
- [ ] Manual upload always available as zero-cost fallback
- [ ] Decision logged per job for later cost analysis
- [ ] Cheapest provider meeting the quality floor is the default — expensive generation is never the silent default (roadmap rule: cheap API first)
- [ ] Provider catalog is data-driven: providers can be activated/deactivated by config so self-host options can be added later without redesign
- [ ] [SEC] `provider_key` for a job is chosen by the server-side policy engine; a client-supplied provider key is never accepted at job creation (prevents forcing an expensive provider or an inactive/unknown adapter)
- [ ] [SEC] `provider_catalog.cost_model` and `capabilities` are trusted config maintained server-side only; no endpoint exposes writes to the catalog in V1

**Depends on:** US-7.1

---

#### US-7.3 — Track actual cost per generation job
**As a** Operator, **I want** real API cost recorded per Reel, **so that** we learn true unit economics.

| Owner | Work |
|-------|------|
| **FE** | Cost column on production list; estimated vs actual |
| **BE** | On job complete: persist `actual_cost_cents`, provider, duration |
| **DB** | `video_jobs.estimated_cost_cents`, `actual_cost_cents` |

**Acceptance criteria**
- [ ] Every completed job has actual or `null` with failure reason
- [ ] Dashboard aggregate cost per client per week (simple sum)
- [ ] [SEC] `actual_cost_cents` is written only by the server-side job-completion handler from provider responses; no client-facing endpoint can set or edit recorded costs

**Depends on:** US-7.2, US-8.4

---

#### US-7.4 — Report real total cost per Reel
**As a** Operator, **I want** the full actual cost of each Reel (video jobs, retries, B-roll, TTS) rolled up in one place, **so that** we know true unit economics per piece, not just per API call.

| Owner | Work |
|-------|------|
| **FE** | "Cost" section on Reel detail: estimated vs actual total, breakdown by component (video, B-roll, voiceover); over-budget highlight; EN/ES labels |
| **BE** | Aggregation: sum `actual_cost_cents` across all jobs linked to a `reel_script_id` (all attempts and asset roles); expose to Reel detail and weekly dashboard sum |
| **DB** | No new tables; query over `video_jobs` + TTS asset costs (add `media_assets.cost_cents` for voiceover if missing) |

**Acceptance criteria**
- [ ] Every Reel shows one total actual cost including failed attempts and all asset roles
- [ ] Estimated vs actual variance visible per Reel
- [ ] Weekly per-client cost sum (US-7.3) reconciles with the sum of per-Reel totals
- [ ] [SEC] Cost roll-up queries are parameterized and scoped to the current client's Reels; cost data for other clients is never included in a response (multi-tenancy readiness)

**Depends on:** US-7.3, US-9.3

---

### Module: Video Provider Adapter (P0)

#### US-8.1 — Provider adapter interface
**As a** System, **I want** a single adapter contract for all video providers, **so that** swapping HeyGen for MuseTalk does not rewrite the pipeline.

| Owner | Work |
|-------|------|
| **FE** | — |
| **BE** | Interface: `createJob`, `getJobStatus`, `fetchAsset`, `estimateCost`; registry pattern |
| **DB** | — |

**Acceptance criteria**
- [ ] New provider = new adapter class + config, no changes to assembly pipeline
- [ ] All jobs share statuses: `queued`, `processing`, `completed`, `failed`, `cancelled`
- [ ] [SEC] All adapter code is server-only; provider API keys are read exclusively from server environment variables — never stored in the DB, never in `NEXT_PUBLIC_*` vars, never serialized into any response or log
- [ ] [SEC] The adapter interface treats all provider responses as untrusted input: status values, URLs, and error messages are validated/normalized before persistence, and provider error text is sanitized before display
- [ ] [SEC] `external_job_id` is stored opaque and only ever sent back to the same provider's adapter; it is never used to build local file paths or DB queries beyond an exact-match lookup

**Depends on:** US-7.2

---

#### US-8.2 — HeyGen adapter (V1 default for avatar)
**As a** System, **I want** HeyGen API integration, **so that** we can validate avatar Reels quickly.

| Owner | Work |
|-------|------|
| **FE** | Job status polling UI / SSE |
| **BE** | HeyGen adapter: submit script + avatar ref → poll → store MP4 URL; env API key |
| **DB** | `video_jobs` (reel_script_id, provider_key, external_job_id, status, output_url) |

**Acceptance criteria**
- [ ] Successful job returns playable video URL or stored asset
- [ ] Failures capture provider error message
- [ ] Retries configurable with max attempts
- [ ] [SEC] Job creation re-verifies active avatar consent (US-3.2) and budget (US-7.1) server-side immediately before submitting to HeyGen
- [ ] [SEC] Job status is updated only by the server-side poller (or a webhook handler that verifies the provider's signature/shared secret); no client-callable endpoint can set a job's status or `output_url`
- [ ] [SEC] Output video is downloaded server-side and stored as a local/S3 asset; provider URLs are validated (https, expected provider host) before fetching, and raw provider URLs are not persisted as the long-term `output_url` (they expire and leak provider account structure)
- [ ] [SEC] Status polling from the browser is scoped to jobs owned by the current client; job IDs from other clients return 404

**Depends on:** US-8.1, US-3.3 (own avatar), US-5.1

---

#### US-8.3 — Manual video upload fallback
**As a** Operator, **I want** to upload a video file when API generation fails or is too expensive, **so that** production continues without blocking the client.

| Owner | Work |
|-------|------|
| **FE** | Upload video on Reel detail; mark as manual provider |
| **BE** | `manual` adapter: accept upload → same job record shape as API providers |
| **DB** | Reuse `video_jobs` + `media_assets` |

**Acceptance criteria**
- [ ] Manual upload bypasses cost policy API charges
- [ ] Downstream assembly treats manual raw video like provider output
- [ ] File type and duration validated
- [ ] [SEC] Manual upload applies the same file validation stack as US-3.3 (size limit, video MIME allowlist via magic bytes, server-generated storage key, storage outside web root)
- [ ] [SEC] Manual uploads are restricted to the Operator role and recorded with uploader identity, so `manual` provider jobs are attributable
- [ ] [SEC] A manual job still goes through QA (US-10.1) before approval — the manual path bypasses cost, not compliance

**Depends on:** US-8.1

---

#### US-8.4 — Job status and failure handling UI
**As a** Operator, **I want** to see generation progress and retry failed jobs, **so that** I control regenerations and cost.

| Owner | Work |
|-------|------|
| **FE** | Status badges; retry button; failure reason; disable retry when over budget |
| **BE** | Poll/webhook status updates; retry creates new job with lineage; count regenerations |
| **DB** | `video_jobs.parent_job_id`, `attempt` |

**Acceptance criteria**
- [ ] Stale jobs timeout to `failed`
- [ ] Retry requires explicit confirmation showing new estimate
- [ ] Regeneration count visible (margin risk from roadmap)
- [ ] Retries beyond a configurable max per Reel are blocked until an operator explicitly overrides
- [ ] [SEC] Retry limit and cumulative-budget check (US-7.1) are enforced in the server-side retry handler; disabling the retry button is UI convenience only
- [ ] [SEC] If a webhook endpoint is used for status updates, it verifies request authenticity (provider signature or shared secret) and matches `external_job_id` + `provider_key` against an existing job before writing; unmatched or unsigned callbacks are rejected and logged
- [ ] [SEC] Retry override is recorded (user, reason, timestamp) in the same audit pattern as QA overrides (US-10.2)

**Depends on:** US-8.2 or US-8.3

---

#### US-8.5 — LTX/Wan adapter for B-roll (P0 stretch / Phase 3b)
**As a** System, **I want** short B-roll clips via LTX/Wan API, **so that** faceless Reels have supporting visuals without full text-to-video for every piece.

| Owner | Work |
|-------|------|
| **FE** | Optional B-roll preview strip on Reel |
| **BE** | LTX adapter for short clips; cost per second; only when policy selects it |
| **DB** | `video_jobs.asset_role`: `primary` \| `broll` |

**Acceptance criteria**
- [ ] B-roll only generated when script marks `needs_broll`
- [ ] Clips max duration per policy (e.g. 3–5s)
- [ ] Failed B-roll does not block talking-head primary (graceful degrade)
- [ ] [SEC] LTX/Wan adapter follows the same US-8.1 contract: server-only keys, untrusted-response handling, and B-roll cost counted against the Reel's cumulative budget (US-7.1)

**Depends on:** US-8.1, US-7.2

---

### Module: Media Assembly Pipeline (P0)

#### US-9.1 — Assemble final 9:16 Reel
**As a** System, **I want** to combine voice, avatar/B-roll, template, and timing, **so that** output is Instagram-ready vertical video.

| Owner | Work |
|-------|------|
| **FE** | Assembly progress; final preview player |
| **BE** | Pipeline job: inputs from video job + script + TTS audio → FFmpeg or service → `assembled_reels` |
| **DB** | `assembled_reels` (reel_script_id, preview_url, final_url, status, template_id) |

**Acceptance criteria**
- [ ] Output aspect ratio 9:16
- [ ] Duration within script target ± configurable tolerance
- [ ] Pipeline idempotent per script version
- [ ] [SEC] FFmpeg (or the assembly service) is invoked with argument arrays, never shell string interpolation; all input paths come from validated `media_assets` records owned by the job's client, and text inputs (subtitles, filenames) cannot inject FFmpeg options or shell metacharacters
- [ ] [SEC] Assembly only consumes assets already stored by the system; it never fetches arbitrary URLs supplied at assembly time (SSRF guard)

**Depends on:** US-8.4, US-6.1

---

#### US-9.2 — Add subtitles, logo, and cover
**As a** System, **I want** burned-in or overlay subtitles, client logo, and cover frame, **so that** Reels match brand and perform on Instagram.

| Owner | Work |
|-------|------|
| **FE** | Toggle subtitles on/off preview; logo upload in profile settings |
| **BE** | Subtitle generation from on-screen text + VO; logo placement; cover frame extract at 1s |
| **DB** | `business_profiles.logo_asset_id`; assembly config JSON |

**Acceptance criteria**
- [ ] Subtitles readable on mobile safe zone
- [ ] Logo optional; default template if missing
- [ ] Cover image exported for manual IG upload
- [ ] [SEC] Logo upload uses the shared upload validation stack (US-3.3): size limit, image MIME allowlist via magic bytes, server-generated storage key
- [ ] [SEC] Subtitle text is escaped/sanitized before being passed to the renderer (subtitle files and FFmpeg drawtext are injection surfaces)

**Depends on:** US-9.1, US-2.2

---

#### US-9.3 — Text-to-speech for voiceover
**As a** System, **I want** AI voice from voiceover script, **so that** clients never record audio.

| Owner | Work |
|-------|------|
| **FE** | Voice picker (limited catalog); play audio sample |
| **BE** | TTS provider integration; store audio asset; link to assembly job |
| **DB** | `media_assets` type `voiceover`; `visual_preferences.voice_id` |

**Acceptance criteria**
- [ ] Voice matches profile tone hint when possible
- [ ] Spanish and English voices supported
- [ ] TTS cost included in job estimate
- [ ] [SEC] `voice_id` is validated server-side against the offered catalog (no arbitrary provider voice IDs from the client — guards against voice-cloning misuse and unexpected billing)
- [ ] [SEC] TTS provider key is server-only, and TTS spend is counted in the Reel's cumulative budget check (US-7.1)

**Depends on:** US-5.1, US-9.1

---

## Phase 4 — Control y aprobación

### Module: QA/Compliance Agent (P0)

#### US-10.1 — Run automated QA on script, caption, and video
**As a** System, **I want** compliance checks before client review, **so that** risky content is flagged early.

| Owner | Work |
|-------|------|
| **FE** | QA report panel: pass/fail per check; severity badges |
| **BE** | Agent/rules: dangerous claims, tone, clarity, AI disclosure, avatar misuse, CTA presence |
| **DB** | `qa_reports` (assembled_reel_id, checks JSON, status, created_at) |

**Acceptance criteria**
- [ ] Checks include generic-avatar-not-owner rule (US-3.4)
- [ ] AI disclosure required when avatar or synthetic voice used
- [ ] Failed critical checks block approval until resolved or overridden by operator
- [ ] [SEC] QA verdicts are computed and stored server-side; no endpoint accepts a client-supplied "passed" flag, and the approval gate (US-11.1) reads QA status from the DB, not from the request
- [ ] [SEC] Checks are classified in the schema as `overridable` vs `blocking` (legal class: missing consent, generic-avatar impersonation); this classification is code/config, not data editable via any endpoint

**Depends on:** US-9.2, US-6.1, US-3.4

---

#### US-10.2 — Operator override with reason
**As a** Operator, **I want** to override a failed QA check with documented reason, **so that** edge cases do not stall delivery.

| Owner | Work |
|-------|------|
| **FE** | Override modal; reason required; audit display |
| **BE** | `qa_overrides` record; only operator role (hardcoded user OK locally) |
| **DB** | `qa_overrides` (qa_report_id, check_key, reason, user_id, created_at) |

**Acceptance criteria**
- [ ] Override requires non-empty reason
- [ ] Overrides visible on approval screen
- [ ] Cannot override consent/legal blocks (own avatar without consent)
- [ ] [SEC] The non-overridable set (missing/revoked consent, generic-avatar impersonation) is enforced in the override handler server-side: an override request for a `blocking` check is rejected with 403 even from the Operator, regardless of UI state
- [ ] [SEC] `qa_overrides` is append-only (no update/delete endpoint); each row records check key, reason, server-resolved user, and timestamp
- [ ] [SEC] Override applies to one specific check on one specific QA report; there is no "override all" or report-level bypass parameter

**Depends on:** US-10.1

---

### Module: Approval Flow (P0)

#### US-11.1 — Present Reel package for client approval
**As a** Client, **I want** to preview video, caption, and CTA together, **so that** I can approve what will represent my business.

| Owner | Work |
|-------|------|
| **FE** | Approval screen: video player, caption, hashtags, disclosure text, approve/reject/request changes |
| **BE** | `GET` approval package; status `pending_client`; gate on QA pass or override |
| **DB** | `approvals` (assembled_reel_id, status, client_feedback, decided_at) |

**Acceptance criteria**
- [ ] Nothing reaches client without assembly complete + QA resolved
- [ ] Mobile-friendly preview
- [ ] AI disclosure visible when required
- [ ] [SEC] The gate "assembly complete + QA passed or validly overridden" is re-checked server-side when the approval package is created AND when a decision is submitted — a direct POST to the decision endpoint for an ungated Reel is rejected
- [ ] [SEC] Approval package lookups are scoped to the current client; a Reel/approval ID belonging to another client returns 404 (IDOR guard)

**Depends on:** US-10.1, US-9.2

---

#### US-11.2 — Request controlled revision round
**As a** Client, **I want** to request specific changes (not unlimited loops), **so that** I can correct content without scope creep.

| Owner | Work |
|-------|------|
| **FE** | Change request form; show revisions remaining (e.g. 1 round V1) |
| **BE** | Increment `revision_count`; route feedback to script/caption/assembly as tagged fields |
| **DB** | `approvals.revision_count`, `change_requests` JSON |

**Acceptance criteria**
- [ ] V1 max 1 client revision round per Reel (configurable)
- [ ] Exceeded limit requires operator intervention
- [ ] Change request triggers only affected downstream steps
- [ ] [SEC] Revision limit is enforced server-side atomically (increment + check in one transaction); concurrent or replayed change requests cannot exceed the round limit
- [ ] [SEC] Change-request text is validated (length cap) and treated as data through the pipeline — including when injected into agent prompts (same prompt-injection containment as US-4.1)

**Depends on:** US-11.1

---

#### US-11.3 — Approve and mark ready to publish
**As a** Client, **I want** to approve a Reel, **so that** my team knows it can be posted to Instagram.

| Owner | Work |
|-------|------|
| **FE** | Approve button; confirmation; download/export link |
| **BE** | Status → `approved`; timestamp; optional webhook/email stub |
| **DB** | `approvals.status`: `approved` |

**Acceptance criteria**
- [ ] Approved Reels appear in "ready to publish" list
- [ ] Caption + video downloadable for manual IG posting (V1)
- [ ] Rejected Reels do not appear in publish queue
- [ ] [SEC] Approval status transitions follow a server-enforced state machine (`pending_client` → `approved`/`rejected`/`changes_requested`); approving an already-decided or ungated approval is rejected
- [ ] [SEC] Download/export links serve only assets tied to Reels of the current client, through the authenticated asset route (no direct static paths)

**Depends on:** US-11.1

---

## Phase 5 — Operación semanal (P1)

### Module: Content Calendar (P1)

#### US-12.1 — Weekly calendar view
**As a** Operator, **I want** a calendar of planned and approved Reels, **so that** I can hit 3 posts per week.

| Owner | Work |
|-------|------|
| **FE** | Week grid; drag optional P1; color by status (draft/generating/QA/pending/approved/published) |
| **BE** | Aggregate strategies, scripts, jobs, approvals by `scheduled_date` |
| **DB** | `content_calendar_slots` (client_id, date, reel_script_id, publish_status) |

**Acceptance criteria**
- [ ] Shows gaps when fewer than 3 Reels scheduled
- [ ] Click slot opens Reel detail workflow
- [ ] EN/ES day/month labels

**Depends on:** US-11.3, US-4.1

---

#### US-12.2 — Mark manual publication done
**As a** Operator, **I want** to mark a Reel as published on Instagram, **so that** the calendar reflects reality.

| Owner | Work |
|-------|------|
| **FE** | "Mark published" + optional IG post URL |
| **BE** | Update slot status; store `published_at` and URL |
| **DB** | `publish_status`: `ready` \| `published` |

**Acceptance criteria**
- [ ] Only approved Reels can be marked published
- [ ] Published date defaults to today editable
- [ ] [SEC] "Approved only" is enforced server-side in the mark-published handler (roadmap hard rule: no publish without approval); the optional IG post URL is validated as an `https://www.instagram.com/...` URL and stored as text, never rendered as a raw link without validation

**Depends on:** US-12.1

---

### Module: Metrics Lite (P1)

#### US-13.1 — Record basic post metrics manually
**As a** Operator, **I want** to enter views, likes, comments, saves, and DMs, **so that** we learn what works without a full analytics stack.

| Owner | Work |
|-------|------|
| **FE** | Metrics form on published Reel; simple number inputs |
| **BE** | `POST` metrics; validate non-negative integers |
| **DB** | `reel_metrics` (assembled_reel_id, views, likes, comments, saves, dms, recorded_at) |

**Acceptance criteria**
- [ ] Metrics only on published Reels
- [ ] Edit allowed within 7 days (configurable)
- [ ] [SEC] Metrics inputs are validated server-side as non-negative integers with a sane upper bound; the "published Reels only" and 7-day-edit rules are enforced in the handler, not just the form
- [ ] [SEC] Metrics writes are scoped to Reels of the current client (client-supplied `assembled_reel_id` verified for ownership)

**Depends on:** US-12.2

---

#### US-13.2 — Surface top themes for next strategy cycle
**As a** System, **I want** to pass performance signals into the next Content Strategy run, **so that** weekly planning improves over time.

| Owner | Work |
|-------|------|
| **FE** | "Insights" snippet on strategy screen (top 3 themes) |
| **BE** | Aggregate metrics by theme/pillar; inject summary into strategy agent prompt |
| **DB** | — |

**Acceptance criteria**
- [ ] Strategy agent prompt includes last 4 weeks metrics summary when available
- [ ] Graceful empty state when no metrics yet
- [ ] [SEC] Metrics summary injected into the strategy prompt is built from aggregated numbers server-side (no free-text fields), keeping the prompt surface free of user-authored injection vectors

**Depends on:** US-13.1, US-4.1

---

## Cross-cutting stories (all phases)

#### US-X.1 — Dashboard as default entry
**As a** Client, **I want** a dashboard showing onboarding status, this week's Reels, and pending approvals, **so that** I know what to do next.

| Owner | Work |
|-------|------|
| **FE** | Dashboard route default; cards: interview, profile, pending approvals, production status |
| **BE** | Dashboard aggregator endpoint or server component data loader |
| **DB** | — |

**Acceptance criteria**
- [ ] [SEC] Dashboard data is loaded server-side scoped to `getCurrentUser()`; the aggregator exposes no parameter to load another client's data

**Depends on:** US-1.1, US-11.1  
**Priority:** P0

---

#### US-X.2 — English and Spanish localization
**As a** Client, **I want** the UI in my language, **so that** I can use the product comfortably.

| Owner | Work |
|-------|------|
| **FE** | i18n files `en` / `es`; language switcher; all user-facing strings externalized |
| **BE** | Accept-Language or user preference; agent prompts locale-aware for generated copy |
| **DB** | `clients.preferred_locale` optional |

**Acceptance criteria**
- [ ] [SEC] Locale input (header, cookie, or preference) is validated against the supported list (`en`, `es`) before use; it is never used to build file paths or template lookups dynamically

**Priority:** P0 (incremental per screen)

---

#### US-X.3 — Hardcoded local user (dev V1)
**As a** Developer, **I want** a fixed current user without auth, **so that** we can build flows before login exists.

| Owner | Work |
|-------|------|
| **FE** | Display name/email in header |
| **BE** | `getCurrentUser()` returns `gaveho@gmail.com` / Gabriel Vega |
| **DB** | Seed single client row |

**Acceptance criteria**
- [ ] [SEC] `getCurrentUser()` lives in one server-only module and is the ONLY way any endpoint, Server Action, or agent resolves identity; no other code hardcodes the user or reads identity from headers/cookies/body
- [ ] [SEC] All owned tables carry a `client_id` FK from day one, and every query filters by the `client_id` resolved through `getCurrentUser()` — never a `client_id` from the request — so introducing real auth is a one-function change
- [ ] [SEC] `getCurrentUser()` is never imported into client components; the header displays values passed down from a Server Component

**Security note:** this helper is the future auth seam. Its return shape should already include a stable `id` used as the FK everywhere, so swapping in a session-backed implementation later changes zero call sites.

**Priority:** P0

---

## Suggested sprint order (dependency-aware)

```text
Sprint 1: US-X.3, US-X.1, US-1.1, US-1.2, US-1.3, US-2.1, US-2.2, US-2.3
Sprint 2: US-3.1, US-3.2, US-3.3, US-3.4, US-X.2 (onboarding screens)
Sprint 3: US-4.1, US-4.2, US-5.1, US-5.2, US-6.1, US-6.2
Sprint 4: US-7.1, US-7.2, US-8.1, US-8.2, US-8.3, US-8.4, US-9.3
Sprint 5: US-9.1, US-9.2, US-7.3, US-7.4, US-10.1, US-10.2
Sprint 6: US-11.1, US-11.2, US-11.3, US-8.5 (if capacity)
Sprint 7 (P1): US-12.1, US-12.2, US-13.1, US-13.2
```

---

## MVP cut line (matches roadmap)

Stories **through US-11.3** constitute the operable V1.  
**US-12.x** and **US-13.x** can be manual spreadsheets until P1 is scheduled.

---

## Agent handoff checklist

Before marking a story **done**:

1. FE: loading, empty, error, and success states implemented  
2. BE: input validated; business rules enforced server-side  
3. DB: migration or seed updated if schema changed  
4. EN + ES strings for new UI  
5. Story acceptance criteria checked  
6. Downstream stories unblocked (contract/types stable)
