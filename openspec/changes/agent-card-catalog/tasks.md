# Tasks: agent-card-catalog (KAN-103)

- [x] 1. ADRs 0011 (agentic-first C+A) and 0012 (A2UI later); update AGENTS.md + openspec/config.yaml ADR index; keep `docs/design/agentic/*`
- [x] 2. `lib/agent-cards/` Zod catalog + parse helpers + mappers from proposals / approvals / Mis videos DTOs
- [x] 3. `components/agent-cards/AgentCard.tsx` (shadcn; MediaThumbnail; max 2 primary actions; onAction)
- [x] 4. Migrate chat: ProposalActionCard + status/progress/next-step chips (+ clarifying when applicable) to AgentCard; same Server Actions
- [x] 5. Migrate ApprovalsListView + MyVideosHubView pending cards to AgentCard
- [x] 6. Tests: schema per type, render per type, onAction callback; wiring tests for migrated surfaces
- [x] 7. `npx -y @fission-ai/openspec@latest validate --all --strict`; lint; typecheck; unit tests
