# US-6.1 — Generate Instagram caption per Reel

**Status:** CLOSED — VALIDATE PASS WITH NOTES; QA APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 1 Low; CLOSE yes). Build agents `c385372` · BE `1f45244` · FE `d075781`.

**As a** System, **I want** captions, hashtags, and local keywords for each script, **so that** posts are ready for review alongside video.

Ship **Caption Agent V1 (Operator-triggered)**: Operator triggers **Generate captions** for an **approved** Estrategia semanal (batch all generated scripts) or **Regenerate caption** for a single Reel script; server job composes inputs from approved strategy slot context, persisted **`neuramark_reel_scripts`** package, and **`getBusinessProfileForAgents`** (zone/tone/services); LLM via **`resolveProvider({ assetRole: 'llm', llmVariant: 'default' })`** → DeepSeek (US-X.4 catalog); output is schema-validated (caption, hashtags, keywords, **`cta_variants`**) and persisted in **`neuramark_reel_captions`**. Operator views captions on **`/operator/scripts`** via **Script · Caption** tabs in the expand/detail panel — char counter, hashtag chips, keyword chips; **CTA variant selection** stays **US-6.2**. **Weekly cycle automation, Cliente approval preview, and cost policy pre-check** stay **out**.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-6.1 (checked on CLOSE).

**This folder:** [`plan/stories/US-6.1/`](./) — `README.md` · `TASKS.md` · `SPEC-REVIEW.md` · `SECURITY.md` · `CONTRACT.md` · `VALIDATION.md` · `QA.md`.

**Branch:** `feature/US-6.1-reel-captions`

**Depends on:** [US-5.1](../US-5.1/) ✅ `neuramark_reel_scripts` · `/operator/scripts` · `getReelScriptsForWeek` · [US-5.2](../US-5.2/) ✅ readability on script tab · [US-4.2](../US-4.2/) ✅ approved strategy gate · [US-X.4](../US-X.4/) ✅ `resolveProvider` + `llmVariant: 'default'` → DeepSeek · [US-14.5](../US-14.5/) ✅ `requireOperator()`.

**Unblocks:** [US-6.2](../../USER_STORIES.md) (CTA variant selection + `selected_cta_index`) · [US-10.1](../../USER_STORIES.md) (QA reads caption) · [US-11.1](../../USER_STORIES.md) (Cliente approval package).

---

## Close verdicts

| Gate | Verdict |
|------|---------|
| SPEC-REVIEW | GAPS resolved in CONTRACT |
| SECURITY | APPROVE WITH CONDITIONS |
| CONTRACT | Frozen 2026-08-30; Reviewed by FE (BUILD `d075781`) |
| BUILD | agents `c385372` · BE `1f45244` · FE `d075781` |
| VALIDATION | PASS WITH NOTES (`2cebd89`) |
| QA | APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 1 Low; CLOSE yes) |

**QA handoff (non-blocking, post-CLOSE):** M1 — rate limit fail-open on DB query errors (inherited US-4.1/US-5.1 pattern); M2 — non-atomic in-flight guard TOCTOU (inherited pattern); L1 — add `RATE_LIMITED` / `provider_key` smuggle tests. **Next:** **US-6.2** CTA variants for caption testing.

---

## Scope in

| Area | What US-6.1 adds |
|------|------------------|
| **FE** | Extend **`/operator/scripts`** detail panel: **TabView** **Script · Caption** (expand row — no new Operator nav item). **Caption tab:** plain-text caption block + Instagram char counter; hashtag chips (within max); local keyword chips; read-only **CTA variant** lines (no radio/select — US-6.2); **Generate captions** (batch) + **Regenerate caption** per row; pending/generated caption status badge; copy-to-clipboard; EN/ES (`scripts.caption.*`). |
| **BE** | Operator-gated Server Actions: batch generate all scripts for week; single-script regenerate; extend **`getReelScriptsForWeek`** list DTO with nullable **`caption`** summary; server-only Caption agent in `lib/agents/content/`; Zod caption record schema; persist **`neuramark_reel_captions`**; **[SEC]** `requireOperator`; approved strategy + script-exists gate; schema + length bounds before UPSERT; rate limit; plain-text storage only. |
| **DB** | **`neuramark_reel_captions`** — `reel_script_id` FK (UNIQUE), denormalized `client_id`, `caption` text, `hashtags` jsonb, `keywords` jsonb, `cta_variants` jsonb, audit timestamps; RLS deny-by-default. **No** `selected_cta_index` (US-6.2). |
| **content-agents-engineer** | Caption agent prompt + I/O contract (`lib/contracts/reel-caption.ts`); inputs = strategy slot + script package + profile zone/tone; LLM **`llmVariant: 'default'`**; delimited untrusted blocks; reject malformed output before persist; emit ≥2 **`cta_variants`** strings for US-6.2 handoff. |

