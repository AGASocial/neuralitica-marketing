## Spec Review — US-7.2

### Verdict: GAPS

US-7.2 intent — the **System** selects the cheapest acceptable **active** catalog provider per **Job de generación** from **`provider_tier`** + **modalidad de producción** / **modo visual** + **asset role** (`llm` \| `tts` \| `talking_head` \| `broll`), logs each decision for later cost analysis, never accepts client-supplied `provider_key`, and surfaces a read-only recommendation to **Operator** — is **directionally aligned** with SPEC §3 **Cost Policy Engine** (S3.M8: “elige provider por economía/modo/asset role”), SPEC §3 **Video Provider Adapter** (low-tier default, HeyGen high/P1 not default), USER_STORIES Conventions **Provider tiers** (“cheap API first”; tier switch on `cost_policies` only), frozen **US-X.4** catalog + `resolveProvider()` + binding **[SEC]** floors, and frozen **US-7.1** handoff (“7.2 = full per-asset ranking + job decision logging; 7.1 passes visual/modalidad as projection hint only”).

**Gaps** sit between USER_STORIES § US-7.2 acceptance criteria / owner table and what must be frozen in **CONTRACT.md** before BUILD: per-job **decision log** persistence, explicit **cheapest-active** ranking semantics, a unified **policy-engine API** above `resolveProvider`, **modalidad** → asset-role routing (faceless → B-roll), multi-asset estimate integration with US-7.1 gate, Operator **rationale** DTO + FE surface, and removal of client-authoritative `providerKey` on job-creation boundaries. Story intent does not drift from SPEC; unresolved contract shape is the blocker.

