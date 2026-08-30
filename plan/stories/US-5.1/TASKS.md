# US-5.1 — Generate Reel script package per slot

**Priority:** P0  
**Depends on:** US-4.2 ✅ · US-3.4 ✅ · US-X.4 ✅ · US-16.1 ✅ · US-16.2 ✅ · US-14.5 ✅ (`requireOperator()`)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-5.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **content-agents-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md` PLAN Fase 3). DB migration under BE. Agent module + script Zod contract owned by **content-agents-engineer**; Server Actions / persistence under BE.  
**Canonical terms:** **Paquete de guion** · **Estrategia semanal** · **Formato de Reel** · **Modalidad de producción** · **Táctica de tendencia** · **Operator**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-5.2** on-screen character/line warnings; voiceover word-count vs duration estimate UI.
- **US-6.x** `neuramark_reel_captions`, caption agent jobs.
- **US-7.1** pre-generation budget block; per-job cost logging for LLM calls.
- **integrations-engineer** weekly cycle auto-script after strategy (system `invokedBy` path — document only).
- **Cliente** script read route (Approval package is US-11.x).
- **Operator inline edit** of hook/body/CTA fields — regenerate only.
- **Extra DB columns** for B-roll beats, cold-open notes, `editing_hints` snapshot — prompt context only in V1.
- **Video / TTS / assembly** jobs (US-8.x / US-9.x).
- **DELETE** script rows or script version history UI.
- Multichannel fields — **Instagram Reels only**.

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_reel_scripts` table + UPSERT | **US-5.1** (this story) |
| Video Script agent job + script Zod schema | **US-5.1** (`content-agents-engineer`) |
| Operator batch + single-slot generate UI | **US-5.1** |
| `strategyHasScripts` real implementation | **US-5.1** (unblocks US-4.2 lock) |
| On-screen/VO validation warnings | **US-5.2** |
| Captions per script | **US-6.1** |
| Cost policy before generation | **US-7.1** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table name | **`neuramark_reel_scripts`** (logical `reel_scripts` in USER_STORIES = same with `neuramark_` prefix). |
| Core columns | `id` (uuid PK), `client_id` (FK `neuramark_clients`), `strategy_id` (FK `neuramark_content_strategies` ON DELETE RESTRICT), `slot_index` (integer 0–6), `hook`, `body`, `cta`, `on_screen_text`, `voiceover_text`, `target_duration_sec` (integer), `created_at`, `updated_at`. |
| Uniqueness | **UNIQUE `(strategy_id, slot_index)`** — one script package per Reel slot per strategy version. |
| Tenancy | `client_id` denormalized from strategy row on INSERT/UPSERT; all reads/writes scoped to session `clientId`. |
| Approval gate | **`getApprovedStrategyForWeek({ clientId, weekStart })`** must return row; action also accepts `strategyId` + re-validates `status === 'approved'` and `client_id` match. Draft or missing → **`STRATEGY_NOT_APPROVED`**. |
| Dual-path | **Operator manual only in BUILD.** System/cron script generation deferred; CONTRACT notes future `invokedBy: 'system'` without alternate gate in 5.1. |
| Batch generate | Server Action **`generateReelScripts({ weekStart })`** — loops all `brief.slots[]` on approved strategy; one LLM call per slot (PO lean) or batched CONTRACT choice; UPSERT each result. |
| Single-slot regenerate | Server Action **`regenerateReelScriptSlot({ weekStart, slotIndex })`** — same gates; one slot only; UPSERT one row. |
| Script field bounds (lean) | `hook` ≤ 300 chars; `body` ≤ 2000; `cta` ≤ 200; `on_screen_text` ≤ 500; `voiceover_text` ≤ 2000; all trimmed non-empty — CONTRACT may tune. |
| `target_duration_sec` | Integer **15–45** inclusive; Zod + optional DB CHECK. |
| Agent inputs | **`getApprovedStrategyForWeek`** brief slots; **`getBusinessProfileForAgents(clientId)`** (abort if incomplete); **`getPlaybookForAgents()`**; **`getTrendSnapshotForWeek(weekStart)`**; per slot resolve formato + optional táctica hints. |
| Disclosure | **`profile.visualModeSummary.mustDiscloseNotOwner`** injected server-side; optional **`buildGenericDisclosurePromptHint(mustDisclose, locale)`**; never from request or LLM JSON. |
| LLM provider | **`resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'fallback' })`** → `siliconflow_qwen` (US-X.4). |
| Locale | Match Cliente `preferredLocale` when present on profile, else `es` (carry-forward US-4.1). |
| `strategyHasScripts` | Replace stub: `EXISTS` query on `neuramark_reel_scripts` by `strategy_id`. Unit tests: mock + integration once table exists. |
| Lock-after-scripts | When scripts exist + `isStrategyLockAfterScriptsEnabled()` → US-4.2 `updateContentStrategyBrief` returns **`STRATEGY_LOCKED`** (already wired; 5.1 activates). |
| Operator route | **`/operator/scripts`** + `weekStart` query; under `(app)/operator` layout + `requireOperator("page")`. |
| Read surface | Server Action or RSC loader **`getReelScriptsForWeek({ weekStart })`** — list scripts joined to slot metadata from approved strategy (tema, day, goal, formato slug). |
| Generate trigger UX | **Generate scripts** primary when approved strategy exists and scripts missing or partial; **Regenerate** per row. Pending/disabled while job runs. |
| i18n | EN + ES for Operator UI chrome; script content may follow profile locale. |
| Module placement | Agent: `lib/agents/content/generate-reel-script.ts` (or CONTRACT path). Contracts: `lib/contracts/reel-script.ts`. Orchestration: `lib/reel-scripts/` (mirror `lib/content-strategy/`). |
| Prompt containment | Ficha + playbook + trend text in delimited untrusted blocks; validate LLM JSON against Zod before UPSERT; malformed → typed error, no partial persist for that slot. |
| Rate limit | Per `client_id` on batch generate — **PO lean:** 60s debounce or extend `neuramark_agent_rate_limits` with `agent_kind: 'reel_script'`; CONTRACT freezes. |
| Revalidate | `revalidatePath("/operator/scripts")` and optionally `/operator/strategy` after successful generate. |
| Error codes (lean) | `STRATEGY_NOT_APPROVED`, `SLOT_NOT_FOUND`, `SCRIPT_OUTPUT_INVALID`, `PROFILE_INCOMPLETE`, `RATE_LIMITED` — CONTRACT freezes. |