## Scope out

| Story / topic | Why out |
|---------------|---------|
| **US-6.2** CTA variant **selection** UI + `selected_cta_index` | Separate story; US-6.1 **generates and stores** variants read-only. |
| **US-7.1** pre-generation budget block | Use catalog tier + resolve only; no pre-job cost gate yet. |
| **Weekly cycle auto-caption** | integrations-engineer (ADR-0001) — manual Operator trigger only in 6.1. |
| **Cliente caption read / Approval package** | Operator-only V1; Cliente sees caption in US-11.x. |
| **Operator inline caption edit** | Generated output read-only; regenerate replaces row. |
| **Instagram publish** | US-12.x / publish module. |
| **Video / assembly / QA jobs** | US-8.x / US-9.x / US-10.x. |
| **HTML / markdown in captions** | Plain text only per AC `[SEC]`. |
| **New top-level route** | Extend `/operator/scripts` only (tab in detail panel). |

## Canonical terms (CONTEXT)

Use **Paquete de guion**, **caption de Instagram**, **hashtags**, **keywords locales**, **Operator**, **Ficha viva**, **zona de servicio**.  
_Evitar:_ generic "post copy", "social caption linter", multichannel post text.

## What prior stories already shipped (do not duplicate)

| Source | Continuity |
|--------|------------|
| US-5.1 | `/operator/scripts` · `ScriptsPageView` · `getReelScriptsForWeek` · `generateReelScripts` / `regenerateReelScriptSlot` · `neuramark_reel_scripts` · approval gate · rate-limit pattern · `lib/reel-scripts/` orchestration. |
| US-5.2 | Script tab readability warnings — **Caption tab is separate**; do not mix char limits. |
| US-4.2 | `getApprovedStrategyForWeek` · approved-only downstream jobs. |
| US-4.1 / US-2.3 | `getBusinessProfileForAgents` → **`zone.description`** for local/geo keywords AC. |
| US-X.4 | `resolveProvider(..., { assetRole: 'llm', llmVariant: 'default' })` → **`siliconflow_deepseek`** (caption/strategy/QA row); scripts use `'fallback'` → Qwen — **do not reuse script variant for captions**. |
| DESIGN_PROMPTS §6 | Master-detail with **Script · Caption · Production** tabs — US-6.1 ships **Script + Caption** only; Production deferred. |

**US-6.1 adds Caption agent job + `neuramark_reel_captions` persistence + Caption tab UI** — no CTA selection, no publish, no Cliente view.

## PO decisions frozen (2026-08-30)

1. **Trigger (Operator path):** **`generateReelCaptions({ weekStart })`** (batch) and **`regenerateReelCaption({ weekStart, slotIndex })`** (single) — mirror US-5.1 script actions. Both require **approved** strategy for `(clientId, weekStart)` via `getApprovedStrategyForWeek` + defense-in-depth strategy row load. Reject **`STRATEGY_NOT_APPROVED`** when missing/draft.
2. **Script prerequisite:** Caption generation **only for slots with persisted script** (`neuramark_reel_scripts` row). Pending/missing script → skip in batch with per-slot summary or **`SCRIPT_NOT_FOUND`** on single regenerate — CONTRACT freezes error shape.
3. **Dual-path (system/cron):** ADR-0001 auto-caption path **deferred** to integrations-engineer; US-6.1 BUILD = **Operator manual trigger only**. CONTRACT documents future `invokedBy: 'system'` seam without cron wiring.
4. **Table:** **`neuramark_reel_captions`** with `id` (uuid PK), **`reel_script_id`** FK → `neuramark_reel_scripts(id)` ON DELETE RESTRICT, **`client_id`** FK (denormalized), `caption` (text), `hashtags` (jsonb string[]), `keywords` (jsonb string[]), **`cta_variants`** (jsonb string[]), `created_at`, `updated_at`. **UNIQUE `(reel_script_id)`** — one caption record per script.
5. **Persistence:** **UPSERT** on generate/regenerate (replace caption row for same `reel_script_id`). Batch loops all **generated** scripts for approved strategy week.
6. **Instagram length limits (V1):**
   - **`caption`:** max **2200** characters (Instagram hard limit); trim; reject empty; **plain text** — no HTML/markdown; Zod + optional DB CHECK.
   - **`hashtags`:** array of strings, each **1–100** chars, must start with `#` or CONTRACT normalizes server-side; **`maxHashtags` = 15** (configured max per AC); hard reject **> 30** (IG platform ceiling).
   - **`keywords`:** array of strings, each **1–80** chars; **`maxKeywords` = 10**; include **local/geo terms derived from `profile.zone.description`** when zone present (AC); empty array OK when zone absent.
   - **`cta_variants`:** array of plain-text strings, each **1–200** chars; **min 2, max 4** variants per generation (prepares US-6.2 AC); stored but **not selectable** in US-6.1 UI.
