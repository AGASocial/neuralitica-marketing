## Spec Review — US-13.1

### Verdict: GAPS

US-13.1 intent — **Operator**-only **Métricas lite** V1 on the existing **Calendario de contenido** Sidebar: enter five non-negative integer counters (views, likes, comments, saves, DMs) on **publicado** **Reels** only; persist one row per **Ensamblado** in `neuramark_reel_metrics`; enforce **published-only**, **7-day edit window** (anchored to slot `published_at`), and `requireOperator("handler")` server-side; unlock **US-13.2** strategy prompt injection — is **directionally aligned** with SPEC §3 S3.M15 Metrics Lite (“Operator carga views/likes/comments/saves/DMs”), SPEC §2 **Operator-only** surfaces, USER_STORIES § US-13.1 AC (all five rows), frozen **US-12.2** handoff (`publish_status = published`, `publishedAt`, `assembledReelId` on calendar DTO), **US-12.1** multi-client Operator calendar pattern, CONTEXT canon **Métricas lite**, and ADR boundaries (no Instagram Insights API; no Graph analytics; no strategy injection in this story).

**No SPEC amendment required.** **No CONFLICT.** Remaining items are **documentation reconciliation** (SPEC P2 label vs sprint P1, USER_STORIES DB row / [SEC] AC wording vs Operator multi-client model), **CONTRACT/SECURITY freeze** gaps (max bounds, error codes, multi-slot window calc, orphan metrics), and **CONTEXT glossary** notes — not product-direction drift. Phase A closes full US-13.1 AC per PO binding note.

