# US-8.7 — HeyGen adapter (high tier / operator fallback, P1)

**Priority:** P1  
**Depends on:** US-8.1 ✅ adapter interface + registry + stub `heygen_high` · US-X.4 ✅ catalog seed · US-3.3 ✅ avatar assets · US-5.1 ✅ reel script · US-8.2 ✅ consent/budget/download-and-own pattern · US-8.4 ✅ job orchestration + poller + Operator UI · US-8.6 ✅ allowlist extension pattern · US-7.1 ✅ budget · US-7.2 ✅ tier floor · US-3.2 ✅ consent. **Soft:** US-9.3 (voiceover fixture OK).  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.7 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` Phase 4 / Sprint 7 P1). **Reviewed by FE:** required (Operator action).  
**Canonical terms:** **provider adapter** · **provider key** · **provider tier** · **operator fallback** · **external job id** · **download-and-own**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **Avatar IV / Avatar V** auto-select or catalog keys.
- **Silent upgrade** from low-tier failure to HeyGen without operator click.
- **Client-callable** HeyGen create / provider override fields.
- **Wan / LTX / ElevenLabs** high-tier adapters.
- **New `neuramark_video_jobs` columns** — reuse US-8.4 DDL.
- **Live HeyGen CI tests** — mocked HTTP only.
- **HeyGen avatar marketplace / picker UI** — CONTRACT may freeze server-side avatar id; no client catalog browser.
- **Assembly / FFmpeg** — US-9.x.
- **Webhook status** — poll-only V1 (US-8.4 pattern); if HeyGen callback used later, signature verify required (SEC).

## Scope split

| Concern | Owner |
|---------|--------|
| Real `heygen_high` `VideoProviderAdapter` (HeyGen API) | **US-8.7 Phase A** BE / media |
| `lib/contracts/heygen-high.ts` constants | **US-8.7 Phase A** BE |
| Registry: stub → `createHeygenHighAdapter` | **US-8.7 Phase A** BE |
| `estimateCost` from catalog `per_second` × duration | **US-8.7 Phase A** BE |
| `createJob` / `getJobStatus` / `fetchAsset` + US-8.1 normalizers | **US-8.7 Phase A** BE |
| Mocked-HTTP adapter tests + registry regression | **US-8.7 Phase A** BE |
| Activate catalog `heygen_high` + cost_model correction | **US-8.7 Phase B** DB |
| Unlock orchestrator for `heygen_high` (high tier + fallback) | **US-8.7 Phase B** BE |
| Operator fallback Server Action + audit record | **US-8.7 Phase B** BE |
| Operator “Generate with HeyGen” UI + EN/ES | **US-8.7 Phase B** FE |
| Policy `resolveProviderForJob` tier floor | **US-7.2** ✅ (unchanged — verify with tests) |
| Job row persistence + poller + status badges | **US-8.4** ✅ |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-8.7-heygen-adapter`** |
| Module | **`lib/providers/video/heygen-high-adapter.ts`** (`import "server-only"`) |
| Constants | **`lib/contracts/heygen-high.ts`** — mirror SadTalker/MuseTalk shape |
| Factory | **`createHeygenHighAdapter(params)`** — duration-aware estimate from catalog |
| Provider key | **`heygen_high`** · **`videoAssetRole: primary`** |
| Env | **`HEYGEN_API_KEY`** via `process.env[envKeyName]`; missing → **`PROVIDER_CONFIG_MISSING`** |
| Auth header | **`X-Api-Key`** |
| Vendor API | HeyGen **v3** — `POST /v3/videos`, `GET /v3/videos/{id}` — CONTRACT freezes body + engine |
| Engine | **Explicit standard / non–Avatar-IV** — never omit `engine` (API default is Avatar IV) |
| Avatar IV | **Never auto-selected**; no V1 UI / catalog for IV |
| `estimateCost` | **`per_second` × `targetDurationSec`**; seed **`unitCostCents: 2`** (~$1.20/min) |
| Catalog activate | **Phase B migration** `active = true` + cost_model correction |
| Low tier | **Never** resolves `heygen_high` |
| Fallback | Operator-only after **failed** low-tier talking-head job; recorded override |
| High tier | Policy selects `heygen_high` when tier=`high` and active |
| Consent / budget | Same gate order as US-8.2/8.4 |
| `fetchAsset` | Download-and-own; HeyGen host allowlist (CONTRACT) |
| Orchestrator allowlist | Extend to `{ sadtalker_low, musetalk_low, heygen_high }` |
| FE | Operator “Generate with HeyGen” + estimate confirm + EN/ES |
| Implementers | media-pipeline-engineer + nextjs-backend + nextjs-frontend |

