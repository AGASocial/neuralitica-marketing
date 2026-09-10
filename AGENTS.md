# Neuralitica Marketing — Agent & project governance

Binding for humans and agents working in this repository. Parent architecture defaults also live in `../AGENTS.md`; **this file wins for this app** on precedence, readiness, and orchestrator quarantine.

## Document precedence (D4)

```text
SPEC.md + CONTEXT.md          → product / domain truth
docs/adr/  (and .specfounder/adr when referenced)
                          → architecture decisions
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

- Single Next.js App Router app; Supabase only from server; `neuramark_` DB prefix; EN/ES i18n; PrimeReact-first; Vercel deploy; `getCurrentUser()` identity seam; operator/client role flag only.

See parent `../AGENTS.md` and this repo `README.md` for full stack rules.
