# US-14.1 — Sign up with email and password

**Priority:** P0  
**Depends on:** US-X.3 ✅ (`lib/auth/get-current-user.ts` seam exists)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-14.1 (source of truth)

## FE checklist

- [x] Signup page: email, password, confirm password, display name (PrimeReact)
- [x] Client-side validation as presentation only
- [x] Loading / pending / error states
- [x] Post-signup "check your email to confirm" screen
- [x] Post-confirmation "account pending activation" state (shared pattern with US-14.2)
- [x] EN + ES copy in `messages/en.json` and `messages/es.json`
- [x] No Supabase SDK or keys in client bundle

## BE checklist

- [x] Server Action or Route Handler: Supabase Auth signup server-side (email confirmation on)
- [x] Server-side password policy (12–128 chars, common-password list)
- [x] Duplicate email → generic response (no enumeration)
- [x] Create `neuramark_clients` row: `active=false`, `role=client` (never from request)
- [x] `auth_user_id` only from Supabase response; transactional/compensated create
- [x] Rate limit: 5/IP/hour, 15/IP/day via `neuramark_auth_attempts`
- [x] CSRF: Server Action origin check or Route Handler Origin validation
- [x] Password redaction in logs
- [x] Resend confirmation (if in scope): same rate limits as reset
- [x] Duplicate vs confirmation-send failure both return `{ ok: true }` (no enumeration oracle)
- [x] Rate limiter fails closed on `neuramark_auth_attempts` record/count errors
- [x] Duplicate auth errors matched by code/message only (not bare HTTP 422); `weak_password` → PASSWORD_POLICY
- [x] Duplicate path backfills missing `neuramark_clients` row from existing auth user
- [x] Record signup attempts on validation / password-policy failure
- [x] Top-level try/catch on `signUp` and `resendConfirmationEmail` (generic INTERNAL_ERROR)
- [x] Server-only `SITE_URL` for confirmation `emailRedirectTo` (allowlisted origin)
- [x] Block spend endpoints for `active=false` (coordinate with US-14.5 guard pattern) — US-14.5 `requireActive()` shipped; no spend endpoints exist yet

## DB checklist

- [x] Migration: `neuramark_clients` (auth_user_id, email, display_name, preferred_locale, active, role, created_at)
- [x] Migration: `neuramark_client_role` enum or CHECK (`client` | `operator`)
- [x] Migration: `neuramark_auth_attempts` (ip_hash, email_hash, action, attempted_at)
- [x] Indexes as needed for rate-limit lookups
- [x] ENABLE ROW LEVEL SECURITY on `neuramark_clients` and `neuramark_auth_attempts` (deny-by-default; no policies until US-14.5)

## Gates (orchestrator)

- [x] SPEC-REVIEW.md
- [x] SECURITY.md
- [x] CONTRACT.md + FE signoff
- [x] VALIDATION.md PASS WITH NOTES
- [x] QA.md APPROVE WITH CONDITIONS
