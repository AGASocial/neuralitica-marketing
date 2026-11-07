# Tasks

## 1. Server Component Update

- [x] 1.1 Update `app/(app)/operator/settings/master-prompts/page.tsx` to load clients via `loadOperatorClientsForStrategy()` and verify the page builds without TypeScript errors
- [x] 1.2 Pass client list to `MasterPromptsSettingsView` as a new prop and verify the component accepts the prop in its TypeScript interface

## 2. Client Component UI Replacement

- [x] 2.1 Update `MasterPromptsSettingsView.tsx` to accept clients prop and verify TypeScript types are correct
- [x] 2.2 Replace raw UUID text input with shadcn/ui `Select` component (import from `@/components/ui/select`) and verify the component renders
- [x] 2.3 Map clients to dropdown options (`{ value: id, label: displayName }`) and verify options populate the Select
- [x] 2.4 Update `onChange` handler to load the selected client's prompt from `perBusinessByClientId` and verify switching clients updates the textarea
- [x] 2.5 Handle empty client list by showing empty state message and hiding the business prompt textarea when no client is selected, and verify empty state renders correctly when clients array is empty

## 3. Localization

- [x] 3.1 Add or update `settings.masterPrompts.emptyBusinesses` strings in `messages/en.json` and `messages/es.json` for empty state and verify strings are used in the component
- [x] 3.2 Update any existing placeholder or hint text to reflect the new selector UI and verify the updated copy appears in both locales

## 4. Validation

- [x] 4.1 Run `npx @fission-ai/openspec validate operator-business-selector-prompts --type change --strict` and verify validation passes with zero errors or warnings
- [x] 4.2 Run `npm run typecheck` and verify no TypeScript errors in updated files
- [x] 4.3 Run `npm run lint` and verify no ESLint errors in updated files
- [x] 4.4 Run `npm test` (or relevant test command) and verify existing tests pass

## 5. Manual Verification

- [ ] 5.1 Start the development server and navigate to `/operator/settings/master-prompts` as an operator, and verify the page loads with a client selector dropdown
- [ ] 5.2 Select a business from the dropdown and verify the business prompt textarea loads that business's current prompt (or empty if none exists)
- [ ] 5.3 Switch to a different business and verify the prompt textarea updates to that business's prompt
- [ ] 5.4 Save a per-business prompt and verify the save succeeds with the correct client ID
- [ ] 5.5 Reload the page, select the same business, and verify the saved prompt appears
- [ ] 5.6 Test with no active businesses (set all clients to `active = false` in DB or test in an empty env) and verify the empty state message appears

## Workflow follow-up

- Archive the change after PR review and CI pass.
- Verify the archived result with `npx @fission-ai/openspec list --specs` includes updated `content-generation-prompts` spec.
