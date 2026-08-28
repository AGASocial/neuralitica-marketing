## Spec Review — US-14.2

### Verdict: ALIGNED

Email/password login via Next.js, httpOnly session, generic anti-enumeration errors, and landing by `neuramark_clients.active` match SPEC §2–§3 Authentication and AGENTS.md. Callback carry-forwards from US-14.1 complete “confirmar email” without granting product access. Every-request `active` / spend / `getCurrentUser()` swap stay US-14.5 — as required. No ADR, visual-modality, playbook/trend, or V1 out-of-scope breach.

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-1..SC-4 only as access plumbing (onboarding S4 #1). Does not touch Aprobación, publish, grabación humana, or weekly generation. | SPEC §1 SC-1..SC-4; hard rules | None. Do not add IG publish, Stories, or spend paths here. |
| Info | Roles unchanged: Cliente logs in; Operator activation remains SQL-only; anonymous login with no product until `active=true`. No RBAC UI, invite-only, or activation UI. | SPEC §2; §3 Authentication “Fuera V1”; PLAN Fase 1 | CONTRACT must omit `role` from login input/output. No app UPDATE on `active` / `role` (TASKS already forbids this). |
| Info | Login-time `active` check chooses landing (`/dashboard` vs `/pending`) only. Direct navigation to product routes while inactive, every-request guards, RLS policies, and spend block remain US-14.5. Hardcoded `getCurrentUser()` stays until then. | SPEC §3 “bloquea producto y gasto si inactivo”; SPEC §5 `getCurrentUser()`; AGENTS.md; USER_STORIES US-14.2 AC tagged US-14.5 | CONTRACT.md must freeze this split. Do **not** interpret USER_STORIES “no dashboard or product route is reachable” as middleware/`getCurrentUser()` swap in this story. Landing ≠ route protection. |
| Info | USER_STORIES US-14.2 ACs do not list the email-confirmation callback; US-14.1 deferred that AC + CONTRACT out-of-scope (“US-14.2 / US-14.5”). TASKS correctly pulls callback + post-confirm landing + `?email=` identity fix into this story. | SPEC §3 “confirmar email”; US-14.1 CONTRACT.md Out of scope; VALIDATION.md deferred; QA.md Low #13 | CONTRACT.md must include `/auth/callback` as in-scope: complete confirm; never send inactive users into product routes; freeze **one** landing path (`callback → /pending` **or** `callback → /login` then confirmed-inactive → `/pending`). E2E must prove that path. |
| Info | Callback/login may read `neuramark_clients` after successful Supabase sign-in only to choose landing and to pass the user’s own email/display name to pending. That is not a second product identity API. | SPEC §5 “identidad solo `getCurrentUser()`”; AGENTS.md | Pending response may include at most email/display name the user already knows. No `client_id`, `auth_user_id`, `role`, `active` flag on the wire before auth; after auth, do not leak IDs/queue/operator internals (USER_STORIES [SEC] pending screen). |
| Info | Session cookie flags (`HttpOnly`, `Secure` in prod, `SameSite=Lax`, `Path=/`), fixation/rotation, CSRF, open-redirect on `next`/`redirectTo`, password redaction, brute-force via `neuramark_auth_attempts` (`login_failed`) match SPEC §3/§6 auth NFRs. Optional `login_success` enum only if SECURITY/CONTRACT require it. | SPEC §3 rate limits + generic messages; §5 httpOnly; §6 `neuramark_*` | Reuse existing tables/indexes. New DB objects (if any) must use `neuramark_` prefix. Do not invent a parallel session store. |
| Info | ADRs 0001–0003 are untouched: no cron, no IG Graph publish, no Fly worker for login. Login stays on the Vercel Next.js app. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: Instagram Stories, multicanal, ads, RBAC UI, invite-only, logout mutation (US-14.3), password-reset implementation (US-14.4, link-only), spend guard (US-14.5). | SPEC §1 Fuera de alcance; USER_STORIES US-14.3/14.4/14.5 | Implementers must not ship logout, reset handlers, or deny-by-default product middleware here. |
| Low | USER_STORIES AC “no dashboard or product route is reachable” (inactive login) overlaps US-14.5. TASKS already de-scopes it; implementers could still overbuild if CONTRACT copies the AC literally. | USER_STORIES US-14.2 vs US-14.5; AGENTS.md hardcoded user until US-14.5 | In CONTRACT “Out of scope”: every-request `active` guard, spend guard, RLS policies, `getCurrentUser()` session swap. In-scope: post-login redirect to `/pending` for confirmed-inactive. Known interim: until US-14.5, hardcoded identity may still serve `/dashboard` if the user navigates there — sanctioned, not a US-14.2 defect. |

### Terminology violations (CONTEXT)

None in `plan/stories/US-14.2/` (README.md, TASKS.md).

Canonical use: Cliente / Client, Operator (SQL activation), pending activation — not admin/staff UI. No playbook/trend/visual-modality copy in this story.

Note (not a US-14.2 veto): parent `plan/USER_STORIES.md` Authentication access-model blurb still says “admin activation UI” (CONTEXT _Evitar_: admin). That sentence is module-level, already present for US-14.1. Do not repeat “admin” in US-14.2 CONTRACT, SECURITY, or EN/ES product copy; keep “Operator” / “operator SQL”.

### Recommended action

Proceed to **SECURITY.md** (security-architect), then CONTRACT.md.

CONTRACT freeze items (non-negotiable for alignment):

1. Server Action (or Origin-checked Route Handler) for sign-in; no `@supabase/supabase-js` / tokens / keys in the browser.
2. httpOnly session cookie; landing by `neuramark_clients.active` after successful auth only.
3. One generic failure for unknown email, wrong password, and unconfirmed (same status, shape, copy).
4. `/auth/callback` completes confirmation; inactive never lands on product routes; pick and freeze one post-confirm path.
5. `/pending` identity from authenticated result only — not `?email=`.
6. Explicit out of scope: US-14.5 guards/spend/`getCurrentUser()` swap, US-14.3 logout, US-14.4 reset implementation, RBAC/activation UI, Stories IG.