## Carry-forwards / reuse (do not reinvent)

- Approved strategy gate: `getApprovedStrategyForWeek` from `lib/content-strategy/load-approved-strategy-for-week.ts`.
- Lock helper: `strategyHasScripts`, `isStrategyLockAfterScriptsEnabled` from `lib/content-strategy/strategy-has-scripts.ts` — **implement query in US-5.1**.
- Agent helper imports: `getBusinessProfileForAgents`, `getPlaybookForAgents`, `getTrendSnapshotForWeek`, `getProviderCatalog`, `getDefaultCostPolicy`, `resolveProvider`, `createSiliconFlowLlmAdapter` — **existing modules only**.
- Disclosure: `buildGenericDisclosurePromptHint` from `lib/qa/build-generic-disclosure-prompt-hint.ts`.
- Operator gate: `requireOperator()` from `lib/auth/require-user.ts`.
- Week validation: `trendWeekStartSchema` from `lib/contracts/trend.ts`.
- Brief slot shape: `contentStrategySlotSchema` from `lib/contracts/content-strategy.ts`.
- Agent pattern: `generate-content-strategy-for-client.ts` + `generate-weekly-strategy.ts` — mirror structure for reel scripts.
- Migrations: `neuramark_` prefix; RLS deny-by-default; service-role Node only.
- PrimeReact for Operator layout; loading/skeleton during generate.
- `import "server-only"` on agent + helper modules; no Supabase in Client Components.

---

## FE checklist

Concrete BE consumers: `generateReelScripts` Server Action; `regenerateReelScriptSlot` Server Action; `getReelScriptsForWeek` loader/action.

