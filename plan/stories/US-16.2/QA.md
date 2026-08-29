# QA Report — US-16.2 Publish weekly trend snapshot (manual)

**Story:** US-16.2 — Publish weekly trend snapshot (manual)  
**Branch:** `feature/US-16.2-trend-snapshot`  
**Commits reviewed:** `0ba5821` (SPEC/SECURITY gates) · `d2cd6cd` (CONTRACT) · `3660506` (Operator Trend UI) · `4474fb1` (migration + server actions + tests)  
**Date:** 2026-08-29  
**Reviewer:** qa-engineer  
**Contract:** Frozen (FE signoff 2026-08-29)  
**SECURITY:** APPROVE WITH CONDITIONS (binding)

---

## Verdict: APPROVE WITH NOTES

Implementation meets the frozen US-16.2 CONTRACT and SECURITY bar: global `neuramark_trend_snapshots` with deny-by-default RLS and seed `cold-open-mejor-toma` (`2026-01-05`); Operator-gated Server Actions for publish / add / update / deactivate with Zod `.strict()` writes, slug immutability, Playbook slug validation via `getPlaybookForAgents()` only, ISO-Monday `week_start` enforcement, and `fuente: manual` server merge; RSC loaders and `/operator/trends` UI with EN/ES chrome; server-only `getTrendSnapshotForWeek()` returning active entries with `ejemplo_referencia` stripped; no public Trend Route Handlers.

**CLOSE:** **Yes** — 0 Critical, 0 High; story may close after PO AC checkoff in `plan/USER_STORIES.md`.

---

## Severity counts

| Severity | Count |
|----------|------:|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 4 |

---

## Findings

### Medium — Entry read-modify-write without optimistic concurrency

**Files:** `lib/trend/add-trend-entry.ts:87-93` · `lib/trend/update-trend-entry.ts:103-120` · `lib/trend/deactivate-trend-entry.ts:71-90` · `lib/trend/trend-mutation-helpers.ts:93-108`

**What:** Entry CRUD loads the full `entries` jsonb array, mutates in memory, and writes back with a blind `UPDATE`. There is no row version check, `SELECT … FOR UPDATE`, or jsonb merge guard.

**Why it matters:** Two concurrent Operator mutations on the same `week_start` (e.g. simultaneous add táctica) can race: the later write overwrites the earlier append, silently dropping an entry. Blast radius is limited to a single global week row and V1 likely has one Operator, but the pattern is weaker than US-16.1 Playbook `expectedVersion` concurrency.

**Fix direction:** Add optimistic concurrency (e.g. `updated_at` or version column check on `UPDATE … WHERE week_start = $1 AND updated_at = $expected`) or a short DB transaction with row lock; return `VERSION_CONFLICT` on stale write.

---

### Low — `/operator/trends` routes missing explicit `Cache-Control: no-store` headers

**File:** `next.config.ts:7-56`

**What:** Protected routes (`/dashboard`, `/profile`, etc.) set `Cache-Control: no-store` in `headers()`. `/operator` and `/operator/:path*` are absent. Trend pages rely on `export const dynamic = "force-dynamic"` (`app/(app)/operator/layout.tsx:7`, trend pages).

**Why it matters:** CONTRACT frozen decision #1 and SECURITY require Operator Trend responses not to be cached publicly. `force-dynamic` prevents static prerender but does not mirror the explicit header pattern used elsewhere (same carry-forward from US-16.1 QA).

**Fix direction:** Add `source: "/operator"` and `source: "/operator/:path*"` with `Cache-Control: no-store` to `next.config.ts`.

---

### Low — CONTRACT duplicate-array `superRefine` not implemented on write schemas

**File:** `lib/contracts/trend.ts:63-108`

**What:** Frozen CONTRACT `trendEntryCoreSchema` specifies `superRefine` rejecting duplicate values in `modalidades_recomendadas` and `formatos_playbook_compatibles` (CONTRACT.md lines 257–278). Implemented `trendEntryCoreSchema` and `trendEntryCreateInputSchema` accept duplicate array elements.

