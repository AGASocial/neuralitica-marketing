# Sprint State — Master Orchestrator

> Mantenido por `master-orchestrator`. No editar manualmente salvo para corregir un atasco.

```yaml
current_phase: 3
current_story: US-8.9
story_status: prep
feature_branch: feature/US-8.9-broll-operator-generate-ui
last_completed_story: US-8.8
phase_status: sprint_8_prep
blocked_reason: null
updated_at: 2026-08-31T20:50:00Z
```

## Fase 5 — Operación semanal (Sprint 7 / P1) ✅

| Story | Status | Notes |
|-------|--------|-------|
| US-12.1 Weekly calendar view | done | BE `9ac84dc` · FE `de2fe1e` · fix `79546ab` · VALIDATION `d642e70` · QA `80766dc` · CLOSE `722e5e0` (5/5 AC; mark published → US-12.2) |
| US-12.2 Mark manual publication done | done | BE `6e0fcf0` · FE `513632e` · DB `f62a1a2` · VALIDATION `ceacf10` · QA `8b3536f` · CLOSE `f148e2d` (4/4 AC; metrics → US-13.1) |
| US-13.1 Record basic post metrics manually | done | BE `7880a3c` · FE `6eb7c81` · DB `7880a3c` · fix `d544a47` · VALIDATION `1e90f5f` · QA `d9f829b` · CLOSE `d544a47` (5/5 AC; strategy insights → US-13.2) |
| US-13.2 Surface top themes for next strategy cycle | done | BE `4649b83` · agents `ead2932` · FE `0419e5a` · VALIDATION `6fa9ad8` · QA `7ff873e` · CLOSE `6f06c42` FF-merge to main (3/3 AC; brief-read clientId parity → Phase B) |
| Phase integration | done | PHASE-5.md CONNECTED `bf0ae66` (0 blockers) |

## Sprint 7 backlog — Provider P1 (post Fase 5) ✅

| Story | Status | Notes |
|-------|--------|-------|
| US-8.7 HeyGen adapter (high tier) | done | FE `a18d4cb` · BE `299d638` · VALIDATION `602995c` (5/5 AC; 22/22) · QA `fc19d0a` · fix `b3a9377` · CLOSE `89d0119` FF-merge to main |
| US-8.5 Wan B-roll adapter | done | BUILD `f7cf726` · VALIDATION `14a74f5` (6/6 AC; 39/39) · QA `8617ae7` · fix `e75e1b7` · CLOSE `6c66f7d` FF-merge to main (stitch → US-9.1 Phase B) |
| US-9.1 Phase B faceless B-roll stitch | done (B+M2) | BUILD `c3a9c19` · FE `80652c2` · fix `1106420` · VALIDATION `6d13f4b` (5/5 + 16/16) · QA `37d0dcb` · CLOSE `9a95b55` FF-merge to main; **M2 CLOSED** `2a69b24` assembly poll claim |
| US-9.2 Phase B VO-sync + coverFrameSec | done (B+M1+M2) | BE `95419c1` · FE `8f365bf` · CLOSE `7783de2`; **M1 CLOSED** `1b2a8e7`/`00df642`; **M2 CLOSED** `29352f4` branding poll claim |
| US-8.8 LTX B-roll adapter (high tier) | done | Phase A `5aa1392` · Phase B `4835f2d` · VALIDATION PASS WITH NOTES (7/7 AC; 68/68) · QA initial REJECT → fix `4584573` → re-verdict APPROVE · CLOSE (7/7 AC) |

| Phase integration | done | PHASE-7.md CONNECTED (0 blockers; 149/149 integration tests) |

**Sprint 7 CLOSED** — Fase 5 ops + Provider P1 + faceless stitch + branding hardening + spend backfill + poll-claim races + **LTX high-tier B-roll**. **Idle backlog:** PLAN F7 cron · QA follow-ups (enqueue-time audio probe · faceless revision B-roll step).

## Sprint 8 — Operator B-roll UI (PREP)

