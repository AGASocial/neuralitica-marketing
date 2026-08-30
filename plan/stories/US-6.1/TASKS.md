# US-6.1 — Generate Instagram caption per Reel

**Priority:** P0  
**Depends on:** US-5.1 ✅ · US-5.2 ✅ · US-4.2 ✅ · US-X.4 ✅ · US-14.5 ✅  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-6.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **content-agents-engineer** + **nextjs-backend** + **nextjs-frontend** (`docs/development/AGENT-ROSTER.md`). DB migration under BE. Agent module + caption Zod contract owned by **content-agents-engineer**; Server Actions / persistence under BE.  
**Canonical terms:** **Paquete de guion** · **caption de Instagram** · **hashtags** · **keywords locales** · **Operator** · **zona de servicio**. Avoid CONTEXT _Evitar_ list in product-facing copy.

## Out of scope (do not implement here)

- **US-6.2** CTA variant **radio/select**, **`selected_cta_index`**, "Preview in context" append — US-6.1 stores variants **read-only**.
- **US-7.1** pre-generation budget block before caption LLM call.
- **integrations-engineer** weekly cycle auto-caption after scripts (`invokedBy: 'system'` — document only).
- **Cliente** caption read route (Approval package is US-11.x).
- **Operator inline edit** of caption/hashtags — regenerate only.
- **Instagram publish** (Graph API).
- **Video / TTS / assembly / QA** jobs (US-8.x / US-9.x / US-10.x).
- **HTML / markdown** rendering or storage in caption fields.
- **New Operator nav route** — extend `/operator/scripts` tab panel only.
- **Auto-delete caption** when script regenerated (document stale-caption UX; no cascade in V1).

## Scope split

| Concern | Owner |
|---------|--------|
| `neuramark_reel_captions` table + UPSERT | **US-6.1** (this story) |
| Caption agent job + caption Zod schema | **US-6.1** (`content-agents-engineer`) |
| Operator batch + single caption generate UI | **US-6.1** |
| Extend `getReelScriptsForWeek` with caption summary | **US-6.1** |
| CTA variant selection + approval export | **US-6.2** |
| Cost policy before generation | **US-7.1** |

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Table name | **`neuramark_reel_captions`** (logical `reel_captions` in USER_STORIES = same with `neuramark_` prefix). |
| Core columns | `id` (uuid PK), `reel_script_id` (FK UNIQUE), `client_id` (FK), `caption` (text), `hashtags` (jsonb), `keywords` (jsonb), `cta_variants` (jsonb), `created_at`, `updated_at`. |
| Uniqueness | **UNIQUE `(reel_script_id)`** — one caption per script package. |
| Tenancy | `client_id` denormalized from script row on INSERT/UPSERT; all reads/writes scoped to session `clientId`. |
| Approval gate | **`getApprovedStrategyForWeek({ clientId, weekStart })`** required; re-validate `status === 'approved'` + tenancy on strategy/script load. |
| Script gate | Target slot must have **`neuramark_reel_scripts`** row before caption LLM/UPSERT. |
| Batch generate | **`generateReelCaptions({ weekStart })`** — loops scripts for approved strategy week; one LLM call per script (PO lean); UPSERT each result. |
| Single regenerate | **`regenerateReelCaption({ weekStart, slotIndex })`** — same gates; one script only. |
| Caption max length | **2200** chars (Instagram); trimmed non-empty plain text. |
| Hashtag bounds | Each **1–100** chars; **`maxHashtags` = 15**; reject **> 30**; normalize leading `#` server-side if agent omits. |
| Keyword bounds | Each **1–80** chars; **`maxKeywords` = 10**; inject **`profile.zone.description`** context in prompt; persist geo/local terms when zone present (AC). |
| CTA variants (storage) | **Min 2, max 4** plain-text strings, each **1–200** chars; stored in `cta_variants`; **read-only** in FE (no selection). |
| Agent inputs | Approved strategy slot metadata + full script package + **`getBusinessProfileForAgents`**; optional playbook/trend hints PO lean **omit in V1** unless SECURITY requires — script + strategy + profile sufficient. |
| LLM provider | **`resolveProvider(catalog, { assetRole: 'llm', tier: policy.providerTier, llmVariant: 'default' })`** → DeepSeek — **not** script `'fallback'`. |
| Locale | Profile `preferredLocale` when present, else `es`. |
| Operator route | **`/operator/scripts`** — **TabView Script · Caption** in expand/detail panel (PO lean over sub-route). |
| List DTO | Extend **`reelScriptListItemSchema`** with nullable **`caption`** summary + full caption fields for tab render. |
| Rate limit | **`neuramark_agent_rate_limits`** with `agent_key: 'caption_generate'` (CONTRACT freezes exact key/window); per-`client_id`; in-flight guard for batch/slot. |
| Error codes (lean) | `STRATEGY_NOT_APPROVED`, `SCRIPT_NOT_FOUND`, `CAPTION_OUTPUT_INVALID`, `PROFILE_INCOMPLETE`, `RATE_LIMITED` — CONTRACT freezes. |
| Module placement | Agent: `lib/agents/content/generate-reel-caption.ts`; contracts: `lib/contracts/reel-caption.ts`; orchestration: `lib/reel-captions/`. |
| i18n | EN + ES under `scripts.caption.*`. |
| Plain text | Storage + FE render as text nodes only; no HTML (AC `[SEC]`). |

