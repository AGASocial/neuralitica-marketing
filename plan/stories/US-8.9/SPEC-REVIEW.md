## Spec Review — US-8.9

### Verdict: ALIGNED

US-8.9 intent — the **Operator** triggers B-roll clip generation from **`/operator/scripts`** for faceless Reels via a control that mirrors **`HeygenGenerateControl`** / **`HeygenGenerateConfirmDialog`** (US-8.7): server **`previewBrollVideoJobsEstimate`** for eligibility + cost + clip count + policy-resolved provider label; confirm submits only **`{ reelScriptId, clientId }`** through existing **`createBrollVideoJobs`** (US-8.5 ✅ / US-8.8 ✅ LTX high tier); EN/ES i18n; toast + refresh — is **aligned** with SPEC §3 **Video Provider Adapter** (S3.M9: Operator estado/reintentos; adapters + `neuramark_video_jobs` already shipped; keys/cost server-only; Cliente never sends provider/cost), SPEC §3 **Avatar / Visual Mode** (S3.M4: **B-roll / sin presencia** as allowlisted modalidad; faceless slots with `broll_beats`), SPEC §3 **Cost Policy** (S3.M8: budget-before-generate; estimate server-side), SPEC §2 (acciones solo Operator: intervención/reintentos; no Cliente B-roll trigger), SPEC §4 error path (Operator ve jobs fallidos + reintentar; graceful degrade from US-8.5), SPEC §1 SC-1 (Reels without grabarse), SPEC §5–§6 (Next server-only; `neuramark_*`; EN/ES i18n), USER_STORIES § US-8.9 (6 AC), and frozen upstream **US-8.5** ✅ (orchestrator + deferred FE row) · **US-8.8** ✅ (LTX high tier) · **US-8.7** ✅ (HeyGen generate UI pattern) · **US-8.4** ✅ (Operator scripts page + refresh hooks).

**No SPEC amendment required.** US-8.9 closes the **deferred optional Operator B-roll preview strip** explicitly noted in US-8.5 CONTRACT (“Reviewed by FE: N/A”) and US-8.5 VALIDATION without introducing new product modules, adapters, cron behavior, or Cliente-facing surfaces. Soft gaps are **CONTRACT / SECURITY / BUILD** freezes (preview action wiring, schema union for `ltx_broll_high`, in-flight query, blocked-vs-hidden UX) — not product-direction drift.

**Branch `feature/US-8.9-broll-operator-generate-ui` (PREP only):** README + TASKS + USER_STORIES entry — no `BrollGenerateControl`, preview action, or i18n code yet. This review gates SECURITY → CONTRACT → BUILD.

**Upstream dependencies satisfied:** US-8.5 ✅ `createBrollVideoJobs` + Wan + graceful degrade · US-8.8 ✅ LTX high-tier orchestrator path · US-8.4 ✅ `/operator/scripts` + job refresh · US-8.7 ✅ HeyGen control pattern · US-7.1 ✅ budget · US-7.2 ✅ tier routing · US-5.1 ✅ `broll_beats` / faceless modalidad · US-9.1 Phase B ✅ (stitch consumer — no FE change here).

---

### Findings