| Story | Status | Notes |
|-------|--------|-------|
| US-8.9 Operator B-roll generate UI | prep | PREP 2026-08-31 — deferred from US-8.5 FE; wire `createBrollVideoJobs` + HeyGen pattern on `/operator/scripts`; branch `feature/US-8.9-broll-operator-generate-ui`; next SPEC-REVIEW |

**Idle backlog (post US-8.9):** PLAN F7 cron · QA follow-ups (enqueue-time audio probe · faceless revision B-roll step).

## Fase 3 — Content Strategy + Provider catalog (Sprint 3)

**Sprint 6 ✅** — US-11.1 · US-11.2 · US-11.3 (Cliente Aprobación module) complete.

| Story | Status | Notes |
|-------|--------|-------|
| US-X.4 Provider catalog + resolveProvider | done | BE `5ba9876` · CLOSE `291313b` |
| US-4.1 Content Strategy agent | done | BE `af998d9` · FE `dcbd15a` · agents `bbd159d` · CLOSE |
| US-4.2 Review and approve strategy | done | BE `ba57bac` · FE `4367287` · CLOSE 5/5 AC |
| US-5.1 Reel script package per slot | done | agents `a12cbc7` · BE `aa1c13e` · FE `18abc7e` · CLOSE 6/6 AC |
| US-5.2 Preview script readability | done | BE `b503241` · FE `b68d2ee` · VALIDATION `8ba616e` · CLOSE 2/2 AC |
| US-6.1 Generate Instagram caption per Reel | done | agents `c385372` · FE `d075781` · BE `1f45244` · VALIDATION `2cebd89` · CLOSE 5/5 AC |
| US-6.2 CTA variants for caption testing | done | BE `146479c` · FE `f82ba33` · VALIDATION `258773c` · QA `fc0f4b2` · CLOSE `72723c5` |
| US-7.1 Configure max budget per Reel | done | BE `3bdc709` · FE `bb19e4d` · fix `69d274f` · VALIDATION `13531f8` · QA `f8ac2a7` · CLOSE `d68b71a` |
| US-7.2 Select provider by economics | done | BE `8eab3f7` · FE `2ab482c` · fix `78e6aa1` · VALIDATION `eb03f8e` · QA `4ed7fe9` · CLOSE `fcecce4` |
| US-7.3 Track actual cost per job | done (A+B) | Phase A CLOSE; **Phase B CLOSED** FE `1add7ed` · BE `d3b2e03` · media `3f3653c` · VALIDATION PASS WITH NOTES · QA APPROVE WITH CONDITIONS (0 Critical/High) |
| US-7.4 Report real total cost per Reel | done | Phase A CLOSE `f0ca5a0`; Phase B automatic expand realized via US-7.3-B (no BUILD) |
| US-8.1 Provider adapter interface | done | BE `a11d4ae` · fix `4193a1e` · VALIDATION `7367929` · QA `7f34bdb` · CLOSE `3ac3304` |
| US-8.2 SadTalker adapter | done | Phase A `258fcef` · Phase B closed via US-8.4 `35a433d` |
| US-8.4 Job status and failure UI | done | BE `689d8c6`/`77142b9` · FE `25737db` · VALIDATION `4e36fbc` · QA `9b24c48` · CLOSE `35a433d` |
| US-8.6 MuseTalk adapter | done | Phase A `dbc9ce2` · Phase B `bdfaaf2` · VALIDATION `798635e` · QA `82bde3d` · CLOSE `2fb7573` (4/5 AC; P1 override defer) |
| US-8.3 Manual video upload fallback | done | FE `fc6deca` · BE `eaa974a` · fixes `f3f78af`/`b2fb1cc` · VALIDATION `2f5edc0` · QA `a58faeb` · CLOSE `d8baafb` |
| US-9.3 Text-to-speech for voiceover | done | Phase A `dfdd08b` · adapter `7a2e4ae` · BE `1f2319e` · FE `1d9d813` · VALIDATION `1715048` · QA `e9c1833` · CLOSE 5/6 AC (ElevenLabs Phase B defer) |
| US-9.1 Assemble final 9:16 Reel | done (A+B+M2) | Phase A `4853871` · CLOSE 5/5 AC; **Phase B CLOSED** `9a95b55` FF-merge (VALIDATION `6d13f4b` 5/5+16/16; QA `37d0dcb`; fix `1106420`); **M2 CLOSED** assembly poll claim `2a69b24` |
| US-9.2 Add subtitles, logo, and cover | done (A+B+M1+M2) | Phase A CLOSE `92b196a` (5/5 AC). **Phase B CLOSED** `7783de2` FF-merge (VALIDATION `6db2cba` 2/2+44/44; QA `02bfa3b`; VO-sync + `coverFrameSec`). **M1/M2 fast-follows CLOSED** — VO-hash re-check + branding poll claim |
| US-10.1 Run automated QA | done | agents `0b56c9e`/`75802d6` · BE `5e50115` · FE `b5e0941` · VALIDATION `d95555d` · QA `a6ba923` · CLOSE `b7a3bb9` (6/6 AC; override → US-10.2) |
| US-10.2 Operator override with reason | done | BE `a9cc533` · FE `0c6bfb0` · VALIDATION `d7e3cd5` · QA `3da5547` · CLOSE `c9b97e5` (7/7 AC; approval render → US-11.1) |
| US-11.1 Present Reel package for client approval | done | BE `d830b0f` · FE `defd9ff` · VALIDATION `633c6f5` · QA `3f39db9` · CLOSE `4f11d38` (5/5 AC; request-changes → US-11.2) |
| US-11.2 Request controlled revision round | done | FE `9c60ff1` · BE `8072392`/`088eafa` · agents `f0e4569` · media `dd90242` · VALIDATION `e4f12fb` · QA `84902c8` · CLOSE `a08b999` (5/5 AC; operator UI/history → Phase B) |
| US-11.3 Approve and mark ready to publish | done | FE `f38c731` · BE `af50d1d` · VALIDATION `209dcc3` · QA `04dfe5b` · CLOSE `dfdace9` (5/5 AC; zip/webhook → Phase B) |

