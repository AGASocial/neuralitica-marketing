# ADR-0009 — Orchestrator chat (generative UI + extreme abstraction)

## Contexto

KAN-84: Clients and Operators currently navigate a wide top-level IA (dashboard,
profile, preferences, approvals, ready-to-publish, plus six Operator links) and
drive the weekly content pipeline through forms.

**Product principle (owner):** a plumber with zero tech/social-media knowledge
must run their whole campaign. The social engine plans from company onboarding
(Entrevista / Ficha viva). The owner converses in plain language, attaches a
photo when asked, and taps **Approve** / **Change something** on simple cards.
No jargon in owner-facing UI or chat (avoid: b-roll, faceless, provider, tokens,
avatar segments, QA, cost policy, etc.).

## Decisión

### Stack

Adopt **AI SDK v7 tool-call parts** (`ai` + `@ai-sdk/react` `useChat`) rendered
as first-party Campaña shadcn cards with zod-typed tool I/O (`lib/contracts/orchestrator-chat.ts`).
MCP-UI (`@mcp-ui/*`) is optional later — same proposal/confirm semantics.

- **Transport:** `POST /api/chat` → `streamText` via AI Gateway; default model
  `google/gemini-2.5-flash` (`ORCHESTRATOR_CHAT_MODEL` override).
- **Model choice (prod smoke 2026-11):** `google/gemini-2.5-flash-lite` leaked
  English chain-of-thought and tool names into owner-visible replies. Default is
  therefore **flash** (not flash-lite). KAN-97 may re-evaluate with a harness.
  Always stream with `sendReasoning: false`; sanitize visible text; never name
  tools in the system prompt’s required owner output.
- **Domain:** tools call existing services; **action tools never mutate** — they
  return proposals; mutation only on user Approve via existing Server Actions.
- **Safety:** never auto-spend; never publish to Instagram from chat;
  `getCurrentUser()` / role on every tool and mutation.
- **Attachments:** validated server-side via existing avatar-reference upload path.

### Extreme abstraction (owner UX)

- Chat EN/ES: short, proactive (“I drafted this month’s plan — approve it?”),
  minimal questions, one primary CTA per card (**Approve** / **Change something**).
- Technical details stay on Operator / **Advanced** screens, not in owner chat copy.
- Cards show human summaries only; internal tool payloads may keep domain ids.

### Information architecture

| Audience | Top-level |
|----------|-----------|
| **Owner (Cliente)** | **Home** (chat-first), **My campaign** (`/approvals`), **My videos** (`/ready-to-publish`), **My business** ▾ (`/profile`, `/settings/preferences`) |
| **Operator** | Same owner items + **Advanced** ▾ (strategy, scripts, calendar, playbook, trends, cost policy, cycle) |

Old flat nav (5 client + 6 operator links) is replaced by this grouping. **All
existing routes stay reachable**; nothing is deleted. Chat is a persistent
right-side sheet (header toggle + keyboard shortcut), and Home emphasizes chat.

### Tool catalog (phase 1+)

| Tool | Kind | Role | Mutates? | Owner-facing card |
|------|------|------|----------|-------------------|
| `listCampaignStatus` | read | client + operator | no | “Where things stand” |
| `getWeeklyStrategy` | read | client + operator (own) | no | “This week’s plan” (plain) |
| `getScriptsStatus` | read | operator | no | Advanced status (plain labels) |
| `proposeGenerateStrategy` | proposal | operator | **no** → `generateContentStrategy` | “Create this week’s plan?” |
| `proposeApproveStrategy` | proposal | operator | **no** → `approveContentStrategy` | “Approve this plan?” |
| `proposeApprovePendingVideo` | proposal | client + operator | **no** → `decideApproval` | “Approve this video?” |
| `proposeGenerateScripts` | proposal | operator | **no** → `generateReelScripts` | “Write this week’s videos?” |
| `proposeGenerateVideos` | proposal | operator | **no** → prepare scripts; paid media needs cost card (KAN-93) | “Create the videos?” |

Later: script/video preview cards, spend confirm before paid generation, photo/
presenter setup via chat, MCP-UI host, thread persistence.

### Phases

1. **P1:** Owner IA + Advanced grouping; chat sheet; API; read + proposal tools;
   image attach; contract tests; plain-language system prompt.
2. **P2:** Richer video/script cards; spend-confirm cards.
3. **P3:** Presenter/photo setup via chat; optional MCP-UI.
4. **P4:** Model eval; chat thread persistence.

## Consecuencias

- SPEC / CONTEXT document Orchestrator Chat + extreme abstraction.
- `@ai-sdk/react` runtime dependency.
- Owner nav copy is business language; Operator/Advanced keeps power tools.
- Regression tests: schemas, authz, no mutation without confirm.
