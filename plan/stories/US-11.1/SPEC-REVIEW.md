## Spec Review — US-11.1

### Verdict: ALIGNED

US-11.1 intent — the **Cliente** opens **`/approvals`**, previews a gated **paquete** (branded **Ensamblado** video + caption + selected CTA + hashtags + disclosure when required + read-only QA override audit), and decides **approve** / **reject**; the **System** creates `pending_client` rows only when assembly+branding+QA gate are ready, re-checks **`getQaGateStatusForAssembledReel`** on create **and** decide, widens authenticated **`assembled_reel`** media serve for owning Cliente, and writes `pending_client` → `approved` \| `rejected` — is **aligned** with SPEC §3 **Approval Flow** (S3.M12: preview paquete; gate ensamblado+QA; state machine), SPEC §1 SC-1–SC-4 (Reels listos para aprobar; no publish without **Aprobación**; review ≤ 30 min / first lote ≤ 7 días), SPEC §2 roles (Cliente decides; Operator does not own this queue; System gates), SPEC §4 flow 3 (Aprobación happy path slice), SPEC §5–§6 (`neuramark_*`, server-only secrets/assets, multi-tenant `client_id`, EN/ES), USER_STORIES § US-11.1 AC (core + [SEC] gate re-check + IDOR), and frozen upstream **US-10.1** ✅ / **US-10.2** ✅ (gate helper + override DTO) · **US-9.2** ✅ (branded `assembled_reel`) · soft **US-6.1/US-6.2** (caption + selected CTA).

**No SPEC amendment required.** Soft gaps (pedir cambios → US-11.2; reject→¿nueva? prompt; Cliente CTA picker; ready-to-publish/download polish → US-11.3; weekly cron enqueue → ADR-0001 integrations) are **explicit Phase A deferrals** with dedicated next stories — not product-direction drift. USER_STORIES FE owner-table “request changes” is interpreted by VALIDATION as **US-11.2** (same phased pattern as US-10.1 override / US-10.2 approval-screen render).

