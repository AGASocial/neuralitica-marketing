## Spec Review — US-12.2

### Verdict: GAPS

US-12.2 intent — **Operator**-only **manual mark-published** on the existing **Calendario de contenido** Sidebar: mark an **approved** **Reel** as **publicado** with editable published date (default today) and optional Instagram post URL; persist `publish_status = published` plus `published_at` / `instagram_post_url` on `neuramark_content_calendar_slots`; server-side **approved-only** re-check and `requireOperator("handler")`; unlock **US-13.1** metrics on published Reels — is **directionally aligned** with SPEC §1 SC-2 (no piece marked published without **Aprobación**), SPEC §2 **Operator-only** calendar mutation, SPEC §3 P2 Content Calendar (“estados hasta published”; **mark published manual = fallback**), SPEC §3 S3.M13 Instagram Publish (Graph deferred; manual bookkeeping is explicit fallback, not a substitute for approval), USER_STORIES § US-12.2 AC (all four rows), **DESIGN_PROMPTS §10** (Mark published dialog + violet published cards + IG link), frozen **US-12.1 CONTRACT** handoff (`slotId`, `publish_status`, `assembledReelId`, sync preserve pattern), and **ADR-0002** (Graph publish stays out of scope; approved-only guard pattern reusable by future adapter).

**No SPEC amendment required.** **No CONFLICT.** Remaining items are **documentation reconciliation** (SPEC P2 label vs sprint P1, USER_STORIES DB row staleness), **CONTRACT/SECURITY freeze** gaps (date storage, IG URL strictness, re-mark after approval revoke, sync orphan DELETE vs metrics), and **CONTEXT glossary** gaps — not product-direction drift. Phase A closes full US-12.2 AC per PO binding note.

