## Spec Review — US-12.1

### Verdict: GAPS

US-12.1 intent — **Operator**-only **Calendario de contenido** at **`/operator/calendar`**: multi-client Mon–Sun week grid materialized from latest **approved** **Estrategia semanal** slots (`neuramark_content_calendar_slots` + sync-on-read), **pipeline display status** derived at read time (draft → generating → qa → pending → approved → published), per-client **&lt;3 slot gap warnings**, Sidebar detail + deep links into existing Operator production surfaces, **no `publish_status` writes** (US-12.2) — is **directionally aligned** with SPEC §1 SC-1 (3 Reels/semana operational target), SC-2 (display-only; no publish without **Aprobación**), SPEC §2 **Operator-only** “calendario agregado multi-cliente”, SPEC §3 P2 Content Calendar module behavior (“vista semanal Operator; estados hasta published; huecos &lt;3 Reels”), SECURITY_BASELINE § (e) (Operator aggregate vs future Cliente-scoped endpoint), frozen **US-11.3** ✅ (Operator ≠ Cliente `/ready-to-publish`), **US-4.1/4.2** ✅ (approved strategy slots, `week_start`, `dayOfWeek`), USER_STORIES § US-12.1 AC (all five rows), and **ADR-0002** (calendar surfaces approved-ready Reels; publish + `published` writes deferred to US-12.2; Graph adapter re-checks approval server-side).

**No SPEC amendment required.** **No CONFLICT.** Remaining items are **documentation reconciliation** (SPEC P2 label vs sprint P1), **USER_STORIES table staleness**, and **CONTRACT/SECURITY freeze** gaps (status cascade for rejected approvals, orphan sync deletion, gap math edge cases) — not product-direction drift. Phase A closes full US-12.1 AC per PO binding note.

