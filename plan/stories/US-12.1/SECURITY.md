# Security Design Review — US-12.1

**Story:** US-12.1 — Weekly calendar view  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Branch:** `feature/US-12.1-weekly-calendar`  
**Sources:** `plan/USER_STORIES.md` (US-12.1 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` § (e) US-12.1 visibility, `plan/stories/US-12.1/README.md` + `TASKS.md` (PREP 2026-08-30), `plan/stories/US-11.3/SECURITY.md` (Operator ≠ Cliente ready-to-publish), `plan/stories/US-4.1/SECURITY.md` + `US-4.2/SECURITY.md` (operator gates), `lib/auth/require-user.ts`, `app/(app)/operator/layout.tsx`, `app/api/media/assets/[assetId]/route.ts`, `lib/reel-scripts/actions/get-reel-scripts-for-week.ts`, `lib/approvals/caption-preview.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (migration, sync-on-read, aggregate action, status derivation, contracts, security tests). **nextjs-frontend** (`/operator/calendar`, grid, sidebar, gap UI, i18n, nav — presentation only). **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.

---

## Verdict: APPROVE WITH CONDITIONS

The story correctly positions the V1 calendar as an **Operator-only multi-client aggregate** under `requireOperator`, with **`weekStart` as the sole request parameter**, sync-on-read materialization into `neuramark_content_calendar_slots`, **read-only** consumption of pipeline/approval state (no `publish_status` writes — US-12.2), and explicit separation from Cliente `/ready-to-publish` per US-11.3 and SECURITY_BASELINE § (e).

No **REDESIGN**. No veto of PO product defaults (sync-on-read, ISO Monday week, Sidebar detail, session-scoped deep links as V1 UX limitation). Orchestrator may proceed to **CONTRACT.md** after freezing the **11 conditions** below.

**Inherited floors (US-14.5 / US-11.3 / US-4.x / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; RLS deny-by-default on new tables; service-role Node only; no `@supabase/supabase-js` in Client Components; no browser Supabase keys; no `storage_key` in DTOs; cost fields never on Cliente paths — calendar is Operator-only but still must not leak margin-sensitive cost data in the aggregate DTO; interim hardcoded user sanctioned — not a finding.

**This story owns:** `neuramark_content_calendar_slots` migration; `syncCalendarSlotsForWeek`; pipeline status derivation; `getOperatorCalendarForWeek` Server Action + Zod contracts; `/operator/calendar` Operator page; optional cross-client **`assembled_reel`** thumbnail serve extension on existing media route; security tests for operator gate, forbidden fields, DTO shape, Cliente 403, no Cliente queue reuse.

**This story does not own:** `publish_status = published` writes (US-12.2); drag-and-drop reschedule (Phase B); Cliente-facing calendar endpoint (future story); Instagram publish (ADR-0002); strategy-approve cron/hook; RBAC beyond `requireOperator()`; Operator multi-client session context for deep links (Phase B UX).

**Terminology:** **Calendario de contenido** · **Estrategia semanal** · **Operator** · **Cliente** · **Reel** · **listo para publicar** · **Aprobación**. Do not expose `storage_key`, public Storage URLs, or cost fields on calendar surfaces. Do not filter the Operator aggregate by `client_id` in the browser.

---

### Threat Summary (US-12.1–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Cliente reads multi-client production calendar** | Cross-tenant pipeline/approval/metadata leak | **`requireOperator("handler")` first** on aggregate action; page under `app/(app)/operator/layout.tsx` → `requireOperator("page")`; Cliente → **403** |
| **`client_id` param smuggled on aggregate** | Operator endpoint becomes IDOR filter; future Cliente calendar bypass | Input Zod **`.strict()`** with **`weekStart` only**; forbidden-key scan rejects `client_id` / `clientId` → **`FORBIDDEN_FIELDS`**; no query param on page |
| **Reuse Cliente `/ready-to-publish` for Operator data** | Wrong tenancy model; approved-only filter hides pipeline states Operator needs | **New** Operator aggregate query — **do not** call `listApprovedApprovals` or Cliente loaders |
| **Aggregate DTO over-exposes tenant data** | Margin leak (cost), content exfil (full script/caption), storage path disclosure | **Allowlisted DTO** only; grep/tests prove no `storage_key`, cost cents, provider keys, full script/caption bodies, interview PII |
| **Cross-client thumbnail 404 / broken security model** | Operator sees calendar metadata but cannot preview other clients' reels — or implementers bypass with raw URLs | **Condition:** extend `assembled_reel` Operator branch on media route to serve **any** tenant after `requireOperator` — **without** widening Cliente or `generated_video`/`voiceover` paths |
| **Cliente accesses other clients' MP4 via calendar `previewUrl`** | Cross-tenant media leak | Thumbnails use **`/api/media/assets/{uuid}`** only; Cliente path unchanged (ownership); Operator cross-client **only** after operator gate |
| **Read path writes abused (sync-on-read)** | DB churn / orphan deletion DoS | Operator-only; sync scoped to `weekStart` + active clients; acceptable residual — no Cliente trigger |
| **US-12.1 writes `published` early** | Publish gate bypass before US-12.2 approval checks | **No** `publish_status` UPDATE in US-12.1 except default `'ready'` on INSERT; display `published` when US-12.2 has written rows |
| **Future Cliente calendar reuses Operator aggregate** | Cliente sees all tenants via UI filter | **Documented + tested:** future calendar = **new** action scoped to server-resolved `getCurrentUser().id`; never Operator DTO + client-side filter |
| **Optional `getOperatorCalendarSlotDetail({ slotId })` IDOR** | Cross-tenant slot detail if scoped wrong | If second fetch ships: load slot only when it belongs to **active client + approved strategy for week** — not `operator.id` ownership; foreign/missing → **404** |
| **Inactive / deactivated clients in aggregate** | Stale tenant data visible to Operator | Include **`neuramark_clients.active = true`** only (PO #8) |

**Residual risk accepted:** Operator role intentionally sees production status across all active clients — product trust model (SECURITY_BASELINE § (e)). Sync-on-read performs upsert/delete on calendar read without strict rate limit (PO lean) — bounded to authenticated Operator. Deep links to `/operator/scripts` remain session-`clientId`-scoped (PO #6) — calendar Sidebar is the cross-client action surface until Phase B. Hardcoded local user until auth universal is sanctioned.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Multi-client calendar aggregate (slots, gaps, pipeline status) | **High** — cross-tenant operational view | Operator-only Server Action + layout gate |
| `neuramark_content_calendar_slots` rows | Medium–High — scheduling identity per tenant | Service-role Node; RLS deny-by-default; sync-on-read Operator-triggered only |
| `thumbnailPreviewUrl` / assembled reel bytes | **High** — tenant video content | Authenticated `/api/media/assets/{uuid}`; Operator cross-client serve for `assembled_reel` only |
| `clientDisplayName`, `tema`, pipeline status | Medium — operational metadata | Safe in Operator aggregate DTO |
| Full script / caption / strategy brief / cost rollups | **High** — content + margin | **Exclude** from calendar DTO; deep links defer to existing gated surfaces |
| `approvalId`, approval status summary | Medium | Status + minimal summary only — no full change-request bodies in V1 sidebar |
| `weekStart` | Low–Medium — partition key | Validated via `trendWeekStartSchema` + `normalizeToIsoMonday` |

**Boundaries:**

1. **Browser (Operator) → `/operator/calendar` RSC + `getOperatorCalendarForWeek`** — Untrusted: `weekStart` only (query + action body). **`requireOperator` first**. No Supabase SDK. No `client_id` authority.
2. **Browser (Cliente) → same endpoints** — **Blocked:** layout + action → 403/redirect; must not receive aggregate JSON.
3. **Server Action → `syncCalendarSlotsForWeek` → Postgres** — Service-role; upsert/delete for active clients with approved strategies; parameterized queries.
4. **Server Action → pipeline joins** — Read-only SELECTs; status derived server-side; no approval/QA mutations.
5. **Browser (Operator) → `/api/media/assets/{assetId}` for thumbnails** — UUID only; Operator `assembled_reel` cross-tenant serve after gate (Condition 5).
6. **Future Cliente calendar (out of BUILD)** — New boundary: `requireActive` + `WHERE client_id = session.id` — **never** this aggregate.

---

## Abuse Cases Considered

- *As a Cliente, I call `getOperatorCalendarForWeek` and see all clients' Reels* → **Blocked:** `requireOperator("handler")` → **403**; no sync, no DTO.
- *As a Cliente, I navigate to `/operator/calendar`* → **Blocked:** `requireOperator("page")` → 403 page fallback.
- *As a malicious actor, I POST `{ weekStart, client_id: "<victim>" }`* → **Blocked:** forbidden-key scan → **`FORBIDDEN_FIELDS`** before parse.
- *As a malicious actor, I POST `{ weekStart, clientId: "<victim>" }`* → **Blocked:** same forbidden-key list.
- *As a malicious actor, I filter Operator JSON in DevTools to see one client* → **Irrelevant** if Cliente never receives aggregate; Operator seeing one client is authorized.
- *As implementer, I reuse `listApprovedApprovals` for calendar cards* → **Veto:** wrong filter (approved-only) and Cliente contract — new aggregate query required.
- *As implementer, I add `?client_id=` on `/operator/calendar`* → **Veto:** forbidden per SECURITY_BASELINE § (e) and USER_STORIES `[SEC]`.
- *As implementer, I expose `storage_key` or Supabase URL in `thumbnailPreviewUrl`* → **Veto:** regex-bound `/api/media/assets/{uuid}` via `mediaPreviewUrl()` pattern only.
- *As implementer, I include `estimated_cost_cents` / rollups in calendar DTO* → **Veto:** margin-sensitive — excluded even on Operator calendar (SECURITY_BASELINE § (f) spirit).
- *As implementer, I put full script body / Instagram caption in Sidebar DTO* → **Veto:** use tema + status summary; full content stays on existing gated script/approval pages.
- *As Operator, I view another client's thumbnail* → **Allowed (product intent)** after Condition 5 media-route extension; **not** allowed for Cliente session.
- *As Cliente, I guess another tenant's `assetId` from calendar* → **Blocked:** Cliente never receives cross-tenant asset IDs from this story; existing media ownership matrix unchanged for Cliente.
- *As implementer, I UPDATE `publish_status = 'published'` in sync or display action* → **Veto:** US-12.2 only.
- *As implementer, I ship future Cliente calendar as `getOperatorCalendarForWeek` + FE filter* → **Veto:** separate endpoint required — encoded as `[SEC]` AC + tests.
- *As implementer, optional `slotId` detail fetch returns any row by UUID* → **Blocked:** tenancy scope = materialized calendar row for active client/week — foreign → **404**.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-12.1 are binding. Items marked **(added)** extend enforcement for testability. Do not drop or weaken inherited operator/auth floors.

**USER_STORIES.md `[SEC]` (binding):**

- [ ] **[SEC] Operator-only:** aggregate Server Action and `/operator/calendar` reject non-operator sessions server-side (**403** on action; layout gate on page) — V1 calendar aggregates production status across clients and is an operator surface
- [ ] **[SEC] Future Cliente calendar:** if added later, must be a **separate endpoint** scoped to the server-resolved client's own Reels — never the operator aggregate with rows filtered in the UI, and never a `client_id` parameter on the operator endpoint

**Added in this review (binding for US-12.1 BUILD):**

- [ ] **[SEC] (added) `requireOperator("handler")` is the first await** in `getOperatorCalendarForWeek` (and any optional slot-detail action) before validation, sync, or DB reads; failure → typed **403** envelope, **zero side effects**
- [ ] **[SEC] (added) Request contract is `weekStart` only:** Zod input `.strict()`; `findForbiddenCalendarKeys` (or equivalent) rejects `client_id`, `clientId`, `role`, `filter`, `limit`, and cost/provider authority keys → **`FORBIDDEN_FIELDS`**; page route has **no** `client_id` searchParam
- [ ] **[SEC] (added) No Cliente queue reuse:** aggregate loader does **not** import or call `listApprovedApprovals`, `/ready-to-publish` actions, or Cliente-scoped approval list helpers
- [ ] **[SEC] (added) Aggregate query scope:** include slots only for **`neuramark_clients.active = true`** with a latest **approved** strategy for `weekStart`; ordering server-side; no browser-side client filter
- [ ] **[SEC] (added) DTO allowlist — safe Operator fields only:** per-slot: `slotId`, `clientId`, `clientDisplayName`, `weekStart`, `scheduledDate`, `slotIndex`, `tema`, `reelScriptId`, `pipelineStatus`, `approvalId`, `assembledReelId`, `thumbnailPreviewUrl`; gap warnings: `clientId`, `clientDisplayName`, `scheduledCount`, `missingCount`; sidebar may add **minimal** approval summary (`status`, optional `changesRequested` flag) — **never** full change-request text, script hook/body/cta/voiceover, effective Instagram caption body, strategy `brief` jsonb, QA override reasons, provider fields, or auth identifiers
- [ ] **[SEC] (added) DTO denylist enforced in contract + tests:** response JSON must **not** contain `storage_key`, `storageKey`, `estimated_cost_cents`, `actual_cost_cents`, `costCents`, `costSummary`, `reelCostRollups`, `envKeyName`, `provider_key`, `email`, `auth_user_id`, or raw Supabase/public asset URLs — grep or schema tests in CI
- [ ] **[SEC] (added) `thumbnailPreviewUrl` shape:** when non-null, must match **`^/api/media/assets/[0-9a-f-]{36}$`** (reuse `mediaPreviewUrl()` helper); **never** embed `storage_key` or absolute Storage URL
- [ ] **[SEC] (added) Operator cross-client `assembled_reel` thumbnail serve:** extend `GET /api/media/assets/[assetId]` **`assembled_reel`** branch so that after **`requireOperator("handler")` succeeds**, Operator may stream **any** client's branded output asset; **do not** change Cliente ownership rule (`row.client_id === user.id`); **do not** widen `generated_video` / `voiceover` to cross-client Operator access; Cliente attachment approved-guard (US-11.3) unchanged
- [ ] **[SEC] (added) No publish writes in US-12.1:** sync INSERT may set `publish_status = 'ready'` default only; **no** UPDATE to `'published'`; no mark-published UI
- [ ] **[SEC] (added) Sync-on-read safety:** `syncCalendarSlotsForWeek` runs only from Operator-gated aggregate path; parameterized upsert/delete; orphan deletion limited to `(client_id, week_start)` rows no longer in latest approved brief — no cross-week mass delete API
- [ ] **[SEC] (added) Optional slot detail action:** if `getOperatorCalendarSlotDetail({ slotId })` ships, **`requireOperator` first**; input `.strict()` with `slotId` only; load row + joins only when slot is in materialized calendar scope for an active client — foreign/missing → **404** (uniform, no existence oracle)
- [ ] **[SEC] (added) RLS deny-by-default** on `neuramark_content_calendar_slots`; service-role Node access only — same house pattern as peer tables
- [ ] **[SEC] (added) Future Cliente calendar separation test:** automated test or grep asserts **no** Cliente route/action imports `getOperatorCalendarForWeek`; CONTRACT non-goals document **`getClientCalendarForWeek`** (name frozen in CONTRACT) as future separate action scoped to `getCurrentUser().id`
- [ ] **[SEC] (added) Automated security tests cover at least:** Cliente session → action **403**; Operator session → **200**; body with `client_id` → **`FORBIDDEN_FIELDS`**; DTO JSON excludes denylist keys; `thumbnailPreviewUrl` regex; non-operator page blocked by layout; grep — no `publish_status` UPDATE in US-12.1 modules; grep — no Cliente queue import

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate on handler + page (APPROVE — PO #10, USER_STORIES AC)

Mirror `getReelScriptsForWeek` / `loadTrendWeekListForOperator`: **`requireOperator("handler")`** first in Server Action; page under existing Operator layout.

**Condition 1:** CONTRACT documents gate order and typed 401/403 envelopes (no side effects on 403).

#### 2. No `client_id` on aggregate (APPROVE — SECURITY_BASELINE § (e), USER_STORIES `[SEC]`)

**Condition 2:** CONTRACT freezes `getOperatorCalendarForWeekInputSchema` as `{ weekStart }` `.strict()` plus forbidden-key list including `client_id` / `clientId`.

#### 3. Future Cliente calendar separation (APPROVE — USER_STORIES `[SEC]`)

Not implemented in BUILD; must be architecturally blocked.

**Condition 3:** CONTRACT § non-goals: Cliente calendar = **new** `requireActive` action with server-resolved `client_id`; **never** Operator aggregate + FE filter; **never** `client_id` query on `/operator/calendar`.

#### 4. Multi-tenant Operator DTO allowlist (APPROVE WITH CONDITIONS)

Operator **may** see across tenants: display names, scheduling metadata, pipeline status enum, internal UUIDs for deep links, authenticated preview paths.

Operator **must not** receive via calendar DTO: cost data, storage keys, full generative content, interview PII, provider internals.

**Condition 4:** CONTRACT freezes DTO fields matching TASKS sketch + sidebar minimal approval summary; explicit denylist in contract comments.

**Condition 5:** CONTRACT requires `mediaPreviewUrl()` for thumbnails and Zod regex on `thumbnailPreviewUrl`.

#### 5. Cross-client assembled reel media serve (APPROVE WITH CONDITIONS — **required for thumbnails**)

Current media route allows Operator `assembled_reel` serve only when `row.client_id === operator.id` (`app/api/media/assets/[assetId]/route.ts`). US-12.1 is the first **multi-client** Operator read surface; without this change, cross-client thumbnails **404**.

**Condition 6:** US-12.1 BUILD includes media-route change: **`requireOperator` + `assembled_reel` → allow any `client_id`**; Cliente branch and attachment approved-guard unchanged; **`generated_video` / `voiceover` remain session-scoped**.

**Alternative (only if PO descopes thumbnails):** omit `thumbnailPreviewUrl` for non-session clients and document in CONTRACT — **not** the PO default (README open Q #3 lean preview).

#### 6. No Cliente ready-to-publish reuse (APPROVE — US-11.3)

**Condition 7:** CONTRACT lists forbidden imports; aggregate SQL joins pipeline tables directly.

#### 7. Read-only publish status (APPROVE — PO #3, US-12.2 handoff)

**Condition 8:** CONTRACT states zero `publish_status` UPDATE in US-12.1 modules; display-only `published` when row already written by US-12.2.

#### 8. Sync-on-read scope (APPROVE — PO #3, #8)

**Condition 9:** CONTRACT documents sync entrypoint callable only from Operator aggregate; active-client filter; orphan delete rules.

#### 9. Optional slot detail IDOR (APPROVE IF SHIPPED)

**Condition 10:** If second fetch ships, CONTRACT documents scope check — not operator.self `client_id` ownership.

#### 10. Security tests (APPROVE)

**Condition 11:** CONTRACT § security tests lists minimum cases from criteria above.

---

### Open questions — SECURITY resolutions

| # | Question (PREP) | Resolution |
|---|---|---|
| 1 | Rate limit on aggregate read? | **APPROVE no strict limit V1** — Operator-only read; sync-on-read acceptable; revisit if abuse observed |
| 2 | Single fetch vs panel refetch? | **APPROVE single fetch** — reduces attack surface vs second IDOR-prone action; if refetch added, slot detail rules apply |
| 3 | Thumbnail source | **APPROVE** `mediaPreviewUrl(assembled output asset id)` + **Condition 6** cross-client operator serve |
| 4 | Clients without approved strategy | **APPROVE omit** from slot grid; optional week summary — no PII beyond counts |
| 5 | Deep links session-scoped | **APPROVE UX limitation** — not a security defect; Sidebar is cross-client summary; scripts/strategy links use session `clientId` until Phase B |
| 6 | Sync deletes orphan rows | **APPROVE delete orphans** on sync — Operator-only; CONTRACT defines exact predicate |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Skip `requireOperator` on aggregate action or expose aggregate to Cliente | **REJECT** |
| Accept `client_id` / `clientId` on action, page query, or sync API | **REJECT** |
| Reuse `listApprovedApprovals` or Cliente ready-to-publish for Operator calendar | **REJECT** |
| Return `storage_key`, cost cents, full script/caption, or strategy brief in calendar DTO | **REJECT** |
| Ship cross-client thumbnails without Operator cross-client `assembled_reel` serve (and without descoping thumbnails in CONTRACT) | **REJECT** |
| Widen cross-client serve to `generated_video` / `voiceover` | **REJECT** |
| UPDATE `publish_status` to `published` in US-12.1 | **REJECT** |
| Implement future Cliente calendar as filtered Operator aggregate | **REJECT** |
| Add `client_id` filter param "for Operator convenience" | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **Cliente calendar (future story):** New `requireActive("handler")` action; query **`WHERE client_id = getCurrentUser().id`**; DTO subset of Operator card fields; **no** cross-client gap warnings; never import Operator sync helper without client scope parameter injected server-side.
- **US-12.2 mark published:** Separate Operator mutation on slot row; re-check approval server-side; calendar continues read-only display.
- **Phase B drag-and-drop / multi-client Operator context:** Reschedule mutations need new threat model (tenancy on UPDATE); context switcher must not become client-supplied `client_id` authority.
- **RLS at multi-tenancy time:** `neuramark_content_calendar_slots.client_id` present from day one; policies can mirror other tables without schema rework.
- **Rate limits:** If calendar sync-on-read becomes hot path, add Operator read bucket keyed by `auth_user_id` — not required for V1.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-12.1/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `requireOperator` gate order + error codes
- [ ] Input `{ weekStart }` `.strict()` + forbidden keys
- [ ] DTO allowlist + explicit denylist (cost, storage, full content)
- [ ] `thumbnailPreviewUrl` regex + `mediaPreviewUrl()` usage
- [ ] Media route cross-client Operator `assembled_reel` rule documented (US-12.1 delta)
- [ ] Non-goals: Cliente calendar, `client_id` param, publish writes, Cliente queue reuse
- [ ] Sync-on-read scope + orphan delete predicate
- [ ] Optional slot detail scope check if shipped
- [ ] Security tests list matches SEC criteria
- [ ] **Reviewed by FE** line present before BUILD

---

## CONTRACT freeze list (binding summary)

1. **`requireOperator` first** — action + layout.  
2. **`weekStart` only input** — forbidden `client_id`.  
3. **Future Cliente calendar** — separate endpoint; documented non-goals.  
4. **DTO allowlist** — cross-tenant metadata safe; denylist enforced.  
5. **Thumbnail URLs** — authenticated path regex only.  
6. **Media route** — Operator cross-client `assembled_reel` serve.  
7. **No Cliente queue reuse** — new aggregate joins.  
8. **No publish writes** — US-12.2 owns transition.  
9. **Sync-on-read** — Operator-only entry; active clients.  
10. **Optional slot detail** — scope check, 404 uniform.  
11. **Security tests + grep** — gate, forbidden fields, DTO denylist, separation.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (11 — non-blocking for CONTRACT start):** See § Design Concerns — frozen choices #1–#11. Highest priority: **no `client_id` on aggregate**, **DTO denylist**, **Operator cross-client `assembled_reel` media serve**, **future Cliente endpoint separation**.

---

## BUILD vetoes (summary)

1. Missing `requireOperator` or Cliente-accessible aggregate.  
2. `client_id` accepted on Operator endpoint or page.  
3. Cliente ready-to-publish reuse.  
4. Cost / `storage_key` / full script-capture in DTO.  
5. Cross-client thumbnails without media-route Operator extension.  
6. Cross-client widen on `generated_video` / `voiceover`.  
7. `publish_status = published` writes in US-12.1.  
8. Cliente calendar as filtered Operator aggregate.