**Upstream dependencies satisfied:** US-12.1 ✅ (`/operator/calendar`, `neuramark_content_calendar_slots`, Sidebar, read DTO, sync-on-read, `deriveCalendarPipelineStatus` with `published` cascade) · US-11.x ✅ (approval statuses for re-check) · US-14.x `requireOperator()` floor.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Low** | **SPEC §3 P2 module label vs USER_STORIES / Sprint 7 P1.** SPEC S3.M15 lists Content Calendar + Metrics as **P2**; USER_STORIES and Sprint 7 schedule US-12.2 as **P1**. Behavior unchanged — sprint promotion, not scope reduction. | SPEC §3 S3.M15; USER_STORIES § US-12.2; README § SPEC alignment | **Document precedence:** `plan/USER_STORIES.md` + frozen PREP govern BUILD. Optional PO amend SPEC §3 P2→P1 note on next SPEC edit — **not a BUILD blocker**. |
| **Low** | **USER_STORIES DB row stale — omits `published_at` and `instagram_post_url`.** Table lists only `publish_status: ready \| published`; PREP adds ALTER columns for manual mark metadata. | USER_STORIES US-12.2 DB row; README PO #3 | CONTRACT uses full column set; amend USER_STORIES DB row on next PO edit. |
| **Low** | **Open questions not frozen until CONTRACT.** IG host strictness (`www` only), `publishedAt` date-only → UTC noon storage, future-date bound (today + 1 day lean), re-mark when approval later revoked, return shape, rate limit, empty URL → null — all listed in README § Open questions. | README § Open questions; TASKS § Open questions for CONTRACT | **CONTRACT** must freeze each; lean PO resolutions are acceptable if SECURITY does not veto. |
| **Low** | **Sync orphan DELETE of published slots — metrics orphan risk.** US-12.1 CONTRACT hard-deletes calendar rows when strategy slot drops; published metadata lost if brief changes. README documents as known V1; US-13.1 may orphan metrics. | US-12.1 CONTRACT § `syncCalendarSlotsForWeek`; README PO #10 · open Q #8 | **CONTRACT:** reaffirm preserve-on-upsert for surviving rows; document orphan DELETE behavior; US-13.1 CONTRACT should handle missing slot gracefully. |
| **Low** | **Re-mark after approval revoked — edge case until CONTRACT.** PO #4/#15: re-check `approved` on every write; if approval no longer `approved`, reject update; published row unchanged. Correct for SC-2 but error code + FE copy must be frozen. | SPEC §1 SC-2; README PO #4 · #15 | **CONTRACT:** freeze `NOT_APPROVED` on re-mark path; FE shows update CTA only when still approved or documents read-only published state when not. |
| **Info** | **Manual mark vs Graph publish — ALIGNED; no ADR-0002 breach.** ADR-0002 mandates Graph API publish after **Aprobación**; US-12.2 is **bookkeeping** when Operator publishes outside the system (or before Graph ships). SPEC §3 P2 explicitly: “mark published manual = fallback.” No OAuth, container→publish, or integrations-engineer work in scope. | ADR-0002; SPEC §3 P2 S3.M15; README § Scope out | BUILD grep: no Graph/integrations imports. Future ADR-0002 adapter may set same columns on Graph success — reuse approved-only guard. |
| **Info** | **Approved-only hard rule — ALIGNED with SC-2 and roadmap.** Write-time join slot → assembled reel → latest `neuramark_approvals.status = approved`. FE CTA on `pipelineStatus === 'approved'` is UX only; VALIDATION must prove non-approved and non-operator paths fail in handler. Pending / changes_requested / rejected cannot mark. | SPEC §1 SC-2; SPEC §3 S3.M12; USER_STORIES AC rows 1 & 4 [SEC]; SECURITY_BASELINE § approval-gate bypass | SECURITY + CONTRACT: freeze join path mirroring calendar read; structured errors `NOT_APPROVED` / `SLOT_NOT_READY`. |
| **Info** | **Operator-only mutation — ALIGNED.** `markCalendarSlotPublished` with `requireOperator("handler")` first; zero side effects on 403. No Cliente mark-published; no `client_id` on input; slot `client_id` resolved server-side from row. | SPEC §2 Operator-only actions; US-12.1 CONTRACT § forbidden surfaces; README PO #8 | SECURITY reaffirm forbidden authority keys; CONTRACT strict `.strict()` input. |
| **Info** | **US-12.1 calendar handoff — ALIGNED.** Mutation keys off `slotId` from `CalendarSlotDetailDto`; extends DTO with `publishedAt`, `instagramPostUrl`; sync preserves `publish_status`, `published_at`, `instagram_post_url` on upsert; `pipelineStatus = published` already derived when `publish_status === 'published'`. Does not overload `getOperatorCalendarForWeek` as write action. | US-12.1 CONTRACT § Handoffs · § sync rules · § Non-goals | CONTRACT delta on `lib/contracts/calendar.ts` only; no new calendar page/route. |
| **Info** | **IG URL validation — ALIGNED with [SEC] AC.** Optional; when present must be `https://www.instagram.com/...`; stored as text; FE renders link only from server-validated DTO (`target=_blank`, `rel=noopener noreferrer`). Rejects bare `instagram.com`, `m.`, unvalidated `href` from raw input. | USER_STORIES AC row 4 [SEC]; README PO #7 | CONTRACT freeze regex, max length (lean 500), empty → null normalization. |
| **Info** | **US-13.1 handoff — ALIGNED.** Published slot + `assembledReelId` gates metrics; no `neuramark_reel_metrics` in US-12.2. | USER_STORIES US-13.1; README PO #14 | Do not create metrics tables/UI here. |
| **Info** | **Unpublish / revert — correctly OUT.** V1 sticky `published`; no transition back to `ready`. Matches metrics assumption and avoids SC-2 ambiguity. | README § Scope out · PO #5 | CONTRACT non-goals reaffirm; no unpublish action in BUILD. |
| **Info** | **NFR / stack — ALIGNED.** `neuramark_*` prefix on ALTER; RLS deny-by-default unchanged; multi-tenant `client_id` server-resolved; EN/ES `calendar.markPublished.*`; nextjs-backend + nextjs-frontend only; no Fly worker / Vercel FFmpeg. | SPEC §5–§6; AGENTS.md; TASKS implementer routing | SECURITY owns rate limit bucket. |

**Gap count:** **5 Low** (documentation / CONTRACT freeze) · **8 Info** (aligned — document in CONTRACT) · **0 Medium** · **0 High** · **0 CONFLICT**

**SPEC blockers:** none. **ADR breaches:** none if Graph publish stays deferred and approved-only guard is server-side.

---

### Focus areas (binding assessment)

| Focus | Assessment |
|-------|------------|
| **Manual mark vs Graph publish (ADR-0002)** | **ALIGNED** — US-12.2 is manual bookkeeping on **Calendario de contenido**, not Instagram Graph API. SPEC §3 P2 names manual mark as fallback. ADR-0002 future adapter reuses approved-only pattern; may write same columns. No integrations-engineer scope. |
| **Approved-only hard rule** | **ALIGNED** — server re-check at write time; FE gate insufficient alone; rejects pending/changes_requested/rejected; [SEC] AC satisfied when VALIDATION proves handler enforcement. |
| **Calendar handoff from US-12.1** | **ALIGNED** — `slotId` mutation target; sync preserve publish metadata; DTO extension; Sidebar Dialog per DESIGN §10; no new route; read action stays read-only. |
| **SC-2 (no publish without Aprobación)** | **ALIGNED** — marking **publicado** requires latest approval `approved`; Operator records external publish of already-approved Reel, does not bypass **Aprobación**. |
| **P1 vs P2 in SPEC** | **GAPS (documentation)** — sprint promotion; USER_STORIES/PREP govern BUILD; no scope reduction. |

