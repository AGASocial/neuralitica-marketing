## Spec Review — US-11.3

### Verdict: ALIGNED

US-11.3 intent — after **Aprobación**, the **Cliente** sees **`status = approved`** Reels on a dedicated **`/ready-to-publish`** queue (separate from **`/approvals`** pending-only list); downloads **descarga de respaldo** as separate authenticated video MP4 + caption `.txt` exports; **ConfirmDialog** polish on the existing US-11.1 Approve path (no second status writer); post-approve inline download panel on `/approvals/[approvalId]`; optional log-only `approval_ready_to_publish` event — is **aligned** with SPEC §1 SC-2 (no publish without **Aprobación**; download respaldo available), SPEC §1 Regla de Aprobación (“Aprobar → lista para Publicación en Instagram”), SPEC §2 **Cliente** actions (aprobar; descarga de respaldo), SPEC §3 **Approval Flow** (S3.M12: `approved` terminal; rechazados fuera de publish queue) and **Instagram Publish** (S3.M13: descarga respaldo; publish re-checks `approved`), SPEC §4 flow 3→4 handoff (Aprobación → Publicación IG), SPEC §5–§6 (Next.js server-only assets; `neuramark_*`; multi-tenant `client_id`; EN/ES), USER_STORIES § US-11.3 AC (all five rows), frozen **US-11.1** ✅ / **US-11.2** ✅ contracts (sole `decideApproval` writer; revision loop → re-approve lands `approved`), and **ADR-0002** (no Graph publish in this story; publish gate re-check deferred to US-12.x).

**No SPEC amendment required.** Soft gaps (USER_STORIES owner-table staleness; webhook/email stub deferred; media attachment approved-context rule for CONTRACT; zip bundle → Phase B) are **explicit PREP deferrals or CONTRACT/SECURITY freeze items** — not product-direction drift. Phase A closes full US-11.3 AC per PO binding note.

