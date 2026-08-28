## Spec Review — US-14.3

### Verdict: ALIGNED

SPEC §3 Authentication already lists **cerrar sesión** as a P1 capability. US-14.3 is the story that ships it: POST-only Next.js Server Action, user-scoped Supabase Auth revocation (not cookie deletion alone), matching `sb-*` expiry, then `/login`. Header stays a Server Component with a small client island; pending gets the same action so an inactive session can leave a shared device. US-14.5 guards, `Cache-Control: no-store`, Path A, recovery landings, and US-14.4 global sign-out stay out of this story. No ADR, visual-modality, playbook/trend, RBAC, or V1 out-of-scope breach.

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| Info | Story supports SC-1..SC-4 only as access plumbing (PLAN Fase 1: Authentication; S4 #1 onboarding). Does not touch Aprobación, Publicación en Instagram, grabación humana, Ciclo semanal, Playbook, Trend, or visual modalities. | SPEC §1 SC-1..SC-4; hard rules; PLAN Fase 1 | None. Do not add IG publish, Stories, ads, generation, or Interview/Ficha/preferencias here. |
| Info | Roles unchanged. Logout is not a product/spend endpoint: do **not** call `requireActive()` / `requireOperator()`. Inactive (`/pending`) and client-role sessions must be able to leave. Operator SQL still owns `active` / `role`. No activation UI, invite-only, or RBAC / permission tables / role-management UI. | SPEC §2; §3 Authentication “Fuera V1”; AGENTS.md role flag; PLAN Fase 1 | CONTRACT: no `role` / `active` / `client_id` / `auth_user_id` in logout input or result. No `INSERT`/`UPDATE`/`DELETE` on `neuramark_clients`. |
| Info | **Pending control is in scope** even though USER_STORIES FE names only “header/user menu.” `/pending` is outside `AppShell`; US-14.5 left a logout *hint*. SPEC “cerrar sesión” plus the shared-device outcome require the **same** Server Action on pending. Hint copy is not a control. | SPEC §3 Authentication; USER_STORIES US-14.3 vs US-14.5; US-14.5 SPEC-REVIEW | Wire one action on `AppHeader` (product) and `PendingActivationView`. Pending identity stays server-passed email + display name only. |
| Info | **Identity seam unchanged.** `AppHeader` remains a Server Component receiving `CurrentUser` from `AppShell` after `requireActive("page")`. Client island is the interactive control only — no `getCurrentUser()` in Client Components, no `document.cookie`, no browser Supabase SDK. No second identity API (`neuramark_session`, `client_id` cookie). | SPEC §3 “identidad solo `getCurrentUser()`”; §5 Auth + httpOnly; AGENTS.md | CONTRACT: one seam, server-only. Display name/email stay server props. |
| Info | **Revoke, then expire.** Cookie deletion alone is a fail. User-scoped cookie client (`createUserScopedAuthClient`) calls `signOut` so the current refresh token is revoked; then `discardSupabaseAuthCookies` / `applySessionCookieFlags({ maxAge: 0 })` with the **same** name/path/host-only flags used to set cookies. Replay of a captured pre-logout `Cookie` → `getCurrentUser()` null / login redirect, not dashboard HTML. Service-role client is forbidden on this action. | SPEC §3/§5 session httpOnly; USER_STORIES US-14.3 [SEC]; SECURITY_BASELINE session cookie ↔ server | CONTRACT: order + replay test. Do not clamp `maxAge: 0` up to 7 days. Expire every `sb-*` (`isSupabaseAuthCookieName`). |
| Info | **Local vs global** is a SECURITY/CONTRACT freeze, not a SPEC veto. USER_STORIES outcome is shared-device (“this session cannot be reused”). This story is **this device / this session**, not “sign out everywhere” UI. US-14.4 already uses `scope: "global"` on password reset. SPEC only requires cerrar sesión with server-side Auth (not cookie-only). | SPEC §3 Authentication; USER_STORIES US-14.3; US-14.4 SPEC-REVIEW | CONTRACT must freeze local scope. Do not ship a “sign out all devices” control here. |
| Info | **POST-only.** USER_STORIES BE allows Route Handler **or** Server Action; TASKS correctly narrows to a Server Action with the same CSRF origin check as `logIn` / `signUp`. No `GET /logout`, no `<a href="/logout">`, no `method="get"`. A GET must not terminate a session. Do not allowlist a public GET logout path. Success landing is `/login` (optional `locale` query already on the request). Do **not** pass `next` of `/dashboard`, `/`, or `/pending`. Subsequent `GET /dashboard` without a session uses the existing US-14.5 guard (`/login` + safe `next`). | SPEC §3 Auth vía backend Next; USER_STORIES US-14.3 [SEC] POST-only; US-14.5 deny-by-default | CONTRACT: Server Action only. Optional `?loggedOut=1` only if SECURITY freezes it as non-oracle copy; default is plain `/login`. |
| Info | **Guards and cache are verify, not rebuild.** After logout, protected routes redirect because US-14.5 sees a null/revoked session. Authenticated product and `/pending` already send `Cache-Control: no-store`. This story confirms Back does not show authenticated HTML; extend headers only if a new gated surface appears (none expected). | SPEC §5 `getCurrentUser()`; USER_STORIES US-14.3 AC + [SEC] no-store; US-14.5 CONTRACT | Do not fork middleware or `requireActive()`. Do not add a second caching scheme. |
| Info | **Idempotent + failure envelope.** Missing / already-expired session → still expire `sb-*` crumbs and land on login (not 500). If revoke fails after retry: still expire cookies; do **not** return `{ ok: true }` that implies the refresh token is dead (US-14.4 pattern). FE must not stay on an authenticated shell. Generic errors only (no Supabase text). | SPEC §3 mensajes genéricos; USER_STORIES US-14.4 envelope pattern | Freeze envelope vs redirect in CONTRACT. Reuse `redactAuthPayload` / `forbidden-fields.ts`. |
| Info | **`AUTH_DEV_FALLBACK`:** hardcoded `DEV_USER` is not a real Auth session. Logout still expires `sb-*` and redirects; it cannot revoke that identity until the flag is off. Do not persist the fallback across logout or invent a fake session store. | SPEC §5 identity via `getCurrentUser()`; AGENTS.md; USER_STORIES US-14.5 [SEC] | Document in CONTRACT. Do not teach fallback to survive logout. |
| Info | **NFR:** i18n EN+ES (`header.*` + pending button). PrimeReact before custom UI. Service-role never in this action, never `NEXT_PUBLIC_*`, never client bundle. No new `neuramark_*` tables/columns/enums/indexes/policies. Default: no `logout` value on `neuramark_auth_action` unless SECURITY later requires an audit row. RLS stays enabled with zero policies. Confirmation is optional (story); do not block BUILD on a modal. | SPEC §5–§6; AGENTS.md; USER_STORIES US-14.3 FE | New objects (if SECURITY later requires any) must use `neuramark_` prefix. Product ES copy: **cerrar sesión** (SPEC). Do not invent a second product name for “log out.” |
| Info | ADRs 0001–0003 are untouched: no cron, no IG Graph publish, no Fly worker for logout. Auth stays on the Vercel Next.js app. | ADR-0001, ADR-0002, ADR-0003 | None. |
| Info | Out of scope held: Interview Builder / Ficha viva / Preferencias de producción visual; Instagram Stories, multicanal, ads; RBAC/activation UI; Path A (`GET /auth/callback`) and recovery landings; US-14.4 global sign-out after set-password; re-implementing US-14.5 guards or `no-store`. | SPEC §1 Fuera de alcance; USER_STORIES US-14.4 / US-14.5 | Implementers must not reopen frozen auth landings, write `active`/`role`, or add GET logout. |

### Terminology violations (CONTEXT)

None that block this story in `plan/stories/US-14.3/` (README.md, TASKS.md).

Canonical use: Cliente / Client (product header), Operator (SQL only — unused by logout), Usuario anónimo after success (login page). No playbook / trend / visual-modality copy in this story.

CONTEXT has no dedicated logout lemma. SPEC §3 is the product term: **cerrar sesión**. EN UI: log out / Log out (story title). Do not ship _Evitar_ terms in product copy: **admin**, administrador, staff, prestador (as product role), usuario final. Do not use “sign out everywhere” as a product label in this story.

Note (not a US-14.3 veto): parent `plan/USER_STORIES.md` Authentication blurb still says “admin activation UI”. Do not copy that into this story’s CONTRACT, SECURITY, or EN/ES strings.

### Recommended action

Proceed to **SECURITY.md** (security-architect), then CONTRACT.md.

CONTRACT freeze items (non-negotiable for alignment):

1. POST-only Server Action (CSRF origin check). No GET `/logout`, no GET form, no public GET allowlist for logout.
2. User-scoped `signOut` **then** expire `sb-*` with matching host-only flags. Replay of pre-logout cookie is unauthenticated. Never service-role on this action.
3. Scope = this device / this session. No “sign out all devices” UI. US-14.4 keeps global on password reset.
4. Success → `/login` (optional `locale` already on the request). No `next` of the page they left. Optional `?loggedOut=1` only if SECURITY freezes it as non-oracle; default plain `/login`.
5. Same action on product header island and `/pending`. Do not call `requireActive()` / `requireOperator()`. Idempotent if already logged out.
6. `AppHeader` stays a Server Component; client island is the control only. Identity never fetched in the browser.
7. No app write to `neuramark_clients`. No new DB objects. No tokens / `role` / `active` / `client_id` in the action body.
8. Reuse US-14.5 guards and existing `no-store`. Verify Back; do not fork middleware.
9. `AUTH_DEV_FALLBACK`: expire cookies + redirect; do not persist `DEV_USER`.
10. EN/ES; ES product copy **cerrar sesión**. PrimeReact. Explicit out of scope: Path A / recovery landings, RBAC/activation UI, Stories IG, Interview/Ficha/visual prefs, global sign-out UI.
