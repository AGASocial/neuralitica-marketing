# US-8.7 — HeyGen adapter (high tier / operator fallback, P1)

**Status:** CONTRACT frozen (2026-08-31) — SECURITY ✅ · CONTRACT ✅ (Reviewed by FE) · BUILD pending.

**As a** System, **I want** HeyGen API integration, **so that** operators can produce higher-polish avatar Reels or recover when low-tier adapters fail.

Ship **server-only HeyGen `VideoProviderAdapter`** for catalog key **`heygen_high`**: replace **`createHeygenHighStubAdapter`** with a real adapter behind **`HEYGEN_API_KEY`**; wire **`createHeygenHighAdapter`** in **`getProviderRegistry()`** / **`initializeProviderRegistryFromCatalog()`**; implement **`estimateCost`** from catalog **`per_second`** (~$1/min standard); pipe **`createJob` / `getJobStatus` / `fetchAsset`** through US-8.1 normalizers; **activate** catalog row; unlock orchestrator for **high-tier policy** and **operator-only fallback after low-tier failure**; add Operator **“Generate with HeyGen”** action (EN/ES). **Avatar IV never auto-selected.** Cover adapter with **mocked-HTTP unit tests only**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-8.7 (unchecked until VALIDATION).

**This folder:** [`plan/stories/US-8.7/`](./) — `README.md` · `TASKS.md` (gates: `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md` — create when story enters sprint).

**Branch:** `feature/US-8.7-heygen-adapter`

**Depends on:** [US-8.1](../US-8.1/) ✅ `VideoProviderAdapter` · registry · normalizers · stub `heygen_high` · [US-X.4](../US-X.4/) ✅ catalog seed `heygen_high` · `HEYGEN_API_KEY` · `per_second` · [US-3.3](../US-3.3/) ✅ avatar reference assets · [US-5.1](../US-5.1/) ✅ reel script package · [US-8.2](../US-8.2/) ✅ SadTalker pattern (consent / budget / download-and-own) · [US-8.4](../US-8.4/) ✅ job table · poller · retry UI · [US-8.6](../US-8.6/) ✅ MuseTalk orchestrator allowlist pattern · [US-7.1](../US-7.1/) ✅ budget · [US-7.2](../US-7.2/) ✅ policy tier floor · [US-3.2](../US-3.2/) ✅ consent helper. **Soft:** [US-9.3](../../USER_STORIES.md) (voiceover asset — fixture OK).

**Unblocks:** High-tier talking-head path · operator recovery after SadTalker/MuseTalk failure · Sprint 7 P1 provider matrix completion (next: US-8.5 Wan).

---

## Scope in

| Area | What US-8.7 BUILD adds |
|------|------------------------|
| **FE Phase B** | Operator-only **“Generate with HeyGen”** on Reel / script detail when (a) `provider_tier = high`, or (b) latest talking-head job **failed** on a low-tier provider — EN/ES i18n; confirm estimate before submit. |
| **BE Phase A** | **`lib/providers/video/heygen-high-adapter.ts`** — real HeyGen `VideoProviderAdapter` (`providerKey: heygen_high`, `videoAssetRole: primary`); **`lib/contracts/heygen-high.ts`** constants; **replace stub** in **`create-provider-registry.ts`**; **`estimateCost`** from catalog `per_second` × duration; **`createJob` / `getJobStatus` / `fetchAsset`** + US-8.1 normalizers; **mocked-HTTP tests**. |
| **BE Phase B** | Unlock **`createTalkingHeadVideoJob()`** for **`heygen_high`**; **operator fallback** path (explicit flag / dedicated action — never client-supplied `provider_key`); **activate** catalog row; record fallback override; reuse US-8.4 poller / status UI. |
| **DB Phase B** | Migration: set **`heygen_high.active = true`**; correct **`cost_model`** to standard ~$1/min (`per_second` cents); bootstrap catalog parity. **No** new `video_jobs` columns. |
| **Implementers** | **media-pipeline-engineer** (adapter + HeyGen I/O) + **nextjs-backend** (`CONTRACT.md`, orchestrator, catalog migration, tests) + **nextjs-frontend** (Operator action + EN/ES). |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-8.5** Wan B-roll | Separate P1 adapter. |
| **Avatar IV / Avatar V auto-select** | Never auto-selected; V1 freezes **standard** engine only. |
| **Client-facing HeyGen request** | Operator-only; clients cannot force high tier or provider. |
| **Silent upgrade when `provider_tier = low`** | Tier floor + inactive/active rules — high never chosen on low. |
| **New job table / poller** | US-8.4 ✅ — reuse. |
| **Live HeyGen integration tests** | Mocked HTTP only in CI. |
| **ElevenLabs / LTX high-tier** | Other catalog rows; out of scope. |
| **Assembly / FFmpeg** | US-9.x. |
| **Per-client HeyGen avatar catalog UI** | CONTRACT may freeze env/server avatar id map; no client avatar picker UI in V1. |