**Upstream dependencies satisfied:** US-11.1 ✅ (`decideApproval`, `getApprovalPackage`, `listPendingApprovals`, media serve, state machine) · US-11.2 ✅ (revision loop; re-approve → `approved` eligible for ready-to-publish list) · US-14.x `requireActive` floor.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Low** | **USER_STORIES owner table stale — BE “Status → `approved`”.** Approve transition and timestamp writes land in **US-11.1** `decideApproval`; US-11.3 owns list + download UX only. Not a runtime conflict. | USER_STORIES US-11.3 BE row; US-11.1 CONTRACT § Decide; S3.M12 | Amend USER_STORIES owner row when PO next edits: BE → `listApprovedApprovals`, caption export route, media attachment disposition, log hook. VALIDATION maps AC to US-11.1+11.3 jointly for [SEC] state machine. |
| **Low** | **USER_STORIES BE “optional webhook/email stub” vs PREP Phase B deferral.** README/TASKS freeze webhook/email **out** for V1; optional structured server log only. Soft AC phasing — aligned with integrations-engineer owning real notifications later. | USER_STORIES US-11.3 BE; S3.M13; ADR-0002 | CONTRACT + VALIDATION: Phase A = log-only or omit; do not ship outbound HTTP/email. Note deferral in VALIDATION evidence table. |
| **Low** | **Media attachment disposition: approved-context rule open until CONTRACT.** Cliente can **preview** `assembled_reel` inline while `pending_client` (US-11.1). Without an **`approved`** guard on `?disposition=attachment`, download-before-approve is possible via query param. PO decision #9 requires approved linkage. | S3.M12; S3.M13 respaldo; USER_STORIES [SEC] download AC; US-11.1 media matrix | **CONTRACT + SECURITY:** freeze rule — attachment mode requires resolving approval row with `status === 'approved'` for the asset’s `assembled_reel_id` (404 otherwise); inline default unchanged. |
| **Low** | **Zip bundle not in V1.** SPEC §1 / S3.M13 say “descarga/export sigue disponible como respaldo” without mandating zip. Separate video + caption satisfies manual IG posting AC. | SPEC §1; S3.M13; USER_STORIES AC row 2 | CONTRACT: document Phase B zip as backlog; VALIDATION must not require zip for CLOSE. |
| **Low** | **No QA gate re-check on download for already-approved rows.** PO decision #10 — Cliente already decided; live rules re-checked at publish (ADR-0002 / US-12.x). Differs from US-11.1 create/decide gate but does not weaken SC-2 (no publish here). | S3.M12; ADR-0002; US-11.1 gate pattern | SECURITY + CONTRACT: affirm approved-only + tenancy guards; ADR-0002 publish path must re-check `approved` + live gate. |
| **Info** | **Queue separation ALIGNED.** `/approvals` = `pending_client` only (frozen US-11.1/11.2); `/ready-to-publish` = `approved` only; rejected / changes_requested excluded. Operator aggregate → US-12.1. | S3.M12 rechazados fuera de publish queue; US-11.1 CONTRACT Phase C; USER_STORIES US-11.3 AC rows 1 & 3 | **CONTRACT:** new `listApprovedApprovals` — do not extend `listPendingApprovals`. |
| **Info** | **No second approve path ALIGNED.** ConfirmDialog wraps existing `decideApproval(…, 'approved')`; double-approve stays `INVALID_TRANSITION`. | US-11.1 CONTRACT § Forbidden surfaces; USER_STORIES [SEC] AC row 4 | BUILD grep: no new status writers; regression tests on decide-approval unchanged. |
| **Info** | **State machine consumption ALIGNED.** US-11.3 adds no transitions, no `ready_to_publish` column, no DDL. Re-approve after US-11.2 revision loop uses same `approved` eligibility. | S3.M12; US-11.2 CONTRACT § Publish safety | Download/export handlers 404 on non-`approved` rows. |
| **Info** | **Authenticated download routes ALIGNED.** Caption `GET /api/approvals/[approvalId]/caption.txt`; video via existing media route + attachment param; server-composed `effectiveCaption`; never `storage_key` or public Storage URLs. | SPEC §6; USER_STORIES [SEC] AC row 5; US-11.1 SECURITY | SECURITY owns IDOR 404 + rate limit; CONTRACT freezes route names and guards. |
| **Info** | **ADR-0002 publish gate respected.** No Graph publish, no container→publish, no token exposure. Download UX does not imply publish. Downstream US-12.x / IG module re-checks `approved`. | ADR-0002; SPEC SC-2; S3.M13 | Do not add publish Server Actions or cron publish in US-11.3 BUILD. |
| **Info** | **ADR-0001 / ADR-0003 untouched.** No weekly cron enqueue; no Fly FFmpeg jobs. App-layer Next/Vercel only. | ADR-0001; ADR-0003 | Per implementer routing — nextjs-backend + nextjs-frontend only. |
| **Info** | **MVP cut line ALIGNED.** Phase A = full US-11.3 AC (list, downloads, confirm polish, nav/card, i18n, [SEC]). Phase B = zip, webhook, email, bulk export → backlog / US-12.x / integrations. | USER_STORIES § US-11.3; README § Phased BUILD | VALIDATION closes on Phase A evidence only. |
| **Info** | **Roles / surfaces ALIGNED.** Cliente `requireActive` on `/ready-to-publish`; no Operator ready-to-publish aggregate; no RBAC UI; no Cliente pipeline controls. | SPEC §2; CONTEXT _Evitar_ admin/staff | Operator calendar remains US-12.1. |

**Gap count:** **5 Low** (CONTRACT/SECURITY/hygiene) · **7 Info** (aligned — document in CONTRACT) · **0 Medium** · **0 CONFLICT**

**SPEC blockers:** none. **ADR breaches:** none if downloads stay authenticated + tenant-scoped and no IG publish ships here.

---

### Focus areas (binding assessment)

| Focus | Assessment |
|-------|------------|
| **Ready-to-publish vs pending queue separation** | **ALIGNED** — dedicated `/ready-to-publish` for `approved`; `/approvals` stays `pending_client` only per frozen US-11.1/11.2 contracts. |
| **Download via authenticated routes** | **ALIGNED** — caption export route + media route attachment; freeze approved-context on attachment in CONTRACT (see Low finding). |
| **State machine (approve in US-11.1)** | **ALIGNED** — US-11.3 consumes `approved` only; ConfirmDialog is UX; no new writes. |
| **MVP cut line** | **ALIGNED** — Phase A closes all five AC; zip/webhook/email deferred Phase B with explicit PREP out-of-scope. |
| **ADR-0002 publish gate** | **ALIGNED** — no publish in this story; download ≠ publish; live re-check belongs to US-12.x / IG module. |

