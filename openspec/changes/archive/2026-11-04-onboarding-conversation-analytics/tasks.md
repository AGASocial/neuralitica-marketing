## 1. OpenSpec & docs baseline

- [x] 1.1 Validate change with `openspec validate --all --strict` after artifacts land
- [x] 1.2 Update ADR-0011 consequences for KAN-106/107; note in AGENTS.md architecture defaults
- [x] 1.3 Add `docs/development/UX-ANALYTICS.md` with event catalog + SQL examples

## 2. Onboarding gate (KAN-106)

- [x] 2.1 Add pure `shouldEnterOptionAOnboarding` + unit tests (80%+approved plan → false; incomplete+no approvals → true; operator → false)
- [x] 2.2 Add server helper `loadShouldEnterOptionAOnboarding({ user })` using setup completion + approved plan week + approved reel list
- [x] 2.3 Redirect from `/dashboard` when gate true; ensure operators/approved-content stay on Hoy
- [x] 2.4 Pass `mode=onboarding` query through conversation page; load setup completion for progress UI

## 3. Conversation Option A UI

- [x] 3.1 Extend `ConversationFullView` for onboarding: Skip to Hoy, setup progress, ProposalActionCard in thread, actionable canvas, mobile horizontal carousel
- [x] 3.2 Add EN/ES copy for skip/progress/onboarding chrome in `messages/`
- [x] 3.3 Tighten `buildOrchestratorSystemPrompt` when onboarding mode (API body flag)
- [x] 3.4 Unlock owner access to guided proposal tools (plan/scripts/videos/paid confirm) while keeping Approve boundaries
- [x] 3.5 Component/unit tests for gate wiring and onboarding chrome presence

## 4. Analytics (KAN-107)

- [x] 4.1 Additive migration `neuramark_ux_events` (RLS on, deny-by-default)
- [x] 4.2 `recordUxEvent` Server Action + zod contract; unit tests
- [x] 4.3 Install/wire `@vercel/analytics` + client `trackUxEvent` dual-write helper
- [x] 4.4 Emit `hoy_visit` / `hoy_action`, `chat_first_message`, `approval`, `onboarding_step` from Hoy/chat/approvals/onboarding surfaces
- [x] 4.5 Apply migration to prod via supabase CLI only if additive-safe; otherwise stop and report

## 5. Verification & ship

- [x] 5.1 Run unit/component tests, lint, typecheck
- [ ] 5.2 Branch `feat/onboarding-conversation-analytics`, commit as byagasocial, push, PR (title `KAN-106`/`KAN-107` prefixed), watch checks, squash-merge, pull main, wait Vercel Ready
- [ ] 5.3 Archive OpenSpec change after merge
