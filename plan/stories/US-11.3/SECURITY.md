# Security Design Review — US-11.3

**Story:** US-11.3 — Approve and mark ready to publish  
**Date:** 2026-08-30  
**Reviewer:** security-architect  
**Sources:** `plan/USER_STORIES.md` (US-11.3 AC + `[SEC]`), `plan/SECURITY_BASELINE.md` (Top 5 #2 approval-gate bypass), `plan/stories/US-11.3/README.md` + `TASKS.md` (PREP 2026-08-30), `plan/stories/US-11.1/SECURITY.md` + `CONTRACT.md`, `plan/stories/US-11.2/SECURITY.md`, `lib/approvals/decide-approval.ts`, `app/api/media/assets/[assetId]/route.ts`, `lib/approvals/compose-approval-package.ts`  
**Status:** Binding for implementing agents; validated by requirements-validator like any other acceptance criterion. Do not treat this file as CONTRACT.md. Do not check off `USER_STORIES.md` AC here.  
**Primary implementers:** **nextjs-backend** (`listApprovedApprovals`, caption export route, media attachment disposition, log hook, security tests). **nextjs-frontend** (`/ready-to-publish` pages, Approve ConfirmDialog polish, download UX — presentation only). **No** content-agents-engineer · **No** media-pipeline-engineer · **No** integrations-engineer.

---

## Verdict: APPROVE WITH CONDITIONS

The story correctly **consumes** US-11.1’s `approved` status without opening a second approve writer, adds **read-only** Cliente surfaces under **`requireActive("handler")`**, and routes backup download through the existing authenticated media serve plus a new caption export handler — not static paths or Storage URLs. PO freezes #1–#15 align with inherited US-11.1 floors (IDOR → **404**, gate on decide unchanged, `assembled_reel` matrix unchanged, no `storage_key` in DTOs).

No **REDESIGN**. No veto of PO product defaults. Orchestrator may proceed to **CONTRACT.md** after freezing the **12 conditions** below.

**Inherited floors (US-11.1 / US-11.2 / US-9.2 / US-14.5 / SECURITY_BASELINE — do not weaken):** `decideApproval` remains the sole Cliente status writer; gate re-check on decide unchanged; forbidden-key scan on decide; foreign UUID → **404**; RLS deny-by-default; service-role Node only; no browser Supabase; `assembled_reel` Cliente serve requires ownership; do **not** widen `generated_video` / `voiceover`; interim hardcoded user sanctioned — not a finding.

**This story owns:** `listApprovedApprovals` Server Action; `/ready-to-publish` Cliente routes; `GET /api/approvals/[approvalId]/caption.txt`; media route **`disposition=attachment`** mode with approved-approval guard; optional structured log `approval_ready_to_publish` on approve success; Approve ConfirmDialog + post-approve download panel (FE); security tests for approved-only list/export, IDOR, disposition safety, state-machine regression.

**This story does not own:** Approve/reject/request-changes mutations (US-11.1/11.2); zip bundle export; HTTP webhook / email; Instagram publish (ADR-0002); Operator publish queue (US-12.1); QA gate re-check at download time; RBAC beyond `requireActive()`; DDL / new status values.

**Terminology:** **Aprobación** · **listo para publicar** · **Paquete** · **descarga de respaldo** · **caption de Instagram** · **Cliente**. Do not expose `storage_key`, public Storage URLs, or static `/public` MP4 paths on Cliente surfaces.

---

### Threat Summary (US-11.3–specific)

| Threat | Impact | Mitigation in this story |
|---|---|---|
| **Second approve path / status writer** | Bypass gate or double-approve | **No** new Server Action or route writes `approved`; ConfirmDialog calls existing `decideApproval`; grep closed write surface unchanged |
| **Approve already-decided / ungated row** | Publish-gate bypass (baseline Top 5 #2) | Inherited US-11.1: `status !== 'pending_client'` → **`INVALID_TRANSITION`**; gate re-check before UPDATE; US-11.3 adds regression tests only |
| **IDOR on ready-to-publish list / detail / caption export** | Cross-tenant caption or video leak | All loads **`WHERE client_id = $session`**; foreign `approvalId` → **404** uniform |
| **Caption export for non-approved row** | Backup download before Cliente decision | Caption route requires **`status = 'approved'`** else **404**; compose server-side only |
| **Video attachment before approval** | “Backup download” without Aprobación | **`?disposition=attachment`** requires owning Cliente **and** asset is branded output linked to an **`approved`** approval; inline preview unchanged (US-11.1) |
| **Foreign / cross-client `assetId` on media route** | MP4 leak | Existing ownership matrix retained; attachment does **not** widen types or relax tenancy |
| **`disposition` query header injection** | Response-splitting / crafted `Content-Disposition` | Whitelist param: only exact **`attachment`** triggers attachment mode; **never** reflect raw query into header; filename from server metadata + **`sanitizeFilenameForHeader`** |
| **Client-supplied caption in export** | Wrong / smuggled publish text | Body = **`buildEffectiveInstagramCaption`** from owned rows — **never** FE concat or request body |
| **Static / public Storage URLs in download links** | Unauthenticated exfil | DTO links stay `/api/media/assets/{uuid}` and `/api/approvals/{uuid}/caption.txt` only |
| **Inactive Cliente hits export/list** | Unauthorized backup access | **`requireActive("handler")` first** on every new surface |
| **Operator on Cliente ready-to-publish routes** | Wrong tenancy surface | Cliente **`requireActive` only** — Operator queue is US-12.1 |
| **Log hook → outbound HTTP** | Covert exfil on approve | V1 **structured server log only** — no webhook/email (integrations deferred) |
| **Spam caption export** | Storage/egress DoS | Dedicated rate-limit bucket (lean **`approval_export`**, 30/hour per client — CONTRACT exact) |

**Residual risk accepted:** Inline preview on `/approvals` already streams MP4 to owning Cliente before approve (US-11.1 product intent); attachment mode adds filename UX and **approved-only** guard for explicit backup download. No live QA re-check at download (PO #10) — ADR-0002 / publish must still re-check `approved` + live gates. Hardcoded local user until auth universal is sanctioned.

---

## Assets and Trust Boundaries

| Asset | Sensitivity | Trust boundary |
|---|---|---|
| Branded `assembled_reel` MP4 bytes | **High** — tenant content | Authenticated media route; ownership + **approved** guard for attachment |
| `effectiveCaption` export body | **High** — public-facing IG copy | Server-composed from owned caption/assembly; approved approval only |
| `neuramark_approvals.status = approved` | **Highest** — publish eligibility | **Read-only** in US-11.3; written only by US-11.1/11.2 `decideApproval` |
| `ApprovedListItemDto` / package on detail | Medium — metadata | Client-scoped list/get; no `storage_key` / cost / prompts |
| Download URLs in FE | Medium — capability pointers | Authenticated route paths only — not Storage keys |

**Boundaries:**

1. **Browser (Cliente) → `listApprovedApprovals` / `getApprovalPackage` on `/ready-to-publish`** — Untrusted: none (list) or `approvalId` only on get. **`requireActive("handler")` first**. Approved filter server-side.
2. **Browser (Cliente) → `GET /api/approvals/[approvalId]/caption.txt`** — Untrusted UUID path segment only. Auth + tenancy + **`status === 'approved'`** before compose/stream.
3. **Browser (Cliente) → `GET /api/media/assets/[assetId]?disposition=attachment`** — Untrusted UUID + whitelisted query flag. Auth + ownership + **approved-approval linkage** before attachment disposition.
4. **Browser (Cliente) → Approve ConfirmDialog → `decideApproval`** — **Unchanged** US-11.1 boundary; dialog is not authority.
5. **Handlers → Postgres** — Parameterized SELECT only for list/export (no approval status UPDATE in this story).
6. **`decideApprovalForClient` log hook** — Server-only; no outbound network.

---

## Abuse Cases Considered

- *As a malicious actor, I add a new Server Action that sets `status = approved`* → **Blocked:** story scope forbids; grep closed write surface = US-11.1/11.2 modules only (+ optional log line).
- *As a malicious actor, I POST `decideApproval` again after `approved`* → **Blocked:** inherited **`INVALID_TRANSITION`**; US-11.3 tests reaffirm.
- *As a malicious actor, I POST approve on ungated `pending_client` row* → **Blocked:** inherited gate re-check → **`QA_GATE_NOT_READY`**.
- *As a malicious actor, I GET `/api/approvals/<victim-id>/caption.txt`* → **Blocked:** scoped load → **404**.
- *As a malicious actor, I GET caption export for my `pending_client` approval* → **Blocked:** non-approved → **404** (not 403).
- *As a malicious actor, I GET `/api/media/assets/<victim-asset>?disposition=attachment`* → **Blocked:** ownership mismatch → **404**.
- *As a malicious actor, I GET attachment for my `assembled_reel` while still `pending_client`* → **Blocked (required):** attachment mode requires **`approved`** approval row linking that asset.
- *As a malicious actor, I pass `?disposition=attachment; filename=evil.exe` or `?filename=../../etc/passwd`* → **Blocked:** only exact `disposition=attachment` honored; filename from server + sanitizer — **no** client filename param.
- *As a malicious actor, I pass `?disposition=inline%0d%0aSet-Cookie:…`* → **Blocked:** whitelist equality check; default inline if not exact match.
- *As a malicious Cliente, I concat caption in FE for export* → **Blocked:** export route body authoritative; FE download link hits server route only.
- *As a malicious actor, I enumerate rejected/pending via ready-to-publish list* → **Blocked:** query **`status = 'approved'`** only; foreign ids not in list.
- *As an inactive user, I hit list/export/media attachment* → **Blocked:** `requireActive` → 401/403.
- *As UI, I show Download before approve but call routes anyway* → **Blocked:** server approved + attachment guards; UI non-authoritative.
- *As implementer, I expose `storage_key` or Supabase public URL in download href* → **Veto:** authenticated routes only.

---

## Security Acceptance Criteria

Story `[SEC]` items from `plan/USER_STORIES.md` → US-11.3 are binding. Items marked **(added)** extend enforcement for testability. Do not drop or weaken US-11.1 / US-11.2 `[SEC]` rows on shared paths.

**Inherited (US-11.1 / US-11.2 — still binding; US-11.3 verifies, does not fork):**

- [ ] **[SEC] Approval status transitions follow a server-enforced state machine** — `decideApproval` remains sole Cliente writer; `pending_client` → `approved` \| `rejected` \| `changes_requested` (11.2); already-decided → **`INVALID_TRANSITION`**; ungated decide → **`QA_GATE_NOT_READY`**
- [ ] **[SEC] Gate re-checked on decide** — unchanged from US-11.1; US-11.3 adds automated regression tests, **no** new decide code path
- [ ] **[SEC] Approval package lookups scoped to current client** — foreign `approvalId` → **404** on `getApprovalPackage` (including `/ready-to-publish/[approvalId]`)
- [ ] **[SEC] Media serve ownership** — authenticated route; foreign asset → **404**; never expose `storage_key` in URL or DTO *(US-9.2 / US-11.1)*

**US-11.3 story `[SEC]` (USER_STORIES.md):**

- [ ] **[SEC] Download/export links serve only assets tied to Reels of the current client, through the authenticated asset route (no direct static paths)**

**Added in this review (binding for US-11.3 BUILD):**

- [ ] **[SEC] (added) No new approval status writers:** grep + test prove **zero** INSERT/UPDATE to `neuramark_approvals.status` outside existing `ensure-approval-package.ts`, `decide-approval.ts`, `requeue`/revision modules from US-11.2; US-11.3 may add **log-only** `approval_ready_to_publish` — **no** HTTP/email
- [ ] **[SEC] (added) Approve UX is presentation-only:** ConfirmDialog on `/approvals/[approvalId]` calls existing **`decideApproval({ approvalId, decision: 'approved' })`** — **no** new approve Server Action, Route Handler, or client-writable `status`
- [ ] **[SEC] (added) State-machine regression tests:** double-approve → **`INVALID_TRANSITION`**; approve on `rejected` / `changes_requested` / `approved` → **`INVALID_TRANSITION`**; ungated approve → **`QA_GATE_NOT_READY`**; smuggled `status`/`qaPassed` on decide → **`FORBIDDEN_FIELDS`** (inherited cases re-run in US-11.3 test suite)
- [ ] **[SEC] (added) `listApprovedApprovals` auth + filter:** **`requireActive("handler")` first**; query **`WHERE client_id = $session AND status = 'approved' ORDER BY decided_at DESC`**; **exclude** `pending_client`, `rejected`, `changes_requested`; empty → `[]` (not error); **no** request filter params
- [ ] **[SEC] (added) Ready-to-publish detail guard:** page/action loads package only when row is **`approved`** for session client; otherwise **404** / not-found UX (do not render download CTAs for non-approved)
- [ ] **[SEC] (added) Caption export route — `GET /api/approvals/[approvalId]/caption.txt`:** **`requireActive("handler")` first**; validate `approvalId` UUID; load approval **`WHERE id = $approvalId AND client_id = $session`** — miss → **404**; **`status !== 'approved'` → 404**; compose body via **`buildEffectiveInstagramCaption`** (same path as package composer) — **never** request body or FE concat; `Content-Type: text/plain; charset=utf-8`; `Content-Disposition: attachment; filename="<server-chosen sanitized name>"`; `Cache-Control: private, no-store`; **no** `storage_key` in response headers
- [ ] **[SEC] (added) Caption export IDOR + enumeration:** cross-client `approvalId` → **404** uniform; `pending_client` / `rejected` / `changes_requested` → **404** (same shape as foreign — no status leak in body)
- [ ] **[SEC] (added) Caption export rate limit:** reuse `neuramark_agent_rate_limits` with key **`approval_export`** (CONTRACT exact) — lean **30 attempts / 60 min / client_id**; over-limit → **429**, no stream
- [ ] **[SEC] (added) Media attachment mode — approved backup only:** extend `GET /api/media/assets/[assetId]` to accept **`?disposition=attachment`** (exact value only). When present, after existing auth + ownership for `assembled_reel`, require a row in **`neuramark_approvals`** with **`client_id = session.id`**, **`status = 'approved'`**, and **`assembled_reel.output_media_asset_id = assetId`** (or equivalent server join) — else **404**. Default (param absent or not exact `attachment`) remains **`Content-Disposition: inline`** per US-11.1 preview behavior
- [ ] **[SEC] (added) Media attachment — matrix unchanged:** attachment mode applies **only** to **`assembled_reel`**; **do not** widen `generated_video` / `voiceover` to Cliente; Operator path unchanged; unknown `asset_type` → **404**
- [ ] **[SEC] (added) `disposition` param safety:** parse query with whitelist — **`disposition === 'attachment'`** (case-sensitive exact match) is the **only** attachment trigger; ignore/reject client **`filename`**, **`download`**, or other params for header construction; set filename from server metadata (`assembled-reel.mp4` or CONTRACT pattern) through existing **`sanitizeFilenameForHeader`**; **never** interpolate raw query strings into `Content-Disposition`
- [ ] **[SEC] (added) Download URL shapes frozen:** package DTO / FE download hrefs use **`/api/media/assets/{assetId}?disposition=attachment`** and **`/api/approvals/{approvalId}/caption.txt`** only — **no** `/public/**`, signed long-lived Storage URLs, or DTO fields containing `storage_key`
- [ ] **[SEC] (added) `getApprovalPackage` on ready-to-publish:** reuse action unchanged; RSC may redirect/404 when `package.status !== 'approved'` before showing download CTAs
- [ ] **[SEC] (added) Cliente-only surfaces:** `/ready-to-publish` list + detail + export routes use **`requireActive("handler")`** — **not** `requireOperator`; Operator publish views remain US-12.1
- [ ] **[SEC] (added) Log hook safety:** optional `approval_ready_to_publish` structured log in **`decideApprovalForClient`** success branch when `decision === 'approved'` — fields: `approvalId`, `assembledReelId`, `clientId`, `decidedAt` — **no** outbound HTTP, email, or user-controlled log payload
- [ ] **[SEC] (added) Automated security tests cover at least:** `listApprovedApprovals` excludes non-approved statuses; foreign approval on list/get/caption → **404**; caption export non-approved → **404**; caption cross-client → **404**; attachment on foreign asset → **404**; attachment on own asset with **non-approved** approval → **404**; attachment on **approved** own asset → **200** + `Content-Disposition: attachment`; inline default without param → **inline**; malicious `disposition` values do not alter filename/header; double-approve → **`INVALID_TRANSITION`**; grep — no new status writers; grep — no static/public assembled MP4 serve

---

## Design Concerns and Required Changes

### Frozen design choices (must land in CONTRACT)

#### 1. No second approve path (APPROVE — PO #4)

ConfirmDialog + post-approve panel are FE-only. **Single** approve mutation: US-11.1 **`decideApproval`**.

**Condition 1:** CONTRACT documents **no** new approve action/route and lists ConfirmDialog as non-authoritative UI.

#### 2. State machine unchanged (APPROVE — PO #8, USER_STORIES [SEC])

US-11.3 is read/export UX plus tests — **not** a new transition table entry.

**Condition 2:** CONTRACT § closed write surface unchanged except optional log line; US-11.3 tests re-run invalid-transition + ungated cases.

#### 3. Ready-to-publish list scoping (APPROVE — PO #2)

**`listApprovedApprovals`:** `requireActive` + `client_id` + `status = 'approved'` only.

**Condition 3:** CONTRACT freezes action name, empty strict input, and DTO minimal fields (no `storage_key`).

#### 4. Caption export tenancy + approved gate (APPROVE — PO #3, #9)

New route handler; **404** for foreign and non-approved; server-composed caption.

**Condition 4:** CONTRACT freezes path, headers, compose import, filename pattern, and **`approval_export`** rate limit.

#### 5. Media attachment — approved linkage required (APPROVE WITH CONDITIONS — resolves TASKS open question)

PO freeze #9 requires video backup download only when approval is **`approved`**. Inline preview without param stays US-11.1 (pending review allowed).

**Condition 5:** CONTRACT documents join rule: attachment only when asset is branded output of an **`approved`** approval for session client.

**Condition 6:** CONTRACT documents whitelist parsing for `disposition=attachment` and rejects client filename params.

#### 6. No QA re-check at download (APPROVE PO #10)

Tenancy + **`approved`** status only at export/attachment — publish (ADR-0002) re-checks live rules later.

**Condition 7:** CONTRACT explicitly states **no** `getQaGateStatusForAssembledReel` on download handlers.

#### 7. Operator / webhook / zip out of scope (APPROVE)

**Condition 8:** CONTRACT non-goals: Operator ready-to-publish list, zip bundle, HTTP webhook, email.

#### 8. Inherited media matrix (APPROVE)

**Condition 9:** CONTRACT repeats — do **not** widen `generated_video` / `voiceover` to Cliente in attachment mode.

#### 9. DTO / FE download links (APPROVE)

**Condition 10:** CONTRACT freezes href patterns; FE must not build caption text for export.

#### 10. Detail page guard (APPROVE)

**Condition 11:** `/ready-to-publish/[approvalId]` 404 when not `approved` for tenant.

#### 11. Security tests (APPROVE)

**Condition 12:** CONTRACT § security tests lists minimum cases from criteria above (IDOR, approved-only export, disposition safety, state regression, grep).

---

### Open questions — SECURITY resolutions

| # | Question (PREP) | Resolution |
|---|---|---|
| 1 | `disposition=attachment` vs `download=1`? | **APPROVE `disposition=attachment` only** — exact match whitelist |
| 2 | Caption filename pattern? | **APPROVE** server-chosen sanitized name (CONTRACT picks between `reel-{shortId}-caption.txt` vs script slug — must pass `sanitizeFilenameForHeader`) |
| 3 | Attachment without approved check? | **REJECT for attachment mode** — PO #9 requires approved linkage; inline unchanged |
| 4 | `listApprovedApprovals` vs extend pending list? | **APPROVE new action** — keeps US-11.1 list frozen |
| 5 | Log hook location? | **APPROVE** `decideApprovalForClient` on `approved` success — log-only |
| 6 | Operator on Cliente queue? | **APPROVE out** — `requireActive` only |
| 7 | Gate re-check on download? | **APPROVE no** — tenancy + `approved` only (PO #10) |

---

### Vetoes (would block BUILD)

| If implementers… | Verdict |
|---|---|
| Add a second Server Action / route that writes `approved` | **REJECT** |
| Skip `requireActive` on list / caption export / attachment | **REJECT** |
| Serve caption export for non-approved or foreign approval | **REJECT** |
| Allow `?disposition=attachment` without **approved** approval linkage | **REJECT** |
| Reflect client query params into `Content-Disposition` / filename | **REJECT** |
| Widen attachment to `generated_video` / `voiceover` for Cliente | **REJECT** |
| Put download hrefs to `/public/**`, Storage public URLs, or raw `storage_key` | **REJECT** |
| Add outbound HTTP/email in “stub” hook | **REJECT** |
| Return 403 with distinguishing body on foreign export (use **404**) | **REJECT** |
| Concatenate authoritative export caption in FE | **REJECT** |

None of the PO product defaults trigger a redesign veto.

---

## Future-Proofing Notes

- **ADR-0002 / US-12.x publish:** Re-check `status === 'approved'` and any live consent/QA server-side before IG container — download UX does not imply publish authority.
- **US-12.1 Operator calendar:** Separate aggregate endpoint under `requireOperator` — never reuse Cliente `/ready-to-publish` with UI-only filtering.
- **Zip / bulk export (Phase B):** New story must re-threat-model archive bombs, cross-reel tenancy, and egress limits.
- **Signed share links:** Out of scope — would need expiring scoped tokens and a new SECURITY gate.
- **Attachment on pending preview:** If product later wants pre-approve download, that is a deliberate policy change — today inline stream is sufficient for review; attachment stays post-approve.

---

## CONTRACT.md Checklist (pre-implementation)

When `plan/stories/US-11.3/CONTRACT.md` exists, verify before coding proceeds:

- [ ] No new approval status writers; optional log-only hook documented
- [ ] `listApprovedApprovals` auth, filter, DTO, empty input `.strict()`
- [ ] `GET /api/approvals/[approvalId]/caption.txt` orchestrator steps + approved guard + compose path
- [ ] Media route attachment whitelist + approved-approval join + sanitizer
- [ ] Rate limit key `approval_export`
- [ ] Ready-to-publish detail 404 when not approved
- [ ] Download href shapes; no `storage_key` / static paths
- [ ] Non-goals: zip, webhook, Operator queue, gate re-check on download
- [ ] Security tests list matches SEC criteria
- [ ] **Reviewed by FE** line present before BUILD

---

## CONTRACT freeze list (binding summary)

1. **No second approve writer** — ConfirmDialog → existing `decideApproval`.  
2. **State machine regression** — tests only; decide unchanged.  
3. **`listApprovedApprovals`** — `requireActive` + approved-only + client scope.  
4. **Caption export** — auth + tenancy + approved + server compose + rate limit.  
5. **Attachment mode** — `disposition=attachment` exact + **approved** linkage + sanitizer.  
6. **Inline default** — US-11.1 preview behavior without param.  
7. **No gate on download** — approved + tenancy only.  
8. **Media matrix** — `assembled_reel` only; no Cliente widen for generated/voiceover.  
9. **404 uniformity** — foreign and non-approved export.  
10. **Log hook** — structured log only.  
11. **Cliente-only** — `requireActive` on new surfaces.  
12. **Tests + grep** — IDOR, disposition injection, closed write surface.

---

## Recommended action

**APPROVE WITH CONDITIONS.** Proceed to **CONTRACT.md** (nextjs-backend). Binding floors above must appear in CONTRACT before BUILD. FE signoff required after CONTRACT.

**CONTRACT may proceed:** **Yes.**

**Conditions (12 — non-blocking for CONTRACT start):** See § Design Concerns — frozen choices #1–#12. Highest priority: **approved-only attachment linkage**, **caption export tenancy**, **`disposition` whitelist**, **no new status writers**.

---

## BUILD vetoes (summary)

1. Second approve writer or client-writable `status`.  
2. Caption export without `requireActive` + client scope + `approved` guard.  
3. Attachment mode without approved-approval linkage.  
4. Client-controlled `Content-Disposition` / filename via query.  
5. Static paths, public Storage URLs, or `storage_key` in download hrefs.  
6. Widen media attachment to `generated_video` / `voiceover` for Cliente.  
7. Outbound HTTP/email in approve “stub”.  
8. Foreign/non-approved export returning distinguishable 403 bodies.