---

### Terminology violations (CONTEXT)

**None blocking** in README/TASKS internal docs (uses **Aprobación**, **Cliente**, **Paquete**, **caption de Instagram**, **Ensamblado**, **listo para publicar**, **descarga de respaldo**; explicitly avoids “publish queue” as Cliente product noun and admin/staff).

**CONTRACT / FE i18n must enforce:**

| Prefer (Cliente copy) | _Evitar_ |
|------------------------|----------|
| **listo para publicar** (ES) / localized “Ready to publish” (EN route slug OK) | publish queue (as primary Cliente noun) |
| **descarga de respaldo** | direct static URL, storage key exposure |
| **Aprobación** | approval decision (as primary ES noun) |
| **Cliente** | prestador, dueño, admin, staff |
| **caption de Instagram** | raw concatenation in FE (server composes `effectiveCaption`) |

**Undefined in CONTEXT canon (non-blocking):** “listo para publicar” and “descarga de respaldo” appear in story PREP but are not yet CONTEXT glossary entries — recommend PO add when next editing CONTEXT (story usage matches SPEC §2 / S3.M13 intent).

USER_STORIES AC English strings (“ready to publish list”, “publish queue”) are AC source text — map to canonical ES/EN product copy per table above in `readyToPublish.*` namespace.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-11.3 SECURITY.md | **Yes — next gate** | Download tenancy; approved-only export guards; attachment vs inline matrix; IDOR 404; no static paths; rate limit bucket. |
| US-11.3 CONTRACT.md | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. Extend `lib/contracts/approval.ts` — do not fork US-11.1 decide/list-pending contracts. |
| `listApprovedApprovals` + `ApprovedListItemDto` | **Yes — AC row 1** | `status = 'approved'` only; `decided_at DESC`; client-scoped. |
| Caption export route | **Yes — AC row 2 + [SEC]** | `requireActive`; approved guard; server-composed caption; attachment disposition. |
| Media attachment approved-context | **Yes — [SEC] AC row 5** | Attachment requires approved approval for asset’s assembly — not ownership alone. |
| Approve ConfirmDialog | **No — UX only** | Same `decideApproval` payload; no new action. |
| Zip / webhook / email | **No — Phase B** | Explicit out of scope. |
| IG publish / Fly worker / cron | **No — ADR out of scope** | ADR-0001–0003. |

**SECURITY can proceed?** **Yes.** PREP sufficiently specifies download auth model, queue filters, and state-machine non-mutation for **security-architect** to author **SECURITY.md**.

**CONTRACT blockers (freeze before BUILD):**

1. **`listApprovedApprovals`** — empty strict input; `requireActive("handler")`; query filter; DTO shape.
2. **`GET /api/approvals/[approvalId]/caption.txt`** — approved + tenancy guards; `buildEffectiveInstagramCaption`; rate limit bucket.
3. **Media route extension** — `disposition=attachment` with **approved-context** guard; sanitized filename; inline default unchanged.
4. **Non-goals reaffirmed** — no second approve path; no DDL; no zip; no outbound webhook/email; no IG publish.
5. **Phased acceptance** — Phase A closes USER_STORIES § US-11.3 all five AC.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-11.3 CONTRACT.md** with the non-negotiable freezes above.

1. **S3.M12 / S3.M13 handoff** — Cliente **listo para publicar** queue + **descarga de respaldo** after `approved`.
2. **Queue separation** — `/ready-to-publish` vs `/approvals` pending-only; list excludes rejected / pending / changes_requested.
3. **Download auth** — authenticated routes only; approved guard on exports; attachment approved-context on video download.
4. **State machine** — consume US-11.1 `decideApproval`; verify + test; no new writers.
5. **Explicit out of scope:** zip bundle, webhook/email send, IG Graph publish, Operator ready-to-publish aggregate, mixed-status `/approvals` list, new status enum values, QA re-check on download, RBAC UI.

**Gate status:** SPEC-REVIEW **ALIGNED** (5 Low gaps · 0 blockers). Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