**Why it matters:** Duplicate Playbook slugs or modalities can be persisted; downstream Strategy slot assignment may behave unpredictably. Data-quality / contract-alignment issue, not a security bypass.

**Fix direction:** Port the CONTRACT `superRefine` blocks onto `trendEntryCreateInputSchema` (and ensure `trendEntryCoreSchema` matches for read validation).

---

### Low — No automated test for non-operator **page** gate on Trend loaders

**Files:** `lib/trend/load-trend-week-list-for-operator.ts:19` · `lib/trend/load-trend-snapshot-for-operator.ts:25` · `app/(app)/operator/layout.tsx:14`

**What:** Unit tests assert non-operator **mutations** return `FORBIDDEN` without DB I/O (`lib/trend/trend.test.ts:276-301`). SECURITY checklist also requires non-operator page gate → 403. No isolated test throws `requireOperator("page")` from a Trend loader.

**Why it matters:** Layout + loaders both call `requireOperator("page")` (defense in depth), so runtime behavior is likely correct. Missing test leaves regressions undetected if a future page drops the loader gate.

**Fix direction:** Add mocked loader test asserting `requireOperator("page")` rejection before Supabase I/O (mirror US-16.1 QA handoff).

---

### Low — CONTRACT automated-test gaps (non-blocking)

**File:** `lib/trend/trend.test.ts`

**What:** CONTRACT automated-test table (CONTRACT.md lines 1116–1133) lists cases not covered: full publish → add → update → deactivate chain; `deactivateTrendEntry` action; `published_at` unchanged on update; explicit `fuente` smuggle rejection code path.

**Why it matters:** Core security paths are covered (operator gate, strict schemas, agent strip, Playbook slug rejection, inactive exclusion). Gaps are regression harness completeness, not missing runtime guards.

**Fix direction:** Extend `trend.test.ts` with isolated mocks for deactivate, upsert `published_at` semantics, and end-to-end mutation chain.

---

## Security focus review

| Area | Result | Evidence |
|------|--------|----------|
| Operator gate on mutations (first await) | **Pass** | `requireOperator("handler")` before validation/DB in `publish-or-update-snapshot.ts:45`, `add-trend-entry.ts:47`, `update-trend-entry.ts:50`, `deactivate-trend-entry.ts:41` |
| Operator gate on reads | **Pass** | `requireOperator("page")` in `operator/layout.tsx:14`, `load-trend-week-list-for-operator.ts:19`, `load-trend-snapshot-for-operator.ts:25` |
| No public CRUD Route Handler | **Pass** | No `app/api/trends*`; test asserts path absent (`trend.test.ts:521-524`) |
| `getTrendSnapshotForWeek` server-only | **Pass** | `import "server-only"` + MUST-import comment (`get-trend-snapshot-for-week.ts:1-12`); no import from `components/**` or `app/**` |
| Agent DTO strip (`ejemplo_referencia`, `activo`) | **Pass** | `map-trend-row.ts:68-89`; tests (`trend.test.ts:249-272`, `455-481`) |
| Active-only agent filter | **Pass** | `get-trend-snapshot-for-week.ts:65-68`; test with inactive entry excluded |
| Zod `.strict()` on writes | **Pass** | Contract tests (`trend.test.ts:214-236`); privilege slug smuggle → `FORBIDDEN_FIELDS` (`377-394`) |
| Slug immutability | **Pass** | Update schema omits slug; handler rejects smuggled slug (`update-trend-entry.ts:64-70`) |
| Soft deactivate only | **Pass** | `deactivate-trend-entry.ts` sets `activo: false`; no DELETE path |
| `fuente: manual` on V1 writes | **Pass** | `mergeTrendEntryCreate` forces `manual` (`trend-mutation-helpers.ts:31-35`); `fuente` absent from create input schema |
| Playbook slug validation path | **Pass** | `validate-playbook-slugs.ts` imports `getPlaybookForAgents()` only; test (`trend.test.ts:527-535`, `397-437`) |
| ISO Monday `week_start` | **Pass** | `trendWeekStartSchema` + publish rejection test (`trend.test.ts:244-247`, `361-374`) |
| Global snapshot — no `client_id` | **Pass** | Migration has no tenant column (`20260829250000_neuramark_trend_snapshots.sql:4-17`) |
| RLS deny-by-default | **Pass** | RLS enabled, zero policies (`20260829250000_neuramark_trend_snapshots.sql:27-29`) |
| No browser Supabase in Trend UI | **Pass** | Grep: no `@supabase` under `components/trend/**` |
| XSS — plain text táctica fields | **Pass** | No `dangerouslySetInnerHTML` under `components/trend/**` |
| Logging — codes/slugs only | **Pass** | Error logs use `code`, `weekStart`, slug context; no full jsonb bodies |
| Seed `cold-open-mejor-toma` | **Pass** | Migration payload matches CONTRACT freeze (`20260829250000_neuramark_trend_snapshots.sql:39-72`) |
| EN/ES Operator chrome | **Pass** | `messages/en.json` + `messages/es.json` `trend.*` sections |
| No LLM / scraping / Strategy jobs | **Pass** | No agent jobs or scraping paths under `lib/trend/**` |

