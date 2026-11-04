## 1. OpenSpec validate

- [x] 1.1 Run `npx -y @fission-ai/openspec@latest validate --all --strict` and fix any errors

## 2. Faceless pipeline (A)

- [x] 2.1 Duration-covering `computeBrollClipCount` (+ estimate/create callers)
- [x] 2.2 Faceless cost card total = b-roll + TTS in `proposeConfirmPaidGeneration`
- [x] 2.3 `confirmPaidGenerationFromChat` runs TTS (if needed) then `createBrollVideoJobs`
- [x] 2.4 `maybeAdvanceFacelessAssemblyAfterBroll` from `applyVideoJobStatusUpdate`
- [x] 2.5 Offline tests (mock providers) for estimate, confirm, and assembly advance

## 3. Mis videos + chat preview (B) + i18n (C)

- [x] 3.1 Load in-production + pending + approved for `/ready-to-publish`
- [x] 3.2 Hub UI: progress, waiting OK (inline video + actions), ready download
- [x] 3.3 `messages/{en,es}.json` hub strings; verify locale=es
- [x] 3.4 Chat `getVideoPreview` / approve path ensures latest assembled package + URL
- [x] 3.5 Offline tests for list hub + preview ensure

## 4. Nueva conversación (D)

- [x] 4.1 Persist empty conversation server action; wire panel
- [x] 4.2 Offline test: new conversation is latest after create

## 5. Home last-updated + a11y (E)

- [x] 5.1 Client timezone formatter for last-updated
- [x] 5.2 Deduplicate next-action section title
- [x] 5.3 Offline/unit coverage where practical

## 6. Verify + ship

- [x] 6.1 Lint, typecheck, tests green
- [ ] 6.2 PR, checks, squash merge; archive OpenSpec change
- [ ] 6.3 `fly deploy` if worker-shared lib changed; report result