7. **LLM routing:** **`resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'default' })`** — **PO lean: default variant (DeepSeek)**, same as Content Strategy agent — **not** script `'fallback'` (Qwen). AC: catalog row at resolved `provider_tier`.
8. **Agent inputs (trusted helpers only):** Approved strategy brief slot (tema, goal, angle, `ctaHint`, formato, modalidad, optional táctica); full **`ReelScriptPackage`** from script row; **`getBusinessProfileForAgents(clientId)`** (zone, tone, services, locale); optional slot **`ctaHint`** from strategy — **never** accept caption/hashtag text from client body.
9. **Locale:** Match Cliente `preferredLocale` on profile when present, else `es` (carry-forward US-4.1 / US-5.1).
10. **Operator UI surface:** Extend **`/operator/scripts`** — **PrimeReact `TabView`** in existing expand/detail panel: **Script** (current US-5.1 + US-5.2) · **Caption** (new). **PO lean: tab in expand row**, not a separate sub-route.
11. **List DTO:** Extend **`reelScriptListItemSchema`** with **`caption: ReelCaptionSummary | null`** — present when caption row exists; includes `status: 'pending' | 'generated'`, char counts, hashtag count, `hasKeywords`, variant count; full caption payload loaded in tab from same list read (PO lean: no second round-trip unless CONTRACT splits for payload size).
12. **Auth:** `requireOperator("handler")` on generate actions; `requireOperator("page" | "handler")` on reads. V1 session `clientId` only — no body `clientId`.
13. **Rate limit:** Reuse **`neuramark_agent_rate_limits`** with new **`agent_key: 'caption_generate'`** (or CONTRACT name); per-`client_id` window — **PO lean:** mirror script pattern (shared window constants or parallel 60s / in-flight guard); batch + single-slot scopes analogous to US-5.1.
14. **Schema validation:** Zod **`.strict()`** on agent JSON output **before** UPSERT; strip/ reject HTML; normalize hashtags; malformed → **`CAPTION_OUTPUT_INVALID`**, no partial persist for that slot.
15. **Plain text rendering:** FE renders caption, hashtags, keywords, variants as **React text nodes / PrimeReact chips only** — no `dangerouslySetInnerHTML` (AC `[SEC]`).
16. **Idempotency:** Re-running batch **UPSERTs all eligible scripts**. Single regenerate UPSERTs one caption row only. Regenerating **script** (US-5.1) does **not** auto-invalidate caption — Operator may regenerate caption separately (PO lean: no cascade delete in 6.1; stale caption possible until Operator regens — document in UI copy).
17. **Empty profile:** Reject when `getBusinessProfileForAgents` returns `exists: false` (same as US-5.1).
18. **Implementers:** **content-agents-engineer** (agent + contract) + **nextjs-backend** (actions, persistence, rate limit) + **nextjs-frontend** (Caption tab).
19. **Module placement:** Agent: `lib/agents/content/generate-reel-caption.ts`. Contracts: `lib/contracts/reel-caption.ts`. Orchestration: **`lib/reel-captions/`** (mirror `lib/reel-scripts/`).
20. **Revalidate:** `revalidatePath("/operator/scripts")` after successful batch/single generate.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — 2026-08-30)
- [x] SECURITY.md (security-architect — 2026-08-29)
- [x] CONTRACT.md (nextjs-backend — 2026-08-30 frozen; **Reviewed by FE** before BUILD)
- [x] BUILD (content-agents-engineer + nextjs-backend + nextjs-frontend)
- [x] VALIDATION.md
- [x] QA.md — APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 1 Low; CLOSE yes)

**Status:** CLOSED (2026-08-30). All gates complete; AC checked in `plan/USER_STORIES.md`. **Next:** **US-6.2** CTA variants for caption testing.
