# US-14.4 — Reset forgotten password

Request a password reset by email and set a new password. Supabase Auth only on the server; recovery token never in client JS; `neuramark_clients.active` is never changed.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-14.4

**This folder:** [`plan/stories/US-14.4/`](./) — `TASKS.md` (this PREP). `SECURITY.md` and `CONTRACT.md` are authored in later gates, not here.

**Depends on:** [US-14.1](../US-14.1/) (password policy, `neuramark_auth_attempts`, `password_reset_request` on `neuramark_auth_action`, `SITE_URL`, enumeration pattern) and [US-14.2](../US-14.2/) (login link to `/reset-password`, callback Path A, cookie adapter `lib/auth/supabase-cookie.ts`)