### Catalog row (Phase B target)

| Field | Value |
|-------|-------|
| `key` | `heygen_high` |
| `asset_role` | `talking_head` |
| `tier` | `high` |
| `active` | **`true`** (Phase B) |
| `env_key_name` | `HEYGEN_API_KEY` |
| `capabilities` | `{}` (or CONTRACT: `{ "highTierOnly": true }`) |
| `cost_model` | `{ "billingUnit": "per_second", "unitCostCents": 2, "metadata": { "plan": "standard", "vendor": "heygen", "approxPerMinuteCents": 120 } }` |

### Trigger matrix (CONTRACT freezes)

| Condition | HeyGen allowed? |
|-----------|-----------------|
| `provider_tier = low` + normal create | **No** (policy never selects) |
| `provider_tier = low` + failed low-tier job + operator fallback action | **Yes** (explicit override) |
| `provider_tier = high` + catalog active | **Yes** (policy select) |
| Client session / non-operator | **No** (403) |
| Client body `provider_key` / `tier` | **Reject** (`FORBIDDEN_FIELDS`) |

### Adapter method sketch (CONTRACT freezes exact signatures)

```ts
// lib/providers/video/heygen-high-adapter.ts
export function createHeygenHighAdapter(params: {
  defaultEstimateCents: number; // fallback when duration missing
  unitCostCentsPerSecond: number; // from catalog
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "portrait" | "audio" | "video",
  ) => Promise<string>;
  uploadGeneratedVideo?: (args: UploadGeneratedVideoArgs) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  heygenAvatarId?: string; // server config / env — CONTRACT
  initialJobContexts?: Map<ExternalJobId, JobContext>;
}): VideoProviderAdapter;
```

### HeyGen createJob flow (Phase A BUILD)

```ts
// 1. Validate env HEYGEN_API_KEY
// 2. Validate voiceover (+ portrait / avatar mapping per CONTRACT)
// 3. Resolve assets → HTTPS URLs (owned media only)
// 4. POST https://api.heygen.com/v3/videos with explicit non–Avatar-IV engine
// 5. Return { externalJobId, status: "queued", estimatedCostCents }
```

### Registry registration (Phase A BUILD)

```ts
// lib/providers/create-provider-registry.ts
import { createHeygenHighAdapter } from "@/lib/providers/video/heygen-high-adapter";

// Replace createHeygenHighStubAdapter — register real adapter for heygen_high
```

### Orchestrator + fallback (Phase B BUILD)

```ts
// 1. Extend isAllowedTalkingHeadProviderKey to include heygen_high
// 2. High-tier: resolveProviderForJob → heygen_high when active
// 3. Fallback action: requireOperator → load failed parent job → force heygen_high
//    (server authority — not client provider_key) → budget + consent → createJob
// 4. Persist provider_tier on job row as high for HeyGen jobs; log decision / override
// 5. Reuse US-8.4 poller unchanged
```

## Carry-forwards / reuse (do not reinvent)