## Fase 2 — Playbook + Tendencias (manual V1) ✅

| Story | Status | Notes |
|-------|--------|-------|
| US-16.1 Content Playbook | done | |
| US-16.2 Trend snapshot manual | done | FE `3660506` · BE `4474fb1` |
| Phase integration | done | PHASE-2.md CONNECTED |

## Historial reciente

- 2026-08-31 · US-8.9 SELECT → PREP: `US-8.9` added to USER_STORIES.md (6 AC); README + TASKS in `plan/stories/US-8.9/` — Operator B-roll generate UI on `/operator/scripts`; reuse `createBrollVideoJobs` + HeyGen pattern; Wan low + LTX high per policy; branch `feature/US-8.9-broll-operator-generate-ui`; next SPEC-REVIEW.
- 2026-08-31 · US-8.8 CLOSE: 7/7 AC checked; VALIDATION PASS WITH NOTES (7/7 AC; 68/68); QA initial REJECT H1/M1 → fix `4584573` (`isAllowedBrollProviderPair` + `retryVideoJob` test) → re-verdict APPROVE; Phase A `5aa1392` · Phase B `4835f2d`; branch `feature/US-8.8-ltx-broll-high` ready for FF-merge → **Sprint 7 provider matrix complete**; SELECT B-roll Operator generate UI, F7 cron, or QA follow-ups.
- 2026-08-31 · US-8.8 SELECT → PREP: `US-8.8` added to USER_STORIES.md (7 AC); README + TASKS in `plan/stories/US-8.8/` — Phase A (FAL LTX adapter) then Phase B (activate catalog + orchestrator high-tier unlock); branch `feature/US-8.8-ltx-broll-high`; mirror US-8.5 Wan + US-8.7 activate; FE deferred; next SPEC-REVIEW.
- 2026-08-31 · Sprint 7 phase integration CONNECTED: `PHASE-7.md` (0 blockers; 149/149 tests); Wan→stitch→branding→QA + HeyGen + US-7.3-B spend + Fase 5 ops verified on `main` → **Sprint 7 CLOSED**; SELECT **`ltx_broll_high`**, B-roll generate UI, or F7 cron.
- 2026-08-31 · US-9.1-B-M2 CLOSE: VALIDATION PASS WITH NOTES; QA APPROVE (1 Low; QA Phase A Medium #1 + QA-PHASE-B Medium #1 CLOSED); BUILD `2a69b24` · SECURITY/CONTRACT `db8e246`; assembly poll atomic claim → SELECT **Sprint 7 phase integration** (recommended), **`ltx_broll_high` adapter**, or QA follow-ups.
- 2026-08-31 · US-9.1-B-M2 SELECT → PREP: `PHASE-B-M2.md` + README/TASKS M2 checklist; branch `feature/US-9.1-b-m2-assembly-poll-claim`; closes QA Phase A/Phase B Medium #1 (assembly poll claim race); mirror US-9.2-B-M2; next SECURITY lean amend.
- 2026-08-31 · US-9.2-B-M2 CLOSE: VALIDATION PASS WITH NOTES; QA APPROVE (0 findings; QA Phase A Medium #1 + QA-PHASE-B Medium #2 CLOSED); BUILD `29352f4` · SECURITY/CONTRACT `3ccc42b`; branding poll atomic claim → SELECT **US-9.1-B-M2** (assembly poll claim race — recommended).
- 2026-08-31 · US-9.2-B-M1 CLOSE: VALIDATION PASS WITH NOTES; QA APPROVE; worker VO-hash re-check `1b2a8e7`/`00df642`; Medium #1 closed → SELECT **US-9.2-B-M2** (branding poll claim race).
- 2026-08-31 · US-7.3-B CLOSE: VALIDATION PASS WITH NOTES; QA APPROVE WITH CONDITIONS (0 Critical/High, M1 non-blocking); FE `1add7ed` · BE `d3b2e03` · media `3f3653c`; video/TTS/B-roll actuals + Operator poll cost on `/operator/scripts`; US-7.4 Phase B auto-expand realized → SELECT **US-9.2-B QA M1** (`voiceoverTimingHash` worker re-check).
- 2026-08-31 · US-7.3-B BUILD: FE `1add7ed` (poll cost merge) · BE `d3b2e03` (GET cost DTO + TTS duration) · media `3f3653c` (async_update duration + closed reason); next VALIDATE.
- 2026-08-31 · US-7.3-B PREP: `PHASE-B.md` + README/TASKS freezes (B1–B18); branch `feature/US-7.3-phase-b-spend-backfill`; most writers already exist — BUILD = duration + poll cost refresh + TTS duration; no `/operator/production`; next SPEC-REVIEW.
- 2026-08-31 · US-9.2 Phase B CLOSE: VALIDATION PASS WITH NOTES `6db2cba` (2/2 deferred; 44/44); QA APPROVE WITH CONDITIONS `02bfa3b` (0 Critical/High); FF-merge `7783de2` to main; VO-sync + `coverFrameSec` complete → SELECT **US-7.3 Phase B** (recommended), `ltx_broll_high`, or VO-hash M1 fast-follow.
- 2026-08-31 · US-9.1 Phase B CLOSE: VALIDATION PASS WITH NOTES `6d13f4b` (5/5 AC + 16/16); QA APPROVE WITH CONDITIONS `37d0dcb` (0 Critical/High); fix `1106420`; FF-merge `9a95b55` to main; faceless path complete (Wan → stitch) → SELECT **US-9.2 Phase B** (recommended), high-tier B-roll, or US-7.3 Phase B spend.
- 2026-08-31 · US-9.1 Phase B PREP: `PHASE-B.md` + README/TASKS freezes (B1–B14); branch `feature/US-9.1-phase-b-broll-stitch`; sprint `US-9.1-B` / PREP; next SPEC-REVIEW → SECURITY → CONTRACT.
- 2026-08-31 · US-8.5 CLOSE: 6/6 AC checked; VALIDATION PASS WITH NOTES `14a74f5` (39/39); QA APPROVE WITH CONDITIONS `8617ae7` (H1/M1 fixed `e75e1b7`); FF-merge `6c66f7d` to main; **Sprint 7 provider backlog complete** → SELECT **US-9.1 Phase B** faceless B-roll stitch (recommended), or high-tier B-roll when added.
- 2026-08-31 · US-8.5 PREP: README + TASKS in `plan/stories/US-8.5/` — Phase A (adapter) then Phase B (B-roll orchestrator + graceful degrade); stitch → US-9.1 Phase B; FE preview deferred; next SPEC-REVIEW → SECURITY → CONTRACT.
- 2026-08-31 · US-8.7 CLOSE: 5/5 AC checked; VALIDATION PASS WITH NOTES `602995c` (22/22); QA APPROVE WITH CONDITIONS `fc19d0a` (0 Critical/High; M1/M2 fixed `b3a9377`); FF-merge `89d0119` to main; Provider P1 → SELECT **US-8.5** Wan B-roll (recommended).
- 2026-08-31 · US-8.7 PREP: README + TASKS in `plan/stories/US-8.7/` — Phase A (adapter) then Phase B (activate catalog + orchestrator + operator FE); next SPEC-REVIEW → SECURITY → CONTRACT.
- 2026-08-31 · Fase 5 integration CONNECTED `bf0ae66`; SELECT **US-8.7** HeyGen adapter; branch `feature/US-8.7-heygen-adapter`.
- 2026-08-31 · US-13.2 CLOSE: 3/3 AC checked; VALIDATION PASS WITH NOTES `6fa9ad8` (98/98); QA APPROVE WITH CONDITIONS `7ff873e` (0 Critical/High, 1 Medium non-blocking: brief-read clientId parity → Phase B); FF-merge `6f06c42` to main; **Sprint 7 complete**; Phase 5 → SELECT **phase integration** (recommended), **US-8.7**, or **US-8.5**.
- 2026-08-31 · US-13.2 SELECT → PREP. Branch `feature/US-13.2-strategy-insights` from main; deps US-13.1 ✅ · US-4.1 ✅; README + TASKS in `plan/stories/US-13.2/`.
- 2026-08-31 · US-13.1 CLOSE: 5/5 AC checked; VALIDATION PASS WITH NOTES `1e90f5f` (37/37); QA APPROVE WITH CONDITIONS `d9f829b` (0 Critical/High, 4 Low); fix `d544a47` (editable default); FF-merge `d544a47` to main; Phase 5 → SELECT **US-13.2** (recommended), US-8.7, or phase integration.
- 2026-08-30 · US-13.1 SELECT → PREP. Branch `feature/US-13.1-reel-metrics` from main; deps US-12.2 ✅.
- 2026-08-30 · US-12.2 CLOSE: 4/4 AC checked; VALIDATION PASS WITH NOTES `ceacf10` (39/39); QA APPROVE `8b3536f` (0 Critical/High); FF-merge `f148e2d` to main; Phase 5 → SELECT **US-13.1** (recommended), US-13.2, or US-8.7.
- 2026-08-30 · US-12.2 SELECT → PREP. Branch `feature/US-12.2-mark-published` from main; deps US-12.1 ✅.
- 2026-08-30 · US-12.1 CLOSE: 5/5 AC checked; VALIDATION PASS WITH NOTES `d642e70` (18/18); QA APPROVE WITH CONDITIONS `80766dc` after fix `79546ab` (0 Critical/High); FF-merge `722e5e0` to main; Phase 5 → SELECT **US-12.2** (recommended), US-13.1, or US-8.7.
- 2026-08-30 · US-11.3 CLOSE: 5/5 AC checked; VALIDATION PASS WITH NOTES `209dcc3` (44/44); QA APPROVE WITH CONDITIONS `04dfe5b` (0 Critical/High); FF-merge `dfdace9` to main; **Sprint 6 complete** (US-11.1/11.2/11.3); Phase 3 → SELECT **US-12.1** (recommended), phase integration, or US-8.5.