| Severity | Finding | SPEC/ADR reference | Fix |
|----------|---------|-------------------|-----|
| **High** | **No US-8.9 CONTRACT.md.** PREP/TASKS sketch preview DTO, visibility matrix, and open Q1–4, but do not freeze `previewBrollVideoJobsEstimate` implementation (shared estimate helper extraction vs thin wrapper), in-flight broll job query, `blockedReasonKey` catalog, partial-skip toast shape, or FE props/copy keys. BUILD cannot start without CONTRACT at HeyGen-control depth. | USER_STORIES US-8.9; README gates; TASKS open Q1–4 | Author **US-8.9 CONTRACT.md** before BUILD — preview request/response, visibility rules, forbidden keys, FE component props, i18n key table. **Reviewed by FE required** (FE is primary consumer). |
| **High** | **`previewBrollVideoJobsEstimate` Server Action not implemented.** Schemas exist in `lib/contracts/video-job.ts` but preview action is stubbed/missing; success schema **`providerKey` is Wan-only literal** — must extend to **`siliconflow_wan21_turbo \| ltx_broll_high`** per US-8.8. | USER_STORIES AC #1/#3; README PO #7; `video-job.ts` L493 | BE BUILD: implement operator-gated preview; extend schema union; delegate to orchestrator estimate path (no duplicate provider math). |
| **Medium** | **In-flight broll job detection unresolved.** TASKS open Q1: preview queries server vs props from Server Component. PO lean preview-side query — must freeze or FE may show duplicate generate while jobs `queued`/`processing`. | USER_STORIES AC #2; HeyGen `jobInFlight` pattern; TASKS open Q1 | CONTRACT: preview queries latest broll job per `reel_script_id` (or equivalent); returns hide signal when in-flight; mirror HeyGen eligibility hide. |
| **Medium** | **Blocked vs hidden UX open.** When preview returns `blockedReasonKey` (reference still missing, budget, provider inactive), PO lean hide (match HeyGen ineligible) — CONTRACT must freeze so Operator debugging needs are not accidentally dropped. | USER_STORIES AC #2; TASKS open Q2; US-8.5 `referenceStillMissing` gap | CONTRACT: default **hide** when ineligible/blocked; optional Operator-only diagnostic message only if SECURITY approves (lean hide). |
| **Medium** | **Partial skip UX must not imply primary failure.** Orchestrator may return `skipped` with budget/provider reasons while primary path unaffected (US-8.5 graceful degrade). FE must surface created vs skipped counts without blocking talking-head workflow. | USER_STORIES AC #4; US-8.5 degrade; SPEC §4 ciclo parcial | CONTRACT: success DTO handling + localized skip reason keys; toast non-blocking; tests for partial success path. |
| **Medium** | **i18n gap from US-8.5 VALIDATION.** `scripts.broll.failure.referenceStillMissing` returned by orchestrator but missing from `messages/en.json` / `es.json`. Story correctly scopes adding it — must ship in BUILD or preview errors show raw keys. | US-8.5 VALIDATION; README PO; TASKS FE checklist | FE BUILD: add EN/ES under `scripts.broll.generate.*` + `scripts.broll.failure.referenceStillMissing`. |
| **Low** | **B-roll job list / status panel still deferred.** AC do not require dedicated `asset_role = broll` list; US-8.4 primary-filtered panel acceptable for CLOSE (same as US-8.5 SPEC-REVIEW acceptance). | US-8.5 SPEC-REVIEW; README scope out | VALIDATION: do not fail CLOSE for missing broll job panel; document follow-up if desired. |
| **Low** | **HeyGen create body is wider than B-roll create.** HeyGen sends `confirmEstimateCents`, duration, voiceover/portrait asset ids; B-roll correctly reuses narrow **`{ reelScriptId, clientId }`** only — do not copy HeyGen submit fields into B-roll CONTRACT. | US-8.7 pattern; `create-broll-video-jobs.ts` action | CONTRACT explicitly forbids expanding create body; preview-only cost display. |
| **Info** | **Vision & hard rules intact.** No publish without Aprobación; no human recording; no Stories/multicanal/ads/RBAC UI; Playbook vs Trend not conflated; B-roll generate feeds existing pipeline → assembly → QA → Aprobación — not IG Graph. | SPEC §1 SC-1–SC-4; CONTEXT | Manual Operator trigger is exception path, not replacing Ciclo semanal automatizado default. |
| **Info** | **Roles unchanged.** Operator-only preview + create (`requireOperator`); Cliente 403; System orchestrator unchanged; no client-supplied `provider_key` / tier / prompts. | SPEC §2; AGENTS.md; US-8.5 SECURITY | Reuse existing action gates; preview mirrors create IDOR rules (`clientId === operator.id` V1 seam). |
| **Info** | **Modalidades / tier routing aligned.** Visibility when faceless + `needs_broll` + policy resolves Wan (low) or LTX (high, active); non-faceless hidden. Matches S3.M4 allowlist + per-slot B-roll modality and US-7.2 tier floor (LTX never on low). | S3.M4; S3.M9; US-7.2; US-8.8 | Preview must call same `resolveProviderForJob` path as create — no FE tier logic. |
| **Info** | **ADRs respected.** No FFmpeg or long poll on Vercel (ADR-0003 — provider work stays adapter + Fly poller); no IG publish (ADR-0002); no cron/weekly automation change (ADR-0001). Thin FE + preview action on Next server layer only. | ADR-0001–0003 | Do not add worker jobs, stitch UI, or publish routes in this story. |
| **Info** | **Out of scope held:** new Wan/LTX adapters, orchestrator logic changes, DB migrations, assembly/stitch UI (US-9.1 ✅), Cliente-facing trigger, manual upload changes (US-8.3), PLAN F7 cron, dedicated broll job panel, Stories IG, multicanal, ads, RBAC UI. | SPEC §1 fuera de alcance; README scope out | US-8.9 = Operator UI + preview action only. |

