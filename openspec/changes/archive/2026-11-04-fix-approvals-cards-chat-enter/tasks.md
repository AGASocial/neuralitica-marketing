## 1. OpenSpec

- [x] 1.1 Validate change with `npx -y @fission-ai/openspec@latest validate --all --strict`

## 2. Approvals cards + detail

- [x] 2.1 EN/ES messages: card summary, untitled, disclosure chip + tooltip; detail uses reel title
- [x] 2.2 Update `ApprovalsListView`: title, MediaThumbnail, summary, disclosure tooltip, ClientLocalDateTime on createdAt
- [x] 2.3 Wire new copy through `app/(app)/approvals/page.tsx`
- [x] 2.4 Attach `reelTitle` in `composeApprovalPackage` / package DTO; show on detail view
- [x] 2.5 Source/unit tests for list view + package title wiring

## 3. Chat Enter-to-send

- [x] 3.1 Pure key-handler helper + autosize; wire into OrchestratorChatPanel
- [x] 3.2 Unit tests for Enter / Shift+Enter / IME / empty / busy

## 4. Verify

- [x] 4.1 Lint, typecheck, tests
