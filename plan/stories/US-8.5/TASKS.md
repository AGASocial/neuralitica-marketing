# US-8.5 — Wan B-roll adapter (low tier, P0)

**Priority:** P0  
**Depends on:** US-8.1 ✅ adapter interface + registry + stub `siliconflow_wan21_turbo` · US-7.2 ✅ policy routes low + `needsBroll` → Wan · US-X.4 ✅ catalog seed (active, 21¢ `per_clip`, `SILICONFLOW_API_KEY`) · US-8.4 ✅ job table + poller + Operator UI · US-7.1 ✅ budget. **Soft:** US-5.1 (`broll_beats` / `modalidad`) · US-9.1 Phase A (stitch = US-9.1 Phase B). **Pattern:** US-8.2 / US-8.6 / US-8.7 · CosyVoice2 SiliconFlow.  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-8.5 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **media-pipeline-engineer** + **nextjs-backend** (`docs/development/AGENT-ROSTER.md` Phase 4 / Sprint 7). **Reviewed by FE: N/A** — preview strip deferred.  
**Canonical terms:** **provider adapter** · **provider key** · **asset role (`broll`)** · **external job id** · **download-and-own** · **graceful degrade**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-9.1 Phase B** FFmpeg multi-clip stitch / `build-broll-concat-args.ts`.
- **Optional FE B-roll preview strip** — deferred; no FE AC.
- **`ltx_broll_high`** / high-tier B-roll activation.
- **New provider_key** (`wan_broll_low`) — use **`siliconflow_wan21_turbo`** only.
- **Catalog activate migration** — row already `active = true`.
- **Talking-head create path changes** that couple primary to B-roll success.
- **Live SiliconFlow CI tests** — mocked HTTP only.
- **New `neuramark_video_jobs` DDL** unless CONTRACT proves a gap (column `asset_role` already supports `broll`).
- **Client-supplied `provider_key` / free-form prompt as sole create authority**.

## Scope split