---

### TASKS open questions — resolved against SPEC

| Question (README / TASKS) | Resolution | SPEC / ADR basis |
|---------------------------|------------|------------------|
| In-flight detection: preview query vs SC props? | **Preview action queries server-side** (single source of truth); hide when broll job `queued`/`processing`. | USER_STORIES AC #2; HeyGen `jobInFlight` pattern |
| Blocked vs hidden when `blockedReasonKey` set? | **Default hide** (match HeyGen ineligible); CONTRACT may allow Operator diagnostic only if SECURITY approves. | SPEC §2 Operator exceptions; UX consistency with US-8.7 |
| Refresh after success? | Reuse existing router refresh / parallel **`onBrollGenerateSuccess`** callback (mirror `onHeygenGenerateSuccess`). | US-8.4 scripts page pattern |
| Clip count display? | Server **`clipCount`** from preview (clamped max 8 per US-8.5 CONTRACT). | S3.M8 budget; US-5.1 beats |
| Expand create body with estimate confirm? | **No** — create stays `{ reelScriptId, clientId }` only; cost shown preview-only (unlike HeyGen `confirmEstimateCents`). | S3.M8; existing action contract |
| Client-facing B-roll trigger? | **Out of scope — 403** | SPEC §2 Operator-only intervention |
| New adapters / orchestrator / DB? | **Out of scope** — reuse US-8.5/8.8 | S3.M9 already shipped |
| SPEC amendment for Operator B-roll UI? | **Not required** — closes US-8.5 deferred FE; implied by Operator job intervention + existing orchestrator | US-8.5 CONTRACT deferral |

---

### Terminology violations (CONTEXT)

**None that block** in README/TASKS planning language (technical enums `faceless`, `needs_broll`, `provider_key`, `siliconflow_wan21_turbo`, `ltx_broll_high` OK in code/contracts).

Product-facing EN/ES for US-8.9 UI must use:

| Prefer | _Evitar_ |
|--------|----------|
| **B-roll / sin presencia** · **Video sin rostro** | faceless (user-facing ES; enum `faceless` OK in code) |
| **Job de generación** | generation job |
| **Operator** | admin, administrador, staff |
| **Cliente** | prestador, dueño, usuario final (as product role) |
| **Modalidad de producción** | production mode, slot visual type |
| **Política de costo** | max_cost as loose business concept |
| **Paquete de guion** | script package |
| **Reel** | piece, content item (generic) |

Do **not** expose SiliconFlow/FAL URLs, API keys, storage keys, or raw vendor error bodies in UI/DTOs. Provider labels: localized **Wan** (low) / **LTX B-roll** (high) from server `providerKey` — never client-picked provider.

---

### Blockers for SECURITY / CONTRACT

