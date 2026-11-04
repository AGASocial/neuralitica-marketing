# Tasks

## 1. OpenSpec

- [x] 1.1 Validate change with `npx -y @fission-ai/openspec@latest validate --all --strict` and fix any errors

## 2. Chip selection + i18n

- [x] 2.1 Add EN/ES `orchestratorChat.suggestedPrompts` strings (fixed + state chips + list aria) in `messages/{en,es}.json`
- [x] 2.2 Implement pure `selectSuggestedPromptChips` (+ types) from setup/campaign signals; unit tests cover 80% setup + 4 pending + approved plan and no-plan XOR
- [x] 2.3 Add server loader/action that gathers setup + campaign signals and returns localized chips; verify no paid calls

## 3. Chat UI + agent path

- [x] 3.1 Add `SuggestedPromptChips` UI (wrap, min 44px, horizontal scroll) and wire into `OrchestratorChatPanel` under greeting when no user messages; click sends via `sendMessage`; component source test for hide-on-user-messages
- [x] 3.2 Pass chips + copy from AppHeader (or loader) into the panel
- [x] 3.3 Add read-only `suggestNextActions` tool + contracts; render tool output as clickable chips in the transcript
- [x] 3.4 Tighten system prompt for capability-question overview (~5 bullets) + tool call; extend system-prompt unit test

## 4. Verify

- [x] 4.1 Run lint, typecheck, and unit tests; fix failures

## Workflow follow-up

- Archive the change after squash-merge (`openspec archive` / `/opsx-archive`)