- Pattern: `lib/providers/video/sadtalker-low-adapter.ts` / `musetalk-low-adapter.ts`.
- Stub today: `lib/providers/video/heygen-high-stub-adapter.ts` — replace.
- Interface: `lib/providers/provider-adapters.ts` — **`VideoProviderAdapter`**.
- Normalizers: `lib/providers/normalize-provider-response.ts`.
- Registry: `lib/providers/create-provider-registry.ts`.
- Orchestrator: `lib/video-jobs/create-talking-head-video-job.ts`.
- Operator gate: `requireOperator` (US-8.3 / US-8.4).
- Policy: `lib/providers/resolve-provider-for-job.ts` — verify low never → heygen.
- Display label: `resolve-provider-display-label.ts` — **`heygen_high: "HeyGen"`** already seeded.
- Security baseline: `plan/SECURITY_BASELINE.md` § Video Provider; US-8.2 SECURITY.md.

---

## FE checklist

Concrete consumer: Operator Reel / script detail (US-8.4 surfaces).

- [ ] **“Generate with HeyGen”** control — visible only to Operator when eligibility met (high tier **or** failed low-tier talking-head job).
- [ ] **Confirm dialog** shows estimated cost (per-second × duration) before submit.
- [ ] **EN + ES** message keys for label, confirm, errors, disabled reasons.
- [ ] **PrimeReact** components; no client-supplied `provider_key` / tier fields.
- [ ] Hide / disable for non-operator; clients never see the action.
- [ ] After success, rely on existing US-8.4 status badges / poll (provider-agnostic).
- [ ] Loading / error / empty (ineligible) states covered.

---

## BE checklist

Concrete consumers: **`createTalkingHeadVideoJob()`** · operator fallback action · US-8.4 poller · **`estimateVideoJobCost()`** / policy estimates · FE confirm dialog.

### Phase A — HeyGen adapter

- [ ] **`lib/contracts/heygen-high.ts`** — env key, API base paths, engine constant (non–IV), MIME allowlists, output hosts, fetch limits.
- [ ] **`lib/providers/video/heygen-high-adapter.ts`** — implement **`VideoProviderAdapter`** for **`heygen_high`** / **`primary`**.
- [ ] **`estimateCost`** — `unitCostCents * durationSec` from catalog / projection; ~$1/min standard.
- [ ] **`createJob`** — validate inputs; set **explicit engine ≠ Avatar IV**; POST HeyGen v3; return opaque `externalJobId`.
- [ ] **`getJobStatus`** — GET video status; **`normalizeVideoJobStatusResult`**; allowlisted `rawOutputUrl` only when terminal.
- [ ] **`fetchAsset`** — **`validateProviderOutputUrl`** → download → Storage → **`storedMediaAssetSchema`**; job context map for poller L1.
- [ ] **Registry** — replace **`createHeygenHighStubAdapter`** with **`createHeygenHighAdapter`**; update bootstrap estimate wiring for `per_second`.
- [ ] **[SEC] `server-only`**; token never logged/returned; untrusted JSON sanitized; output URL allowlist; opaque **`external_job_id`**.
- [ ] **`lib/providers/video/heygen-high-adapter.test.ts`** — mocked HTTP round-trip; missing env; engine not omitted; sanitized errors; estimate math.
- [ ] **Update registry / policy tests** — `getVideoAdapter("heygen_high")` is real; **low tier never selects** `heygen_high`.

### Phase B — Orchestrator + fallback + activate

- [ ] **Migration** — `UPDATE neuramark_provider_catalog SET active = true, cost_model = … WHERE key = 'heygen_high'`; bootstrap catalog parity.
- [ ] **`isAllowedTalkingHeadProviderKey`** — include **`heygen_high`**.
- [ ] **High-tier create path** — when policy resolves `heygen_high`, create succeeds with consent/budget gates.
- [ ] **Operator fallback Server Action** — `requireOperator`; eligibility = failed low-tier parent (or CONTRACT-equivalent); force `heygen_high` server-side; record override audit.
- [ ] **Reject** client `provider_key` / tier / Avatar IV flags.
- [ ] **Job INSERT** — `provider_key = heygen_high`, `provider_tier = high`, spend event, lineage to parent when fallback.
- [ ] **Retry path** — HeyGen retries stay on `heygen_high` when parent was HeyGen; low-tier retry does **not** silently become HeyGen.
- [ ] **Orchestrator tests** — high select · fallback · low never · non-operator 403 · budget block · consent block (`own_avatar`).
- [ ] **No new poller** — reuse US-8.4.

