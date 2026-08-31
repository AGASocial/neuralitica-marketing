# US-13.1 — Record basic post metrics manually

**Priority:** P1  
**Depends on:** US-12.2 ✅ (published calendar slots · `publishedAt` · `assembledReelId` in DTO)  
**Acceptance criteria:** `plan/USER_STORIES.md` § US-13.1 (source of truth — do **not** redefine; do **not** check off in PREP)  
**Implementers:** **nextjs-backend** (DDL migration, `upsertReelMetrics`, Zod, published gate, edit window, calendar DTO delta, tests) + **nextjs-frontend** (Sidebar metrics section, InputNumber form, i18n). Per `docs/development/AGENT-ROSTER.md` Phase 5 Operación semanal. **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.  
**Canonical terms:** **Calendario de contenido** · **Operator** · **Reel** · **Ensamblado** · **publicado** · **métricas**.

**Reference:** [US-13.1 README](./README.md) · [US-12.2 CONTRACT](../US-12.2/CONTRACT.md) · [US-12.1 CONTRACT](../US-12.1/CONTRACT.md) · `lib/contracts/calendar.ts` · `components/calendar/OperatorCalendarView.tsx`

## Out of scope (do not implement here)

- Instagram Insights / Graph API auto-import.
- Separate `/operator/metrics` page or route.
- Strategy agent prompt / US-13.2 aggregation.
- Cliente metrics surfaces.
- Charts, dashboards, CSV import.
- Operator override of 7-day edit window.
- Metrics on non-published Reels.
- `client_id` on mutation input.
- RBAC beyond `requireOperator()`.

## Scope split

| Concern | Owner |
|---------|--------|
| DDL `neuramark_reel_metrics` | **DB** / **BE** |
| `upsertReelMetrics` Server Action + published gate + edit window | **BE** |
| Integer Zod validation + upper bound | **BE** |
| Calendar DTO `metrics` snapshot + `editable` flag | **BE** (+ FE consume) |
| Sidebar metrics section on published slots | **FE** |
| PrimeReact `InputNumber` form + read-only expired state | **FE** |
| EN/ES `calendar.metrics.*` | **FE** |
| `[SEC]` Operator 403 + published-only + window + bounds tests | **BE** |

## Implementer routing

| Agent | Owns |
|-------|------|
| **nextjs-backend** | Migration · `lib/contracts/reel-metrics.ts` · `upsertReelMetrics` · core helper · calendar read join · security/unit tests |
| **nextjs-frontend** | Sidebar metrics panel in `OperatorCalendarView` (or small child) · form gating · i18n · week refresh after save |

---

## PO decisions (freeze in CONTRACT unless SECURITY / SPEC vetoes)

| Topic | Decision |
|-------|----------|
| Branch | **`feature/US-13.1-reel-metrics`** |
| Table | **`neuramark_reel_metrics`** — UNIQUE `assembled_reel_id` |
| UI | **Calendar Sidebar section** when `pipelineStatus === 'published'` — no new route |
| Action | **`upsertReelMetrics`** — new Server Action |
| Input authority | **`assembledReelId`** + five counters — **no** `slotId`, **no** `client_id` |
| Published gate | Calendar slot `publish_status = published` linked via `reel_script_id` |
| Edit window | **`published_at + 7 days`** (configurable `REEL_METRICS_EDIT_WINDOW_DAYS`) |
| Fields | `views`, `likes`, `comments`, `saves`, `dms` — non-negative integers |
| Read | **`metrics` on `CalendarSlotDetailDto`** — single-fetch Sidebar |
| Auth | **`requireOperator("handler")`** → 403 |

### Action sketch (CONTRACT freezes names)

```ts
// Server Action — Operator only; body strict; NO client_id
upsertReelMetrics({
  assembledReelId,
  views,
  likes,
  comments,
  saves,
  dms,
}): Promise<UpsertReelMetricsResult>;

// Success lean:
// { ok: true, metrics: ReelMetricsDto }

// Error codes (sketch — CONTRACT freezes):
// FORBIDDEN | FORBIDDEN_FIELDS | VALIDATION_ERROR | NOT_FOUND |
// NOT_PUBLISHED | EDIT_WINDOW_EXPIRED | RATE_LIMITED | INTERNAL_ERROR
```

---

## Contract-first checklist (before BUILD)

- [x] `SPEC-REVIEW.md` — spec-guardian
- [x] `SECURITY.md` — security-architect
- [x] `CONTRACT.md` frozen — Zod in `lib/contracts/reel-metrics.ts` + calendar DTO delta · **Reviewed by FE** approved — 2026-08-31
- [ ] Open questions in README § resolved in CONTRACT

---

## Frontend (nextjs-frontend)

**Consumer:** `/operator/calendar` · `components/calendar/OperatorCalendarView.tsx` (Sidebar)

