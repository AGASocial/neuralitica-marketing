# Design

## Context

See proposal.md - Why for motivation.

Current state: System prompts in `lib/agents/content/generate-weekly-strategy.ts`, `lib/agents/content/generate-reel-script.ts`, and `lib/video-jobs/create-broll-video-jobs.ts` are hardcoded TypeScript strings. Playbook hints (`guionHints`, `editingHints`) inject soft creative guidance from the `neuramark_content_playbooks` and `neuramark_trend_snapshots` tables, but operators have no direct control over foundational creative direction (hooks, retention, pacing) that applies uniformly across all clients.

Operator settings already follow a pattern: `/operator/settings/cost-policy` page with forms, server actions, and service-role-only RLS tables (`neuramark_cost_policies`, `neuramark_automation_settings`).

## Goals / Non-Goals

**Goals:**
- Operator can edit one global master prompt and per-business overrides via a settings UI.
- Master prompts inject consistently into strategy, script, and B-roll generation after base system instructions and before untrusted user data.
- Empty prompts are no-ops—existing clients without prompts behave identically to today.
- Database schema supports nullable TEXT fields with reasonable length limits (4,000 chars).
- Default global prompt seeds on migration for immediate value.

**Non-Goals:**
- Client/owner prompt editing (operator-only).
- Prompt versioning or history (could be added later).
- Per-slot or per-formato prompt overrides (global + per-business only).
- Chat-based prompt editing (settings page only).
- Prompt validation beyond length and trimming (no content filtering; operator is trusted).

## Decisions

### Decision 1: Two tables vs. one table with nullable client_id
**Chosen**: Two tables (`neuramark_operator_prompts` for global singleton, `neuramark_business_prompts` per-client).

**Rationale**: Semantically clearer. Global singleton uses a unique constraint on a constant column `((1))` (existing pattern from `neuramark_cost_policies`). Per-business prompts are one row per client with `client_id` FK. Avoids confusion of "what does `client_id IS NULL` mean" in a single table.

**Alternative considered**: Single `neuramark_master_prompts` table with `client_id NULL` for global. Rejected because two concerns (global vs. per-business) are clearer as separate tables, and loaders can be simpler.

### Decision 2: Injection order
**Chosen**: Base system instructions → global master prompt → per-business master prompt → untrusted playbook/profile/trend blocks.

**Rationale**: Base instructions (schema, safety, format) must always run first to constrain the LLM. Master prompts then provide creative direction. Untrusted blocks (user-editable playbook, client profile) come last so they cannot override safety constraints. This order matches the existing pattern in `generate-weekly-strategy.ts` where trusted system instructions wrap untrusted blocks with frozen delimiters (`<UNTRUSTED_*>` tags).

**Alternative considered**: Injecting master prompts into the user message. Rejected because system messages are the proper place for steering instructions that apply to the entire generation, and user messages are for the specific task input (client context, slot brief).

### Decision 3: Max length 4,000 characters
**Chosen**: 4,000 character limit enforced by CHECK constraint and server action validation.

**Rationale**: Long enough for detailed creative instructions (multiple paragraphs), but short enough to avoid token budget bloat. Most LLMs handle ~3,000-4,000 chars as a reasonable system message section. If operators need longer, they can split guidance between global and per-business.

**Alternative considered**: No limit. Rejected because unbounded TEXT could lead to accidental token budget issues. 10,000 limit. Rejected as unnecessarily large; 4,000 is a sweet spot.

### Decision 4: Loader pattern
**Chosen**: New `lib/prompts/load-master-prompts.ts` with `loadMasterPrompts({ clientId })` returning `{ global: string | null, business: string | null }`. Called from generation entry points.

**Rationale**: Centralized loader keeps injection logic consistent. Returns nulls when prompts don't exist or are empty (trimmed to empty string). Generation code can check `if (prompts.global)` and skip injection if null.

**Alternative considered**: Loaders per generation type. Rejected as unnecessary duplication; all three generations (strategy, script, B-roll) need the same data.