**Upstream dependencies satisfied:** US-11.3 ✅ (Cliente queue separate; no Operator aggregate reuse) · US-4.1 ✅ · US-4.2 ✅ (approved brief slots) · US-11.1 ✅ (approval statuses for derivation) · pipeline tables through US-10.x ✅ · US-14.x `requireOperator()` floor.

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **Low** | **SPEC §3 P2 module label vs USER_STORIES / Sprint 7 P1.** SPEC S3.M15 lists “Content Calendar (P2)”; USER_STORIES module header and Sprint 7 schedule treat US-12.1 as **P1**. Behavior and Operator-only aggregate in SPEC §2 are unchanged — this is a **sprint promotion**, not scope reduction. | SPEC §3 S3.M15; SPEC §2 Operator actions; USER_STORIES § US-12.1; README PO #10 open Q | **Document precedence:** `plan/USER_STORIES.md` + frozen PREP are sprint source of truth for US-12.1 BUILD scope. Optional PO amend SPEC §3 P2→P1 note when next editing SPEC — **not a BUILD blocker**. |
| **Low** | **USER_STORIES FE owner row stale — “drag optional P1”.** PREP Phase A explicitly **defers drag-and-drop reschedule to Phase B**; grid is read-only in US-12.1. | USER_STORIES US-12.1 FE row; README § Scope out · PO #9 | Amend USER_STORIES FE row when PO next edits: “Week grid (read-only Phase A); Sidebar detail; gap warnings; status colors.” VALIDATION must not require drag for CLOSE. |
| **Low** | **USER_STORIES DB row omits `neuramark_` prefix and full slot shape.** Table says `content_calendar_slots (client_id, date, reel_script_id, publish_status)` — PREP adds `week_start`, `slot_index`, `strategy_id`, `scheduled_date`, UNIQUE constraint. | SPEC §5–§6; AGENTS.md; USER_STORIES US-12.1 DB row | CONTRACT uses **`neuramark_content_calendar_slots`** per NFR; amend USER_STORIES DB row on next PO edit. |
| **Low** | **DESIGN_PROMPTS §10 spans US-12.1 + US-12.2.** Prompt includes “Mark published” dialog and IG link on published cards — **out of US-12.1 BUILD** per README/TASKS (US-12.2 owns writes). | DESIGN_PROMPTS §10; USER_STORIES US-12.2; README § Scope out | **CONTRACT + FE:** Phase A implements grid + Sidebar only; **no** mark-published UI. Published **display** (`publish_status = published`, violet color) when US-12.2 has written rows — read-only. |
| **Low** | **Rejected-approval card rule open until CONTRACT.** PO #14: hide cards for `rejected`; slot may revert to `generating` or `qa` if assembly exists — exact cascade not frozen. | S3.M12 rechazados fuera de publish queue; README PO #5 · #14 | **CONTRACT:** freeze `deriveCalendarPipelineStatus` rule for `rejected` (hide card vs show pipeline status); align with US-11.1 “rechazados fuera de publish queue” — calendar is planning/ops view, not Cliente publish queue. |
| **Low** | **Orphan slot deletion on sync open until CONTRACT.** PO lean: delete rows whose `(client_id, week_start, slot_index)` no longer in latest approved brief. | README open Q #8; US-4.2 strategy supersession | **CONTRACT:** freeze upsert + orphan delete semantics (hard delete vs `deleted_at`); idempotency tests required. |
| **Info** | **Operator aggregate vs Cliente separation — ALIGNED.** New `getOperatorCalendarForWeek({ weekStart })` with **`requireOperator("handler")`**; **no `client_id` param**; **no reuse** of Cliente `listApprovedApprovals` / `/ready-to-publish`. Future Cliente calendar = **separate endpoint** scoped to server-resolved `client_id`. | SPEC §2 Operator-only actions; SECURITY_BASELINE § (e); USER_STORIES [SEC] AC row 5; US-11.3 CONTRACT | SECURITY + CONTRACT reaffirm forbidden body keys; aggregate never client-filtered in browser. |
| **Info** | **3 Reels/week gap indicator — ALIGNED.** Per active client with approved strategy for week: warning when **&lt;3** calendar slot rows after sync (`missingCount = 3 - scheduledCount`). Supports SC-1 operational cadence. Clients **without** approved strategy excluded from gap math (PO #7). | SPEC §1 SC-1; SPEC §3 P2 “huecos &lt;3 Reels”; USER_STORIES AC row 1 | CONTRACT freeze gap DTO + edge case: client with approved brief but 0 synced rows (strategy slots &lt;3) still triggers warning. |
| **Info** | **Pipeline status derivation — ALIGNED with SPEC “estados hasta published”.** Display enum derived at read from scripts / video jobs / assembly / QA / approvals; **`publish_status`** column read-only in US-12.1 (`ready` default on insert; `published` when US-12.2 writes). Cascade priority: published → approved → pending → qa → generating → draft. | SPEC §3 P2 Content Calendar; README PO #5; TASKS § derive helper | CONTRACT freeze cascade + test fixtures for each stage; reuse existing loaders — do not duplicate QA gate logic. |
| **Info** | **Handoff to US-12.2 — ALIGNED.** US-12.1 creates **`neuramark_content_calendar_slots`** with `publish_status` `ready` \| `published`; exposes `slotId` in DTO; US-12.2 owns mark-published mutation, `published_at`, optional IG URL, server-side approved-only guard. | USER_STORIES US-12.2; ADR-0002; README § Upstream/downstream | US-12.1 BUILD must not ship mark-published Server Action or UI; display `published` state when column already set. |
| **Info** | **Click slot → Reel detail workflow — ALIGNED.** Sidebar with summary + pipeline status satisfies AC; deep links to `/operator/scripts?weekStart=&highlightSlot=` supplementary. Known V1 limitation: deep links session-`clientId`-scoped (PO #6) — acceptable; full multi-client Operator context is Phase B. | USER_STORIES AC row 2; README PO #6 | VALIDATION evidence: Sidebar opens on card click with status + CTAs; deep-link limitation documented in CONTRACT. |
| **Info** | **ADR-0001 sync-on-read vs strategy-approve hook — acceptable V1 deferral.** Auto-sync on strategy approve (cron/hook) deferred to integrations-engineer / Phase B; V1 **`syncCalendarSlotsForWeek`** at aggregate read is idempotent. | ADR-0001; README § Scope out | Do not add cron Route Handler in US-12.1 unless explicitly scoped. |
| **Info** | **ADR-0002 / ADR-0003 respected.** No Graph publish, no Fly worker, no Vercel FFmpeg. App-layer Next.js only per implementer routing. | ADR-0002; ADR-0003; TASKS implementer routing | nextjs-backend + nextjs-frontend only. |
| **Info** | **NFR / stack — ALIGNED.** `neuramark_*` prefix; RLS deny-by-default; multi-tenant `client_id`; EN/ES `calendar.*` + `Intl`; server-built preview URLs (never `storage_key`); Operator layout gate. | SPEC §5–§6; AGENTS.md; SECURITY_BASELINE | SECURITY owns rate limit bucket + thumbnail auth pattern. |

**Gap count:** **6 Low** (documentation / CONTRACT freeze) · **7 Info** (aligned — document in CONTRACT) · **0 Medium** · **0 High** · **0 CONFLICT**

**SPEC blockers:** none. **ADR breaches:** none if US-12.1 stays read-only for `publish_status` and Operator-gated.

---

### Focus areas (binding assessment)

| Focus | Assessment |
|-------|------------|
| **Operator aggregate vs Cliente separation** | **ALIGNED** — `/operator/calendar` + aggregate action; forbidden `client_id` param; no Cliente `/ready-to-publish` reuse; future Cliente calendar = separate endpoint per SECURITY_BASELINE § (e) and USER_STORIES [SEC] AC. |
| **3 posts/week gap** | **ALIGNED** — per-client warning when &lt;3 synced slot rows for week with approved strategy; supports SC-1 cadence; gap math excludes clients without approved brief. |
| **Status derivation** | **GAPS (CONTRACT freeze)** — cascade directionally aligned with SPEC “estados hasta published”; freeze rejected-approval behavior and test matrix in CONTRACT. |
| **P1 vs P2 in SPEC** | **GAPS (documentation)** — sprint promotion; USER_STORIES/PREP govern BUILD; no scope reduction. Optional SPEC §3 label update — non-blocking. |
| **Handoff to US-12.2** | **ALIGNED** — table + DTO + read `publish_status`; US-12.2 owns writes, approved-only guard, IG URL validation. US-12.1 may display `published` when already written. |

---

### Terminology violations (CONTEXT)

**None blocking** in README/TASKS (uses **Calendario de contenido**, **Estrategia semanal**, **Operator**, **Cliente**, **Reel**, **Aprobación**, **listo para publicar**, **Ensamblado**; explicitly avoids “publish queue” on Operator surfaces, admin/staff, client-side aggregate filtering, and storage key exposure).

**CONTRACT / FE i18n must enforce:**

| Prefer (Operator copy) | _Evitar_ |
|------------------------|----------|
| **Calendario de contenido** | publish queue (Operator primary noun) |
| **Operator** / **Cliente** | admin, administrador, staff |
| **Aprobación** | approval decision (primary ES noun) |
| **listo para publicar** (when referencing approved pipeline stage) | mixing Cliente queue naming on Operator aggregate |
| **Estrategia semanal** | weekly brief (product-facing) |

**Undefined in CONTEXT canon (non-blocking):** **Calendario de contenido** and **listo para publicar** used in PREP but not yet CONTEXT glossary entries — recommend PO add when next editing CONTEXT (matches SPEC §3 P2 intent and US-11.3 usage).

USER_STORIES AC English (“Reel detail workflow”, “operator surface”) are AC source text — map to canonical ES/EN in `calendar.*` namespace.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-12.1 SECURITY.md | **Yes — next gate** | `requireOperator` on aggregate; `weekStart`-only strict schema; forbidden `client_id`; future Cliente endpoint documented; preview URL auth. |
| US-12.1 CONTRACT.md | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| `getOperatorCalendarForWeek` + DTOs | **Yes — all AC** | Sync-on-read; gap warnings; pipeline status cascade; single-fetch panel fields. |
| `syncCalendarSlotsForWeek` | **Yes — slot materialization** | Idempotent upsert from approved strategies; orphan deletion; `scheduled_date` mapping (PO #4). |
| `deriveCalendarPipelineStatus` | **Yes — status colors** | Freeze cascade including rejected + published read path. |
| Mark published UI / action | **No — US-12.2** | Explicit out of scope; DESIGN_PROMPTS §10 split. |
| Drag-and-drop reschedule | **No — Phase B** | Read-only grid Phase A. |
| Cliente calendar endpoint | **No — future story** | Document in SECURITY only. |
| IG Graph publish / Fly worker / cron hook | **No — ADR out of scope** | ADR-0001–0003. |

**SECURITY can proceed?** **Yes.** PREP sufficiently specifies Operator gate, tenancy model, and aggregate boundary for **security-architect** to author **SECURITY.md**.

**CONTRACT blockers (freeze before BUILD):**

1. **`getOperatorCalendarForWeek`** — strict `{ weekStart }` input; `requireOperator("handler")`; response `{ weekStart, weekRangeLabel, clients[], slots[], gapWarnings[] }`.
2. **`syncCalendarSlotsForWeek`** — approved-strategy-only source; orphan row policy; `reel_script_id` linkage; insert-only `publish_status = 'ready'`.
3. **`deriveCalendarPipelineStatus`** — priority cascade (PO #5); rejected-approval rule (PO #14); no duplicate QA gate logic.
4. **Non-goals reaffirmed** — no mark-published writes; no drag-and-drop; no Cliente endpoint; no `client_id` on aggregate; no reuse Cliente ready-to-publish action.
5. **US-12.2 handoff** — expose `slotId`, `publish_status`, `assembledReelId` in DTO for downstream mark-published.
6. **Phased acceptance** — Phase A closes USER_STORIES § US-12.1 all five AC.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-12.1 CONTRACT.md** with the non-negotiable freezes above.

1. **Operator aggregate boundary** — new action; 403 for Cliente; no `client_id`; never filter Operator DTO client-side.
2. **Gap warnings** — &lt;3 slots per client with approved strategy after sync.
3. **Status derivation** — read-time cascade; read-only `publish_status`; display `published` when US-12.2 has written.
4. **Sidebar detail workflow** — card click → panel + deep links (session clientId V1 limitation documented).
5. **Explicit out of scope:** mark published, drag-and-drop, Cliente calendar, IG publish, strategy-approve cron hook, new approval/QA mutations, RBAC UI.

**Gate status:** SPEC-REVIEW **GAPS** (6 Low · 0 blockers · 0 CONFLICT). Next: security-architect **SECURITY.md** → nextjs-backend **CONTRACT.md** (Reviewed by FE) → BUILD.
