# Tasks

## 1. Database Schema and Migration

- [ ] 1.1 Create migration file `supabase/migrations/202611XX_neuramark_master_prompts.sql` with `neuramark_operator_prompts` and `neuramark_business_prompts` tables, CHECK constraints (4,000 char limit), RLS enabled (no policies), unique index on global singleton, and seed default global prompt; verify migration applies cleanly with `supabase db reset --local` (or equivalent local test)
- [ ] 1.2 Create TypeScript types in `lib/contracts/master-prompts.ts` for `OperatorPromptsRow`, `BusinessPromptsRow`, and `MasterPromptsResult`; verify types compile without errors

## 2. Master Prompts Loader

- [ ] 2.1 Implement `lib/prompts/load-master-prompts.ts` with `loadMasterPrompts({ clientId })` using Supabase service-role client; verify it returns `{ global: string | null, business: string | null }` with nulls for missing/empty prompts
- [ ] 2.2 Write unit tests in `lib/prompts/load-master-prompts.test.ts` covering null-handling (empty string trims to null, missing rows return null), both global and business prompts present, and loader error handling; verify tests pass with `npm test -- load-master-prompts.test.ts`

## 3. Strategy Generation Injection

- [ ] 3.1 Update `lib/agents/content/generate-weekly-strategy.ts` `buildWeeklyStrategyPrompts` to call `loadMasterPrompts({ clientId })` and inject global + business prompts into system message after base instructions, before untrusted blocks; verify injection order with existing unit tests and add new test cases for prompt injection
- [ ] 3.2 Update `lib/agents/content/generate-weekly-strategy.test.ts` to cover injection scenarios (global only, global + business, no prompts); verify tests pass

## 4. Script Generation Injection

- [ ] 4.1 Update `lib/agents/content/generate-reel-script.ts` `buildReelScriptPrompts` to call `loadMasterPrompts({ clientId })` and inject prompts after base instructions, before untrusted profile/slot blocks; verify injection order preserves existing frozen delimiter pattern
- [ ] 4.2 Update `lib/agents/content/generate-reel-script.test.ts` to cover prompt injection scenarios; verify tests pass

## 5. B-roll Generation Injection

- [ ] 5.1 Update `lib/video-jobs/create-broll-video-jobs.ts` `buildWanBrollPrompt` and add new helper `buildLtxBrollPrompt` (if separate) to load and inject master prompts after base cinematic style instructions, before scene beat; verify prompt string includes injected text
- [ ] 5.2 Write unit tests in `lib/video-jobs/create-broll-video-jobs.test.ts` (or new `broll-prompt-builders.test.ts`) covering B-roll prompt injection; verify tests pass

## 6. Server Actions for Prompt Management

- [ ] 6.1 Implement `lib/prompts/actions/update-global-master-prompt.ts` with `requireOperator("handler")` guard, trim input, validate max 4,000 chars, upsert to `neuramark_operator_prompts`; verify action returns success/error result schema
- [ ] 6.2 Implement `lib/prompts/actions/update-business-master-prompt.ts` with `requireOperator("handler")` guard, `clientId` param, trim/validate, upsert to `neuramark_business_prompts`; verify action handles empty string as null
- [ ] 6.3 Write unit tests for both actions covering validation errors (over-length), successful upserts, and empty-to-null conversion; verify tests pass

## 7. Operator Settings UI

- [ ] 7.1 Create `app/(app)/operator/settings/master-prompts/page.tsx` with server component loading current prompts via new loader, passing to form component; verify page renders for operators and redirects/403s for non-operators (via `requireOperator("page")` in layout or loader)
- [ ] 7.2 Create `components/prompts/MasterPromptsSettingsForm.tsx` with textareas for global and per-business prompts, client picker (dropdown or autocomplete), character counters, save buttons calling the server actions, and toast notifications; verify form submits, validates, and displays success/error states
- [ ] 7.3 Add i18n copy to `messages/en.json` and `messages/es.json` under `settings.masterPrompts` for title, subtitle, labels, placeholders, save buttons, errors, and success toasts; verify both locales render correctly
- [ ] 7.4 Add navigation link to `/operator/settings/master-prompts` in `app/(app)/operator/layout.tsx` or equivalent operator settings nav; verify link appears and routes correctly

## 8. Integration and Validation

- [ ] 8.1 Run `npx -y @fission-ai/openspec@latest validate --all --strict` and fix any validation errors; verify all specs pass
- [ ] 8.2 Manually test: set global master prompt via UI, trigger strategy generation for a client, verify LLM system message includes the global prompt after base instructions; check logs or add temporary logging
- [ ] 8.3 Manually test: set per-business master prompt for a client, trigger script generation, verify LLM system message includes both global and business prompts in correct order
- [ ] 8.4 Manually test: clear both prompts (empty strings), trigger generation, verify behavior is identical to current implementation (no prompt sections in system message)
- [ ] 8.5 Manually test: B-roll generation with master prompts set, verify the final prompt string sent to provider includes the prompts

## Workflow follow-up

- Commit changes, push to feature branch `cursor/operator-master-prompts-7a27`.
- Open PR with description linking to OpenSpec change, following repo conventions.
- After PR review and merge, archive the change with `npx -y @fission-ai/openspec@latest archive operator-master-prompts` and verify main specs are updated.
