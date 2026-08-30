## Spec Review — US-6.1

### Verdict: GAPS

US-6.1 intent — **System** generates Instagram **caption**, **hashtags**, and **local/geo keywords** (and, per SPEC, **CTA variants**) for each **Paquete de guion** row on an **approved Estrategia semanal**, persists schema-validated plain-text records in `neuramark_reel_captions`, and surfaces them on the Operator **Caption** tab alongside the existing `/operator/scripts` workspace — is **directionally aligned** with SPEC §3 **Caption Agent** (S3.M7), SPEC §1 SC-1/SC-4 (Reels ready for review without Cliente writing copy), hard rules (no publish without **Aprobación**, no human recording), SPEC §5–§6 (`neuramark_*`, server-only LLM, multi-tenant `client_id`), TASKS.md Fase 3 Caption Agent, frozen upstream **US-5.1** handoff (`neuramark_reel_scripts`, `reel_script_id` FK, Operator scripts page + Caption tab seam in DESIGN_PROMPTS §6), and **US-X.4** provider catalog pattern.

**Gaps** sit between `plan/USER_STORIES.md` § US-6.1 acceptance criteria / owner table and what SPEC, TASKS.md, frozen **US-5.1 CONTRACT**, and **US-X.4 CONTRACT** require. Until USER_STORIES (or frozen CONTRACT) closes them, implementation risks a caption job that omits **CTA variant generation**, uses wrong LLM variant, lacks concrete Instagram bounds, skips the trusted helper pipeline, or blocks **ADR-0001 Ciclo semanal automatizado** with an Operator-only gate.