| Concern | Owner |
|---------|--------|
| Real `siliconflow_wan21_turbo` `VideoProviderAdapter` (SiliconFlow Wan I2V) | **US-8.5 Phase A** BE / media |
| `lib/contracts/siliconflow-wan21-turbo.ts` (or CONTRACT-exact) constants | **US-8.5 Phase A** BE |
| Registry: stub → `createSiliconflowWan21TurboAdapter` | **US-8.5 Phase A** BE |
| `estimateCost` from catalog `per_clip` / **21¢** | **US-8.5 Phase A** BE |
| `createJob` / `getJobStatus` / `fetchAsset` + US-8.1 normalizers | **US-8.5 Phase A** BE |
| Mocked-HTTP adapter tests + registry regression | **US-8.5 Phase A** BE |
| B-roll orchestrator (`createBrollVideoJobs` or CONTRACT name) | **US-8.5 Phase B** BE |
| `asset_role = broll` job INSERT + spend events | **US-8.5 Phase B** BE |
| Graceful degrade vs talking-head primary | **US-8.5 Phase B** BE |
| Poller / retry parity for B-roll jobs | **US-8.5 Phase B** BE |
| Policy `resolveProviderForJob` B-roll low default | **US-7.2** ✅ (verify with tests) |
| Multi-clip stitch | **US-9.1 Phase B** (handoff) |
| FE preview strip | **Deferred** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-8.5-wan-broll-adapter`** |
| Module | **`lib/providers/video/siliconflow-wan21-turbo-adapter.ts`** (`import "server-only"`) |
| Constants | **`lib/contracts/siliconflow-wan21-turbo.ts`** — mirror CosyVoice2 / SadTalker constant shape |
| Factory | **`createSiliconflowWan21TurboAdapter(params)`** — catalog-driven estimate |
| Provider key | **`siliconflow_wan21_turbo`** · **`videoAssetRole: broll`** |
| Env | **`SILICONFLOW_API_KEY`** via `process.env[envKeyName]`; missing → **`PROVIDER_CONFIG_MISSING`** |
| Vendor API | SiliconFlow **Wan2.1 I2V Turbo** — CONTRACT freezes model id + create/status/fetch URLs (lean: same SiliconFlow API host family as CosyVoice2) |
| Duration | Clamp to **≤ 5s**; policy band **3–5s**; default lean **5s** |
| `estimateCost` | **`per_clip` × clipCount**; seed **`unitCostCents: 21`** (~$0.21) |
| Catalog | Already **active**; no activate migration |
| Default when low + needs_broll | Policy ✅; Phase B orchestrator must create |
| Graceful degrade | B-roll failure **never** blocks / fails primary talking-head |
| Multi-clip | N jobs from `brollBeats` (max lean **8**); stitch → **US-9.1 Phase B** |
| Inputs | Server-resolved **image** + server-authored **prompt** from beat/script (I2V) |
| Consent | **Not** required for B-roll |
| Budget | Per-clip estimate + **`assertReelBudgetAllowsSpend`** before each create |
| FE | **Defer** preview strip; **Reviewed by FE: N/A** |
| Implementers | media-pipeline-engineer + nextjs-backend |

### Catalog row (US-X.4 seed — do not rename)

| Field | Value |
|-------|-------|
| `key` | `siliconflow_wan21_turbo` |
| `asset_role` | `broll` |
| `tier` | `low` |
| `active` | `true` (already) |
| `env_key_name` | `SILICONFLOW_API_KEY` |
| `capabilities` | `{}` (or CONTRACT metadata) |
| `cost_model` | `{ "billingUnit": "per_clip", "unitCostCents": 21, "metadata": { "clipDurationSec": 5, "model": "wan2.1-i2v-turbo", "vendor": "siliconflow" } }` |

### Trigger matrix (CONTRACT freezes)

| Condition | Wan B-roll create? |
|-----------|---------------------|
| `provider_tier = low` + `needsBroll` + budget OK | **Yes** (policy → `siliconflow_wan21_turbo`) |
| `provider_tier = low` + no needsBroll | **No** |
| `provider_tier = high` + `ltx_broll_high` inactive | **No** Wan; high B-roll out of scope |
| Talking-head primary create | **Independent** — never waits on B-roll |
| B-roll job fails / times out | Primary **continues**; B-roll row `failed` |
| Client body `provider_key` | **Reject** (`FORBIDDEN_FIELDS`) |

### Adapter method sketch (CONTRACT freezes exact signatures)

```ts
// lib/providers/video/siliconflow-wan21-turbo-adapter.ts
export function createSiliconflowWan21TurboAdapter(params: {
  defaultEstimateCents: number; // 21 from catalog bootstrap
  unitCostCentsPerClip?: number;
  resolveMediaAssetUrl?: (
    assetId: string,
    clientId: string,
    kind: "image" | "portrait",
  ) => Promise<string>;
  uploadGeneratedVideo?: (args: UploadGeneratedVideoArgs) => Promise<UploadGeneratedVideoResult>;
  fetchImpl?: typeof fetch;
  initialJobContexts?: Map<ExternalJobId, JobContext>;
}): VideoProviderAdapter;
```

### SiliconFlow createJob flow (Phase A BUILD)

```ts
// 1. Validate env SILICONFLOW_API_KEY
// 2. Validate reference image asset id + server prompt / duration ≤ 5s
// 3. Resolve image → HTTPS URL (owned media only; MIME allowlist)
// 4. POST SiliconFlow Wan I2V endpoint (CONTRACT freezes path + body)
// 5. Return { externalJobId, status: "queued", estimatedCostCents: 21 }
```

### Registry registration (Phase A BUILD)

```ts
// lib/providers/create-provider-registry.ts
import { createSiliconflowWan21TurboAdapter } from "@/lib/providers/video/siliconflow-wan21-turbo-adapter";

