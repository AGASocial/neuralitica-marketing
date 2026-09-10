# Governance protocol (neutral)

Portable rules shared by Cursor and Codex. Role files remain under `.cursor/agents/` for now (N3 defers a move).

## Boot order (safe)

1. Read `AGENTS.md` (this repo) — quarantine + precedence.
2. Read `SPEC.md` + `CONTEXT.md` for product truth.
3. Read relevant ADR under `docs/adr/` or `.specfounder/adr/` if architecture is in scope.
4. Read `plan/USER_STORIES.md` story + `plan/stories/US-x.y/CONTRACT.md` if implementing.
5. Check `docs/development/SPRINT-STATE.md` only as orchestrator cursor — not backlog truth.
6. **If orchestrator / `$desarrollar`:** stop unless governance status is READY (see `docs/governance/READINESS.md`).

## SpecFounder

`.specfounder/` and `specfounder-v2/` are **REFERENCE-ONLY**. Do not treat SpecFounder drafts as overriding SPEC.md / CONTEXT.md / USER_STORIES.md.