**Upstream dependencies satisfied or frozen:** **US-X.4** ✅ (`neuramark_provider_catalog` + seed matrix; `getProviderCatalog()`; `resolveProvider()` with `llmVariant`, MuseTalk loop preference, manual exclusion; high-tier inactive rows). **US-7.1** ✅ (`getCostPolicyForClient`, `assertReelBudgetAllowsSpend`, `neuramark_reel_spend_events` with `provider_key`, `estimateLlmJobCost` + LLM-only gate; explicit 7.2 out-of-scope table). **US-3.1** ✅ (per-slot **modalidad de producción** + profile **modo visual** inputs). **US-5.1** ✅ (`reel_script_id` lineage, b-roll beats on script package).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Per-job decision log schema undefined.** AC: “Decision logged per job (tier, asset role, provider_key, estimate) for later cost analysis.” `neuramark_reel_spend_events` (US-7.1) records spend **after** successful LLM jobs only; no append-only store for **routing decisions** on blocked/skipped paths, video/TTS jobs, or rationale metadata. | USER_STORIES US-7.2 AC; SPEC §3 Cost Policy Engine; US-7.1 CONTRACT out-of-scope “7.2 job decision logging” | CONTRACT: add **`neuramark_provider_decisions`** (or extend spend ledger with `decision_type`) — `client_id`, `reel_script_id`, `asset_role`, `provider_tier`, `provider_key`, `estimated_cost_cents`, `rationale_key` / compact `metadata` jsonb, `job_kind`, `created_at`; service-role INSERT only; no Cliente read; never log full `cost_model` / `envKeyName`. |
| **High** | **“Cheapest active provider” not implemented.** `resolveProvider()` ends with `return resolvedCandidates[0]` after capability filters — no sort by `costModel.unitCostCents` (nor normalized compare across `billingUnit`). V1 seed has one active row per role+tier today, but AC requires explicit **ranking** and future multi-row tiers (e.g. two low `broll` rows). | USER_STORIES US-7.2 AC (“Cheapest **active** provider…”); Conventions “cheap API first”; US-X.4 CONTRACT | CONTRACT: after capability filter, **`sortCandidatesByEstimatedCost(candidates, estimateContext)`** — compare normalized cents for the job context (duration sec, clip count, token/char placeholders); pick minimum; tie-break frozen key order. Unit tests with synthetic multi-row catalog. |
| **High** | **No frozen policy-engine module.** US-7.1 ships `estimateLlmJobCost` only. AC requires engine for all asset roles + integration at job creation (US-8.x, US-9.3). `estimateVideoJobCost()` exists as a sketch in `provider-adapters.ts` but is not the canonical entry, and TTS/B-roll/faceless paths are unwired. | SPEC §3 S3.M8 + S3.M9; USER_STORIES US-7.2 BE row; US-7.1 CONTRACT L246–247 handoff | CONTRACT: freeze **`selectProviderForJob(input)`** (`import "server-only"`) — inputs: `clientId`, `reelScriptId`, `assetRole`, `jobKind`, `modalidad`, `visualMode`, `hasReferenceLoop?`, `targetDurationSec?`, `brollClipCount?`, `llmVariant?`; outputs: `providerKey`, `providerTier`, `estimatedCostCents`, `resolvedProviderLabel`, `rationaleKey`; loads policy via `getCostPolicyForClient` + catalog via `getProviderCatalog`; delegates ranking to extended `resolveProvider` or post-filter sort. **Replace** `estimateLlmJobCost` internals to call this helper. |
| **High** | **Modalidad → asset-role routing incomplete.** AC: faceless → Wan (**broll**); talking-head → SadTalker; generic + reference loop → MuseTalk. `ResolveProviderContext` includes `visualMode` and `needsBroll` but **`resolveProvider()` does not read them** — caller must map modalidad to `assetRole` before resolve. No frozen matrix in story folder. | USER_STORIES US-7.2 AC; SPEC §3 Avatar/Visual Mode + Cost Policy; US-7.1 CONTRACT projection hints | CONTRACT: frozen routing table — `modalidad === "faceless"` → `assetRole: "broll"` (never `talking_head`); `own_avatar` \| `generic_avatar` without loop → `talking_head` + `hasReferenceLoop: false`; `generic_avatar` + loop asset → `talking_head` + `hasReferenceLoop: true`; policy engine owns mapping; adapters (US-8.2/8.5/8.6) consume resolved key only. |
| **Medium** | **Operator FE “rationale (read-only)” unspecified.** AC assigns FE to show recommended provider + tier + rationale. US-7.1 shows `resolvedLlmProviderLabel` + `projectionHintKey` on budget preview only — no video/TTS recommendation, no `rationaleKey` i18n map, no job-detail surface for US-8.4 polling UI. | USER_STORIES US-7.2 FE row; US-7.1 `ReelBudgetPreview`; US-X.4 SECURITY minimal DTO | CONTRACT: **`OperatorProviderRecommendationDto`** allowlist — `resolvedProviderLabel`, `providerTier`, `assetRole`, `estimatedCostCents`, `rationaleKey` (enum → EN/ES); extend `/operator/scripts` preview and future `/operator/production` job rows; **no** `envKeyName`, full `cost_model`, or `capabilities` to browser. |
| **Medium** | **Client-authoritative `providerKey` still in contract code.** `createVideoJobInputSchema` requires `providerKey` from caller; US-7.2 [SEC] forbids client authority. US-X.4 / US-7.1 SECURITY flagged; not fixed in 7.1 BUILD. | USER_STORIES US-7.2 [SEC]; US-X.4 CONTRACT downstream floors; `lib/contracts/providers.ts` | CONTRACT (7.2 + US-8.1 coordination): HTTP/job-creation boundary schemas **omit** `providerKey`; internal type sets `providerKey` only after `selectProviderForJob`; forbidden-key lists on video/TTS create actions mirror US-7.1 script/caption pattern. |
| **Medium** | **Multi-asset budget gate still LLM-only.** US-7.1 gate + ledger wired for script/caption only; AC cumulative budget (7.1) expects retries + B-roll + TTS in cumulative sum. US-7.2 must supply estimates for video/TTS so `assertReelBudgetAllowsSpend` can gate US-8.x / US-9.3 — handoff documented but not implemented. | USER_STORIES US-7.1 AC cumulative; US-7.1 CONTRACT call sites US-8.2+; SPEC §3 pre-Job check | CONTRACT: list orchestrator call sites where **`selectProviderForJob` + `assertReelBudgetAllowsSpend`** run before vendor I/O; `recordReelSpendEvent` with `asset_role` `talking_head` \| `broll` \| `tts`; 7.2 ships estimates + decision log even if US-8.x adapters land same sprint. |
| **Medium** | **Duration- and clip-aware estimates unset.** High-tier HeyGen uses `per_second`; Wan uses `per_clip` with `metadata.clipDurationSec`. Policy engine AC implies estimates per job; no frozen inputs (`targetDurationSec`, `brollClipCount` from script beats / `duracion_ideal_seg`). | Conventions Provider tiers economics; US-X.4 seed `cost_model`; SPEC §3 Video Script duration | CONTRACT: freeze estimate inputs from **Paquete de guion** + playbook `duracion_ideal_seg` + count of `brollBeats`; adapter `estimateCost` called with server-derived duration/clip count — never client-supplied cost drivers. |
| **Low** | **High tier when catalog inactive.** AC: HeyGen / LTX when rows **active**. US-X.4 seeds `active = false`; US-7.1 fails closed `PROVIDER_UNAVAILABLE`. US-7.2 should return typed `PROVIDER_UNAVAILABLE` + Operator-safe `rationaleKey` — not silent fallback to low tier. | USER_STORIES US-7.2 AC; US-X.4 seed invariants; Conventions upgrade order | CONTRACT: **no tier downgrade** in policy engine; if `provider_tier = high` and no active row for role → fail closed; settings copy (7.1) already warns SQL activation path. |
| **Low** | **Manual zero-cost fallback semantics.** AC: “Manual upload always available.” US-X.4: `manual` excluded from auto `resolveProvider`; explicit `allowManualFallback` only. | USER_STORIES US-7.2 AC; US-X.4 CONTRACT `manual` row; US-8.3 | CONTRACT: policy engine **never** auto-selects `manual`; Operator upload path (US-8.3) uses `getCatalogRowByKey("manual")` + skips budget gate — document in 7.2 as explicit out-of-auto-routing. |
| **Low** | **Depends on adapter stories for E2E, not for routing unit tests.** AC names US-8.2/8.5/8.6/8.7 — adapters can lag if catalog + policy engine tests prove key selection. Sprint plan lists 7.2 before 8.5. | USER_STORIES Sprint 4–5 split; USER_STORIES US-7.2 AC | CONTRACT: BUILD acceptance = routing + estimate + decision log against catalog fixtures; E2E vendor calls remain US-8.x. No SPEC drift. |
| **Info** | **US-7.1 / US-7.2 boundary clear in frozen CONTRACT.** 7.1 = cap/tier settings, cumulative gate, LLM estimate stub, projection hints; 7.2 = ranking, multi-asset selection, decision logging. No duplicate-engine risk if 7.2 replaces `estimateLlmJobCost` internals only. | US-7.1 CONTRACT L22, L616; US-7.1 SPEC-REVIEW High gap (resolved) | Preserve split in US-7.2 CONTRACT; do not reintroduce full routing into settings CRUD. |
| **Info** | **Catalog data-driven activation.** AC satisfied by US-X.4 seed + SQL `active` toggle — no catalog CRUD in 7.2. | USER_STORIES US-7.2 AC; US-X.4 [SEC] | 7.2 reads catalog only via `getProviderCatalog()`; no write endpoints. |
| **Info** | **Cliente never picks tier or provider.** Conventions + SPEC §2 Operator-only tier; 7.2 FE is Operator read-only recommendation. | SPEC §3; CONTEXT **Política de costo**; USER_STORIES Conventions | No Cliente provider picker; cost fields remain Operator-gated (7.1 floor). |
| **Info** | **ADRs respected.** Provider selection on Vercel Next server layer before job enqueue; Fly worker executes jobs with server-assigned `provider_key` (ADR-0003); cron uses same policy path (ADR-0001); no publish/cost to Cliente (ADR-0002 N/A for 7.2). | ADR-0001–0003; SPEC §5 | Do not move selection authority to Client Components or worker config. |
| **Info** | **Out of scope held:** catalog CRUD (SQL-only), actual cost backfill (US-7.3), Reel cost rollup UI (US-7.4), vendor HTTP adapters (US-8.x), FFmpeg assembly (US-9.x), Cliente cost visibility, RBAC UI, Stories IG, multicanal, ads. | SPEC §1; USER_STORIES phase split | US-7.2 = policy engine + decision log + Operator recommendation DTO — not unit-economics reporting or adapter implementations. |

