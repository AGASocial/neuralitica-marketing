## Spec Review — US-11.2

### Verdict: GAPS

US-11.2 intent — extend Cliente **Aprobación** on `/approvals/[approvalId]` with **pedir cambios** (tagged `script` / `caption` / `assembly` / `branding`, length-capped notes, **máx 1 ronda de revisión** per Reel with atomic server enforcement, prompt-injection containment for notes entering agent jobs, minimal downstream re-run routing, `changes_requested` ↔ `pending_client` requeue loop, and Operator one-shot override when the limit is exceeded — is **directionally aligned** with SPEC §1 Regla de Aprobación (“pedir cambios: máximo 1 ronda/Reel; reprocesa solo lo afectado”; “ronda agotada → Operator”), SPEC §3 **Approval Flow** (S3.M12 state machine including `changes_requested`), SPEC §1 SC-3 (Cliente can review/decide within 7 days — one self-serve round + Operator overflow path), SPEC §2 roles (Cliente requests; System routes; Operator intervenes after limit), USER_STORIES § US-11.2 AC (all five rows including [SEC]), and US-11.1 Phase B deferral (first writer of `changes_requested` + revision columns).

**No SPEC amendment required.** No hard rule violations (SC-2 publish gate intact; no unlimited loops; no Cliente-direct pipeline triggers; no publish from `changes_requested`). Remaining items are **CONTRACT / SECURITY freeze gaps** — especially server-only revision invoke seams into closed US-5.1 / US-6.1 / US-9.x / US-10.x orchestrators — not product-direction drift.

**Upstream dependencies satisfied:** US-11.1 ✅ (`neuramark_approvals`, `decideApproval`, gate re-check, forbidden keys, reserved enum) · soft US-4.1 ✅ (delimiter + Zod-before-persist pattern) · US-5.1 / US-6.1 / US-9.1 / US-9.2 / US-10.1 ✅ (regen / assembly / branding / QA helpers exist but are Operator-gated or need explicit revision invoke path).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Medium** | **Revision router cannot call Operator Server Actions from Cliente path.** TASKS wire `routeApprovalChangeRequest` → `regenerateReelScriptSlot`, `regenerateReelCaption`, assembly/branding enqueue, QA re-run. US-5.1 / US-6.1 / US-9.1 / US-9.2 / US-10.1 freeze **Operator-gated** browser actions (`requireOperator`) or helpers without a **`invokedBy: "revision"`** (or equivalent) trusted path. Calling Operator actions from `decideApproval` would break auth model and tenancy. | SPEC §2 (Cliente vs Operator); US-5.1 CONTRACT § dual invoke; US-6.1 CONTRACT § orchestrator; AGENTS.md server-only pipeline | **CONTRACT:** add server-only entrypoints only callable from `routeApprovalChangeRequest` / completion hooks — e.g. extend `generateReelScriptsForClient`, `generateReelCaptionsForClient`, `createAssemblyJobForReelScript`, branding enqueue, `runQaForAssembledReelForClient` with `invokedBy: "revision"` + `{ approvalId, delimitedNotes }`; **forbid** HTTP/Cliente exposure; document closed write surface. |
| **Medium** | **Tag → pipeline expansion table sketched but not frozen.** PO #4 maximal-path union (`script`+`caption` = script path; caption-only skips assembly/branding/QA) matches SPEC “reprocesa solo lo afectado” but lacks frozen step order, failure partial states, and “video job if applicable” rule for manual-upload slots (README open Q #2). | SPEC §1 Regla de Aprobación; S3.M12; USER_STORIES US-11.2 AC row 3 | **CONTRACT:** freeze expansion matrix + ordered enqueue list + error codes when upstream row missing; best-effort video regen policy when prior `neuramark_video_jobs` exists vs manual upload (Operator swap deferral explicit). |
| **Medium** | **Caption-only path: QA re-run skipped — gate on requeue underspecified.** PO #4 / TASKS: caption regen → requeue without QA re-run. Caption changes can affect CTA/claims checks in **Veredicto QA**. Prior `passed` report may be stale vs new caption body. | S3.M11–M12; US-10.1 gate helper; SPEC “solo lo afectado” | **CONTRACT:** freeze one of: (a) lightweight caption-affecting QA subset re-run, or (b) explicit rule “caption-only revision keeps prior QA if gate still `ready` and only caption hash changed” with invalidation trigger; **`requeueApprovalAfterRevision`** must not set `pending_client` unless gate helper returns `ready === true` (US-11.1 SECURITY future-proofing note). |
| **Medium** | **Media-path QA invalidation acknowledged but hook placement not frozen.** README open Q #3: invalidate prior QA when assembly/branding/script path runs. US-10.1 auto-chain runs QA after branding `completed`; revision re-run must not leave US-11.1 gate satisfied on pre-revision report while output asset changed. | S3.M11; US-10.1 CONTRACT § auto-chain; US-11.1 gate re-check | **CONTRACT:** on media-path revision, enqueue `runQaForAssembledReelForClient({ invokedBy: "revision" })` after branding complete; gate `ready` false while QA `pending`/`running`; requeue only after new report satisfies US-10.2 ready rules. |
| **Medium** | **In-flight / idempotency guard for `changes_requested` not frozen.** TASKS note “do not double-enqueue if revision already in flight”; no PO decision on concurrent `request_changes`, router retry, or job failure → Operator manual requeue. | USER_STORIES [SEC] atomic limit; S3.M12 state machine | **CONTRACT:** define single-writer rule while `status = 'changes_requested'` (no second Cliente decide; router idempotency key = `approvalId` + last `change_requests[].roundId`); failure path stays `changes_requested` until Operator fix or successful pipeline + requeue. |
| **Low** | **US-11.1 CONTRACT extension boundary.** Frozen US-11.1 decide enum = `approved` \| `rejected` only; forbidden keys already block `revision_count`, `change_requests`, body `status`. US-11.2 extends same action — backward compatible if CONTRACT amends § Decide, state machine, closed write surface, error codes (`REVISION_LIMIT_EXCEEDED`), package DTO revision fields. | US-11.1 CONTRACT; S3.M12 | **CONTRACT:** extend US-11.1 (or US-11.2 CONTRACT with explicit supersession table); keep forbidden authority keys; allow `changeRequest` only when `decision === "request_changes"`. |
| **Low** | **Operator override semantics aligned but audit shape open.** `operatorGrantExtraRevision` + one-shot `extra_revision_granted` matches SPEC “ronda agotada → Operator”. Audit JSON append shape not frozen (README PO #7). | SPEC §1 Regla de Aprobación; S3.M12; SPEC §2 Operator | **CONTRACT:** freeze action input `{ approvalId, reason }` (reason 1–500 trim), audit append-only field, tenancy `requireOperator` + IDOR 404; no Cliente self-serve extra rounds. |
| **Low** | **Gate re-check on `request_changes` submit — aligned.** Same as US-11.1 approve/reject: `getQaGateStatusForAssembledReel → ready` before accepting pedir cambios. Cliente reviews a gated **Paquete**. | S3.M12; US-11.1 [SEC] AC; US-11.1 SECURITY | **CONTRACT:** document in decide orchestrator step table (mirror US-11.1 step 7); no relaxation. |
| **Low** | **Revision limit + atomic enforcement — aligned.** `APPROVAL_MAX_CLIENT_REVISION_ROUNDS = 1`, single UPDATE increment + check, `REVISION_LIMIT_EXCEEDED` — matches SPEC “máx 1 ronda/Reel” and USER_STORIES [SEC] concurrent/replay AC. | SPEC §1; USER_STORIES US-11.2 AC rows 1 & 4 | **CONTRACT:** freeze SQL WHERE clause (README PO #6), env var name, error code; concurrent double-submit test required. |
| **Low** | **List UX during `changes_requested` — aligned.** `/approvals` pending-only; item leaves queue until requeue; deep-linked detail read-only — consistent with SC-4 review queue focus and US-11.1 Phase A list contract. | US-11.1 CONTRACT § list; SC-4 | **CONTRACT:** extend package DTO status copy for waiting state; no decide CTAs when `changes_requested`. |
| **Info** | **Prompt-injection containment — aligned with US-4.1 pattern.** Delimited `<UNTRUSTED_CLIENT_CHANGE_REQUEST>` (or CONTRACT alias), system instructions outside, Zod before persist/job enqueue, notes never executed as instructions — matches USER_STORIES [SEC] row 5 and US-4.1 SECURITY.delimiters. | US-4.1 CONTRACT § Prompt containment; USER_STORIES [SEC] | **CONTRACT + SECURITY:** freeze delimiter constant shared with content-agents-engineer; apply to script + caption regen only (assembly/branding do not take free-text instructions from Cliente). |
| **Info** | **State machine extension — aligned with US-11.1 reserved enum.** `pending_client` → (`request_changes`) → `changes_requested` → (system requeue) → `pending_client`; approve/reject unchanged from `pending_client`; forbidden Cliente decide from `changes_requested`; terminal `approved`/`rejected` immutable. | S3.M12; US-11.1 migration CHECK; USER_STORIES US-11.3 [SEC] | **CONTRACT:** freeze transition table + actors (Cliente vs system/operator requeue only). |
| **Info** | **ADRs respected.** No Instagram publish from revision (ADR-0002); assembly/branding/FFmpeg on Fly worker via existing jobs (ADR-0003); no weekly cron enqueue (ADR-0001). App-layer decide + route; long work stays off Vercel. | ADR-0001–0003 | Do not add Graph publish or new Vercel FFmpeg in this story. |
| **Info** | **Reject → ¿nueva pieza? unchanged — correct deferral.** US-11.2 explicitly excludes new revision after `rejected`; SPEC reject prompt remains soft follow-up — no conflict. | SPEC §1 Regla de Aprobación; US-11.1 SPEC-REVIEW gap #2 | Do not conflate reject regen with pedir cambios loop. |
| **Info** | **NFR / stack.** `neuramark_approvals` ALTER only (prefix, RLS unchanged); multi-tenant `client_id` from session; i18n EN/ES `approvals.revision.*`; rate limit reuse `approval_decide`; no RBAC UI; no Cliente pipeline controls in copy. | SPEC §5–§6; AGENTS.md; CONTEXT | SECURITY + CONTRACT freeze DDL + forbidden keys. |

**Gap count:** **5 Medium** · **4 Low** (CONTRACT-freeze) · **5 Info** (aligned — document in CONTRACT)

**Blocking items (CONTRACT freeze — not SPEC veto):**

1. Server-only **`invokedBy: "revision"`** orchestrator seams into US-5.1 / US-6.1 / US-9.1 / US-9.2 / US-10.1 — **must not** route through Operator Server Actions.
2. Caption-only vs media-path **QA / gate behavior on requeue** — requeue must not expose ungated package to Cliente.
3. **In-flight idempotency** while `changes_requested` — prevent double pipeline enqueue.
4. Frozen **tag expansion matrix** + completion hook → `requeueApprovalAfterRevision` ownership (BE vs media-pipeline-engineer).

---

### Terminology violations (CONTEXT)

**None blocking** in README/TASKS (uses **Aprobación**, **Cliente**, **Operator**, **Ensamblado**, **Paquete**, **pedir cambios**, **ronda de revisión**, **caption de Instagram**, **Veredicto QA**; explicitly scopes _Evitar_ “change request ticket”, admin/staff, Cliente pipeline controls).

**CONTRACT / FE i18n must enforce:**

| Prefer (Cliente copy) | _Evitar_ |
|------------------------|----------|
| **Pedir cambios** | change request (as primary ES noun); ticket |
| **Ronda de revisión** / revisiones restantes | unlimited revisions; admin override (Cliente-facing) |
| **Aprobación** | approval decision |
| **Cliente** | prestador, dueño, staff |
| **Operator** / contactar a tu equipo (escalation) | admin, administrador, staff |
| **Ensamblado** / **Reel ensamblado** | assembled reel (ES UI) |
| **Veredicto QA** | QA verdict |

Technical enums (`request_changes`, `changes_requested`, `changeRequest`, `change_requests`, tag keys) OK in code/DB/wire JSON. Map tags to localized labels (`approvals.revision.tags.*`) — not raw pipeline jargon in Cliente UI.

Wire decision value **`request_changes`** (verb) → status **`changes_requested`** (noun) is acceptable technical vocabulary; ES UI labels must still say **pedir cambios**, not “request changes”.

---

### Recommended action

1. **Proceed to SECURITY.md** — threat model: atomic revision limit; untrusted change text; extend decide surface (no parallel smuggle path); revision orchestrator auth (`invokedBy: "revision"` trust boundary); IDOR on `approvalId`; Operator grant tenancy; gate purity on submit and requeue.
2. **Freeze US-11.2 CONTRACT.md** (extends US-11.1) with:
   - Extended `decideApproval` schema + state machine + atomic UPDATE SQL
   - `changeRequestSchema` + `REVISION_LIMIT_EXCEEDED`
   - `routeApprovalChangeRequest` + `requeueApprovalAfterRevision` + `operatorGrantExtraRevision`
   - Tag expansion table + revision invoke matrix (per upstream story)
   - QA invalidation / caption-only gate rules
   - Package DTO: `revisionCount`, `maxRevisionRounds`, `extraRevisionGranted`, optional `lastChangeRequest`
   - Closed write surface (only listed modules may write `changes_requested`, increment `revision_count`, requeue)
   - Prompt delimiter constant (shared with content-agents-engineer)
   - **Reviewed by FE** line before BUILD
3. **VALIDATION** must map each USER_STORIES § US-11.2 AC row to evidence; Phase A closes full story (US-11.1 deferral satisfied); US-11.3 download/ready queue not required for CLOSE.
4. **No SPEC.md edit** unless product later wants SC-3 telemetry hooks for “revision completed within 7 days” (optional; not blocking PREP → SECURITY → CONTRACT).

---

### Checklist (spec-guardian)

| Check | Result |
|-------|--------|
| Vision & SC-1..SC-4 | **Pass** — one controlled revision round supports SC-3; no publish without Aprobación (SC-2) |
| Roles Cliente / Operator / System | **Pass** — Cliente pedir cambios; System routes; Operator limit override + manual fix |
| Modalidades visuales | **N/A** — no change to allowlist / slot assignment |
| Playbook vs Trend | **N/A** |
| ADR-0001 cron | **Pass** — out of scope |
| ADR-0002 no IG without approval | **Pass** — `changes_requested` not publishable |
| ADR-0003 long work on Fly | **Pass** — reuse existing assembly/branding/QA jobs |
| NFR server-only / i18n / `neuramark_` / `client_id` | **Pass** — gaps are CONTRACT detail only |
| Out of scope (Stories, multicanal, ads, RBAC UI) | **Pass** |
| US-11.1 state machine extension | **Pass with CONTRACT gaps** — extension coherent; invoke seams need freeze |

---

**Reviewed by:** spec-guardian — 2026-08-30  
**Branch:** `feature/US-11.2-revision-round`  
**Next gate:** SECURITY.md → CONTRACT.md