### Decision 5: Default global prompt content
**Chosen**: Seed migration inserts a default focused on Instagram Reels best practices: retention hooks, pacing for 9:16 vertical, faceless/avatar modality awareness, CTA clarity.

**Rationale**: Immediate value on fresh installs. Operators can edit/clear it if they prefer different guidance.

**Alternative considered**: No default (empty). Rejected because operators would need to write prompts from scratch; a sensible default accelerates onboarding.

### Decision 6: UI placement
**Chosen**: New page `/operator/settings/master-prompts` with two textareas (global, per-business with client picker). Links from `/operator/layout.tsx` settings nav.

**Rationale**: Settings pages are the established pattern for operator-only config (cost policy, automation). Textareas support multiline copy naturally.

**Alternative considered**: Inline editing in the strategy/scripts pages. Rejected because prompt editing is configuration, not generation workflow; separating concerns keeps the UI cleaner.

## Risks / Trade-offs

**Risk**: Operators write prompts that conflict with base safety instructions or schema constraints (e.g., "ignore JSON schema").
**Mitigation**: Base instructions run first and use frozen delimiter wrapping for untrusted blocks. Master prompts are operator-written (trusted), but still placed before untrusted client data. Document best practices in the settings page help text: "Master prompts steer creative direction (tone, pacing, hooks). Do not override schema or safety instructions."

**Risk**: Very long master prompts increase LLM input token cost and latency.
**Mitigation**: 4,000 char limit. If operators hit the limit frequently, we can log warnings and revisit the limit.

**Risk**: Per-business prompts proliferate, making it hard to maintain consistency across clients.
**Mitigation**: Global prompt applies to all clients. Per-business overrides are optional and should be used sparingly (special client needs). UI could show a count of how many clients have overrides in a future iteration.

**Trade-off**: Two tables vs. one increases schema complexity slightly.
**Accepted**: Semantic clarity and simpler loaders outweigh the extra table.

**Trade-off**: No prompt versioning means operators can't roll back to a previous prompt easily.
**Accepted**: For V1, operators can copy/paste prompts before editing. Versioning can be added later if needed.

## Migration Plan

1. **Migration file**: `supabase/migrations/2026MMDD_neuramark_master_prompts.sql`
   - Create `neuramark_operator_prompts` (singleton with unique index on `((1))`).
   - Create `neuramark_business_prompts` (per-client with `client_id` FK).
   - Seed default global prompt (idempotent: `INSERT ... ON CONFLICT DO NOTHING`).
   - RLS: Enable but no policies (service-role-only access).
   - Constraints: `CHECK (char_length(global_master_prompt) <= 4000)`, `CHECK (char_length(business_master_prompt) <= 4000)`.

2. **TypeScript types**: Add types in `lib/contracts/master-prompts.ts` for row shapes and loader results.

3. **Loader**: Implement `lib/prompts/load-master-prompts.ts` with Supabase service-role client.

4. **Injection**: Update `generate-weekly-strategy.ts`, `generate-reel-script.ts`, `create-broll-video-jobs.ts` to call loader and inject prompts after base instructions.

5. **Server actions**: Add `lib/prompts/actions/update-global-master-prompt.ts` and `lib/prompts/actions/update-business-master-prompt.ts` with `requireOperator("handler")` guards.

6. **UI**: Build `/operator/settings/master-prompts/page.tsx` with form component, client picker for per-business prompt, i18n copy in `messages/{en,es}.json`.

7. **Tests**: Unit tests for loader (null-handling), injection order, and action validation.

8. **Rollout**: Deploy migration, then deploy code. No breaking changes; empty prompts mean no behavior change. Test with a single client by setting their business prompt and verifying script generation includes it.

**Rollback**: If issues arise, operators can clear the global prompt via the UI (set to empty string, stores as NULL). Code continues working; generation reverts to current behavior. If DB migration must roll back, drop tables with `DROP TABLE IF EXISTS neuramark_operator_prompts, neuramark_business_prompts CASCADE;`. Generation code handles loader failures gracefully (logs error, skips injection).