## Canonical terms (CONTEXT)

Use **provider adapter**, **provider key**, **provider tier**, **asset role**, **external job id**, **video job status**, **download-and-own**, **operator fallback**.  
_Evitar:_ client-supplied `provider_key`; long-lived third-party `output_url` as canonical; API secrets in catalog rows or responses; silent high-tier default on low.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-8.1 | Stub **`heygen_high`** registered — **replace body**, do not fork interface. |
| US-8.2 / US-8.6 | Replicate adapter pattern — **mirror** for HeyGen HTTP + normalizers + download-and-own. |
| US-8.4 | **`createTalkingHeadVideoJob()`**, poller, retry, Operator status — **extend allowlist** + fallback action. |
| US-7.2 | Tier floor: **`provider_tier = low` never selects `heygen_high`**; high selects only when row **active**. |
| US-X.4 | Catalog row **`heygen_high`**: `talking_head` · `high` · **`active = false`** until this story · `envKeyName: HEYGEN_API_KEY`. |
| US-8.3 | Operator-only mutation gate pattern (`requireOperator`) — reuse for fallback trigger. |

**US-8.7 replaces the HeyGen stub, activates the high-tier catalog row, and adds operator fallback + FE** — not a second job system.

---

## PO decisions frozen (2026-08-31)

1. **Phased BUILD (single story):** **Phase A** = real **`heygen_high`** adapter + registry swap + estimate + create/status/fetch stubs→real with mocked HTTP (callable in isolation; catalog may stay inactive). **Phase B** = activate catalog + orchestrator unlock + operator fallback + FE action + consent/budget gates. Full USER_STORIES AC closure requires **both phases** + VALIDATION.
2. **Never silent default on low:** With **`provider_tier = low`**, policy **must not** resolve `heygen_high` (tier floor). Activating the row does **not** change low-tier routing. No silent upgrade after low-tier failure — only **explicit operator** fallback.
3. **`provider_key`:** **`heygen_high`** only (no `heygen_avatar_iv` catalog key in V1).
4. **Activate catalog row:** **Yes in Phase B** — migration sets `active = true` so **`provider_tier = high`** can select it. Until Phase B, keep `active = false` (Phase A adapter still registerable for isolated tests).
5. **Operator fallback trigger:** After a **failed** low-tier talking-head job (`sadtalker_low` / `musetalk_low`), Operator may invoke **“Generate with HeyGen”**. Server records override (operator id, reason/rationale key e.g. `operator_heygen_fallback`, timestamp — same audit spirit as US-8.4 retry override / US-10.2). **Not** available to clients (403).
6. **High-tier path:** When cost policy **`provider_tier = high`** and row active, `resolveProviderForJob` selects **`heygen_high`**; orchestrator allowlist includes it (extend `isAllowedTalkingHeadProviderKey`).
7. **Cost model:** Keep schema **`billingUnit: "per_second"`** (no `per_minute` enum). Align seed to **standard ~$1/min**: **`unitCostCents: 2`** (≈ $1.20/min; 30s Reel ≈ 60¢). Metadata `{ plan: "standard", vendor: "heygen", approxPerMinuteCents: 120 }`. Estimate = `unitCostCents * targetDurationSec` (server duration from script — never client cost drivers). Correct migration **updates** prior seed `unitCostCents: 7` (was inconsistent with ~$1/min AC).
8. **Avatar IV:** **Never auto-selected.** HeyGen API defaults to Avatar IV when `engine` omitted — V1 adapter **must set engine explicitly to standard / non–Avatar-IV** (CONTRACT freezes exact `engine` string). Avatar IV / V remain out of scope (no catalog row, no UI toggle).
9. **Consent / budget / download-and-own:** **Same as US-8.2 / US-8.4** — gate order: policy (or fallback force) → estimate → **`assertReelBudgetAllowsSpend`** → **`assertActiveAvatarConsentForJobs`** when `own_avatar` → `adapter.createJob` → INSERT → spend → poll. **`fetchAsset`**: validate HTTPS allowlist → download → Storage → `StoredMediaAsset`; no long-lived HeyGen CDN URL as canonical.
10. **Env var:** **`HEYGEN_API_KEY`** (catalog `envKeyName` already — do not rename). Missing → **`ProviderAdapterError`** `PROVIDER_CONFIG_MISSING` before network I/O. Header: **`X-Api-Key`**.
11. **Vendor API (PO lean — CONTRACT freezes):** Base `https://api.heygen.com`; create **`POST /v3/videos`** (avatar + audio/script); status **`GET /v3/videos/{id}`**; auth **`X-Api-Key`**. Prefer **audio_url** from resolved voiceover asset (lip-sync) when available; portrait/avatar mapping frozen in CONTRACT (HeyGen `avatar_id` and/or `image_url` from owned media).
12. **Output hosts:** CONTRACT freezes HeyGen CDN / delivery allowlist for `validateProviderOutputUrl` (do not reuse Replicate hosts).
13. **Registry:** Swap stub → **`createHeygenHighAdapter`**; remove stub from production bootstrap (tests may keep factory if needed).
14. **FE:** Operator-only; PrimeReact; EN/ES; show estimate before confirm; reuse US-8.4 status badges after job create (provider-agnostic).
15. **Tests:** Mocked HTTP only for adapter; orchestrator tests for high-tier select + fallback + low-tier never-HeyGen; FE not required for Phase A VALIDATION slice.
16. **Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (Phase B); CONTRACT before BUILD; **Reviewed by FE** required (FE surface exists).