### Caption summary DTO sketch (CONTRACT freezes Zod)

```ts
// Lean sketch — CONTRACT owns exact names / strict()
type ReelCaptionRecord = {
  caption: string;
  hashtags: string[];
  keywords: string[];
  ctaVariants: string[]; // read-only in US-6.1 FE
  charCount: number;     // server-computed .length
  hashtagCount: number;
  maxCaptionChars: 2200;
  maxHashtags: 15;
};

type ReelCaptionSummary = {
  status: "pending" | "generated";
  record: ReelCaptionRecord | null;
};
```

## Carry-forwards / reuse (do not reinvent)

- Scripts page: `app/(app)/operator/scripts/page.tsx` · `components/scripts/ScriptsPageView.tsx`.
- Script actions pattern: `lib/reel-scripts/actions/generate-reel-scripts.ts` · `regenerate-reel-script-slot.ts`.
- Rate limit pattern: `lib/reel-scripts/check-script-generation-rate-limit.ts` · `neuramark_agent_rate_limits`.
- Approval load: `getApprovedStrategyForWeek` · `loadApprovedStrategyForScriptJob` (or caption-specific loader mirroring script job).
- Profile: `getBusinessProfileForAgents` → **`zone.description`** for local keywords AC.
- Provider: `getProviderCatalog` · `getDefaultCostPolicy` · `resolveProvider` · `createSiliconFlowLlmAdapter`.
- Strategy agent LLM pattern: `generate-weekly-strategy.ts` uses **`llmVariant: 'default'`** — mirror for caption.
- Operator gate: `requireOperator()` from `lib/auth/require-user.ts`.
- Week validation: `trendWeekStartSchema` from `lib/contracts/trend.ts`.
- PrimeReact: `TabView` / `TabPanel`, `Tag` chips, `Button`, `Message`, `Toast`.

---

## FE checklist

Concrete BE consumers: `generateReelCaptions` · `regenerateReelCaption` · extended `getReelScriptsForWeek` → `items[].caption`.

- [x] **TabView** in scripts detail panel: **Script** (existing) · **Caption** (new).
- [x] **Caption tab — pending:** show empty state + hint to generate scripts/captions first; disable regen when no script.
- [x] **Caption tab — generated:** plain-text caption with **char counter** (`charCount / 2200`); warn styling when over limit (should not happen post-validation).
- [x] **Hashtag chips** (`Tag` or chip list) within configured max; show count `hashtagCount / maxHashtags`.
- [x] **Keyword chips** for local/geo keywords when present.
- [x] **CTA variants** as read-only numbered lines or chips — **no radio/select** (US-6.2).
- [x] **Generate captions** primary button (batch) when approved strategy + scripts exist; disabled while pending/in-flight.
- [x] **Regenerate caption** secondary per row / in Caption tab for selected Reel.
- [x] **List row status** — optional badge: caption pending vs generated (CONTRACT shape).
- [x] **Copy-to-clipboard** for caption text (and optional "copy hashtags block").
- [x] **Error states** for `CAPTION_OUTPUT_INVALID`, rate limit, missing script.
- [x] **EN + ES strings** in `messages/en.json` / `es.json` (`scripts.caption.*`).
- [x] **No Supabase in Client Components**; render server DTO only; **plain text** — no `dangerouslySetInnerHTML`.
- [x] **No Cliente** caption route in this story.

---

## BE checklist

Concrete FE consumers: `/operator/scripts` Caption tab; batch + single generate buttons.

- [ ] **Migration** `neuramark_reel_captions` per PO table (CONTRACT freezes indexes, FK, CHECKs).
- [ ] **Zod schemas** in `lib/contracts/reel-caption.ts`: agent output, caption record, generate/regenerate inputs, list extension.
- [ ] **`generateReelCaptions({ weekStart })`** Server Action — `requireOperator("handler")`; approval gate; script-exists check; rate limit; orchestrator delegate.
- [ ] **`regenerateReelCaption({ weekStart, slotIndex })`** Server Action — same gates; single script.
- [ ] **Orchestrator** `generate-reel-captions-for-client.ts`: load approved strategy; resolve scripts; per-script agent calls; batch UPSERT.
- [ ] **`loadReelScriptForCaptionJob({ reelScriptId, clientId })`** — script exists + tenancy + approved strategy linkage.
- [ ] **Extend `getReelScriptsForWeek`** — join/load caption rows; attach `caption` summary on list items.
- [ ] **[SEC] Verify strategy `approved` + tenancy** before any LLM call or UPSERT.
- [ ] **[SEC] Zod validate agent output** before persistence; length bounds; plain text; reject unknown keys.
- [ ] **[SEC] Rate limit** on batch generate (`caption_generate` key).
- [ ] **[SEC] Forbidden fields** — no client-supplied caption/hashtag/keyword/variant text.
- [ ] **[SEC] LLM keys** server env only; delimited untrusted prompt blocks for profile/script text.
- [ ] `revalidatePath("/operator/scripts")` after success.
- [ ] **Automated tests**: `lib/reel-captions/reel-captions.test.ts` — approval gate; script missing; UPSERT idempotency; hashtag max; zone keywords prompt fixture; mock LLM; rate limit.

