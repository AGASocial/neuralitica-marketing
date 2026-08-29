# QA Report — US-16.1 Curate evergreen Reel format catalog (Playbook)

**Story:** US-16.1 — Curate evergreen Reel format catalog (Playbook)  
**Branch:** `feature/US-16.1-content-playbook`  
**Commits reviewed:** `5792a63` (migration + operator mutations), `bab3047` (`getPlaybookForAgents`), `d78a699` (Operator Playbook CRUD UI), `c9fc88b` (SPEC / SECURITY / CONTRACT gates)  
**Date:** 2026-08-29  
**Reviewer:** qa-engineer  
**Contract:** Frozen (FE signoff 2026-08-29)  
**SECURITY:** APPROVE WITH CONDITIONS (binding)

---

## Verdict: APPROVE WITH NOTES

Implementation meets the frozen US-16.1 CONTRACT and SECURITY bar: global `neuramark_content_playbooks` table with deny-by-default RLS and five V1 seed formatos; Operator-gated Server Actions for create / update / archive with Zod `.strict()` writes, slug immutability, optimistic `expectedVersion`, archive-only lifecycle; RSC loaders and `/operator/playbook` UI with EN/ES chrome; server-only `getPlaybookForAgents()` returning active formatos with `ejemplo_referencia` stripped; no public Route Handlers or LLM/video jobs.

**CLOSE:** **Yes** — 0 Critical, 0 High; story may close after PO AC checkoff in `plan/USER_STORIES.md`.

---

## Severity counts

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 3 |

---

## Findings

### Low — `/operator` routes missing explicit `Cache-Control: no-store` headers

**File:** `next.config.ts:7-56`

**What:** Protected product routes (`/dashboard`, `/profile`, `/settings`, etc.) set `Cache-Control: no-store` in `headers()`. `/operator` and `/operator/:path*` are absent. Operator Playbook pages rely on `export const dynamic = "force-dynamic"` (`app/(app)/operator/layout.tsx:7`, playbook pages) only.