### Phase A vs Phase B recommendation

| Phase | Ship | Closes which AC? |
|-------|------|------------------|
| **A** | Adapter + registry + estimate + create/status/fetch + mocked tests | Partial — adapter body proof; **not** full USER_STORIES |
| **B** | Activate catalog · orchestrator · operator fallback · FE · consent/budget | Remaining AC — **required for CLOSE** |

**PO recommendation:** Execute **Phase A then Phase B in this story** (MuseTalk-style), not defer B to another US. MVP can run without HeyGen (P1), but closing US-8.7 without operator fallback/FE would leave AC open. Ship A first for vendor-risk isolation; do not merge to main until B + VALIDATION (or explicitly CLOSE Phase A only with unchecked AC — **prefer full close**).

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — cross-cutting vs SPEC §3 S3.M9 Video Provider)
- [x] SECURITY.md (security-architect — HeyGen SSRF, operator fallback abuse, key redaction, Avatar IV cost footgun)
- [x] CONTRACT.md (nextjs-backend — frozen 2026-08-31; **Reviewed by FE:** approved 2026-08-31)
- [ ] BUILD Phase A (media-pipeline-engineer + nextjs-backend)
- [ ] BUILD Phase B (BE orchestrator + DB activate + FE)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** CONTRACT frozen + FE signoff. **Next:** BUILD A → BUILD B.

---

## Acceptance criteria mapping

| USER_STORIES § US-8.7 AC | Deliverable | Phase |
|-------------------------|-------------|-------|
| Never silent default when `provider_tier = low` | Tier floor + tests; no auto-fallback | A (policy unchanged) + B (no silent path) |
| Used when `provider_tier = high`, or operator fallback after low-tier failure | Activate row + orchestrator + FE action + override record | B |
| Estimated cost per-minute model (~$1/min); Avatar IV never auto-selected | `per_second` × duration; explicit non–IV engine | A |
| Same consent, budget, download-and-own, webhook/polling security as US-8.2 | Orchestrator gates + `fetchAsset` + US-8.4 poller | A (`fetchAsset`) + B (gates) |
| Operator-only fallback; clients cannot request HeyGen | `requireOperator` + no client provider field | B |