---

### Terminology violations (CONTEXT)

**None that block** in USER_STORIES § US-7.2 title/AC (uses “System”, asset roles as technical enums).

Product-facing EN/ES for US-7.2 FE + CONTRACT must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Política de costo** / **Nivel de proveedor** | cost policy (primary EN headline); tier picker for Cliente |
| **Modalidad de producción** / **B-roll / sin presencia** | faceless (product copy; enum OK in code) |
| **Avatar propio autorizado** / **Avatar genérico profesional** | own_avatar / generic_avatar (product copy) |
| **Job de generación** | generation job (user-facing EN) |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Paquete de guion** | script package |

Note: USER_STORIES Conventions uses English **Client** — story-folder CONTRACT should use **Cliente** per CONTEXT for product copy. Avoid “recommended vendor” marketing language; use neutral “proveedor seleccionado” / “selected provider” in Operator UI.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| `selectProviderForJob` + cheapest-active sort | **Yes — core AC** | Single server-only entry; all job creators call it before vendor I/O. |
| Decision log table + INSERT on every selection | **Yes — AC + US-7.3/7.4 analytics** | Distinct from spend ledger rows on LLM-only success today. |
| Modalidad → asset-role routing matrix | **Yes — AC routing paths** | Faceless must not resolve to SadTalker. |
| Strip client `providerKey` from job-creation schemas | **Yes — [SEC] AC** | Coordinate with US-8.1 CONTRACT; internal types server-derived only. |
| Operator minimal recommendation DTO | **Yes — US-X.4 SECURITY carry-forward** | No catalog secrets to browser; `rationaleKey` not raw capabilities json. |
| Multi-asset estimate hook for budget gate | **Yes — SPEC budget-before-generate** | Wire US-8.2+ / US-9.3 orchestrators in CONTRACT call-site table even if built same sprint. |
| Duration / b-roll clip estimate inputs | **No — if frozen in CONTRACT** | Required for meaningful `estimated_cost_cents` on video jobs. |
| High-tier inactive fail-closed | **No — if no silent downgrade** | Align with US-7.1 `PROVIDER_UNAVAILABLE`. |
| Manual auto-selection | **No — if explicit exclusion frozen** | US-8.3 path only. |

