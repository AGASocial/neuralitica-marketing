# ADR-0012 — A2UI: later (not now)

## Status

Accepted — defer. Evidence: `docs/design/agentic/analisis.md` §6. Related:
ADR-0011, KAN-103 agent card catalog.

## Context

[A2UI](https://a2ui.org/) (Google / CopilotKit) is a declarative UI protocol:
the agent sends JSON (surfaces, catalog components, data binding, actions);
the host renders with native components. Maturity at decision time: v0.9.1
with v1.0 RC; README still “early stage… expect changes”; TypeScript agent
SDK (`@a2ui/agent`) not published. Alternatives: MCP-UI / MCP Apps, AG-UI,
and our current AI SDK tool parts → shadcn.

## Decision

**Do not integrate A2UI now.** Keep AI SDK v7 tool parts + first-party Campaña
cards. Prepare by defining a **Zod card catalog** and single `<AgentCard>`
(KAN-103 / ADR-0011) so a future A2UI (or MCP Apps) adapter is cheap.

### Why not now

- One first-party agent in Next.js already gets typed tool I/O → native UI
  without a preview protocol or AI SDK↔A2UI adapter.
- Card set is small and known (reel, cost, plan, script, avatar, voice,
  status, clarifying, chips, progress); owners benefit from consistency, not
  LLM-composed arbitrary layouts.
- A2UI still preview-ish; agent TS SDK missing.

### Triggers to revisit (“yes”)

1. Native iOS/Android apps that must render the same agent cards →
   multiplatform value of A2UI becomes real.
2. Third-party / remote agents (A2A) showing UI inside Neuralitica, or an
   agent marketplace.
3. Need for the agent to compose net-new UIs beyond the fixed catalog
   (ad-hoc reports).
4. A2UI v1.0 stable plus official or Vercel AI SDK adapter support.

For distribution **inside ChatGPT/Claude**, prefer **MCP Apps**, not A2UI.

## Consequences

- Catalog schemas in `lib/agent-cards/` are the A2UI-shaped contract without
  the dependency.
- No `@a2ui/*` packages until a trigger above fires and a new ADR supersedes
  this one.
