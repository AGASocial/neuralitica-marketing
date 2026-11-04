## 1. OpenSpec

- [x] 1.1 Validate change with `npx -y @fission-ai/openspec@latest validate --all --strict`

## 2. Pending card data + UI

- [x] 2.1 Extend approval list DTO with `title`, `formatKey` (modalidad), `assembledAt`
- [x] 2.2 Enrich `toApprovalListItemDto` from assembly → script → strategy slot
- [x] 2.3 Update `MyVideosHubView` PendingCard: title, format badge, assembledAt; stop using “Aviso” as primary badge
- [x] 2.4 Wire EN/ES format labels + untitled fallback in ready-to-publish page copy
- [x] 2.5 Tests for enrichment / hub view contracts

## 3. Hydration #418

- [x] 3.1 Add shared after-mount local datetime helper
- [x] 3.2 Use it on dashboard last-updated and Mis videos date lines
- [x] 3.3 Unit/source tests asserting no Intl format during initial client render

## 4. User menu

- [x] 4.1 aria-label “Menú de usuario” / “User menu”
- [x] 4.2 Mobile trigger reachability (`shrink-0`, touch target)

## 5. Verify

- [x] 5.1 Lint, typecheck, tests
- [x] 5.2 Optional: `TZ=UTC next build && next start` smoke note in PR