**Note on `ejemplo_referencia`:** Frozen CONTRACT/SECURITY allow Operator edit forms to include `ejemplo_referencia` after `requireOperator()` (serialized to Client Component props). Agent DTO and non-Operator paths omit it. USER_STORIES `[SEC]` wording (“client-session responses”) is narrower than the frozen CONTRACT; implementation follows CONTRACT.

---

## Checks run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/trend/trend.test.ts` | **17/17 pass** |
| `npm run lint` | **Exit 1** — ESLint `no-require-imports` in `lib/trend/trend.test.ts` (pre-existing test pattern); unused imports in `publish-or-update-snapshot.ts:17-18` (warnings only). No lint issues in production Trend modules beyond unused-import warnings. |
| `AUTH_DEV_FALLBACK= npm run build` | **Pass** — Next.js 15.5.20; `/operator/trends` routes compile as dynamic (`ƒ`) |
| `npm run build` (local `.env` with `AUTH_DEV_FALLBACK=true`) | **Failed** at page-data collection — `AUTH_DEV_FALLBACK must not be set when NODE_ENV=production` (local env; **not introduced by US-16.2**) |
| Live browser E2E (Operator Trend CRUD) | **Not run** |
| Live Supabase migration apply + seed verification | **Not run** |

---

## What was not covered

- Live browser verification of week list, publish week, add/edit/deactivate táctica, toasts, and inactive read-only state
- End-to-end Operator CRUD against a real Supabase instance (unit mocks only)
- Middleware redirect for non-operator session hitting `/operator/trends` (layout gate inferred from code + US-14.5 continuity)
- Concurrent Operator edit race reproduction (theoretical; see Medium finding)
- Catalog táctica content i18n (V1 Spanish-first seed is intentional per CONTRACT; Operator UI chrome is EN/ES)

---

## AC / CONTRACT mapping (summary)

| USER_STORIES AC | QA result |
|-----------------|-----------|
| Operator publish/update snapshot per `week_start` | **Pass** — `publishOrUpdateSnapshot`, UNIQUE `week_start` |
| SPEC táctica fields + seed `cold-open-mejor-toma` | **Pass** — Zod schemas + migration seed |
| `getTrendSnapshotForWeek()` active-only, safe empty | **Pass** — server-only helper + tests |
| Playbook slug validation on write | **Pass** — `validateFormatosPlaybookCompatibles` |
| EN/ES copy | **Pass** — `messages/en.json`, `messages/es.json` |
| Operator-only 403 | **Pass** — `requireOperator` on loaders + mutations |
| [SEC] Zod on write; `prioridad_semana` 1–5 | **Pass** |
| [SEC] server-only agent path; no scraping | **Pass** |
| [SEC] `ejemplo_referencia` absent from agent DTO | **Pass** (Operator edit form inclusion per frozen CONTRACT) |
| [SEC] untrusted input at LLM time | **N/A** — storage story; containment deferred US-4.1+ |
