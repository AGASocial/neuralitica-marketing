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
- [ ] Block spend endpoints for `active=false` (coordinate with US-14.5 guard pattern)

## DB checklist

- [x] Migration: `neuramark_clients` (auth_user_id, email, display_name, preferred_locale, active, role, created_at)
- [x] Migration: `neuramark_client_role` enum or CHECK (`client` | `operator`)
- [x] Migration: `neuramark_auth_attempts` (ip_hash, email_hash, action, attempted_at)
- [x] Indexes as needed for rate-limit lookups

## Gates (orchestrator)

- [x] SPEC-REVIEW.md
- [x] SECURITY.md
- [x] CONTRACT.md + FE signoff
- [ ] VALIDATION.md PASS
- [ ] QA.md