- [x] **Operator Scripts page** at `/operator/scripts`: `week_start` picker (ISO Monday).
- [x] **Script list** for week: one row per slot (tema title, day, `target_duration_sec`, status badge generated/pending).
- [x] **Expand row / detail panel**: hook (highlighted), body, CTA, on-screen text, voiceover text.
- [x] **Copy-to-clipboard** per field (PrimeReact or native button + toast).
- [x] **Generate scripts** primary button when approved strategy exists; disabled while pending; surfaces `STRATEGY_NOT_APPROVED` / rate-limit errors.
- [x] **Regenerate this Reel** secondary action per row (single slot).
- [x] **Empty state** when no approved strategy ("Approve strategy first" + link to `/operator/strategy`).
- [x] **Empty state** when approved but no scripts yet ("Generate scripts to create packages").
- [x] **Loading / generating** state (skeleton + i18n pending copy).
- [x] **Error state** for agent failure / validation rejection (recoverable message).
- [x] **Link from Strategy page** when `status = approved` → navigate to scripts for same `weekStart`.
- [x] **EN + ES strings** in `messages/en.json` / `es.json`.
- [x] **No Supabase in Client Components**; no inline script editing; no char-count warnings (US-5.2).
- [x] **No Cliente** scripts route in this story.

---

## BE checklist

Concrete FE consumers: Operator Scripts page; US-4.2 `strategyHasScripts` lock; future US-6.1 via `reel_script_id`.

- [x] **Migration** `neuramark_reel_scripts` per PO table (CONTRACT freezes indexes, FK, CHECK on duration).
- [x] **Zod schemas** in `lib/contracts/reel-script.ts`: script package, agent output, generate/regenerate inputs, list view DTOs.
- [x] **`generateReelScripts({ weekStart })`** Server Action — `requireOperator("handler")`; approval gate; rate limit; delegates to orchestrator.
- [x] **`regenerateReelScriptSlot({ weekStart, slotIndex })`** Server Action — same gates; single slot.
- [x] **Orchestrator** `generate-reel-scripts-for-client.ts`: load approved strategy; five-helper pipeline; per-slot agent calls; atomic batch UPSERT.
- [x] **`loadApprovedStrategyForScriptJob({ strategyId, clientId })`** — approved + tenancy guard before LLM/UPSERT.
- [x] **Agent job** `generateReelScriptForSlot` (`lib/agents/content/`): slot context + hints; LLM `fallback` variant; parse + validate; tone/disclosure rules in prompt.
- [x] **`getReelScriptsForWeek({ weekStart })`** — list scripts for approved strategy; `requireOperator` at boundary.
- [x] **[SEC] Verify strategy `approved` + tenancy** before any LLM call or UPSERT.
- [x] **[SEC] `mustDiscloseNotOwner` from profile only** — never request body or LLM output.
- [x] **[SEC] Zod validate agent output** before persistence; duration 15–45; reject unknown keys.
- [x] **[SEC] Rate limit** on batch generate (CONTRACT window).
- [x] **[SEC] LLM keys** server env only; never log prompts with secrets.
- [x] **Implement `strategyHasScripts`** query — replace stub `return false`.
- [x] `revalidatePath` for `/operator/scripts` (and strategy if linked).
- [x] **Automated tests**: `lib/reel-scripts/reel-scripts.test.ts` — approval gate; single-slot regenerate; UPSERT idempotency; `strategyHasScripts`; disclosure not from client; mock LLM.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [x] Create **`neuramark_reel_scripts`** per CONTRACT.
- [x] FK `strategy_id` → `neuramark_content_strategies(id)` ON DELETE RESTRICT.
- [x] FK `client_id` → `neuramark_clients(id)`.
- [x] **UNIQUE** `(strategy_id, slot_index)`.
- [x] Index on `(client_id, strategy_id)` and/or `(strategy_id)` for `strategyHasScripts`.
- [x] CHECK `target_duration_sec BETWEEN 15 AND 45` (if CONTRACT adopts).
- [x] Text columns NOT NULL for script fields.
- [x] RLS: zero policies / deny-by-default (match Fase 1 pattern).
- [ ] **Do not** create `neuramark_reel_captions` (US-6.1).
- [ ] **Do not** add video/TTS job tables.

---