| Item | Blocks? | Guidance |
|------|---------|----------|
| US-8.9 SECURITY.md | **Yes — next gate** | Operator-only preview/create; IDOR; forbidden authority fields; no client provider/cost injection; preview does not leak secrets. |
| US-8.9 CONTRACT.md (preview action, schema, FE props, visibility) | **Yes — BUILD gate** | Freeze after SECURITY; **Reviewed by FE** before BUILD. |
| Implement `previewBrollVideoJobsEstimate` | **Yes — AC #1/#3** | Operator-gated; reuse policy + estimate from orchestrator. |
| Extend `providerKey` schema for `ltx_broll_high` | **Yes — AC #1** | Union both B-roll providers. |
| In-flight broll job check in preview | **Yes — AC #2** | Server-authoritative hide. |
| EN/ES `scripts.broll.generate.*` + `referenceStillMissing` | **Yes — AC #5** | Close US-8.5 i18n gap. |
| Partial skip toast/messages | **Yes — AC #4** | Non-blocking; localized skip reasons. |
| B-roll job status panel | **No — deferred** | Primary-filtered list OK for CLOSE. |
| Adapter / orchestrator / migration changes | **No — out of scope** | US-8.5/8.8 own. |
| Weekly cron / IG publish / Fly worker | **No — out of scope** | ADR-0001–0003. |

**SPEC blockers on intent:** none. **ADR breaches:** none if preview/create stay on Next server layer, no FFmpeg on Vercel, and no IG publish path is introduced.

**SECURITY can proceed?** **Yes.** [SEC] AC (Operator-only 403, forbidden authority fields, no adapter/orchestrator expansion) and US-8.5/8.7 security continuity are specified sufficiently for **security-architect** to author **SECURITY.md**.

---

### Recommended action

Proceed to **SECURITY.md** (no SPEC veto), then **US-8.9 CONTRACT.md** with these **non-negotiable freezes**:

1. **`previewBrollVideoJobsEstimate`** — `requireOperator`; `.strict()` `{ reelScriptId, clientId }`; IDOR same as create; returns `needsBroll`, `estimatedCostCents`, `unitCostCentsPerClip`, `clipCount`, optional `providerKey` (`siliconflow_wan21_turbo` \| `ltx_broll_high`), optional `blockedReasonKey`; in-flight broll jobs → hide.
2. **Visibility matrix** — show only faceless + `needs_broll` + active policy provider + not in-flight + no blocking preview reason (default hide).
3. **Create path unchanged** — wire existing **`createBrollVideoJobs`** with `{ reelScriptId, clientId }` only; handle partial `skipped` in success toast.
4. **FE pattern** — `BrollGenerateControl` + `BrollGenerateConfirmDialog` mirror HeyGen structure (no portrait/consent/duration submit fields); placement in `ScriptsPageView` after voiceover/HeyGen, before primary job summary.
5. **i18n EN/ES** — `scripts.broll.generate.*` + `scripts.broll.failure.referenceStillMissing`.
6. **Explicit out of scope:** new adapters, orchestrator forks, DB migrations, stitch/assembly UI, Cliente trigger, broll job list panel, PLAN F7 cron, Stories IG, multicanal, ads, RBAC UI.

Do not check off USER_STORIES acceptance criteria in this gate.

**Gate status:** SPEC-REVIEW **ALIGNED**. SECURITY.md **APPROVE WITH CONDITIONS** (2026-08-31). CONTRACT.md **Frozen** (2026-08-31 — Spec Guardian); closes High finding “No US-8.9 CONTRACT.md” and Medium open Q1–4. Next: **nextjs-frontend** stamps `Reviewed by FE: approved` on CONTRACT → BUILD (FE + BE).

---

## CONTRACT freeze addendum (2026-08-31)

### Verdict: ALIGNED

`plan/stories/US-8.9/CONTRACT.md` freezes `previewBrollVideoJobsEstimate` + FE `BrollGenerateControl` / `BrollGenerateConfirmDialog` without SPEC/ADR drift. Create path stays `{ reelScriptId, clientId }` only; Wan|LTX `providerKey` union; in-flight hide; shared estimate helper; SECURITY 10 conditions encoded. **BUILD unblocked after FE stamp.**
