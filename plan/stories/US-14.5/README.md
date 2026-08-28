# US-14.5 — Session-backed identity and route protection

Unauthenticated requests redirect to login. `getCurrentUser()` reads the httpOnly session → `neuramark_clients` (`active` and `role` fresh every request). Inactive sessions see only pending activation. Deny-by-default allowlist. Seed the local operator row.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-14.5 (do not redefine)

**This folder:** [`plan/stories/US-14.5/`](./) — `TASKS.md` (this PREP). `SECURITY.md` and `CONTRACT.md` are authored in later gates, not here.

**Depends on:** [US-14.2](../US-14.2/) (login cookie, `/pending` landing) · [US-X.3](../../USER_STORIES.md) (`getCurrentUser()` seam) · [US-14.1](../US-14.1/) (`neuramark_clients`) · [US-14.4](../US-14.4/) (cookie adapter; idle/`maxAge` residual)