**Upstream dependencies satisfied:** US-12.2 ✅ (`published_at`, `publish_status = published`, `assembledReelId` in `CalendarSlotDetailDto`, mark-published Sidebar pattern) · US-12.1 ✅ (`/operator/calendar`, Sidebar shell, Operator cross-client read) · US-14.x `requireOperator()` floor.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Low** | **SPEC §3 P2 module label vs USER_STORIES / Sprint 7 P1.** SPEC S3.M15 lists Metrics Lite as **P2**; USER_STORIES module header and Sprint 7 schedule US-13.1 as **P1**. Behavior unchanged — sprint promotion, not scope reduction. Same precedent as US-12.1/US-12.2. | SPEC §3 S3.M15; USER_STORIES § US-13.1; README § SPEC alignment | **Document precedence:** `plan/USER_STORIES.md` + frozen PREP govern BUILD. Optional PO amend SPEC §3 P2→P1 note on next SPEC edit — **not a BUILD blocker**. |
| **Low** | **USER_STORIES DB row stale — shorthand table name, omits `client_id` and `neuramark_` prefix.** Row lists `reel_metrics`; PREP uses **`neuramark_reel_metrics`** with `client_id` denormalized for US-13.2 tenancy. | USER_STORIES US-13.1 DB row; README PO #1 | CONTRACT uses full DDL; amend USER_STORIES DB row on next PO edit. |
| **Low** | **USER_STORIES [SEC] AC wording vs Operator multi-client model.** AC says “scoped to Reels of the **current client** (client-supplied `assembled_reel_id` verified for ownership).” PREP follows US-12.x trust model: Operator may write metrics for **any** tenant’s published Reel; `assembledReelId` is operator action input; `client_id` resolved server-side from assembled reel row — **never** from request. Intent (verify reel exists + tenancy from row) is correct; wording is stale. | USER_STORIES AC row 5 [SEC]; README PO #3 · #9; US-12.1 SECURITY_BASELINE § (e) | **CONTRACT:** freeze “ownership” = assembled reel exists + `client_id` denormalized from reel; Operator cross-tenant writes **allowed**; **not** scoped to session `getCurrentUser().client_id`. Amend USER_STORIES AC on PO edit. |
| **Low** | **USER_STORIES BE row says `POST` metrics; PREP uses Server Action `upsertReelMetrics`.** Stack convention (AGENTS.md) prefers Server Actions for UI-coupled mutations. | USER_STORIES owner table; README PO #11; AGENTS.md | CONTRACT names `upsertReelMetrics` Server Action; no REST route required. |
| **Low** | **Open questions not frozen until CONTRACT.** Max value (99_999_999), `EDIT_WINDOW_EXPIRED` vs `FORBIDDEN`, multi-slot `published_at` window (latest DESC), zero coalesce, `editable` server-computed, optional index for US-13.2, CASCADE on assembled reel delete, rate limit key — listed in README § Open questions. | README § Open questions; TASKS § Open questions for CONTRACT | **CONTRACT** must freeze each; lean PO resolutions acceptable if SECURITY does not veto. |
| **Low** | **Orphan metrics when calendar slot hard-deleted.** US-12.1 sync orphan DELETE may drop published calendar row while metrics row survives. README documents: no Sidebar write path; US-13.2 aggregate still valid. | US-12.2 CONTRACT § sync orphan; README PO #17 · handoffs | **CONTRACT:** document orphan behavior; `NOT_PUBLISHED` when no live published slot links; no DELETE cascade from slot in V1. |
| **Info** | **Published-only gate — ALIGNED with SPEC Metrics Lite and US-12.2 handoff.** Write-time join: require ≥1 `neuramark_content_calendar_slots` row with `publish_status = published` linking via `reel_script_id`. FE visibility on `pipelineStatus === 'published'` is UX only; handler rejects with `NOT_PUBLISHED`. | SPEC §3 S3.M15; USER_STORIES AC rows 1 & 4 [SEC]; README PO #4 | SECURITY + CONTRACT: freeze join path; VALIDATION proves non-published fails in handler. |
| **Info** | **7-day edit window — ALIGNED with USER_STORIES AC.** Window anchored to **`published_at`** on linked published slot (US-12.2), not `recorded_at`. Configurable `REEL_METRICS_EDIT_WINDOW_DAYS` (default 7). Initial create also within window (PO #5 — stricter than AC text but consistent with “edit allowed within 7 days”). After expiry: read-only UI + handler `EDIT_WINDOW_EXPIRED`. | USER_STORIES AC row 2; README PO #5 | CONTRACT freeze constant + error code; FE disables Save when `metrics.editable === false`. |
| **Info** | **Operator-only mutation — ALIGNED.** `upsertReelMetrics` with `requireOperator("handler")` first; zero side effects on 403. No Cliente metrics surfaces; no `client_id` / `clientId` on input. | SPEC §2 Operator-only actions; README PO #9; USER_STORIES AC row 3 | SECURITY reaffirm forbidden authority keys; CONTRACT strict `.strict()` input. |
| **Info** | **Five integer counters — ALIGNED with SPEC and CONTEXT Métricas lite.** views, likes, comments, saves, dms — non-negative integers with sane upper bound; no floats, no free-text metric fields. Avoids “analytics avanzados” product promise. | SPEC §3 S3.M15; CONTEXT **Métricas lite**; USER_STORIES AC row 4 [SEC] | CONTRACT freeze Zod + `REEL_METRICS_MAX_VALUE`; DB integer columns. |
| **Info** | **Calendar Sidebar UI — ALIGNED with US-12.x + DESIGN continuity.** Metrics section on existing `/operator/calendar` Sidebar when published + `assembledReelId`; no separate `/operator/metrics` route. Single-fetch pattern: extend `CalendarSlotDetailDto` with optional `metrics` snapshot. | US-12.2 README handoff; README PO #2 · #8; SPEC §3 P2 Content Calendar pattern | CONTRACT delta on `lib/contracts/reel-metrics.ts` + calendar DTO import; no new page. |
| **Info** | **US-13.2 handoff — ALIGNED.** Stable `neuramark_reel_metrics` keyed by `assembled_reel_id` with `client_id`, counters, `recorded_at`; join path assembled reel → script → strategy **tema**/pillar for ~4-week aggregate injection (US-13.2 / SPEC §3 “System inyecta resumen ~4 semanas en siguiente Estrategia”). Optional index `(client_id, recorded_at DESC)` supports aggregate. No prompt work in US-13.1. | SPEC §3 S3.M15; USER_STORIES US-13.2; README PO #16 | Do not implement aggregation or strategy injection here. |
| **Info** | **Scope out — ALIGNED with SPEC out-of-scope and ADRs.** No Instagram Insights / Graph API auto-import; no charts/dashboards; no strategy agent changes; no Cliente metrics; no RBAC UI; no Fly worker / Vercel FFmpeg (ADR-0003 N/A). | SPEC §1 fuera de alcance; README § Scope out; ADR-0002 | BUILD grep: no integrations-engineer / content-agents-engineer scope. |
| **Info** | **NFR / stack — ALIGNED.** `neuramark_*` prefix; RLS deny-by-default; multi-tenant `client_id` on metrics row; EN/ES `calendar.metrics.*`; nextjs-backend + nextjs-frontend only. | SPEC §5–§6; AGENTS.md; TASKS implementer routing | SECURITY owns rate limit bucket (`reel_metrics_upsert` lean). |

**Gap count:** **6 Low** (documentation / CONTRACT freeze) · **7 Info** (aligned — document in CONTRACT) · **0 Medium** · **0 High** · **0 CONFLICT**

**SPEC blockers:** none. **ADR breaches:** none.

---

### Focus areas (binding assessment)

| Focus | Assessment |
|-------|------------|
| **Metrics Lite P2 in SPEC vs sprint P1** | **GAPS (documentation)** — sprint promotion per USER_STORIES + Sprint 7; full Phase A scope unchanged; same precedent as US-12.x. USER_STORIES/PREP govern BUILD. |
| **Published-only gate** | **ALIGNED** — server-side join to `publish_status = published` calendar slot via `reel_script_id`; FE gate insufficient alone; satisfies AC rows 1 & 4 [SEC]. |
| **7-day edit window** | **ALIGNED** — `published_at + REEL_METRICS_EDIT_WINDOW_DAYS` (default 7); configurable server-side; handler + read-only UI after expiry; satisfies AC row 2. |
| **US-13.2 handoff** | **ALIGNED** — persistence only; stable schema + join path for theme/pillar aggregate and ~4-week recency; no strategy prompt injection in this story. |
| **CONTEXT _Evitar_ violations** | **None blocking** in README/TASKS — see Terminology section below. |

---

### Terminology violations (CONTEXT)

**None blocking** in README/TASKS (uses **Calendario de contenido**, **Operator**, **Cliente**, **Reel**, **Ensamblado**, **publicado**, **métricas** / Metrics Lite; explicitly avoids full analytics stack vocabulary as product promise, admin/staff, client-supplied `client_id` as authority, free-text metric fields).

**CONTRACT / FE i18n must enforce:**

| Prefer (Operator copy) | _Evitar_ |
|------------------------|----------|
| **Métricas lite** / **métricas** | analytics avanzados (product promise) |
| **Calendario de contenido** | separate “metrics dashboard” as primary surface |
| **Operator** / **Cliente** | admin, administrador, staff |
| **publicado** (calendar slot state) | implying auto-import from Instagram Insights |
| **Ensamblado** | assembled reel (primary ES domain noun) |

**English AC source** (“Record basic post metrics manually”) — map to canonical ES/EN in `calendar.metrics.*`.

**Undefined in CONTEXT canon (non-blocking):** disambiguation between manual **métricas** entry vs future Instagram Insights auto-import — README Scope out covers; recommend PO note when editing CONTEXT if Insights story is scheduled.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-13.1 SECURITY.md | **Yes — next gate** | `requireOperator` first; published-only handler; 7-day window handler; integer bounds; no `client_id` authority; Operator cross-tenant write model; rate limit. |
| US-13.1 CONTRACT.md | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| `upsertReelMetrics` | **Yes — all AC** | Strict input; published gate; edit window; UPSERT semantics; error envelope. |
| DDL migration | **Yes — persistence** | `neuramark_reel_metrics` with UNIQUE `assembled_reel_id`. |
| Calendar read DTO delta | **Yes — Sidebar UX** | `metrics: ReelMetricsDto \| null` with `editable` server-computed. |
| US-13.2 aggregation | **No — downstream** | Consumes rows only. |
| Instagram Insights API | **No — Phase B / out of scope** | integrations-engineer; separate story. |
| Strategy prompt injection | **No — US-13.2** | content-agents-engineer. |

**SECURITY can proceed?** **Yes.** PREP sufficiently specifies Operator gate, published-only boundary, edit window, and manual-metrics-only scope for **security-architect** to author **SECURITY.md**.

**CONTRACT blockers (freeze before BUILD):**

1. **`upsertReelMetrics`** — strict `{ assembledReelId, views, likes, comments, saves, dms }`; `requireOperator("handler")`; success `{ ok: true, metrics: ReelMetricsDto }`.
2. **Published gate** — calendar slot join; `NOT_PUBLISHED` when no published slot links.
3. **Edit window** — `published_at + REEL_METRICS_EDIT_WINDOW_DAYS`; `EDIT_WINDOW_EXPIRED`; `editable` on read DTO.
4. **Ownership / tenancy** — `client_id` from assembled reel row; Operator cross-tenant writes allowed; forbid `client_id` on input.
5. **Integer bounds** — non-negative ≤ `REEL_METRICS_MAX_VALUE`; full snapshot replace on upsert.
6. **DDL** — `neuramark_reel_metrics` columns + FK CASCADE on assembled reel delete.
7. **Calendar DTO** — optional `metrics` on published slots; single-fetch Sidebar.
8. **Non-goals reaffirmed** — no Insights API; no `/operator/metrics` route; no Cliente surfaces; no US-13.2 aggregation; no charts; no edit-window override V1.
9. **Phased acceptance** — Phase A closes USER_STORIES § US-13.1 all five AC (reconcile [SEC] “current client” wording per item 4 above).

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-13.1 CONTRACT.md** with the non-negotiable freezes above.

1. **Manual metrics boundary** — Operator-entered counters only; no analytics stack; no Instagram Insights in V1.
2. **US-12.2 continuity** — published gate reads `publish_status`, `published_at`, `assembledReelId`; Sidebar section below publish metadata.
3. **Server-side rules** — published-only + 7-day window + integer bounds enforced in handler, not FE-only.
4. **US-13.2 data contract** — stable `neuramark_reel_metrics` with `client_id`, counters, `recorded_at`; join to strategy tema/pillar documented.
5. **Explicit out of scope:** Insights API, separate metrics route, Cliente entry, charts, strategy injection, bulk import, edit-window override, RBAC UI.

**Gate status:** SPEC-REVIEW **GAPS** (6 Low · 0 blockers · 0 CONFLICT). Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
