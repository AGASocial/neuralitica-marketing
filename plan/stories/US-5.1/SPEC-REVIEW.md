## Spec Review — US-5.1

### Verdict: GAPS

US-5.1 intent — **System** generates one **Paquete de guion** per Reel slot from an **approved Estrategia semanal**, adapted to **Formato de Reel**, **Modalidad de producción (por slot)**, and optional **Táctica de tendencia**; persists schema-validated rows in `neuramark_reel_scripts`; supports **Operator** single-slot regenerate and script read UI; enforces server-side **`approved` + `client_id`** gate and **`must_disclose_not_owner`** from trusted profile — is **directionally aligned** with SPEC §3 **Video Script Agent** (S3.M6), SPEC §1 SC-1 (3 Reels/semana), hard rules (no human recording, no publish, no impersonación genérica), SPEC §5–§6 (`neuramark_*`, server-only LLM keys, multi-tenant `client_id`), TASKS.md Fase 3 Video Script Agent, frozen upstream helpers (US-2.3, US-3.4, US-4.1/4.2, US-16.1, US-16.2, US-X.4), and US-4.2 CONTRACT handoff (`getApprovedStrategyForWeek`, `strategyHasScripts` wiring).

**Gaps** sit between `plan/USER_STORIES.md` § US-5.1 acceptance criteria / owner table and what SPEC, TASKS.md, and frozen helper contracts require. Until USER_STORIES (or frozen CONTRACT) closes them, implementation risks a script job that omits Playbook/Trend hints, under-specifies the **Paquete de guion** payload (B-roll beats, cold open/rewind), mis-resolves **modalidad/disclosure per slot**, or blocks ADR-0001 **Ciclo semanal automatizado** with a single global `approved`-only gate.