**Upstream dependencies satisfied:** US-10.1 ✅ · US-10.2 ✅ · US-9.2 ✅ · US-6.1/US-6.2 soft (CTA required at ensure) · US-14.x `requireActive` floor.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Low** | **FE owner table lists “request changes” in US-11.1.** USER_STORIES FE work row: approve/reject/**request changes**. PREP Phase A hides request-changes control; **US-11.2** owns `changes_requested` + revision round. Soft AC phasing — not a SPEC conflict (S3.M12 full module spans 11.1–11.2). | USER_STORIES US-11.1 FE; S3.M12; US-11.2 | VALIDATION must record: Phase A closes preview + approve/reject + [SEC] gates; request-changes AC lives on **US-11.2**. Do not ship `changes_requested` writes or a disabled stub that implies write. |
| **Low** | **SPEC “rechazar → System pregunta si generar nueva” deferred.** Phase A records `rejected` + optional `clientFeedback`; no auto-regen prompt. Soft gap vs S3.M12 / §1 Regla de Aprobación. | SPEC §1 Regla de Aprobación; S3.M12 | Document in CONTRACT + VALIDATION as follow-up (post-11.1 / regen story). Rejected pieces stay out of publish queue (aligned). |
| **Low** | **SPEC S3.M7 “elegir variante CTA al aprobar” vs Operator-selected CTA.** Phase A displays `selectedCtaText` from US-6.2; no Cliente picker. Soft gap — package still shows the CTA that will publish. | S3.M7; S3.M12; US-6.2 | CONTRACT: create fails if CTA null (`CAPTION_CTA_NOT_SELECTED`). Escalate Cliente picker only if product insists (US-11.3 / Phase B). |
| **Low** | **US-11.3 overlap on `approved` status.** USER_STORIES US-11.3 BE “Status → `approved`”; PREP correctly lands approve transition in 11.1 so the state machine exists; 11.3 owns ready-to-publish list + download UX. | USER_STORIES US-11.3; S3.M12; ADR-0002 | CONTRACT + VALIDATION: Phase A owns `decideApproval(…, 'approved')`; US-11.3 must not invent a second approve path. |
| **Low** | **USER_STORIES DB shorthand omits `neuramark_`.** Row lists `approvals`; canonical **`neuramark_approvals`**. PREP DDL correct. | SPEC §1 prefix; §6; AGENTS.md | CONTRACT uses prefixed names; amend USER_STORIES DB row when PO next edits. |
| **Low** | **Weekly cron auto-enqueue soft gap.** SPEC S3.M14 / ADR-0001 System → cola Aprobación. Phase A uses ensure-on-list/detail (no Operator “Send to approval”). Same pattern as prior cycle stories. | S3.M14; ADR-0001; S3.M12 | Document system seam; **no** cron HTTP in US-11.1 BUILD. Not a PREP/SPEC veto. |
| **Info** | **S3.M12 core Phase A ALIGNED.** Preview paquete; gate ensamblado+QA; `pending_client` → `approved` \| `rejected`; `changes_requested` reserved in CHECK enum; rechazados fuera de publish (no publish writes). | S3.M12; SPEC §1 SC-2 | Gate re-check on create + decide; never honor body `qaPassed` / `ready`. |
| **Info** | **Media serve widen ALIGNED and intentional.** US-9.2 left `assembled_reel` Operator-only; Cliente preview requires authenticated own-tenant serve. Do **not** widen `generated_video` / `voiceover`. | SPEC §6; US-9.2 CONTRACT; USER_STORIES [SEC] IDOR | SECURITY + CONTRACT: freeze matrix — `requireActive` + `row.client_id === session.id` → serve; foreign → 404; keep Operator path. |
| **Info** | **Consumes US-10.2 gate correctly.** `ready` iff `passed` **or** (`failed` ∧ full overridable override coverage); `blocked` never ready; override audit render-only for Cliente. | S3.M11–M12; US-10.2 CONTRACT / SPEC-REVIEW | Import `getQaGateStatusForAssembledReel` — do not fork readiness. |
| **Info** | **Roles / surfaces ALIGNED.** Cliente `/approvals` (+ dashboard card + header nav); no Operator override CTA; no RBAC UI; no Cliente QA mutation. | SPEC §2; S3.M12 | FE: Approve/Reject only; EN/ES `approvals.*`. |
| **Info** | **ADRs respected.** No IG publish (ADR-0002 — approve only sets ready-for-later-publish); no Fly FFmpeg (ADR-0003); no weekly cron HTTP (ADR-0001). App-layer Next/Vercel only. | ADR-0001–0003 | Do not add Graph publish or worker jobs for this story. |
| **Info** | **Hard rules / out of scope intact.** No publish without Aprobación (SC-2); no human recording; no Stories/multicanal/ads/RBAC; Playbook ≠ Trend untouched. | SPEC §1; CONTEXT | Approve ≠ publish. |
| **Info** | **NFR / stack.** `neuramark_approvals`; RLS deny-by-default; multi-tenant `client_id` from session (never body); i18n EN/ES; package DTO excludes `storage_key`, spend, prompts, foreign write fields. | SPEC §5–§6; AGENTS.md | SECURITY owns IDOR + forbidden-key scan; CONTRACT freezes DTO/Zod. |

---

### TASKS open questions — resolved against SPEC

| # | Question (README) | Resolution | SPEC / ADR basis |
|---|-------------------|------------|------------------|
| 1 | Ensure-on-list vs Operator “Send to approval”? | **Ensure-on-list/detail** — matches auto queue to Aprobación; no Operator send button Phase A. | S3.M12; S3.M14; ADR-0001 (cron later) |
| 2 | Reject feedback required? | **Optional** 0–500 trim — SPEC does not mandate feedback text. | S3.M12 reject path |
| 3 | Show decided history on `/approvals`? | **No** Phase A — pending only; history optional later. | SC-4 focus on review queue |
| 4 | Cliente CTA picker at approve? | **Defer** — Operator selection upstream; display only. Soft vs S3.M7. | S3.M7; US-6.2 |
| 5 | Minimal download on approve? | **Defer to US-11.3** — preview via media route is enough for 11.1 AC. | USER_STORIES US-11.3; S3.M13 respaldo |

**No SPEC amendment required** for the resolutions above. They complete S3.M12 **Phase A** (preview + decide approve/reject + gate) without reopening US-11.2 revision or US-11.3 publish-queue UX.

**Recommended USER_STORIES amendments** (non-blocking hygiene when PO next edits):

1. FE owner row → note request-changes = US-11.2 (or split work rows).
2. DB row → `neuramark_approvals` + `client_id` / `decided_by`.
3. Clarify US-11.3 owns ready-to-publish list + download; approve transition may land in 11.1.

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS (uses **Aprobación**, **Cliente**, **Operator**, **Ensamblado**, **Paquete**, **caption de Instagram**, **disclosure**, **Veredicto QA**; correctly scopes _Evitar_ “approval decision” as product noun; no admin/staff; no Cliente override capability).

Product-facing EN/ES for US-11.1 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **Aprobación** | approval decision (as primary ES noun) |
| **Cliente** | prestador, dueño, usuario final |
| **Operator** | admin, administrador, staff |
| **Reel ensamblado** / **Ensamblado** | assembled reel (user-facing ES) |
| **Paquete** (preview package) | approval package (ok in EN UI if localized; avoid “approval decision”) |
| **Veredicto QA** | QA verdict (as primary product noun) |
| **disclosure** (presenter is not the owner) | impersonation (in Cliente-facing copy) |
| **Ciclo semanal automatizado** (if mentioned) | cron / batch job (in product UI) |

Technical enums (`pending_client`, `assembled_reel`, `qaOverrides`, `previewUrl`) OK in code/DB; map to localized labels in FE. Do **not** expose Operator override as a Cliente capability; do **not** show cost/spend fields on package DTO.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-11.1 SECURITY.md | **Yes — next gate** | Threat model: gate purity on create+decide; IDOR 404; media serve widen tenancy; no client-writable `qaPassed`/`ready`/`status`; reject feedback injection bounds. |
| US-11.1 CONTRACT.md (DDL, actions, DTO, media matrix) | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| Gate re-check create + decide | **Yes — [SEC] AC + S3.M12** | Import US-10.2 helper; reject ungated decide; no status write if not ready. |
| IDOR scoping | **Yes — [SEC] AC** | Foreign approval/assembled/media IDs → 404; `client_id` from session only. |
| `neuramark_approvals` DDL + RLS zero policies | **Yes — SPEC prefix + house pattern** | UNIQUE `assembled_reel_id`; enum includes reserved `changes_requested`. |
| Media serve widen `assembled_reel` only | **Yes — preview AC + §6** | Cliente own-tenant; keep Operator; do not widen generated/voiceover. |
| Package DTO shape | **Yes — S3.M12 preview** | video · caption+CTA · hashtags · disclosure · qaOverrides; forbid storage_key/spend/prompts. |
| Request-changes / regen prompt / CTA picker / download list | **No — US-11.2 / later / US-11.3** | Soft deferrals; VALIDATION must not claim full S3.M12 closed. |
| Weekly cron / IG publish / Fly worker | **No — out of scope** | ADR-0001–0003. |

**SPEC blockers on intent:** none. **ADR breaches:** none if approve/reject stay on Next server layer, media serve remains authenticated + tenant-scoped, and no IG publish ships here.

**SECURITY can proceed?** **Yes.** [SEC] AC items (gate re-check on create + decide; IDOR 404; no client-supplied readiness flags) and SECURITY_BASELINE continuity with US-10.2 / US-9.2 media serve are specified sufficiently for **security-architect** to author **SECURITY.md**.

**CONTRACT blockers (freeze before BUILD):**

1. Migration — `neuramark_approvals` (`id`, `client_id`, `assembled_reel_id` UNIQUE, `status` CHECK including reserved `changes_requested`, `client_feedback`, `decided_at`, `decided_by`, timestamps); index `(client_id, status, created_at DESC)`; RLS enabled, zero policies.
2. **`ensureApprovalPackageForAssembledReel`** — branding complete + gate `ready` + selected CTA; idempotent INSERT `pending_client`; typed errors (`QA_GATE_NOT_READY`, `CAPTION_CTA_NOT_SELECTED`).
3. **`listPendingApprovals` / `getApprovalPackage` / `decideApproval`** — `requireActive("handler")` first; Cliente-scoped 404; decide only `approved` \| `rejected` from `pending_client`; gate re-check before write; actor from session.
4. Package DTO Zod (server-owned) — video `{ assetId, previewUrl }` · caption · hashtags · disclosure · `qaOverrides` audit; optional informational `gate`; never `storage_key` / spend / prompts / client-writable gate flags.
5. Media matrix — widen `assembled_reel` for owning Cliente; cover poster optional; no widen of `generated_video` / `voiceover`.
6. Zod `.strict()` + forbidden keys (`qaPassed`, `ready`, `status` as authority, `clientId`, override spoof fields).
7. Phased acceptance — US-11.1 closes preview + approve/reject + [SEC] gates; US-11.2 request-changes; US-11.3 ready-to-publish/download polish.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-11.1 CONTRACT.md** with the non-negotiable freezes above.

1. **S3.M12 Phase A** — Cliente package preview + approve/reject + ensamblado+QA gate.
2. **Gate purity** — re-check on create and decide; import US-10.2 helper only.
3. **Media serve widen** — intentional for Cliente preview; tenant + IDOR hard.
4. **State machine slice** — `pending_client` → `approved` \| `rejected`; reserve `changes_requested`.
5. **Explicit out of scope:** request-changes UI/mutations, reject→regen prompt, Cliente CTA picker, ready-to-publish list, download/export polish, Stories IG, multicanal, ads, RBAC UI, Playbook/Trend, Fly FFmpeg, IG publish, weekly cron HTTP.

**Gate status:** SPEC-REVIEW **ALIGNED**. Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