---

### Terminology violations (CONTEXT)

**None blocking** in README/TASKS (uses **Calendario de contenido**, **Operator**, **Cliente**, **Reel**, **Aprobación**, **publicado**, **listo para publicar**, **Ensamblado**; explicitly avoids “publish queue” as Operator primary noun, admin/staff, unvalidated IG `href`, storage keys, client-supplied `client_id`).

**CONTRACT / FE i18n must enforce:**

| Prefer (Operator copy) | _Evitar_ |
|------------------------|----------|
| **publicado** / mark as **publicado** (ES) | “Publicación manual asistida” as product mode label (CONTEXT _Evitar_ — refers to V1-only publish mode, not this bookkeeping action) |
| **Calendario de contenido** | publish queue (Operator primary noun) |
| **Operator** / **Cliente** | admin, administrador, staff |
| **Aprobación** | approval decision (primary ES noun) |
| **listo para publicar** (approved pipeline stage) | Cliente queue naming on Operator aggregate |

**English AC source** (“Mark published”, “Mark manual publication done”) — map to canonical ES/EN in `calendar.markPublished.*`; EN button may stay “Mark published” if ES uses **Marcar como publicado** or equivalent.

**Undefined in CONTEXT canon (non-blocking):** **publicado** (calendar slot state) and manual mark bookkeeping vs **Publicación en Instagram** (Graph) — recommend PO add disambiguation when next editing CONTEXT (SPEC §3 P2 already separates fallback from Graph).

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-12.2 SECURITY.md | **Yes — next gate** | `requireOperator` first; approved-only handler; IG URL allowlist; no `client_id` authority; rate limit; safe link rendering. |
| US-12.2 CONTRACT.md | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| `markCalendarSlotPublished` | **Yes — all AC** | Strict input; approval re-check; UPDATE columns; idempotent re-mark; error envelope. |
| ALTER migration | **Yes — persistence** | `published_at`, `instagram_post_url` on existing table; no enum change. |
| Calendar read DTO delta | **Yes — display** | `publishedAt`, `instagramPostUrl` on `CalendarSlotDetailDto`; violet + IG affordance. |
| `syncCalendarSlotsForWeek` preserve | **Yes — continuity** | Preserve all three publish fields on upsert. |
| Instagram Graph publish | **No — ADR-0002 deferred** | integrations-engineer; separate story. |
| Unpublish | **No — Phase B** | Explicit out of scope. |
| Metrics / US-13.1 | **No — downstream** | Consumes published slots only. |

**SECURITY can proceed?** **Yes.** PREP sufficiently specifies Operator gate, approved-only boundary, and manual-vs-Graph separation for **security-architect** to author **SECURITY.md**.

**CONTRACT blockers (freeze before BUILD):**

1. **`markCalendarSlotPublished`** — strict `{ slotId, publishedAt, instagramPostUrl? }`; `requireOperator("handler")`; success `{ ok: true, slot: CalendarSlotDetailDto }`.
2. **Approved re-check** — same join path as calendar read; `NOT_APPROVED` / `SLOT_NOT_READY` / `NOT_FOUND` error codes.
3. **ALTER columns** — `published_at timestamptz NULL`, `instagram_post_url text NULL`; `publish_status` CHECK unchanged.
4. **IG URL schema** — `https://www.instagram.com/...` only; max length; `""` → null.
5. **`publishedAt` input** — date-only `YYYY-MM-DD` → store UTC noon (PO lean); future-date bound frozen.
6. **Sync preserve** — `publish_status`, `published_at`, `instagram_post_url` on upsert; orphan DELETE behavior documented.
7. **Non-goals reaffirmed** — no Graph publish; no unpublish; no Cliente mutation; no `client_id` on input; no metrics tables.
8. **Phased acceptance** — Phase A closes USER_STORIES § US-12.2 all four AC.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-12.2 CONTRACT.md** with the non-negotiable freezes above.

1. **Manual mark boundary** — bookkeeping only; ADR-0002 Graph stays out; approved-only server re-check is the SC-2 control.
2. **US-12.1 continuity** — `slotId` off existing DTO; sync preserve; Sidebar Dialog; extend read DTO for published display.
3. **IG URL safety** — store-time validation; DTO-only link rendering; no raw user input in `href`.
4. **Idempotent re-mark** — overwrite date/URL when already published and still approved; no unpublish.
5. **Explicit out of scope:** Graph API, unpublish, Cliente mark-published, metrics, separate route, approval/QA mutations, RBAC UI.

**Gate status:** SPEC-REVIEW **GAPS** (5 Low · 0 blockers · 0 CONFLICT). Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