// Replace createSiliconflowWan21TurboStubAdapter — register real adapter
// estimateCentsFromCatalog(..., "siliconflow_wan21_turbo", 21)
```

### B-roll orchestrator (Phase B BUILD)

```ts
// 1. requireOperator (or existing video-job gate)
// 2. Load script → needsBroll + brollBeats → clipCount (cap max)
// 3. resolveProviderForJob(assetRole: "broll", tier: low) → siliconflow_wan21_turbo
// 4. For each clip: estimate → assertReelBudgetAllowsSpend → adapter.createJob
//    → INSERT asset_role = "broll" → spend event → enqueue poll
// 5. On clip failure: mark that job failed; do NOT touch primary jobs
// 6. Talking-head createTalkingHeadVideoJob remains unchanged (asset_role primary)
```

## Carry-forwards / reuse (do not reinvent)

- Stub today: `lib/providers/video/siliconflow-wan21-turbo-stub-adapter.ts` — replace.
- Interface: `lib/providers/provider-adapters.ts` — **`VideoProviderAdapter`**.
- Normalizers: `lib/providers/normalize-provider-response.ts`.
- Registry: `lib/providers/create-provider-registry.ts`.
- Policy: `lib/providers/resolve-provider-for-job.ts` — verify `needsBroll` → Wan.
- Display label: `resolve-provider-display-label.ts` — **`siliconflow_wan21_turbo: "Wan 2.1 Turbo"`** already seeded.
- SiliconFlow auth pattern: `lib/providers/tts/siliconflow-cosyvoice2-adapter.ts`.
- Job row shape: `lib/video-jobs/video-job-row.ts` (`assetRole: "primary" | "broll"`).
- Talking-head orchestrator: `create-talking-head-video-job.ts` — **do not** couple; add parallel B-roll create module.
- Security baseline: `plan/SECURITY_BASELINE.md` § Video Provider; US-8.2 / US-8.7 SECURITY.md patterns.

---

## FE checklist

Concrete consumer: **none in this story** (optional preview strip **deferred**).

- [ ] **Deferred:** Operator B-roll preview strip on Reel detail (EN/ES) — follow-up / P1.
- [ ] **Note:** `/operator/scripts` may continue filtering `asset_role = primary` (`get-video-jobs-for-reel-scripts`) until a thin UX pass lists B-roll jobs — **not blocking CLOSE**.

**Reviewed by FE: N/A**

---

## BE checklist

Concrete consumers: **B-roll orchestrator** · US-8.4 poller · **`estimateVideoJobCost()`** / policy estimates · future US-9.1 Phase B assembly input resolver.

### Phase A — Wan adapter

- [ ] **`lib/contracts/siliconflow-wan21-turbo.ts`** — env key, API paths, model id, duration caps (3–5 / max 5), MIME allowlists, output hosts, fetch limits.
- [ ] **`lib/providers/video/siliconflow-wan21-turbo-adapter.ts`** — implement **`VideoProviderAdapter`** for **`siliconflow_wan21_turbo`** / **`broll`**.
- [ ] **`estimateCost`** — **21¢** × clipCount (default 1); from catalog / projection — not hardcoded 10¢ stub default.
- [ ] **`createJob`** — validate image + prompt + duration clamp; POST SiliconFlow Wan I2V; return opaque `externalJobId`.
- [ ] **`getJobStatus`** — poll vendor; **`normalizeVideoJobStatusResult`**; allowlisted `rawOutputUrl` only when terminal.
- [ ] **`fetchAsset`** — **`validateProviderOutputUrl`** → download → Storage → **`storedMediaAssetSchema`**; job context map for poller L1.
- [ ] **Registry** — replace **`createSiliconflowWan21TurboStubAdapter`** with **`createSiliconflowWan21TurboAdapter`**; bootstrap estimate **21**.
- [ ] **[SEC] `server-only`**; token never logged/returned; untrusted JSON sanitized; output URL allowlist; opaque **`external_job_id`**.
- [ ] **`lib/providers/video/siliconflow-wan21-turbo-adapter.test.ts`** — mocked HTTP round-trip; missing env; duration clamp; sanitized errors; estimate **21**.
- [ ] **Update registry / policy tests** — `getVideoAdapter("siliconflow_wan21_turbo")` is real; low + needsBroll still selects Wan.

### Phase B — B-roll orchestrator + degrade

- [ ] **`createBrollVideoJobs` (CONTRACT name)** — Operator-gated; resolves policy for `asset_role = broll`; creates N jobs.
- [ ] **Job INSERT** — `provider_key = siliconflow_wan21_turbo`, `provider_tier = low`, **`asset_role = broll`**, spend event per clip.
- [ ] **Budget** — `assertReelBudgetAllowsSpend` per clip; over-budget skips/fails **that** B-roll create without aborting primary.
- [ ] **Graceful degrade** — unit/integration tests: primary talking-head succeeds when B-roll create/poll fails.
- [ ] **Reject** client `provider_key` / tier / raw unbounded prompt fields.
- [ ] **Poller** — reuse US-8.4; ensure B-roll jobs are picked up (no primary-only filter in poller query).
- [ ] **Retry** — B-roll retry stays `asset_role = broll` + Wan; does not convert to primary / HeyGen.
- [ ] **Clip count** — from `brollBeats` with max cap; prompts server-derived per beat.
- [ ] **Reference image** — server-resolved still (CONTRACT: profile/cover/avatar still or script-linked asset — fail closed if missing).
- [ ] **Orchestrator tests** — needsBroll select · no needsBroll skip · N clips · budget block · degrade · non-operator 403.
- [ ] **Handoff note** — document US-9.1 Phase B as stitch consumer in CONTRACT / VALIDATION.

---

## DB checklist

All objects keep `neuramark_` prefix.

- [ ] **No activate migration** required (`siliconflow_wan21_turbo` already active).
- [ ] **No DDL** on `neuramark_video_jobs` unless CONTRACT finds a gap (`asset_role` already `primary` \| `broll`).
- [ ] Optional bootstrap metadata parity (`clipDurationSec: 5`, model string) — non-blocking.
- [ ] RLS deny-by-default unchanged; service-role Node only.
- [ ] No secrets in catalog rows — `env_key_name` only.

---

## Media / provider checklist

- [ ] SiliconFlow Wan HTTP only under `lib/providers/**` (except tests).
- [ ] **`videoAssetRole: "broll"`** on adapter — never `primary`.
- [ ] Download-and-own storage key shape **`neuramark/{clientId}/{reelScriptId}/{uuid}.mp4`**.
- [ ] Poller L1 job context map parity with SadTalker/MuseTalk/HeyGen.
- [ ] Duration clamp **≤ 5s** enforced server-side.
- [ ] Cost estimate uses catalog **21¢**/clip — fix any **10¢** stub leftover in registry wiring.

