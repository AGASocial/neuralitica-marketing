# Neuralitica Marketing — Agent & project governance

Binding for humans and agents working in this repository. Parent architecture defaults also live in `../AGENTS.md`; **this file wins for this app** on precedence, readiness, and orchestrator quarantine.

## Document precedence (D4)

```text
SPEC.md + CONTEXT.md          → product / domain truth
docs/adr/  (and .specfounder/adr when referenced)
                          → architecture decisions
openspec/specs/               → current implemented capability behavior (OpenSpec)
plan/USER_STORIES.md          → requirements / backlog
plan/stories/US-x.y/CONTRACT.md
                          → implementation contract
Code + tests                  → evidence of implementation
GitHub Project / Issues       → operational status of work

Derived (not competing trackers):
  PLAN.md                     → roadmap
  README.md                   → navigation map
  docs/development/SPRINT-STATE.md
                              → orchestrator cursor only
  TASKS.md                    → HISTORICAL checklist — not the live tracker
```

When documents conflict, higher rows win. Do not invent scope that contradicts SPEC/CONTEXT/ADRs.

## OpenSpec change workflow (required)

Every code or behavior change in this repo **MUST** start with an OpenSpec change proposal:

1. Create `openspec/changes/<id>/` with `proposal.md`, `tasks.md`, and spec deltas under `specs/` (ADDED/MODIFIED/REMOVED/RENAMED Requirements) that update the relevant `openspec/specs/<capability>/spec.md` capabilities.
2. Run `npx -y @fission-ai/openspec@latest validate --all --strict` (or the installed `openspec` CLI) and fix errors before implementation review.
3. Implement against the approved change; keep tasks checked off in `tasks.md`.
4. After the change merges, archive it (`openspec archive` / `/opsx-archive`) so main specs stay current and the proposal moves under `openspec/changes/archive/`.

Do not land behavior changes that skip the proposal → validate → implement → archive loop. Tooling: Cursor skills/commands under `.cursor/` from `openspec init --tools cursor`. Project context: `openspec/config.yaml` (+ human index `openspec/project.md`).

## Human Gate decisions (approved 2026-09-10 — issue #3)

| ID | Decision |
|----|----------|
| **D1** | Instagram Graph Publish stays **in V1** (SPEC / ADR-0002). Agents must not drop it because it is unimplemented. |
| **D2** | Completion ladder: **CODE COMPLETE → INTEGRATION VERIFIED → OPERATIONALLY VALIDATED**. F7 may be code/integration advanced without claiming SC-1–SC-4 operational. |
| **D3** | Fly.io / ADR-0003: **no redesign**. Inventory external Docker/Fly; if missing in-repo → `ACCEPTED` + `IMPLEMENTATION INCOMPLETE`. |
| **D4** | Precedence as above; global `TASKS.md` is not the tracker. |
| **D5** | **Cursor + Codex supported; neither is canon.** SpecFounder = REFERENCE-ONLY. |

Parent audit issue: [#2](https://github.com/AGASocial/neuralitica-marketing/issues/2) (mother normalization — open until READY).

## Orchestrator quarantine

**`$desarrollar` / `master-orchestrator` autonomous loops are QUARANTINED** until governance status is **READY**.

Do not:

- Start multi-story autonomous sprints
- Close phases as OPERATIONALLY VALIDATED without SC evidence
- Mass-fix ESLint/test debt without classification

Allowed without READY: human-supervised hotfixes, single-story work with review, Track A production reliability fixes.

## AVOS authorization

[`DECISION_AVOS_AGENT_AUTHORIZATION_V1`](docs/governance/DECISION_AVOS_AGENT_AUTHORIZATION_V1.md) — **PROPOSED_FOR_REGISTRATION**, effective on merge. Until that merge, AVOS has no authority in this repo.

## Documentary states

Use these labels on phases/stories:

- `CODE COMPLETE` — merged implementation + unit/integration tests for the story contract
- `INTEGRATION VERIFIED` — cross-module checker PASS for the phase
- `OPERATIONALLY VALIDATED` — staging/production smoke for SC criteria (SC-1..SC-4 etc.)

Never collapse the three.

## Agent model (D5)

```text
Neutral protocol (this AGENTS.md + docs/governance/)
        ↓
   Role definitions (.cursor/agents/*.md today; portable markdown)
     ↙               ↘
 Cursor              Codex
```

- SpecFounder (`.specfounder/`, `specfounder-v2/`) is **REFERENCE-ONLY** — no authority over product scope; no automatic boot into `$desarrollar`.
- Do not relocate `.cursor/agents/` in the first governance PR; portability is N3 follow-up.

## Architecture defaults (summary)

- Single Next.js App Router app; Supabase only from server; `neuramark_` DB prefix; EN/ES i18n; Tailwind CSS v4 + shadcn/ui (Campaña); Vercel deploy; `getCurrentUser()` identity seam; operator/client role flag only.
- Orchestrator chat (ADR-0009): company interview runs in-chat via existing `neuramark_interview_sessions` + `persistInterviewDraft` / `submitInterview` (no new tables); assistant text is Markdown-rendered; `proposeEnableOwnAvatar` only upserts Preferencias modalities (never HeyGen/avatar generation) and redirects to the consent card when consent is missing; TTS voice spend uses a separate `confirm_tts_generation` card from b-roll/HeyGen (defaults to latest eligible write-up + in-card picker); layout compositor (always visible; Cmd/Ctrl+J focuses; no FAB) opens the conversation panel on send; `/conversation` is full-screen Option A. Onboarding shape (ADR-0010 / KAN-100): hybrid — setup checklist spine, not a separate multi-page wizard.
- Agentic-first UI (ADR-0011 / KAN-102): daily home → Option C “Hoy” (feed + hero compositor; KAN-104); mobile bottom tab bar Hoy · Campaña · Videos · Negocio (KAN-105); onboarding/first-run → Option A (KAN-106: incomplete setup ∧ no approved plan/reel → `/conversation?mode=onboarding`; Skip to Hoy; operators/approved content stay on Hoy). Shared Zod card catalog + `<AgentCard>` (KAN-103) unifies chat / Mis videos / approvals / Hoy (max 2 primary actions; cost always explicit). UX analytics (KAN-107): `@vercel/analytics` + `neuramark_ux_events` (see `docs/development/UX-ANALYTICS.md`). A2UI deferred (ADR-0012) until native apps, third-party agents, free-form composition, or stable v1 + AI SDK adapter.
- Owner-facing pages (dashboard/Hoy, conversation, interview, profile, preferences, approvals, ready-to-publish) resolve locale with `resolveRequestLocale` so `?locale=` and `preferredLocale` both apply; owner Hoy (`/dashboard`) is the agentic feed (Needs OK / What I did / Next / Results) with copy in `messages/{en,es}.json`.

## Supabase migrations (prod)

- Ship SQL under `supabase/migrations/` in the PR (idempotent-safe).
- **Do not** apply migrations to remote/prod from feature agent sessions unless the human explicitly asks.
- Production apply for project `lrnhrzpwgyhkruwxeppw` is done by the orchestrator via **Supabase MCP `apply_migration`** (see `docs/governance/OPERATIONS.md`).

See parent `../AGENTS.md` and this repo `README.md` for full stack rules.