**SPEC blockers on intent:** none. **ADR breaches:** none identified.

---

### Recommended action

Proceed to **SECURITY.md** then **CONTRACT.md** with these **non-negotiable freezes**:

1. **`selectProviderForJob(...)`** — sole server path from policy + catalog → `providerKey` + `estimatedCostCents` + `rationaleKey`; `import "server-only"`; replaces `estimateLlmJobCost` internals.
2. **Cheapest-active ranking** after capability filters — normalized cost compare; never `candidates[0]` without sort when multiple actives share role+tier.
3. **Frozen modalidad / visual routing matrix** — faceless → `broll`; generic loop → MuseTalk via `hasReferenceLoop`; own/generic portrait → SadTalker when no loop.
4. **`neuramark_provider_decisions`** (or equivalent) — append-only decision log per job attempt; log tier, asset role, provider_key, estimate; no Cliente read.
5. **Job-creation schemas** — omit client-authoritative `providerKey` / `providerTier`; forbidden-key lists on video/TTS actions (US-8.1+).
6. **`OperatorProviderRecommendationDto`** + `rationaleKey` enum with EN/ES — extend Operator preview/production surfaces; no `envKeyName` or full `cost_model`.
7. **US-7.1 integration** — `assertReelBudgetAllowsSpend` calls `selectProviderForJob` for each gated asset role; `recordReelSpendEvent` + decision log on success path.
8. **Manual / high-tier rules** — manual never auto-selected; high tier never silently downgrades when inactive rows.
9. **Explicit out of scope** — catalog CRUD, adapter HTTP, actual cost (US-7.3), Cliente provider UI.

Do not check off USER_STORIES acceptance criteria in this gate.
