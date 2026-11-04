# Tasks

## 1. OpenSpec validate

- [ ] 1.1 Run `npx -y @fission-ai/openspec@latest validate --all --strict` and fix any errors

## 2. Contracts and loaders

- [ ] 2.1 Add `lib/contracts/owner-home-dashboard.ts` with zod DTOs for next action, week counts, campaign progress, results, recent videos, atajos, lastUpdatedAt
- [ ] 2.2 Implement `lib/dashboard/load-owner-home-dashboard.ts` aggregating approvals, strategy, calendar slots (client+week), guided next-step; set `insightsAvailable: false`
- [ ] 2.3 Unit tests for next-action priority, week count mapping, progress X/Y, results empty flag

## 3. UI + i18n

- [ ] 3.1 Rebuild `components/dashboard/DashboardView.tsx` (and helpers) for next action, week counts, progress, results empty, recent strip, Atajos; chat-open client CTA
- [ ] 3.2 Wire `app/(app)/dashboard/page.tsx` to the loader; keep setup banner when Supabase missing
- [ ] 3.3 Add EN/ES `messages` keys; update `lib/i18n/dashboard-locale.test.ts`

## 4. Docs

- [ ] 4.1 Update ADR-0009 (Home is owner dashboard, not card grid) and KAN-84 doc with KAN-98 note; brief AGENTS.md mention if needed

## 5. Verify + ship

- [ ] 5.1 Run unit tests, lint, typecheck
- [ ] 5.2 Archive OpenSpec change into main specs when merge-ready
- [ ] 5.3 Commit as byagasocial@gmail.com, push branch, open PR with KAN-98, watch checks, squash-merge