**Upstream dependencies are satisfied or frozen:** `getBusinessProfileForAgents` (incl. `visualModeSummary.mustDiscloseNotOwner`), `getPlaybookForAgents`, `getTrendSnapshotForWeek`, `contentStrategyBriefSchema` + per-slot `formatoPlaybookSlug` / `modalidad` / `tacticaTendenciaSlug`, US-4.2 `getApprovedStrategyForWeek` + `approveContentStrategy`, US-X.4 `resolveProvider({ assetRole: "llm", llmVariant: "fallback" })` → `siliconflow_qwen`, `buildGenericDisclosurePromptHint` (US-3.4).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **Playbook + Trend hints missing from AC.** SPEC §3 Video Script: adapt guion to **Formato de Reel** and **Táctica de tendencia**; apply **`guion_hints` + `editing_hints`** from playbook/trend (e.g. cold open + rewind). TASKS.md Fase 3: “Aplicar `guion_hints` / `editing_hints` (cold open, rewind).” USER_STORIES BE: “strategy + profile + visual mode → `reel_scripts`” — no AC for `getPlaybookForAgents()` or `getTrendSnapshotForWeek(weekStart)` or hint application per slot. | SPEC §3 Video Script; §3 Content Playbook; §3 Trend Intelligence; TASKS.md L78–79; US-16.1/US-16.2 CONTRACT (sole agent read paths) | Add AC: per slot, resolve formato/táctica from **approved** strategy brief; load hints **only** via `getPlaybookForAgents()` + `getTrendSnapshotForWeek(weekStart)` — never direct table SELECT. Agent prompt must include formato `guionHints` / `editingHints` and táctica hints when `tacticaTendenciaSlug` set. |
| **High** | **Paquete de guion schema under-specified in AC/DB row.** SPEC requires hook, cuerpo, CTA, texto en pantalla, VO, **beats visuales B-roll**, **notas cold open/rewind** when `editing_hints` apply (~15–45s). USER_STORIES DB: `hook`, `body`, `cta`, `on_screen_text`, `voiceover_text`, `target_duration_sec` only — no B-roll beats or editing notes fields. | SPEC §3 Video Script (S3.M6); CONTEXT **Paquete de guion**; TASKS.md L78 | Freeze Zod `reelScriptPackageSchema` in CONTRACT: required hook/body/cta/onScreenText/voiceoverText/targetDurationSec; optional `brollVisualBeats[]`, `editingNotes` (cold open / rewind); jsonb or typed columns; bounds aligned to US-5.2 warning story. |
| **High** | **Per-slot Modalidad de producción vs global “visual mode”.** SPEC: script adapts to **modalidad de producción** assigned **per slot** in Estrategia semanal (within Cliente allowlist). USER_STORIES BE: “profile + **visual mode**” — conflates Preferencias allowlist with per-slot `modalidad` on `contentStrategyBriefSchema.slots[]`. US-3.4 SECURITY: per-slot disclosure must compose with allowlist when slot uses `generic_avatar`. | SPEC §3 Avatar/Visual + Video Script; US-4.1 CONTRACT § Per-slot brief; US-3.4 SECURITY § per-slot Modalidad follow-on | Add AC: each script job reads **`slot.modalidad`** from approved brief (trusted server copy); disclosure flag = `slot.modalidad === 'generic_avatar' && profile.visualModeSummary.mustDiscloseNotOwner` (server-derived); never accept modalidad or disclosure flags from request/LLM output. |
| **High** | **Dual-path approval gate (ADR-0001) unresolved in US-5.1 AC.** US-4.2 CONTRACT freezes: **(A) Operator/manual** script batch requires `status = 'approved'`; **(B) System/cron** auto-avance deferred to integrations-engineer (draft bypass or auto-approve). USER_STORIES AC: “approved strategy” only — no `invokedBy: "operator" \| "system"` split. SPEC §3 Content Strategy auto-avance + ADR-0001 require System path to continue without Operator approve. | SPEC §3 Content Strategy auto-avance; ADR-0001; US-4.2 CONTRACT § Dual-path approval gate | Freeze in CONTRACT: **Operator** `generateScriptsForStrategy` / batch → verify `approved` via `getApprovedStrategyForWeek` or explicit `strategyId` + row re-check; **System** orchestrator → separate gate documented (accept `draft` after valid strategy **or** call future auto-approve helper) — pick one with PO signoff; do not block ADR-0001 with global Operator-only gate. |
| **Medium** | **Mandatory helper pipeline absent from AC.** Same four-helper pattern as US-4.1: Ficha viva + Playbook + Trend + provider catalog. USER_STORIES AC mandates profile constraints and US-X.4 LLM only — not `getPlaybookForAgents` / `getTrendSnapshotForWeek`. | SPEC §3 Video Script inputs; US-4.1 CONTRACT § Agent inputs; helper file headers (`get-playbook-for-agents.ts`, `get-trend-snapshot-for-week.ts`) | Add AC: agent module **MUST** call `getBusinessProfileForAgents(clientId)`, `getPlaybookForAgents()`, `getTrendSnapshotForWeek(weekStart)`, `getProviderCatalog()` + `resolveProvider` — no direct `neuramark_*` SELECT from agent module. |
| **Medium** | **DB table name + tenancy columns.** USER_STORIES DB row: `reel_scripts` without `neuramark_` prefix; columns omit `client_id`, `strategy_id` FK semantics, uniqueness `(strategy_id, slot_index)`. | SPEC §5–§6; AGENTS.md; US-4.1 CONTRACT migration pattern | Rename to **`neuramark_reel_scripts`**; require `client_id`, `strategy_id` FK → `neuramark_content_strategies.id`, `slot_index`; UNIQUE `(strategy_id, slot_index)`; index `neuramark_reel_scripts_client_id_idx`. |
| **Medium** | **`strategyHasScripts` lock floor — US-4.2 handoff.** US-4.2 CONTRACT: stub returns `false` until US-5.1 table exists; then `EXISTS` on `strategy_id`; blocks brief UPDATE when scripts exist (default locked). US-5.1 must INSERT with `strategy_id` only after strategy is `approved` (Operator path) and wire real helper. | US-4.2 CONTRACT § `strategyHasScripts`; US-4.2 SECURITY § Lock-after-scripts | Add AC: migration creates table + implement `strategyHasScripts(strategyId)`; script batch verifies `approved` + `client_id` independently of US-4.2 approve path. |
| **Medium** | **LLM variant not pinned in AC.** US-X.4 CONTRACT maps US-5.1 → `llmVariant: 'fallback'` → `siliconflow_qwen`. USER_STORIES references US-X.4 generically (same as Strategy/Caption ambiguity). | US-X.4 CONTRACT § Agent → variant mapping; SPEC §3 “LLM vía catálogo/tier” | CONTRACT: `resolveProvider(catalog, { assetRole: "llm", tier: policy.providerTier, llmVariant: "fallback" })` — no hardcoded vendor; keys via `envKeyName` only. |
| **Medium** | **System auto-invoke after strategy missing.** SPEC: “auto en ciclo tras estrategia.” USER_STORIES silent on cron/orchestrator entry (`generateScriptsForClient({ invokedBy: "system" })`) vs Operator-only Server Action. | SPEC §3 Video Script; ADR-0001; US-4.1 `generateContentStrategyForClient` dual-path pattern | CONTRACT: server-only orchestrator callable from trusted cycle job without `requireOperator`; Operator UI action gated `requireOperator("handler")`. |
| **Low** | **Cliente script view vs Operator-only DESIGN_PROMPTS.** SPEC §3: “Operator/**Cliente**: ver guiones.” USER_STORIES FE: script list/expand (DESIGN_PROMPTS §6 Operator-only workspace). Cliente visibility may defer to US-11 Aprobación package. | SPEC §3 Video Script; DESIGN_PROMPTS.md §6 vs §9 | Explicit scope: US-5.1 FE = **Operator** scripts workspace; Cliente read via Aprobación (US-11) **or** add thin Cliente read AC — do not silently drop SPEC Cliente visibility. |
| **Low** | **`must_disclose_not_owner` injection detail.** [SEC] AC: “injected from server-side profile, never from request input” — correct direction. US-3.4: use `buildGenericDisclosurePromptHint(mustDiscloseNotOwner, locale)` when per-slot generic; profile flag alone is allowlist proxy until slot modalidad applied. | US-3.4 CONTRACT; US-3.4 SECURITY § Agents DTO injection | CONTRACT: trusted block outside delimiters; per-slot `mustDiscloseForSlot` server-computed; optional import `buildGenericDisclosurePromptHint`; LLM output must not set disclosure flags. |
| **Low** | **Regenerate single slot — idempotency.** AC: regenerate one slot without full week. CONTRACT must define UPSERT vs new row version, rate limit, and whether prior script row is superseded (`superseded_at` or delete forbidden). | USER_STORIES US-5.1 AC; SPEC §3 “Operator regenera un slot” | Freeze: regenerate replaces row for `(strategy_id, slot_index)` or INSERT new version with lineage — never DELETE approved downstream artifacts; idempotent batch skips existing unless `forceRegenerate`. |
| **Info** | **Approved strategy + tenancy [SEC] — aligned.** AC matches US-4.2 handoff and USER_STORIES [SEC]: verify `status = 'approved'` and `client_id` server-side before agent invoke. | USER_STORIES US-5.1 [SEC]; US-4.2 CONTRACT | CONTRACT: `STRATEGY_NOT_APPROVED`, IDOR-safe `strategyId` + `weekStart` match; no client-supplied `clientId` authority. |
| **Info** | **Schema validation before persist [SEC] — aligned.** Hook/body/CTA/on-screen/VO + duration bounds matches SPEC server-only agent pattern. | SPEC §3 Video Script; USER_STORIES [SEC] | CONTRACT: Zod `.strict()` on agent output; reject `AGENT_OUTPUT_INVALID`, no INSERT; plain text fields (no HTML). |
| **Info** | **Playbook vs Trend not conflated.** Script consumes formato slug from strategy slot + optional táctica slug — hints from respective helpers, not merged catalog. | SPEC §3 Playbook vs Trend; CONTEXT canon | Resolve `formatoPlaybookSlug` → playbook DTO; `tacticaTendenciaSlug` → trend entry DTO; empty trend OK. |
| **Info** | **ADRs respected.** Video Script LLM job on Vercel app layer — no Fly worker (ADR-0003), no IG publish (ADR-0002). Cron consumer invokes server-only orchestrator (ADR-0001) once dual-path gate is frozen. | ADR-0001–0003 | Do not add FFmpeg, publish path, or public cron HTTP in US-5.1 unless explicitly scoped. |
| **Info** | **Out of scope held:** Caption (US-6.x), on-screen/VO length warnings UI (US-5.2), cost policy pre-check (US-7.1), video jobs (US-8.x), assembly (US-9.x), QA agent (US-10.x), Cliente **Aprobación** (US-11.x), Cliente free-form guion edit (SPEC “Fuera V1”), multicanal, Stories, ads, RBAC UI. | SPEC §1; USER_STORIES phase split | US-5.1 = generate + store + Operator script read/regenerate; not caption/video/approval. |

---

### Helper contract alignment (closed upstream)

| Helper | Story | US-5.1 obligation |
|--------|-------|-------------------|
| `getBusinessProfileForAgents(clientId)` | US-2.3 ✅, US-3.4 ✅ | **Required.** Tone, locale, zone, `visualModeSummary` (allowlist + `mustDiscloseNotOwner`). Sole Ficha viva path. |
| `getPlaybookForAgents()` | US-16.1 ✅ | **Required.** Resolve each slot `formatoPlaybookSlug` → `guionHints`, `editingHints`, `estructura`, `duracionIdealSeg`, `ctaTipo`. |
| `getTrendSnapshotForWeek(weekStart)` | US-16.2 ✅ | **Required** when week has snapshot; safe `{ entries: [] }`. When slot has `tacticaTendenciaSlug`, apply táctica `guionHints` / `editingHints`. |
| `getApprovedStrategyForWeek({ clientId, weekStart })` | US-4.2 ✅ | **Required** for Operator batch gate — latest `approved` row; defense-in-depth re-check `status` + `client_id` on `strategyId`. |
| `getProviderCatalog()` + `resolveProvider(..., llmVariant: "fallback")` | US-X.4 ✅ | **Required** for LLM → `siliconflow_qwen`. |
| `buildGenericDisclosurePromptHint(mustDisclose, locale)` | US-3.4 ✅ | **Optional convenience** when slot `modalidad === 'generic_avatar'`; authority remains server-computed flags. |
| `strategyHasScripts(strategyId)` | US-4.2 stub → US-5.1 | **US-5.1 implements** real EXISTS check after migration; enables US-4.2 lock-after-scripts. |

---

### US-4.1 / US-4.2 handoff alignment

| Upstream artifact | US-5.1 obligation |
|-------------------|-------------------|
| `contentStrategyBriefSchema.slots[]` | One script row per slot; match `slotIndex`; read `tema`, `formatoPlaybookSlug`, `modalidad`, `tacticaTendenciaSlug`, `goal`, `ctaHint`, `angle` |
| `getApprovedStrategyForWeek` | Operator batch entry lookup; not `getLatestContentStrategy` alone (latest may be `draft`) |
| `approveContentStrategy` / `status = 'approved'` | Operator path gate — US-5.1 re-verifies server-side |
| `strategyHasScripts` stub | Replace with FK-backed EXISTS when `neuramark_reel_scripts` exists |
| Dual-path approval (US-4.2 CONTRACT) | US-5.1 CONTRACT must document System path — do not inherit Operator-only gate globally |
| INSERT-only strategy versioning | Scripts reference explicit `strategy_id`; regenerating strategy INSERTs new draft — scripts stay tied to approved `strategy_id` until supersede story |

---

### Terminology violations (CONTEXT)

**USER_STORIES § US-5.1** uses terms from the _Evitar_ list in product-facing or imprecise BE copy.

| Location | Issue | Prefer |
|----------|-------|--------|
| Story title / AC “script package” | CONTEXT _Evitar_ for **Paquete de guion** | **Paquete de guion** (ES) / “Reel script” (EN product chrome) |
| BE “visual mode” | CONTEXT _Evitar_: visual preferences as business entity; imprecise vs per-slot assignment | **Modalidad de producción (por slot)** from approved **Estrategia semanal** |
| DB `reel_scripts` | Missing canonical prefix | **`neuramark_reel_scripts`** |
| “profile + visual mode → reel_scripts” | Omits **Formato de Reel**, **Táctica de tendencia**, **Playbook de formatos** | “approved Estrategia semanal slot + Ficha viva + formato/táctica hints” |

Technical enums (`hook`, `voiceover_text`, `generic_avatar`, `faceless`, `strategy_id`) OK in code/DB per upstream CONTRACTs.

---

### Blocking gaps (must close before CONTRACT freeze)

| # | Gap | Blocks |
|---|-----|--------|
| 1 | AC missing **`getPlaybookForAgents()` + `getTrendSnapshotForWeek()`** and **`guion_hints` / `editing_hints` application** per slot | SPEC §3 Video Script; TASKS.md Fase 3 |
| 2 | AC/DB missing **B-roll visual beats + cold open/rewind editing notes** in **Paquete de guion** schema | SPEC §3 S3.M6 full output shape; US-9.x assembly downstream |
| 3 | AC conflates **global visual mode** vs **per-slot `modalidad`** + **per-slot disclosure** for `generic_avatar` | SPEC slot model; US-3.4 SECURITY |
| 4 | **Dual-path gate** (Operator `approved` vs System/cron auto-avance) not defined in US-5.1 | ADR-0001; US-4.2 CONTRACT reconciliation |
| 5 | DB **`reel_scripts`** → **`neuramark_reel_scripts`** + **`client_id`** + FK/uniqueness | NFR / AGENTS.md prefix; multi-tenant readiness |

**Non-blocking (resolve in CONTRACT or story split):** Operator vs Cliente script read surfaces; `buildGenericDisclosurePromptHint` import; single-slot regenerate idempotency/versioning; rate limit on regenerate; explicit `invokedBy` orchestrator signature; US-5.2 length warnings (separate story).

---

### Recommended action

1. **Amend `plan/USER_STORIES.md` § US-5.1** (or document overrides in CONTRACT with PO signoff) to add the five blocking AC items above.
2. Proceed to **SECURITY.md** then **CONTRACT.md** with frozen:
   - Table **`neuramark_reel_scripts`** (`client_id`, `strategy_id`, `slot_index`, script fields, timestamps); UNIQUE `(strategy_id, slot_index)`; RLS deny-by-default.
   - **`reelScriptPackageSchema`** (Zod `.strict()`) incl. optional `brollVisualBeats`, `editingNotes`; duration 15–45s bounds.
   - **Five-helper input pipeline** + per-slot formato/táctica resolution from approved brief.
   - **Dual invoke paths:** Operator Server Action (`requireOperator`, `approved` gate) vs internal cycle runner (`invokedBy: "system"` — gate per PO/integrations).
   - **Per-slot disclosure:** server-computed from `slot.modalidad` + profile; `buildGenericDisclosurePromptHint` optional; never from request/LLM.
   - **LLM:** `resolveProvider({ assetRole: "llm", llmVariant: "fallback" })`.
   - **`strategyHasScripts` implementation** + US-4.2 lock reference.
   - **Regenerate single slot** semantics (replace row vs version; no silent week-wide regen).
   - Explicit out of scope: captions, video, cost engine, QA, Cliente Aprobación UI, Cliente guion edit, publish, FFmpeg.

Do not check off USER_STORIES acceptance criteria in this gate. Do not write application code.
