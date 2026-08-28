# US-14.3 — Log out

End the current session from the product header (and pending, which has no header) so a shared device cannot reuse it. Supabase Auth revocation plus matching cookie expiry; then login.

**Canonical acceptance criteria:** [`plan/USER_STORIES.md`](../../USER_STORIES.md) → US-14.3 (do not redefine)

**This folder:** [`plan/stories/US-14.3/`](./) — `TASKS.md` (this PREP). `SECURITY.md` and `CONTRACT.md` are authored in later gates, not here.

**Depends on:** [US-14.5](../US-14.5/) ✅ (session-backed `getCurrentUser()`, deny-by-default guards, `Cache-Control: no-store` on product/pending, cookie flags) · [US-14.2](../US-14.2/) ✅ (httpOnly `sb-*` session)
