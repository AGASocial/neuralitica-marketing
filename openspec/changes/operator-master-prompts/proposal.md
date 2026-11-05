# Proposal

## Why

Content generation (strategy, reel scripts, and B-roll) uses hardcoded system prompts with no operator steering. Neuralitica needs operator-editable master prompts—one global and one per-business override—to inject creative direction (hooks, retention, tone) that applies consistently across all content generation while preserving safety, format, and schema instructions. This improves generated strategy, script quality, and B-roll relevance without rebuilding agent logic.

## What Changes

- **Database schema**: Add `neuramark_operator_prompts` table with `global_master_prompt` TEXT and per-business `neuramark_business_prompts` table with `business_master_prompt` TEXT (both nullable).
- **Prompt injection**: Load global + per-business master prompts in `generate-weekly-strategy.ts`, `generate-reel-script.ts`, and B-roll generators (`create-broll-video-jobs.ts` / `buildWanBrollPrompt` / `buildLtxBrollPrompt`). Inject after base system instructions, before untrusted playbook/profile blocks.
- **Operator UI**: Add `/operator/settings/master-prompts` page with textarea fields for global and per-business prompts (textarea for multiline copy). Only accessible to operator role (via `requireOperator("page")`). Uses server actions `updateGlobalMasterPrompt` and `updateBusinessMasterPrompt` with validation (max length checks, trimming, empty-string-as-null).
- **Default global prompt**: Seed migration with a strong default focused on Instagram Reels hooks, retention, pacing for faceless/avatar short-form (based on Neuralitica's modalities).
- **Backward compatibility**: Empty prompts (null) no-op—injection skips them. Existing clients continue working with current behavior when no master prompt is set.

## Capabilities

### New Capabilities

- `content-generation-prompts`: Operator-editable global and per-business master prompts that inject creative steering into weekly strategy, reel script, and B-roll generation without changing LLM safety/schema constraints.

### Modified Capabilities

- `campaign-plan`: Weekly strategy generation SHALL load and inject global + per-business master prompts before untrusted playbook context.
- `scripts`: Reel script generation SHALL load and inject global + per-business master prompts before untrusted profile/slot brief context.
- `reel-production`: B-roll prompt builders (`buildWanBrollPrompt`, `buildLtxBrollPrompt`) SHALL inject global + per-business master prompts to steer faceless cinematic style and scene composition.

## Impact

- **Database**: New migration (`neuramark_operator_prompts`, `neuramark_business_prompts`), new TypeScript types, loader helpers in `lib/prompts/`.
- **Agent modules**: Modified `lib/agents/content/generate-weekly-strategy.ts`, `lib/agents/content/generate-reel-script.ts`, `lib/video-jobs/create-broll-video-jobs.ts`.
- **UI**: New operator settings page at `app/(app)/operator/settings/master-prompts/page.tsx` with form component, actions in `lib/prompts/actions/`.
- **i18n**: Spanish + English copy in `messages/{en,es}.json` under `settings.masterPrompts.*`.
- **Tests**: Unit tests for prompt injection order, empty-prompt no-op, and max-length validation.
- **No breaking changes**: Existing calls continue working; injection is additive. No changes to approval flows, spend gates, or Instagram publish paths.