---

## Tests checklist

- [ ] Adapter mocked HTTP: create → poll → fetchAsset happy path.
- [ ] Missing `SILICONFLOW_API_KEY` → `PROVIDER_CONFIG_MISSING`.
- [ ] Estimate: 1 clip = **21¢**; 3 clips = **63¢** (orchestrator projection).
- [ ] Duration > 5s rejected or clamped (CONTRACT pick one — lean: **clamp**).
- [ ] Output host reject (SSRF).
- [ ] Policy: `provider_tier=low` + `needsBroll` → `siliconflow_wan21_turbo`.
- [ ] Policy: no `needsBroll` → no B-roll recommendation / no B-roll jobs.
- [ ] Degrade: primary job succeeds when B-roll adapter throws / status `failed`.
- [ ] Budget: B-roll blocked does not mark primary failed.
- [ ] Registry: no stub id prefix for `siliconflow_wan21_turbo`.
- [ ] Job rows persist **`asset_role = broll`**.

---

## Gates (orchestrator)

- [ ] SPEC-REVIEW.md (spec-guardian)
- [ ] SECURITY.md (security-architect)
- [ ] CONTRACT.md authored (nextjs-backend; **Reviewed by FE: N/A**)
- [ ] BUILD Phase A (media-pipeline-engineer + nextjs-backend)
- [ ] BUILD Phase B (BE orchestrator + degrade/budget)
- [ ] VALIDATION.md (requirements-validator) — note stitch → US-9.1 Phase B
- [ ] QA.md (qa-engineer)

**Status:** PREP. **Next:** SPEC-REVIEW → SECURITY → CONTRACT.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Exact SiliconFlow Wan I2V model id + async API shape?** **PO lean:** CONTRACT freezes against current SiliconFlow Wan2.1 I2V Turbo docs (async task + poll) — mirror CosyVoice2 host/auth style (`Authorization: Bearer`).
2. **Reference still source when faceless (no avatar)?** **PO lean:** server picks first available owned still (profile logo / cover / uploaded still); fail closed with clear `messageKey` if none — Operator may manual-upload primary (US-8.3) as alternate path.
3. **Prompt authorship?** **PO lean:** build from `brollBeats[i]` + script hook/body snippets server-side; never accept client free-text as sole prompt without server wrap/delimiter (injection floor).
4. **Max clips per Reel?** **PO lean:** **8** (script `brollBeats` max) — CONTRACT may lower for cost (e.g. 3) if budget stories prefer.
5. **Clamp vs reject duration > 5s?** **PO lean:** **clamp** to 5s (log/metadata note).
6. **Should Phase B extend Operator job list to show `broll`?** **PO lean:** **no** for CLOSE — defer with preview strip; poller must still process B-roll rows.
7. **Partial CLOSE after Phase A?** **PO lean:** **no** — keep AC unchecked until Phase B VALIDATION (degrade + default create are core AC).
8. **US-9.1 stitch in same PR?** **PO lean:** **no** — handoff only; open US-9.1 Phase B after Wan clips exist.

No SPEC amendment assumed in PREP: SPEC §3 requires swappable video adapters with download-and-own; Wan is the documented low-tier B-roll provider.