**Upstream dependencies satisfied or frozen:** US-5.1 ✅ (`neuramark_reel_scripts`, generate/regenerate orchestrator, `getReelScriptsForWeek`, `/operator/scripts`); US-4.2 ✅ (`getApprovedStrategyForWeek`, approved gate pattern); US-X.4 ✅ (`resolveProvider`, `llmVariant: "default"` → `siliconflow_deepseek_flash` for US-6.x); US-2.3 ✅ (`getBusinessProfileForAgents` incl. `fields.zone` for geo keywords); US-5.2 ✅ (script readability warnings — out of scope here).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **CTA variant generation missing from AC.** SPEC §3 Caption Agent: per guion generates caption + hashtags + keywords + **variantes CTA** in `neuramark_reel_captions`. TASKS.md: “≥2 variantes CTA.” USER_STORIES DB lists `cta_variants JSON` but AC never requires generating variants; US-6.2 owns selection UI + `selected_cta_index` only. | SPEC §3 Caption Agent (S3.M7); TASKS.md L85–87; US-6.2 AC “At least 2 CTA variants” | Add AC: agent output includes **`ctaVariants` array with ≥2 plain-text strings** per Reel; persisted to `cta_variants` jsonb; **`selected_cta_index` NULL** until US-6.2/US-11. Freeze Zod bounds (max length per variant, max count). |
| **High** | **Instagram length limits numerically undefined.** BE owner: “Instagram length limits.” AC [SEC]: “length-bounded” only. Hashtag AC: “within **configured max**” — no constant, env, or policy table. Industry default: caption ≤2200 chars; hashtags commonly capped (e.g. 30). None frozen in repo. | SPEC §3 Caption Agent “límites IG”; TASKS.md “límites IG”; DESIGN_PROMPTS §6 “char counter”, “hashtag chips (within max)” | Freeze shared constants in CONTRACT (e.g. `IG_CAPTION_MAX_CHARS`, `IG_HASHTAG_MAX_COUNT`, per-hashtag max length); Zod `.strict()` rejects over-limit **before** INSERT; FE char counter imports same module. |
| **High** | **Trusted helper pipeline + approval gate absent from AC.** SPEC: LLM vía catálogo/tier; post-guion job. US-5.1 SECURITY: caption FK/tenancy via script row; five-helper pattern precedent. USER_STORIES BE: “strategy + script + profile → caption record” — no AC for `getBusinessProfileForAgents(clientId)`, loading **approved** strategy + script rows, or **`resolveProvider({ assetRole: "llm", llmVariant: "default" })`**. | SPEC §3 Caption Agent; US-5.1 CONTRACT § Five-helper pipeline; US-X.4 CONTRACT § Agent → variant mapping (US-6.x → `'default'`) | Add AC: orchestrator **MUST** call profile helper, approved-strategy loader, script row(s) for `(strategy_id, slot_index)`, catalog + `resolveProvider` — **no** direct `neuramark_*` SELECT from agent module; verify `status = 'approved'` + `client_id` before LLM/UPSERT (Operator path). |
| **High** | **Dual-path invoke (ADR-0001) unresolved.** SPEC: “auto en ciclo”; TASKS: “Job post-guion.” USER_STORIES silent on cron/system orchestrator vs Operator Server Action. US-5.1 CONTRACT freezes `invokedBy: "operator" \| "system"` seam for scripts — caption should mirror post-script step in weekly cycle. | SPEC §3 Caption Agent “auto en ciclo”; ADR-0001; US-5.1 CONTRACT § Dual invoke path | CONTRACT: **`generateReelCaptionsForClient({ invokedBy })`** server-only orchestrator; Operator actions gated `requireOperator("handler")`; system path documented for integrations-engineer (no HTTP in US-6.1 BUILD); approval gate for system path deferred like US-5.1. |
| **Medium** | **DB table name + tenancy columns.** USER_STORIES DB: `reel_captions` without `neuramark_` prefix; columns omit `client_id`, uniqueness rule. US-5.1 SECURITY: FK `reel_script_id`; tenancy inherit from script — denormalized `client_id` still required for index/RLS pattern. | SPEC §5–§6; AGENTS.md; US-5.1 CONTRACT migration pattern | Rename to **`neuramark_reel_captions`**; `reel_script_id` FK → `neuramark_reel_scripts.id`; denormalize **`client_id`** from script row; UNIQUE **`(reel_script_id)`** (one caption row per script); RLS deny-by-default. |
| **Medium** | **`llmVariant` not pinned in AC.** US-X.4 CONTRACT documents US-6.x Caption → **`llmVariant: 'default'`** → `siliconflow_deepseek_flash` (distinct from US-5.1 `'fallback'` / `siliconflow_qwen`). USER_STORIES references US-X.4 generically. | US-X.4 CONTRACT L125–129; SPEC §3 “LLM vía catálogo/tier” | CONTRACT: `resolveProvider(catalog, { assetRole: "llm", tier: policy.providerTier, llmVariant: "default" })` — no hardcoded vendor; keys via `envKeyName` only. |
| **Medium** | **Batch vs per-script trigger semantics unset.** AC: “Caption generated for each script in approved strategy.” US-5.1 generates scripts per slot; caption should run **after** script exists — one LLM call per `reel_script_id`. Unclear: Operator batch “Generate captions for week”, auto after script batch, regen single slot when script regens. | SPEC §3 “por cada guion”; US-5.1 CONTRACT regenerate slot UPSERT | CONTRACT: batch generate all scripts-without-caption for `(clientId, weekStart)`; single-slot regen when script row UPSERTed (or explicit `regenerateReelCaption`); idempotent UPSERT on `reel_script_id`; **no** caption without existing script row. |
| **Medium** | **Depends list incomplete.** Story lists US-5.1, US-4.2, US-X.4 only. Geo keywords AC requires **Ficha viva** zone → **US-2.3** implicit but not declared. Strategy slot context (tema, goal, CTA hint) may improve caption alignment → **US-4.1** brief via approved strategy row. | USER_STORIES § US-6.1 Depends; AC “profile has zone” | Add **US-2.3** (required) to Depends; document approved brief slot metadata as orchestrator input (trusted server copy, not request body). |
| **Medium** | **US-6.1 vs US-6.2 FE scope overlap.** DESIGN_PROMPTS §6 puts CTA radio-cards on Caption tab for US-6.1–6.2. USER_STORIES US-6.1 FE: tab + chips + char count only; US-6.2 FE: CTA select + preview. Without split, US-6.1 may ship incomplete tab or US-6.2 may duplicate generation UI. | DESIGN_PROMPTS §6; USER_STORIES US-6.1 / US-6.2 | CONTRACT: US-6.1 FE = **read-only** caption/hashtags/keywords/**ctaVariants list** + char/hashtag counters; US-6.2 adds **selection** + preview + `selected_cta_index` persistence. |
| **Low** | **Geo keywords when zone absent.** AC: “Includes local/geo keywords **when profile has zone**.” Correct conditional; CONTRACT should define empty `keywords[]` when `fields.zone` missing/empty — not a failure. | USER_STORIES AC; US-2.3 `fields.zone` | CONTRACT: `keywords` jsonb `string[]` — omit geo injection when no zone; agent may still emit service keywords from Ficha viva. |
| **Low** | **Cliente caption view deferred.** SPEC §3: “Cliente/Operator: ver en Aprobación.” US-6.1 FE = Operator scripts workspace; Cliente package → US-11.x. | SPEC §3 Caption Agent; US-5.1 out-of-scope Cliente read | US-6.1 BUILD = Operator `/operator/scripts` Caption tab; reuse DTO when US-11 **Aprobación** shows caption/hashtags. |
| **Low** | **Plain text [SEC] — aligned.** Schema-validated, length-bounded, never HTML in storage or render. | USER_STORIES [SEC]; SPEC §3 plain text | CONTRACT: Zod `.strict()` on agent output; React text nodes / `white-space: pre-wrap` — no `dangerouslySetInnerHTML`. |
| **Info** | **Playbook/Trend hints not required for captions.** Unlike Video Script, SPEC Caption Agent inputs are guion-centric (hook/body/CTA + profile zone/tone). Strategy slot metadata sufficient; no mandate for `getPlaybookForAgents()` in Caption module unless PO wants formato-aware hashtag tone. | SPEC §3 Caption vs Video Script | Do not conflate Playbook/Trend consumption with Script agent; optional lean: pass slot `tema` / `goal` from approved brief. |
| **Info** | **ADRs respected.** Caption LLM job on Vercel app layer — no Fly worker (ADR-0003), no IG publish (ADR-0002). Cron invokes server-only orchestrator (ADR-0001) once dual-path gate frozen. | ADR-0001–0003 | Do not add Graph publish, FFmpeg, or public cron HTTP in US-6.1. |
| **Info** | **Out of scope held:** `selected_cta_index` persistence (US-6.2), Cliente Aprobación package (US-11), cost pre-check (US-7.1), video/TTS/assembly (US-8.x/US-9.x), QA agent (US-10.x), publish, multicanal, Stories, ads, RBAC UI, Operator free-text caption edit (regenerate only). | SPEC §1; US-5.1 CONTRACT § Out of scope | US-6.1 = generate + store + Operator read; not selection/export/publish. |

---

### Helper contract alignment (closed upstream)

| Helper | Story | US-6.1 obligation |
|--------|-------|-------------------|
| `getBusinessProfileForAgents(clientId)` | US-2.3 ✅ | **Required.** Tone, locale, **`fields.zone`** for geo keywords; services/offerings context. Sole **Ficha viva** path. |
| `getApprovedStrategyForWeek({ clientId, weekStart })` | US-4.2 ✅ | **Required** for Operator batch gate — latest `approved` row; defense-in-depth `client_id` + `status` re-check. |
| Script rows (`neuramark_reel_scripts`) | US-5.1 ✅ | **Required input.** Load by `strategy_id` + `slot_index` or `reel_script_id`; caption agent consumes hook/body/cta/onScreenText (trusted delimited blocks). |
| Approved brief slot metadata | US-4.1 ✅ (via US-4.2) | **Recommended.** `tema`, `goal`, `ctaHint`, `angle` from trusted `brief` jsonb on strategy row. |
| `getProviderCatalog()` + `resolveProvider(..., llmVariant: "default")` | US-X.4 ✅ | **Required** for LLM → `siliconflow_deepseek_flash`. |
| `getPlaybookForAgents()` / `getTrendSnapshotForWeek()` | US-16.1 / US-16.2 ✅ | **Not required** for V1 caption unless PO amends SPEC — Script agent already consumed hints. |
| `requireOperator()` | US-14.5 ✅ | **Required** on Operator generate/regenerate/read Server Actions — not inside system orchestrator. |

---

### US-5.1 handoff alignment

| Upstream artifact | US-6.1 obligation |
|-------------------|-------------------|
| `neuramark_reel_scripts` row | One caption row per script via **`reel_script_id` FK**; inherit `client_id`, `strategy_id`, `slot_index` for queries |
| `generateReelScripts` / `regenerateReelScriptSlot` | Caption regen policy when script UPSERTed — CONTRACT defines auto-queue vs manual “Generate captions” |
| `getReelScriptsForWeek` | Extend read DTO or sibling loader to include caption presence + summary for Caption tab |
| `/operator/scripts` + DESIGN_PROMPTS §6 | Add **Caption** tab content (char counter, hashtag chips, keywords chips, CTA variant list) |
| US-5.1 out of scope | **`neuramark_reel_captions`** created only in US-6.1 — do not pre-create in US-5.1 migration |
| Dual invoke seam | Mirror `generateReelScriptsForClient` → `generateReelCaptionsForClient({ invokedBy })` |

---

### Terminology violations (CONTEXT)

| Location | Issue | Prefer |
|----------|-------|--------|
| DB `reel_captions` | Missing canonical prefix | **`neuramark_reel_captions`** |
| Story “for each script” | Acceptable EN; domain entity = **Paquete de guion** | ES product chrome: **Paquete de guion**; link caption to **Reel** slot |
| BE “strategy + script + profile” | Omits **Estrategia semanal** (approved), **Ficha viva**, Instagram **Reels** scope | “approved **Estrategia semanal** slot + **Paquete de guion** + **Ficha viva** → caption record” |
| “local/geo keywords” | Acceptable; profile field is **`zone`** in Ficha viva | AC may reference `fields.zone.description` (implementation) vs “zona” in ES UI |

No _Evitar_ role synonyms (admin, prestador, cron in UI, etc.) in US-6.1 story text.

---

### Blocking gaps (must close before CONTRACT freeze)

| # | Gap | Blocks |
|---|-----|--------|
| 1 | AC missing **≥2 CTA variant generation** + `cta_variants` schema bounds | SPEC §3 Caption Agent full output; US-6.2 dependency |
| 2 | Freeze **Instagram numeric limits** (`IG_CAPTION_MAX_CHARS`, `IG_HASHTAG_MAX_COUNT`, per-tag length) shared FE/BE | AC “configured max”; [SEC] length-bounded; DESIGN_PROMPTS counters |
| 3 | AC missing **trusted helper pipeline** + **`llmVariant: "default"`** + approved-strategy/script gate | US-X.4 mapping; US-5.1 security pattern; wrong model if `'fallback'` reused |
| 4 | **Dual-path invoke** (`invokedBy: "operator" \| "system"`) + post-guion batch semantics not defined | ADR-0001 auto-en-ciclo; TASKS “Job post-guion” |
| 5 | DB **`reel_captions`** → **`neuramark_reel_captions`** + **`client_id`** + UNIQUE `(reel_script_id)` + RLS | NFR / AGENTS.md prefix; multi-tenant readiness |

**Non-blocking (resolve in CONTRACT or story split):** US-6.1 vs US-6.2 FE boundary (read-only vs CTA select); optional brief slot metadata in prompt; caption regen trigger on script regen; rate limit `agent_key`; empty zone → empty geo keywords; Cliente Aprobación read reuse; i18n keys under `captions.*`.

---

### Recommended action

1. **Amend `plan/USER_STORIES.md` § US-6.1** (or document overrides in CONTRACT with PO signoff) to add the five blocking AC items above; add **US-2.3** to Depends.
2. Proceed to **SECURITY.md** then **CONTRACT.md** with frozen:
   - Table **`neuramark_reel_captions`** (`reel_script_id` FK UNIQUE, `client_id`, `caption`, `hashtags`, `keywords`, `cta_variants` jsonb; no `selected_cta_index` — US-6.2); RLS deny-by-default.
   - **`reelCaptionPackageSchema`** (Zod `.strict()`) with IG bounds + ≥2 `ctaVariants`.
   - **Orchestrator** `generateReelCaptionsForClient({ clientId, weekStart, invokedBy, mode })` + Operator Server Actions.
   - **Agent module** `lib/agents/content/generate-reel-caption.ts` — profile + script + optional brief slot; delimited untrusted blocks.
   - **LLM:** `resolveProvider({ assetRole: "llm", llmVariant: "default" })`.
   - **Constants module** for IG limits imported by FE Caption tab + BE validation.
   - Explicit out of scope: CTA **selection** persistence (US-6.2), Cliente Aprobación, publish, cost engine, video/QA, inline Operator caption edit.

Do not check off USER_STORIES acceptance criteria in this gate. Do not write application code.

---

### Spec alignment summary

| Checklist item | Status |
|----------------|--------|
| Vision SC-1..SC-4 | ✅ Captions ready for review; no publish/approval change |
| Roles (System generate, Operator read/regen, Cliente deferred) | ✅ Aligned; Cliente view → US-11 |
| Modalidades / playbook / trend | ✅ No change; caption guion-centric |
| Playbook vs Trend | ✅ Not conflated |
| ADR-0001/0002/0003 | ✅ No breach once dual-path documented |
| NFR i18n, server-only, `neuramark_`, multi-tenant | ⚠️ Gap on table prefix + `client_id` until CONTRACT |
| Out of scope v1 | ✅ Held (no Stories, multicanal, ads, RBAC UI) |