- [ ] Add **metrics section** in Sidebar when `pipelineStatus === 'published'` and `assembledReelId` present.
- [ ] Five **`InputNumber`** fields (integer, min 0, max per CONTRACT); labels EN/ES.
- [ ] Pre-fill from `selectedSlot.metrics` when present; default zeros when null.
- [ ] **Save** button calls **`upsertReelMetrics`**; disabled/hidden when `metrics.editable === false` or window expired.
- [ ] Read-only state after edit window: show values + “window expired” copy; no Save.
- [ ] Show **`recordedAt`** when metrics exist (formatted, localized).
- [ ] On success: toast/inline success + **refresh** week via `getOperatorCalendarForWeek`.
- [ ] Field + server error display (`notPublished`, `editWindowExpired`, validation, forbidden).
- [ ] i18n EN + ES under **`calendar.metrics.*`**.
- [ ] Do **not** show metrics form for non-published pipeline statuses.
- [ ] Do **not** add a new route/page for metrics.

---

## Backend (nextjs-backend)

**Consumers:** Operator calendar Sidebar (FE above); US-13.2 will aggregate rows later.

- [ ] Migration **`neuramark_reel_metrics`**: `id`, `client_id`, `assembled_reel_id` (UNIQUE FK), five int columns, `recorded_at`, `created_at`, `updated_at`; RLS deny-by-default.
- [ ] Zod: `upsertReelMetricsInputSchema`, `reelMetricsDtoSchema`, result union in **`lib/contracts/reel-metrics.ts`**.
- [ ] Constants: `REEL_METRICS_EDIT_WINDOW_DAYS` (default 7), `REEL_METRICS_MAX_VALUE`, forbidden authority keys.
- [ ] Implement **`upsertReelMetrics`**: `requireOperator("handler")` first → 403; `.strict()` input.
- [ ] Load `neuramark_assembled_reels` by `assembledReelId`; 404 if missing.
- [ ] **Published gate:** verify linked calendar slot `publish_status = published`; else `NOT_PUBLISHED`.
- [ ] **Edit window:** compare `now()` to slot `published_at + REEL_METRICS_EDIT_WINDOW_DAYS`; else `EDIT_WINDOW_EXPIRED`.
- [ ] Validate counters: non-negative integers ≤ max bound.
- [ ] UPSERT metrics row; set `client_id` from assembled reel row; bump `recorded_at` on write.
- [ ] Extend **`getOperatorCalendarForWeek`** mapper: attach `metrics` + `editable` on published slots with `assembledReelId`.
- [ ] Rate limit (lean 30/hour per operator — match CONTRACT).
- [ ] Unit/security tests: non-operator 403; non-published reject; expired window reject; bounds validation; happy path upsert + update; ownership via assembled reel; forbidden keys.

---

## Database (nextjs-backend / migrations)

- [ ] New migration file (timestamp after US-12.2 publish-metadata migration): **`CREATE TABLE neuramark_reel_metrics`** only.
- [ ] Columns: `assembled_reel_id uuid NOT NULL UNIQUE`, `client_id uuid NOT NULL`, `views`, `likes`, `comments`, `saves`, `dms` (integer NOT NULL, ≥ 0), `recorded_at timestamptz NOT NULL`.
- [ ] FK `assembled_reel_id` → `neuramark_assembled_reels(id)` ON DELETE CASCADE.
- [ ] FK `client_id` → `neuramark_clients(id)`.
- [ ] Optional index `neuramark_reel_metrics_client_recorded_idx` on `(client_id, recorded_at DESC)` for US-13.2 lean.
- [ ] `updated_at` trigger via existing `neuramark_set_updated_at()` pattern.
- [ ] No RLS policies (deny-by-default / service-role Node only).
- [ ] Comment on table noting US-13.1 manual metrics + US-13.2 consumer.

---

## Dependencies and sequence

```text
US-12.2 CLOSED
    → PREP (this) → SPEC-REVIEW → SECURITY → CONTRACT (+ FE signoff)
    → BE migration + action + calendar DTO join (can land first)
    → FE Sidebar metrics against frozen contract (parallel after CONTRACT)
    → VALIDATION → QA → CLOSE
    → unblocks US-13.2
```

| Gate | Owner |
|------|-------|
| SPEC-REVIEW | spec-guardian |
| SECURITY | security-architect |
| CONTRACT | nextjs-backend; FE reviews |
| BUILD BE | nextjs-backend |
| BUILD FE | nextjs-frontend |
| VALIDATION | requirements-validator |
| QA | qa-engineer |
| CLOSE | product-owner (AC check-off only after validator) |

---

## Security checklist (for security-architect — expand in SECURITY.md)

- [ ] `requireOperator` first; Cliente → 403; no side effects before gate.
- [ ] Published-only enforced in handler (not FE-only).
- [ ] 7-day edit window enforced in handler from `published_at`.
- [ ] Integer bounds enforced server-side (non-negative + max).
- [ ] No `client_id` authority in input; tenancy from assembled reel row.
- [ ] `assembled_reel_id` ownership verified (reel exists; `client_id` denormalized on insert from reel).
- [ ] DTO allowlist for metrics fields; no injection vectors (integers only).
- [ ] Rate limit decision recorded.

---

## Open questions for CONTRACT (from README)

See [README § Open questions](./README.md#open-questions-for-security--contract--not-prep-blockers) — max value, error codes, multi-slot window, InputNumber UX, zero coalesce, `editable` flag, index, CASCADE, rate limit key.