**Why it matters:** SECURITY freeze and CONTRACT require Operator Playbook responses not to be cached publicly (`SECURITY.md` item 14; `CONTRACT.md` frozen decision #1). `force-dynamic` prevents static prerender but does not mirror the explicit header pattern used elsewhere (US-14.5 follow-on).

**Fix direction:** Add `source: "/operator"` and `source: "/operator/:path*"` with `Cache-Control: no-store` to `next.config.ts`.

---

### Low — No automated test for non-operator **page** gate on loaders

**Files:** `lib/playbook/load-playbook-list-for-operator.ts:19`, `lib/playbook/load-playbook-formato-for-operator.ts:25`, `app/(app)/operator/layout.tsx:14`

**What:** Unit tests assert non-operator **mutations** return `FORBIDDEN` without DB I/O (`playbook.test.ts:238-270`). SECURITY checklist also requires non-operator page gate → 403 (`SECURITY.md:117`). No isolated test throws `requireOperator("page")` 403 from a loader or documents layout gate behavior.

**Why it matters:** Layout + loader both call `requireOperator("page")` (defense in depth), so runtime behavior is likely correct. Missing test leaves regressions undetected if a future page drops the loader gate and relies on layout alone.

**Fix direction:** Add a mocked loader test (or extend `session-guards.test.ts`) asserting `requireOperator("page")` rejection propagates before Supabase I/O.

---

### Low — ESLint `no-require-imports` in playbook test modules

**Files:** `lib/playbook/playbook.test.ts:258,282,311,345,378,411,461`, `lib/playbook/get-playbook-for-agents.test.ts` (similar pattern)

**What:** `npm run lint` reports `@typescript-eslint/no-require-imports` errors in playbook tests (dynamic `require()` for module mocking).

**Why it matters:** Pre-existing repo pattern for Node test harnesses (same class as `lib/media/media-assets.test.ts`). Tests pass via `npx tsx --test`. No production impact.

**Fix direction:** Optional — align with project test lint policy (disable rule for `*.test.ts` or migrate mocks to ESM `import()`).

---

## Security focus review

| Area | Result | Evidence |
|------|--------|----------|
| Operator gate on mutations (first await) | **Pass** | `requireOperator("handler")` before validation/DB in `create-playbook-formato.ts:39`, `update-playbook-formato.ts:69`, `archive-playbook-formato.ts:67` |
| Operator gate on reads | **Pass** | `requireOperator("page")` in `operator/layout.tsx:14`, `load-playbook-list-for-operator.ts:19`, `load-playbook-formato-for-operator.ts:25` |
| No public CRUD Route Handler | **Pass** | No `app/api/playbook*`; tests assert path absent (`playbook.test.ts:476-478`, `get-playbook-for-agents.test.ts:100-105`) |
| `getPlaybookForAgents` server-only | **Pass** | `import "server-only"` + MUST-import comment (`get-playbook-for-agents.ts:1-12`); not imported from `components/playbook/**` |
| Agent DTO strip | **Pass** | `map-playbook-rows-for-agents.ts:15-35`; tests prove `ejemplo_referencia` / `version` absent (`playbook.test.ts:224-234`, `439-470`) |
| Zod `.strict()` on writes | **Pass** | Contract tests + `findForbidden*PlaybookKeys` for privilege fields (`create-playbook-formato.ts:47-56`, `playbook.test.ts:190-214`) |
| Slug immutability | **Pass** | Update schema excludes slug; `FORBIDDEN_PLAYBOOK_UPDATE_KEYS` includes `slug` (`map-playbook-row.ts:141-144`) |
| Archive-only lifecycle | **Pass** | Archive sets `active=false`, `archived_at`; no DELETE action; agent query filters `active=true` AND `archived_at IS NULL` (`get-playbook-for-agents.ts:31-32`) |
| Optimistic concurrency | **Pass** | Stale `expectedVersion` → `VERSION_CONFLICT` (`update-playbook-formato.ts:119-121`, `playbook.test.ts:325-356`) |
| Global catalog — no `client_id` | **Pass** | Migration has no tenant column (`20260829240000_neuramark_content_playbooks.sql:4-27`) |
| RLS deny-by-default | **Pass** | RLS enabled, zero policies (`20260829240000_neuramark_content_playbooks.sql:38-40`) |
| No browser Supabase in Playbook UI | **Pass** | Grep: no `@supabase` under `components/playbook/**` |
| XSS — plain text catalog fields | **Pass** | No `dangerouslySetInnerHTML` under `components/playbook/**` |
| Logging — no full payloads | **Pass** | Errors log slug/code only (`map-playbook-rows-for-agents.ts:47-48`, `create-playbook-formato.ts:76-79`) |
| Five seed slugs | **Pass** | Migration inserts `tip-rapido`, `antes-despues`, `objecion`, `oferta-local`, `mito-vs-realidad` (`20260829240000_neuramark_content_playbooks.sql:50-136`) |
| EN/ES Operator chrome | **Pass** | `messages/en.json` + `messages/es.json` `playbook.*` sections |
| No LLM / video / Trend in scope | **Pass** | Grep: no LLM calls under `lib/playbook/**` |

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/playbook/playbook.test.ts lib/playbook/get-playbook-for-agents.test.ts` | **23/23 pass** |
| `npm run lint` | **Exit 1** — ESLint `no-require-imports` in playbook test files (pre-existing test pattern); no lint issues in production Playbook modules |
| `AUTH_DEV_FALLBACK= NODE_ENV=production npm run build` | **Pass** — Next.js 15.5.20; `/operator/playbook` routes compile as dynamic (`ƒ`) |
| `npm run build` (reviewer local `.env` with `AUTH_DEV_FALLBACK=true`) | **Failed** at page-data collection — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local env; **not introduced by US-16.1**). TypeScript compile succeeded before failure |
| Live browser E2E (Operator CRUD flow) | **Not run** |
| Live Supabase migration apply + seed verification | **Not run** |

---

## What was not covered

- Live browser verification of list / create / edit / archive UX, toasts, and version-conflict reload flow
- End-to-end Operator CRUD against a real Supabase instance (unit mocks only)
- Middleware redirect behavior for non-operator session hitting `/operator/playbook` (layout gate inferred from code + US-14.5 continuity)
- Catalog content i18n (V1 Spanish-first seed is intentional per CONTRACT; Operator UI chrome is EN/ES)

---

## AC / CONTRACT mapping (summary)

| USER_STORIES AC | QA result |
|-----------------|-----------|
| Operator list / create / edit / archive | **Pass** — routes, loaders, Server Actions, UI |
| SPEC payload fields + seed formatos | **Pass** — Zod schema + migration |
| `getPlaybookForAgents()` active-only, stripped | **Pass** — helper + tests |
| Slug immutable; duplicate rejected | **Pass** — schema + `DUPLICATE_SLUG` on `23505` |
| EN/ES copy | **Pass** — UI chrome; seed ES-first per freeze |
| Operator-only 403 | **Pass** — `requireOperator` on layout, loaders, mutations |
| [SEC] items | **Pass** — see security table above |