---

## DB checklist

All objects keep `neuramark_` prefix. Migrations via Supabase migrations only.

- [ ] Create **`neuramark_reel_captions`** per CONTRACT.
- [ ] FK **`reel_script_id`** → `neuramark_reel_scripts(id)` ON DELETE RESTRICT.
- [ ] FK **`client_id`** → `neuramark_clients(id)`.
- [ ] **UNIQUE** `(reel_script_id)`.
- [ ] Index on `(client_id)` and/or `(reel_script_id)` for list joins.
- [ ] JSONB columns: `hashtags`, `keywords`, `cta_variants` — arrays of strings.
- [ ] `caption` text NOT NULL on generated rows.
- [ ] RLS: zero policies / deny-by-default (match Fase 1 pattern).
- [ ] **Do not** add `selected_cta_index` (US-6.2).
- [ ] **Do not** add video/publish job tables.

---

## content-agents-engineer checklist

Coordinates with BE on CONTRACT; owns agent logic and caption schema.

- [ ] **`lib/contracts/reel-caption.ts`** — agent output + persisted record schemas shared with BE/FE.
- [ ] **Caption agent module** `lib/agents/content/generate-reel-caption.ts` — prompt with delimited untrusted blocks (profile zone/tone/services, script hook/body/cta/on-screen/VO, strategy slot tema/goal/angle/ctaHint).
- [ ] Wire **`getBusinessProfileForAgents(clientId)`** — zone for local keywords; abort if profile incomplete.
- [ ] Wire **`resolveProvider(..., llmVariant: 'default')`** + LLM adapter — **not** script fallback variant.
- [ ] Agent output: `caption`, `hashtags[]`, `keywords[]`, `ctaVariants[]` (min 2) — Zod strict before return.
- [ ] **Locale-aware** prompt (ES/EN) matching profile preference.
- [ ] **Instagram constraints** in system prompt: plain text, no HTML, hashtag count, caption length.
- [ ] **`generate-reel-caption.test.ts`** — schema reject; hashtag bounds; min 2 CTA variants; zone present → keywords non-empty expectation in prompt fixture.
- [ ] `import "server-only"` on agent module.

---

## Gates (orchestrator)

- [x] SPEC-REVIEW.md (spec-guardian — 2026-08-30 GAPS resolved in CONTRACT)
- [x] SECURITY.md (security-architect — 2026-08-29 APPROVE WITH CONDITIONS; reconciled in CONTRACT)
- [x] CONTRACT.md authored (nextjs-backend — 2026-08-30 frozen; **Reviewed by FE** required before BUILD)
- [ ] BUILD (content-agents-engineer + nextjs-backend + nextjs-frontend)
- [ ] VALIDATION.md
- [ ] QA.md

**Status:** CONTRACT (2026-08-30). Branch `feature/US-6.1-reel-captions`. **Next:** FE signoff → BUILD.

---

## Open questions (for SPEC / SECURITY / CONTRACT)

1. **Hashtag normalization** — Require `#` prefix in storage vs add server-side if missing? **PO lean:** normalize to `#` prefix on persist; display without double-hash.
2. **Batch partial failure** — Atomic all-or-nothing vs per-slot errors like US-5.1 batch? **PO lean:** per-slot error collection in batch response; successful slots persist (mirror script batch).
3. **Stale caption after script regen** — Show banner when script `updated_at` > caption `updated_at`? **PO lean:** optional FE warn badge; no auto-delete in 6.1.
4. **Playbook/trend hints in caption prompt** — **PO lean:** omit V1; strategy slot + script + profile sufficient; SECURITY may require delimited trend block if added later.
5. **Full caption in list DTO vs lazy load** — **PO lean:** include full caption record in `getReelScriptsForWeek` (≤3 Reels/week); CONTRACT may split if payload grows.
6. **Char counting** — JS `.length` UTF-16 vs grapheme? **PO lean:** `.length` for V1 (carry-forward US-5.2 documented limitation).

No SPEC amendment assumed in PREP: SPEC § Caption Agent already requires `neuramark_reel_captions`, IG limits, schema-validate, plain text, LLM via catalog/tier.
