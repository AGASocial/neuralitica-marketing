# Security Design Review — US-12.2

**Story:** US-12.2 — Mark manual publication done  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Branch:** `feature/US-12.2-mark-published`  
**Sources:** `plan/USER_STORIES.md` (US-12.2 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` § (e) Operator surfaces + approval-gate bypass risk #2, `plan/stories/US-12.2/README.md` + `TASKS.md` (PREP 2026-08-30), `plan/stories/US-12.1/SECURITY.md` + `CONTRACT.md`, `plan/stories/US-11.3/SECURITY.md` (approved-only publish eligibility), `lib/calendar/*`, `lib/contracts/calendar.ts`, `lib/auth/require-user.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (ALTER migration, `markCalendarSlotPublished`, Zod, approval re-check, sync preserve, DTO delta, rate limit, security tests). **nextjs-frontend** (Sidebar Dialog, CTA gating, published affordances, i18n — presentation only). **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.

---

## Verdict: APPROVE WITH CONDITIONS

The story correctly introduces the **first `publish_status` write path** as a **dedicated Operator-only Server Action** keyed by **`slotId`**, with **write-time approval re-check** (roadmap hard rule), **strict input** forbidding `client_id` and status spoof keys, **validated IG URL storage**, and **sync preserve** of publish metadata — consistent with US-12.1 read-only handoff and SECURITY_BASELINE publish-gate posture.

No **REDESIGN**. No veto of PO product defaults (manual mark only, Dialog on Sidebar, idempotent re-mark, no unpublish V1, cross-tenant Operator authority via `slotId`). Orchestrator may proceed to **CONTRACT.md** after freezing the **13 conditions** below.

**Inherited floors (US-14.5 / US-12.1 / US-11.3 / SECURITY_BASELINE — do not weaken):** `requireOperator()` calls `requireActive()` first; role never from request; handler-level gates mandatory; RLS deny-by-default on `neuramark_content_calendar_slots`; service-role Node only; no `@supabase/supabase-js` in Client Components; no browser Supabase keys; interim hardcoded user sanctioned — not a finding.

**This story owns:** ALTER `published_at` + `instagram_post_url`; `markCalendarSlotPublished` Server Action + optional `markCalendarSlotPublishedCore`; Zod input/result schemas; write-time approval re-check join; calendar read DTO delta (`publishedAt`, `instagramPostUrl`); sync preserve of publish columns; operator mutation rate limit; security tests for operator gate, approved-only, forbidden keys, URL validation, sync non-escalation.

**This story does not own:** Instagram Graph API publish (ADR-0002); unpublish / revert to `ready`; Cliente mark-published or Cliente calendar; metrics (`neuramark_reel_metrics` — US-13.1); RBAC beyond `requireOperator()`; approval status mutations; extending `getOperatorCalendarForWeek` into a write action.

**Terminology:** **Calendario de contenido** · **Operator** · **Cliente** · **Reel** · **Aprobación** · **publicado** · **listo para publicar** · **Ensamblado**. Do not render unvalidated IG URLs as `href`; do not accept `client_id` as mutation authority; do not expose `storage_key` or cost fields on calendar surfaces.

---

### Threat Summary (US-12.2–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Cliente marks Reel published without approval** | Publish gate bypass; metrics on unapproved content | **`requireOperator("handler")` first** → **403**; write-time **`status = 'approved'`** re-check on latest approval for slot's assembled reel |
| **Direct Server Action call skipping FE CTA gate** | Non-approved slot published | Handler re-check — FE visibility is UX only (PO VALIDATION note) |
| **`client_id` smuggled to target victim tenant** | Cross-tenant publish bookkeeping IDOR | Input **`.strict()`** with **`slotId` only**; forbidden-key scan rejects `client_id` / `clientId`; slot's tenant resolved **server-side from row** |
| **`publish_status` / `published` spoof in body** | Skip approval or force published without join | Forbidden keys: `publish_status`, `publishStatus`, `status`, `pipelineStatus`; server sets `publish_status = 'published'` only after approval re-check |
| **Malicious IG URL (`javascript:`, `data:`, open redirect)** | XSS via Sidebar link; phishing | Zod allowlist: **`https://www.instagram.com/`** + path required; max length 500; store canonical validated string; DTO schema re-validates on read; FE `target="_blank"` + `rel="noopener noreferrer"` |
| **Raw request URL echoed in DTO without persist validation** | Stored XSS if validation skipped on read path | Success DTO built from **post-UPDATE DB row** or re-parsed stored value — never echo raw input |
| **Sync-on-read escalates `ready` → `published`** | Publish without mark action | Sync UPDATE must **not** set `publish_status`, `published_at`, or `instagram_post_url`; INSERT default `'ready'` only |
| **Re-mark after approval revoked** | Published metadata updated when no longer approved | **Re-check approved on every write** including re-mark; reject with **`NOT_APPROVED`**; existing published row unchanged |
| **Operator mutation spam** | DB churn / audit noise | **Rate limit** 30 attempts per operator per rolling 60 minutes (`neuramark_agent_rate_limits`, agent_key `calendar_mark_published`) |
| **Random `slotId` UUID enumeration** | Existence oracle across tenants | Foreign/missing slot → **`NOT_FOUND`** with uniform envelope (no distinguishable "wrong tenant" body) |
| **US-12.1 read path abused to infer publish write surface** | Confused deputy | **New** action only — do not overload `getOperatorCalendarForWeek` |

**Residual risk accepted:** Operator role may mark published for **any** active client's calendar slot after approval — product trust model (SECURITY_BASELINE § (e)). Sync orphan DELETE may remove published rows when strategy brief drops a slot (US-12.1 known V1) — metrics orphan risk deferred to US-13.1 CONTRACT. Hardcoded local user until auth universal is sanctioned.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| `neuramark_content_calendar_slots.publish_status` | **High** — publish eligibility for US-13.1 | Operator-only mutation; server sets after approval re-check |
| `published_at`, `instagram_post_url` | Medium–High — operational + public URL | Validated at write; DTO allowlist; XSS-safe FE render |
| Latest `neuramark_approvals.status` | **Highest** — publish gate | Read-only in this story; re-checked at write; never mutated here |
| `slotId` (calendar row UUID) | Medium — mutation key | Untrusted input; load row server-side; Operator may target any tenant |
| Assembled reel identity | Medium | Resolved via same join path as US-12.1 calendar read |

**Boundaries:**

1. **Browser (Operator) → `markCalendarSlotPublished`** — Untrusted: `slotId`, `publishedAt`, optional `instagramPostUrl`. **`requireOperator` first**. No Supabase SDK. No `client_id` authority.
2. **Browser (Cliente) → same action** — **Blocked:** `requireOperator("handler")` → **403**; zero DB writes.
3. **Server Action → Postgres UPDATE** — Service-role; parameterized; sets publish fields only after approval join succeeds.
4. **Server Action → approval join** — Read-only SELECT; latest approval per `assembled_reel_id`; require **`approved`**.
5. **Browser (Operator) → Sidebar IG link** — Renders **only** `instagramPostUrl` from server-validated DTO; never raw form input for `href`.
6. **`syncCalendarSlotsForWeek`** — Must not write publish transition; preserve existing publish metadata on upsert.

---

## Abuse Cases Considered

- *As a Cliente, I call `markCalendarSlotPublished` and publish my pending Reel* → **Blocked:** `requireOperator("handler")` → **403**; no UPDATE.
- *As a Cliente, I open the Mark published Dialog via DevTools* → **Blocked:** action still **403**; FE CTA is non-authoritative.
- *As a malicious actor, I POST `{ slotId, client_id: "<victim>" }`* → **Blocked:** forbidden-key scan → **`FORBIDDEN_FIELDS`** before parse.
- *As a malicious actor, I POST `{ slotId, publish_status: "published" }`* → **Blocked:** forbidden keys → **`FORBIDDEN_FIELDS`**.
- *As a malicious actor, I POST `{ slotId, publishStatus: "published" }`* → **Blocked:** same.
- *As a malicious actor, I POST `{ slotId, pipelineStatus: "approved" }`* → **Blocked:** forbidden keys.
- *As a malicious actor, I mark published for a slot whose approval is `pending_client`* → **Blocked:** write-time re-check → **`NOT_APPROVED`** (or **`SLOT_NOT_READY`** if no assembly).
- *As a malicious actor, I mark published for a slot with no assembled reel* → **Blocked:** **`SLOT_NOT_READY`**; no UPDATE.
- *As a malicious actor, I re-mark a published slot after approval was later `rejected`* → **Blocked:** re-check fails → **`NOT_APPROVED`**; row unchanged.
- *As a malicious actor, I supply `instagramPostUrl: "javascript:alert(1)"`* → **Blocked:** Zod URL schema reject → **`VALIDATION_ERROR`**; nothing stored.
- *As a malicious actor, I supply `https://instagram.com/p/abc` (no `www`)* → **Blocked:** host must be exactly `www.instagram.com` V1.
- *As a malicious actor, I supply `http://www.instagram.com/p/abc`* → **Blocked:** HTTPS only.
- *As a malicious actor, I spam mark-published* → **Blocked:** rate limit → **`RATE_LIMITED`**.
- *As implementer, I trust FE `pipelineStatus === 'approved'` without server re-check* → **Veto:** handler must join approval table.
- *As implementer, I UPDATE `publish_status` in `syncCalendarSlotsForWeek`* → **Veto:** sync preserves publish columns; no escalation.
- *As implementer, I overload `getOperatorCalendarForWeek` with write branch* → **Veto:** dedicated action only (PO #1).
- *As implementer, I render Dialog URL field directly as `href`* → **Veto:** use DTO field after server validation only.
- *As Operator, I mark another client's approved slot published* → **Allowed (product intent)** — Operator aggregate trust model; authority is Operator role + approval re-check, not session `client_id`.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-12.2 are binding. Items marked **(added)** extend enforcement for testability. Do not drop or weaken inherited operator/auth floors.

**USER_STORIES.md `[SEC]` (binding):**

- [ ] **[SEC] Operator-only:** `markCalendarSlotPublished` rejects non-operator sessions server-side (**403** on action; page already gated by `requireOperator("page")` on `/operator/calendar`)
- [ ] **[SEC] Approved-only at write:** "Approved only" is enforced **server-side in the mark-published handler** (roadmap hard rule: no publish without approval); FE CTA visibility is insufficient alone
- [ ] **[SEC] IG URL validation:** optional IG post URL validated as **`https://www.instagram.com/...`** (HTTPS only, host `www.instagram.com`, non-empty path); stored as **text**; never rendered as a raw link without validation — DTO value must pass the same schema; FE uses `target="_blank"` + `rel="noopener noreferrer"`

**Added in this review (binding for US-12.2 BUILD):**

- [ ] **[SEC] (added) `requireOperator("handler")` is the first await** in `markCalendarSlotPublished` before forbidden-key scan, validation, rate limit, slot load, approval re-check, or UPDATE; failure → typed **403** envelope, **zero side effects**
- [ ] **[SEC] (added) Request contract is `slotId` + `publishedAt` + optional `instagramPostUrl` only:** Zod input `.strict()`; `findForbiddenMarkPublishedKeys` (or shared calendar helper) rejects authority keys including `client_id`, `clientId`, `publish_status`, `publishStatus`, `status`, `pipelineStatus`, `assembledReelId`, `assembled_reel_id`, `approvalId`, `approval_id`, `role`, `auth_user_id`, `weekStart`, `strategyId`, cost/provider keys → **`FORBIDDEN_FIELDS`**
- [ ] **[SEC] (added) Slot load is `slotId`-scoped only:** load calendar row by primary key; missing row → **`NOT_FOUND`** (uniform envelope); resolve `client_id` from row — never from request
- [ ] **[SEC] (added) Write-time approval re-check:** slot → reel script → branded assembly → latest `neuramark_approvals` for `assembled_reel_id`; require **`status === 'approved'`**; missing assembly → **`SLOT_NOT_READY`**; non-approved / missing approval → **`NOT_APPROVED`**; no approval status UPDATE in this action
- [ ] **[SEC] (added) `publishedAt` validation:** date-only **`YYYY-MM-DD`** input; store as **`timestamptz` at UTC noon** for that calendar date; reject invalid dates; allow range **not before slot's `week_start`** and **not more than 1 calendar day after today** (Operator-local "today" per CONTRACT — lean timezone-skew window)
- [ ] **[SEC] (added) `instagramPostUrl` normalization:** trim; treat `""` and whitespace-only as **`null`**; when non-null must match frozen Zod regex (HTTPS + `www.instagram.com` + path segment); **max length 500**; reject `javascript:`, `data:`, `//` tricks, `@` userinfo, non-IG hosts including `m.instagram.com` V1
- [ ] **[SEC] (added) Success DTO from persisted state:** `{ ok: true, slot: CalendarSlotDetailDto }` built from post-write row + derived pipeline status; `instagramPostUrl` in response must satisfy read schema — **never** echo unvalidated request string
- [ ] **[SEC] (added) DTO read schema for publish fields:** extend `calendarSlotDetailDtoSchema` with `publishedAt: string | null` (ISO timestamptz or date per CONTRACT) and `instagramPostUrl` nullable — when non-null, must pass **`calendarInstagramPostUrlSchema`** (same rules as input)
- [ ] **[SEC] (added) Idempotent re-mark:** when row already `publish_status = 'published'`, same action may UPDATE `published_at` / `instagram_post_url` **only if** approval re-check still passes; **no** unpublish / revert to `ready` in V1
- [ ] **[SEC] (added) Sync non-escalation:** `syncCalendarSlotsForWeek` INSERT sets `publish_status = 'ready'` only; UPDATE path must **not** include `publish_status`, `published_at`, or `instagram_post_url` in SET clause — existing values preserved on upsert
- [ ] **[SEC] (added) Rate limit:** reuse `neuramark_agent_rate_limits` with **`agent_key: 'calendar_mark_published'`**; **max 30 attempts per operator `client_id` per rolling 60 minutes**; check after operator gate + before slot load; over-limit → **`RATE_LIMITED`**; record attempt on successful UPDATE only (failed validation/approval does not consume budget — lean)
- [ ] **[SEC] (added) No Graph / integrations imports:** mark action modules must not import Instagram Graph adapters or ADR-0002 publish code
- [ ] **[SEC] (added) Automated security tests cover at least:** Cliente session → action **403**; Operator happy path approved slot → **200** + `pipelineStatus: "published"`; non-approved → **`NOT_APPROVED`**; no assembly → **`SLOT_NOT_READY`**; body with `client_id` → **`FORBIDDEN_FIELDS`**; body with `publish_status` → **`FORBIDDEN_FIELDS`**; invalid IG URL → **`VALIDATION_ERROR`**; valid `https://www.instagram.com/reel/abc/` → stored + returned; re-mark overwrites date/URL when still approved; re-mark after approval revoked → **`NOT_APPROVED`** + row unchanged; foreign `slotId` → **`NOT_FOUND`**; rate limit → **`RATE_LIMITED`**; grep — sync has no `publish_status = 'published'` UPDATE; grep — read action has no publish UPDATE

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. Operator gate on handler (APPROVE — PO #8, USER_STORIES AC)

Mirror US-12.1 / `getOperatorCalendarForWeek`: **`requireOperator("handler")`** first in `markCalendarSlotPublished`.

**Condition 1:** CONTRACT documents gate order: `requireOperator` → forbidden keys → Zod → rate limit → slot load → approval re-check → UPDATE; typed 401/403 envelopes; zero side effects on 403.

#### 2. No `client_id` on mutation (APPROVE — PO #8, US-12.1 Condition 2)

**Condition 2:** CONTRACT freezes `markCalendarSlotPublishedInputSchema` as `{ slotId, publishedAt, instagramPostUrl? }` `.strict()` plus `FORBIDDEN_MARK_PUBLISHED_AUTHORITY_KEYS` including `client_id` / `clientId`.

#### 3. Write-time approval re-check (APPROVE — PO #4, #15, SECURITY_BASELINE risk #2)

Same hard rule as ADR-0002 pattern: join path aligned with US-12.1 calendar read (script → assembly → latest approval).

**Condition 3:** CONTRACT documents join steps, error codes **`NOT_APPROVED`** / **`SLOT_NOT_READY`**, and explicit rule: **no approval row UPDATE** in this action.

#### 4. Forbidden status / identity spoof keys (APPROVE)

**Condition 4:** CONTRACT lists forbidden keys: `publish_status`, `publishStatus`, `status`, `pipelineStatus`, `assembledReelId`, `approvalId`, plus US-12.1 authority keys not in the allowlist input.

#### 5. IG URL allowlist + XSS-safe render (APPROVE — PO #7, USER_STORIES `[SEC]`)

**Condition 5:** CONTRACT freezes `calendarInstagramPostUrlSchema`:

```ts
// Lean freeze — CONTRACT may tighten regex; must reject non-HTTPS and non-www hosts
z.string()
  .trim()
  .max(500)
  .url()
  .refine((u) => {
    try {
      const p = new URL(u);
      return (
        p.protocol === "https:" &&
        p.hostname === "www.instagram.com" &&
        p.pathname.length > 1
      );
    } catch {
      return false;
    }
  });
```

FE: render link **only** when DTO field non-null; `target="_blank"` + `rel="noopener noreferrer"`; display text = URL or localized label — never `dangerouslySetInnerHTML`.

#### 6. `publishedAt` date storage (APPROVE — PO #6)

**Condition 6:** CONTRACT freezes date-only input `YYYY-MM-DD` → persist `published_at` as **UTC noon** for that date; bound max to **today + 1 day** in Operator-local calendar semantics.

#### 7. Dedicated mutation surface (APPROVE — PO #1)

**Condition 7:** CONTRACT names `markCalendarSlotPublished` under `lib/calendar/actions/`; **non-goal:** write branch on `getOperatorCalendarForWeek`.

#### 8. DTO delta + read validation (APPROVE — PO #9)

**Condition 8:** CONTRACT extends `CalendarSlotDetailDto` with `publishedAt`, `instagramPostUrl`; read mapper selects new columns; Zod output validation on URL field.

#### 9. Sync preserve publish metadata (APPROVE — PO #10, US-12.1 sync rules)

Current `syncCalendarSlotsForWeek` UPDATE omits publish columns — preserve by omission. US-12.2 must **extend** `loadExistingSlotsForClientWeek` if sync ever needs publish awareness; must **not** add publish fields to UPDATE SET.

**Condition 9:** CONTRACT documents sync preserve rule for `publish_status`, `published_at`, `instagram_post_url`; grep test proves no escalation.

#### 10. Rate limit (APPROVE — PO open Q #6)

Modest Operator write bucket — no LLM cost but prevents abuse.

**Condition 10:** CONTRACT freezes `CALENDAR_MARK_PUBLISHED_AGENT_KEY = 'calendar_mark_published'`, window **60 minutes**, max **30** per operator `client_id`; error code **`RATE_LIMITED`**.

#### 11. Idempotent re-mark + no unpublish (APPROVE — PO #5)

**Condition 11:** CONTRACT documents re-mark overwrite when still approved; **non-goal:** transition to `ready`, clear-only URL without staying published.

#### 12. Error envelope consistency (APPROVE)

Extend `CALENDAR_ERROR_CODES` (or mark-published union) with: `NOT_FOUND`, `NOT_APPROVED`, `SLOT_NOT_READY`, `RATE_LIMITED` — same `{ ok: false, error: { code, fields?, messageKey? } }` house pattern.

**Condition 12:** CONTRACT error table matches codes above.

#### 13. Security tests (APPROVE)

**Condition 13:** CONTRACT § security tests lists minimum cases from criteria above.

---

### Open questions — SECURITY resolutions

| # | Question (PREP) | Resolution |
|---|---|---|
| 1 | IG host strictness (`www` only?) | **Require `https://www.instagram.com/`** — reject bare `instagram.com`, `m.instagram.com`, `instagr.am` V1 |
| 2 | `publishedAt` input shape | **Date-only `YYYY-MM-DD`** → store UTC noon `timestamptz` |
| 3 | Future-dated `publishedAt`? | **Allow up to today + 1 day** (timezone skew); reject further future |
| 4 | Re-mark when approval revoked? | **Re-check on every write** — reject; published row stays as-is |
| 5 | Return shape | **`{ ok: true, slot: CalendarSlotDetailDto }`** + FE refreshes week |
| 6 | Rate limit | **30 per operator per 60 min** via `neuramark_agent_rate_limits` / `calendar_mark_published` |
| 7 | Empty URL vs omit | **`""` / whitespace → `null`**; re-mark may clear URL |
| 8 | Sync orphan DELETE of published | **Keep US-12.1 hard DELETE** — document residual metrics orphan risk for US-13.1 |
| 9 | IG link `target=_blank` | **Required** FE hardening |
| 10 | Column name | **`instagram_post_url`** (PO frozen) |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Skip `requireOperator` on mark action or allow Cliente to call it | **REJECT** |
| Accept `client_id` / `clientId` on mutation input | **REJECT** |
| Accept `publish_status` / `publishStatus` / `status` spoof keys | **REJECT** |
| Mark published without write-time `approved` re-check | **REJECT** |
| Store or return IG URL without `calendarInstagramPostUrlSchema` validation | **REJECT** |
| Render user-typed URL as `href` before server-validated DTO | **REJECT** |
| UPDATE `publish_status` to `published` in sync or read paths | **REJECT** |
| Overload `getOperatorCalendarForWeek` with write behavior | **REJECT** |
| Add unpublish / revert to `ready` in V1 without new security review | **REJECT** |
| Skip rate limit entirely on mark mutation | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **ADR-0002 Graph publish:** May set same columns on success; must reuse **approved-only** guard; manual mark pattern remains valid for non-Graph flows.
- **US-13.1 metrics:** Gate on `publish_status = 'published'` + `assembledReelId`; orphan risk if sync deletes published slot — US-13.1 CONTRACT should handle missing slot gracefully.
- **RLS at multi-tenancy time:** `client_id` on calendar rows from day one; Operator mutation remains service-role with explicit approval join — policies additive later.
- **IG URL allowlist expansion:** If product needs `instagram.com` without `www`, ship as explicit CONTRACT amendment — do not silently widen regex.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-12.2/CONTRACT.md` exists, verify before coding proceeds:

- [ ] `requireOperator` gate order + error codes (incl. `NOT_FOUND`, `NOT_APPROVED`, `SLOT_NOT_READY`, `RATE_LIMITED`)
- [ ] Input `{ slotId, publishedAt, instagramPostUrl? }` `.strict()` + forbidden keys list
- [ ] Approval re-check join path + no approval writes
- [ ] `calendarInstagramPostUrlSchema` + max 500 + HTTPS/www host rules
- [ ] `publishedAt` date-only → UTC noon storage + date bounds
- [ ] Success `{ ok: true, slot: CalendarSlotDetailDto }` from persisted row
- [ ] DTO delta `publishedAt` / `instagramPostUrl` with read-side URL schema
- [ ] Sync preserve / non-escalation rules
- [ ] Rate limit constants + `neuramark_agent_rate_limits` agent_key
- [ ] Non-goals: unpublish, Graph publish, Cliente mutation, read-action write overload
- [ ] Security tests list matches SEC criteria
- [ ] **Reviewed by FE** line present before BUILD

---

## CONTRACT freeze list (binding summary)

1. **`requireOperator` first** — zero side effects on 403.  
2. **`slotId` + publish fields only** — forbidden `client_id` and status spoof keys.  
3. **Write-time approval re-check** — `approved` only; `NOT_APPROVED` / `SLOT_NOT_READY`.  
4. **IG URL allowlist** — `https://www.instagram.com/...`; store + DTO re-validate.  
5. **`publishedAt`** — `YYYY-MM-DD` in → UTC noon; max today + 1 day.  
6. **Dedicated action** — not read-action overload.  
7. **DTO delta** — `publishedAt`, `instagramPostUrl`; XSS-safe FE rules.  
8. **Sync preserve** — no publish escalation in sync.  
9. **Rate limit** — 30 / 60 min / operator via `calendar_mark_published`.  
10. **Re-mark** — overwrite when still approved; no unpublish V1.  
11. **Error codes** — extended calendar envelope.  
12. **Security tests + grep** — gate, forbidden fields, approval, URL, sync, rate limit.  
13. **Non-goals** — Graph, Cliente, unpublish, approval mutations.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (13 — non-blocking for CONTRACT start):** See § Design Concerns — frozen choices #1–#13. Highest priority: **`requireOperator` + approved re-check**, **forbidden authority keys**, **IG URL allowlist**, **sync non-escalation**, **rate limit**.

---

## BUILD vetoes (summary)

1. Missing `requireOperator` or Cliente-accessible mark action.  
2. `client_id` or `publish_status` accepted on mutation input.  
3. Publish without write-time `approved` re-check.  
4. Unvalidated IG URL stored or rendered as `href`.  
5. `publish_status = 'published'` written outside mark action (incl. sync).  
6. Read action overloaded with write behavior.  
7. Unpublish in V1 without security review.  
8. No rate limit on mark mutation.