## content-agents-engineer checklist

Coordinates with BE on CONTRACT; owns agent logic and script schema.

- [ ] **`lib/contracts/reel-script.ts`** — script package + agent output schemas shared with BE/FE types.
- [ ] **Video Script agent module** under `lib/agents/content/` — prompt template with delimited untrusted data blocks (profile, playbook hints, trend hints).
- [ ] Wire **`getBusinessProfileForAgents(clientId)`** — abort if `exists: false` or missing `visualModeSummary`.
- [ ] Wire **`getPlaybookForAgents()`** — resolve `guion_hints`, `editing_hints`, `duracion_ideal_seg` per slot `formatoPlaybookSlug`.
- [ ] Wire **`getTrendSnapshotForWeek(weekStart)`** — resolve táctica entry when `tacticaTendenciaSlug` set.
- [ ] Wire **`mustDiscloseNotOwner`** + optional **`buildGenericDisclosurePromptHint`** in system prompt.
- [ ] Wire **`getProviderCatalog()`** + **`getDefaultCostPolicy()`** + **`resolveProvider(..., llmVariant: 'fallback')`**.
- [ ] Post-LLM: Zod parse; enforce duration bounds; adapt tone to profile; no false owner claims when `mustDiscloseNotOwner`.
- [ ] **[SEC] Prompt-injection containment** per `plan/SECURITY_BASELINE.md` — no store on validation failure.
- [ ] Unit tests: schema rejects invalid duration/empty fields; mock LLM returns valid package; disclosure prompt present when flag true.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — Video Script vs SPEC §3; Instagram-only; no US-5.2/6.x scope creep)
- [x] SECURITY.md (security-architect — approved gate; disclosure injection; schema validation; Operator-only)
- [x] CONTRACT.md authored (nextjs-backend) — frozen 2026-08-30; **Reviewed by FE** line required before BUILD
- [x] BUILD (content-agents-engineer + nextjs-backend + nextjs-frontend) — BE slice on `feature/US-5.1-reel-scripts`
- [x] VALIDATION.md
- [x] QA.md — APPROVE WITH NOTES (0 Critical, 0 High, 3 Medium, 3 Low; CLOSE yes)

**Status:** CLOSED (2026-08-30). All gates complete; AC checked in `plan/USER_STORIES.md`. **Next:** **US-5.2** preview script readability for vertical video.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **LLM calls per batch** — One call per slot (PO lean, mirrors strategy single-call-per-job clarity) vs single multi-slot JSON response? **PO lean:** one LLM call per slot; simpler validation and single-slot regenerate parity.
2. **Partial batch failure** — If slot 2 fails, persist slot 1? **PO lean:** per-slot transaction; return partial success envelope listing succeeded/failed slot indices; CONTRACT freezes.
3. **Batch on existing scripts** — Overwrite all via UPSERT? **PO lean:** yes; Operator expects refresh on **Generate scripts**; per-slot **Regenerate** for surgical redo.
4. **Read when multiple approved versions** — Scripts FK `strategy_id` to specific approved row used at generation time; list shows scripts for **`getApprovedStrategyForWeek`** current approved id only. **PO lean:** if new approved version supersedes, old scripts orphaned until regenerate — CONTRACT documents UX (warn "strategy version changed").
5. **Rate limit** — Share `neuramark_agent_rate_limits` table with new `agent_kind` or separate debounce? **PO lean:** extend existing table with `reel_script_batch` kind.
6. **Sync vs async** — Blocking Server Action with FE pending (carry-forward US-4.1)? **PO lean:** sync with `maxDuration` on batch action; CONTRACT confirms timeout for N slots.
7. **`on_screen_text` format** — Single string vs array of beats? **PO lean:** single string with newlines for beats; US-5.2 adds char validation.
8. **Nav label** — "Scripts" / "Guiones" in Operator nav? **PO lean:** EN "Scripts", ES "Guiones".

No SPEC amendment assumed in PREP: SPEC §3 Video Script Agent already defines inputs, `neuramark_reel_scripts` columns, disclosure, and catalog LLM routing. Spec-guardian confirms system auto-path and Cliente read are not pulled into 5.1 BUILD.