---

## DB checklist

All objects keep `neuramark_` prefix.

- [ ] **Migration** activate + cost_model correction for **`heygen_high`** only (no DDL on `video_jobs`).
- [ ] Bootstrap / seed fixtures in tests updated (`active: true`, `unitCostCents: 2`).
- [ ] RLS deny-by-default unchanged; service-role Node only.
- [ ] No secrets in catalog rows — `env_key_name` only.

---

## Media / provider checklist

- [ ] HeyGen HTTP only under `lib/providers/**` (except tests).
- [ ] Explicit **non–Avatar-IV** engine on every create.
- [ ] Download-and-own storage key shape **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`**.
- [ ] Poller L1 job context map parity with SadTalker/MuseTalk.
- [ ] Cost estimate uses **server** `targetDurationSec` from script package.

---

## Tests checklist

- [ ] Adapter mocked HTTP: create → poll → fetchAsset happy path.
- [ ] Missing `HEYGEN_API_KEY` → `PROVIDER_CONFIG_MISSING`.
- [ ] Estimate: 30s × 2¢ = 60¢ (example fixture).
- [ ] Engine field present and not Avatar IV default.
- [ ] Output host reject (SSRF).
- [ ] Policy: `provider_tier=low` → never `heygen_high` (even when active).
- [ ] Policy: `provider_tier=high` + active → `heygen_high`.
- [ ] Fallback: operator + failed low job → create HeyGen; client → 403.
- [ ] Consent + budget gates on HeyGen create (orchestrator).
- [ ] Registry: no stub id prefix for `heygen_high`.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian)
- [x] SECURITY.md (security-architect)
- [x] CONTRACT.md authored (nextjs-backend — frozen 2026-08-31; **Reviewed by FE:** pending)
- [ ] BUILD Phase A (media-pipeline-engineer + nextjs-backend)
- [ ] BUILD Phase B (BE + DB + FE)
- [ ] VALIDATION.md (requirements-validator)
- [ ] QA.md (qa-engineer)

**Status:** CONTRACT frozen. **Next:** FE Reviewed by FE → BUILD A → BUILD B.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Exact HeyGen `engine` string for standard (non–IV)?** **PO lean:** CONTRACT freezes against current HeyGen v3 docs (e.g. legacy Avatar III / explicit standard) — must not omit field.
2. **Avatar identity:** HeyGen `avatar_id` from env (`HEYGEN_DEFAULT_AVATAR_ID`) vs upload `image_url` from own-avatar portrait? **PO lean:** CONTRACT supports **portrait `image_url` for own_avatar** + **configured studio `avatar_id` for generic** — SECURITY reviews URL allowlisting for inputs.
3. **Audio vs text script on create?** **PO lean:** prefer **`audio_url`** from US-9.3 voiceover asset when present; text script fallback only if CONTRACT needs it.
4. **Fallback eligibility window?** **PO lean:** latest talking-head job for reel is `failed` and `provider_key` ∈ `{ sadtalker_low, musetalk_low }` — CONTRACT may also allow after max retries exhausted.
5. **Override storage?** **PO lean:** reuse US-8.4 / US-10.2 audit pattern (dedicated table or job metadata jsonb) — CONTRACT picks one; must record operator + reason + timestamp.
6. **Webhook vs poll?** **PO lean:** **poll-only** V1 (US-8.4); no HeyGen callback endpoint in this story.
7. **Cost seed 7→2?** **PO lean:** **yes** — prior 7¢/sec (~$4.20/min) misaligned with AC ~$1/min standard; document in migration comment.
8. **Partial CLOSE after Phase A?** **PO lean:** **no** — keep AC unchecked until Phase B VALIDATION; optional interim “Phase A BUILD done” note in SPRINT-STATE only.

No SPEC amendment assumed in PREP: SPEC §3 requires swappable video adapters with download-and-own; HeyGen is the documented high-tier / P1 fallback, not the default.
