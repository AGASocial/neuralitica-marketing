# Sprint State — Master Orchestrator

> Mantenido por `master-orchestrator`. No editar manualmente salvo para corregir un atasco.

```yaml
current_phase: 3
current_story: US-9.2
story_status: QA
feature_branch: feature/US-9.2-subtitles-logo-cover
last_completed_story: US-9.1
phase_status: in_progress
blocked_reason: null
updated_at: 2026-08-30T18:35:00Z
```

## Fase 3 — Content Strategy + Provider catalog (Sprint 3)

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
| US-7.3 Track actual cost per job | done | BE `030d85f` · FE `02b399b`/`ddca524` · fix `f60579d` · VALIDATION `09656e0` · QA `691f657` · CLOSE Phase A |
| US-7.4 Report real total cost per Reel | done | BE `5c9abb4` · FE `8735be2` · fix `5b3e9d7` · VALIDATION `a678ac4` · QA `746a563` · CLOSE Phase A `f0ca5a0` |
| US-8.1 Provider adapter interface | done | BE `a11d4ae` · fix `4193a1e` · VALIDATION `7367929` · QA `7f34bdb` · CLOSE `3ac3304` |
| US-8.2 SadTalker adapter | done | Phase A `258fcef` · Phase B closed via US-8.4 `35a433d` |
| US-8.4 Job status and failure UI | done | BE `689d8c6`/`77142b9` · FE `25737db` · VALIDATION `4e36fbc` · QA `9b24c48` · CLOSE `35a433d` |
| US-8.6 MuseTalk adapter | done | Phase A `dbc9ce2` · Phase B `bdfaaf2` · VALIDATION `798635e` · QA `82bde3d` · CLOSE `2fb7573` (4/5 AC; P1 override defer) |
| US-8.3 Manual video upload fallback | done | FE `fc6deca` · BE `eaa974a` · fixes `f3f78af`/`b2fb1cc` · VALIDATION `2f5edc0` · QA `a58faeb` · CLOSE `d8baafb` |
| US-9.3 Text-to-speech for voiceover | done | Phase A `dfdd08b` · adapter `7a2e4ae` · BE `1f2319e` · FE `1d9d813` · VALIDATION `1715048` · QA `e9c1833` · CLOSE 5/6 AC (ElevenLabs Phase B defer) |
| US-9.1 Assemble final 9:16 Reel | done | Phase A `4853871` · worker `f74570f`/`153b73a` · BE `7189f4b` · FE `9e7142c` · VALIDATION `03dff73` · QA `5c0ec7e` · CLOSE 5/5 AC (faceless B-roll Phase B defer) |
| US-9.2 Add subtitles, logo, and cover | BUILD | CONTRACT `150262c` · FE signoff `710d307` · media+BE+FE in flight |

## Fase 2 — Playbook + Tendencias (manual V1) ✅

| Story | Status | Notes |
|-------|--------|-------|
| US-16.1 Content Playbook | done | |
| US-16.2 Trend snapshot manual | done | FE `3660506` · BE `4474fb1` |
| Phase integration | done | PHASE-2.md CONNECTED |

## Historial reciente

- 2026-08-30 · US-9.2 SELECT → PREP. Branch `feature/US-9.2-subtitles-logo-cover` from main; deps US-9.1 ✅ · US-2.2 ✅.
- 2026-08-30 · US-9.1 CLOSE Phase A: 5/5 AC checked; QA APPROVE WITH CONDITIONS `5c0ec7e`; FF-merge `4853871` to main; Phase 3 → SELECT US-9.2 (recommended) or US-8.5.
- 2026-08-30 · US-9.1 BUILD: worker `f74570f` · BE `7189f4b` · FE `9e7142c`; story_status VALIDATE.
- 2026-08-30 · US-9.1 SPEC GAPS `8728973` · SECURITY APPROVE WITH CONDITIONS `3b13b66`; story_status CONTRACT.
- 2026-08-30 · US-9.1 SELECT → PREP `70a312d`. Branch `feature/US-9.1-assemble-reel`.
- 2026-08-30 · US-9.3 CLOSE Phase A: 5/6 AC checked; QA APPROVE WITH CONDITIONS `e9c1833`; FF-merge `dfdd08b` to main; Phase 3 → SELECT US-9.1 (recommended).
- 2026-08-30 · US-9.3 VALIDATION: PASS WITH NOTES `1715048` (79/79 tests); story_status QA.
- 2026-08-30 · US-9.3 BUILD: adapter `7a2e4ae` · BE `1f2319e` · FE `1d9d813`.
- 2026-08-30 · US-9.3 CONTRACT: frozen `fb620ef`; story_status SIGNOFF.
- 2026-08-30 · US-8.3 CLOSE: 7/7 AC; QA APPROVE WITH CONDITIONS `a58faeb`; FF-merge `d8baafb` to main; Phase 3 → SELECT US-9.3.
- 2026-08-30 · US-8.6 CLOSE: 4/5 AC V1; QA APPROVE WITH CONDITIONS `82bde3d`; FF-merge `2fb7573` to main; Phase 3 → SELECT US-8.3.
- 2026-08-30 · US-8.4 CLOSE: 8/8 AC + US-8.2 Phase B 9/9 AC; QA APPROVE WITH CONDITIONS `9b24c48`; FF-merge `35a433d` to main; Phase 3 → SELECT US-8.6.
- 2026-08-30 · US-8.4 CONTRACT: frozen `af68149`; FE signoff; PREP docs; branch `feature/US-8.4-video-jobs`; story_status CONTRACT → BUILD next (closes US-8.2 Phase B).
- 2026-08-30 · US-8.4 PREP: README + TASKS + SPEC-REVIEW (GAPS) + SECURITY APPROVE WITH CONDITIONS.
- 2026-08-30 · US-8.2 CLOSE Phase A: `258fcef`; Phase B deferred to US-8.4.
- 2026-08-30 · US-8.1 CLOSE: 6/6 AC; QA BLOCK remediated `4193a1e`; BE `a11d4ae` · VALIDATION PASS WITH NOTES `7367929`; Phase 3 → SELECT next story (US-8.2 recommended).
- 2026-08-30 · US-7.4 CLOSE: 6/6 AC Phase A; QA APPROVE WITH CONDITIONS after fix `5b3e9d7`; BE `5c9abb4` · FE `8735be2` · VALIDATION PASS WITH NOTES `a678ac4`; Phase 3 → SELECT next story. Phase B (video/TTS/B-roll lines) deferred.
- 2026-08-30 · US-7.4 CONTRACT: frozen `08b4131`; FE signoff; story_status CONTRACT → BUILD next.
- 2026-08-30 · US-7.4 PREP: README + TASKS + SPEC-REVIEW (GAPS) + SECURITY APPROVE WITH CONDITIONS.
- 2026-08-30 · US-7.3 CLOSE: 4/4 AC Phase A; QA APPROVE WITH NOTES after fix `f60579d`; BE `030d85f` · FE `02b399b`/`ddca524` · VALIDATION PASS WITH NOTES `09656e0`; Phase 3 → SELECT US-7.4. Phase B (video/TTS) deferred.
- 2026-08-30 · US-7.3 CONTRACT: frozen `f6038e9`; FE signoff; story_status CONTRACT → BUILD next.
- 2026-08-30 · US-7.3 PREP: README + TASKS + SPEC-REVIEW (GAPS) + SECURITY APPROVE WITH CONDITIONS.
- 2026-08-30 · US-7.2 CLOSE: 8/8 AC; QA APPROVE WITH NOTES after fix `78e6aa1`; BE `8eab3f7` · FE `2ab482c` · VALIDATION PASS WITH NOTES `eb03f8e`; Phase 3 → SELECT US-7.3.
- 2026-08-30 · US-7.2 CONTRACT: frozen `45c46e5`; FE signoff; story_status CONTRACT → BUILD next.
- 2026-08-30 · US-7.2 PREP: README + TASKS + SPEC-REVIEW (GAPS) + SECURITY APPROVE WITH CONDITIONS.
- 2026-08-30 · US-7.1 CLOSE: 10/10 AC; QA APPROVE WITH NOTES; BE `3bdc709` · FE `bb19e4d` · fix `69d274f` · VALIDATION PASS WITH NOTES `13531f8`; Phase 3 → SELECT US-7.2.
- 2026-08-30 · US-7.1 BUILD: frozen `9470d49`; FE signoff; branch `feature/US-7.1-cost-policy`; story_status CONTRACT → BUILD next.
- 2026-08-30 · US-7.1 PREP: README + TASKS + SPEC-REVIEW (GAPS) + SECURITY APPROVE WITH CONDITIONS.
- 2026-08-30 · US-6.2 CLOSE: 3/3 AC checked; QA APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 4 Low); BE `146479c` · FE `f82ba33` · VALIDATION `258773c` · QA `fc0f4b2` · CLOSE `72723c5`; Phase 3 → SELECT US-7.1.
- 2026-08-30 · US-6.2 BUILD: BE `146479c` · FE `f82ba33`; VALIDATION PASS WITH NOTES `258773c`; QA APPROVE WITH NOTES `fc0f4b2`.
- 2026-08-30 · US-6.2 CONTRACT: `plan/stories/US-6.2/CONTRACT.md` frozen; FE signoff; 7 SPEC gaps closed; SECURITY APPROVE WITH CONDITIONS; branch `feature/US-6.2-cta-selection`; story_status CONTRACT → BUILD next.
- 2026-08-30 · US-6.2 PREP: `plan/stories/US-6.2/README.md` + `TASKS.md` + `SPEC-REVIEW.md` + `SECURITY.md`; PO decisions frozen; story_status PREP → CONTRACT.
- 2026-08-30 · US-6.1 CLOSE: 5/5 AC checked; QA APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 1 Low); agents `c385372` · FE `d075781` · BE `1f45244` · VALIDATION `2cebd89`; Phase 3 → SELECT US-6.2.
- 2026-08-30 · US-6.1 QA: APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 1 Low); `plan/stories/US-6.1/QA.md`; 48/48 caption tests; CLOSE recommended yes; agents `c385372` · FE `d075781` · BE `1f45244` · VALIDATION `2cebd89`; story_status QA.
- 2026-08-30 · US-6.1 VALIDATION: PASS WITH NOTES (0 blockers, 45/48 tests); `plan/stories/US-6.1/VALIDATION.md`; agents `c385372` · FE `d075781` · BE `1f45244`; 3 agent prompt-fixture assertion failures documented; story_status VALIDATION.
- 2026-08-30 · US-6.1 BUILD (BE): `neuramark_reel_captions` migration, caption contracts, orchestrator, Server Actions, list DTO extension, 34 caption tests; story_status BUILD.
- 2026-08-30 · US-6.1 PREP: `plan/stories/US-6.1/README.md` + `TASKS.md`; PO decisions frozen; story_status PREP.
- 2026-08-30 · US-5.2 CLOSE: 2/2 AC checked; QA APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 3 Low); BE `b503241` · FE `b68d2ee` · VALIDATION `8ba616e`; Phase 3 → SELECT US-6.1.
- 2026-08-30 · US-5.2 QA: APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 3 Low); `plan/stories/US-5.2/QA.md`; 18/18 tests; CLOSE recommended yes; BE `b503241` · FE `b68d2ee` · VALIDATION `8ba616e`; story_status QA.
- 2026-08-30 · US-5.2 VALIDATION: PASS WITH NOTES (0 blockers, 18/18 tests); `plan/stories/US-5.2/VALIDATION.md`; BE `b503241` · FE `b68d2ee`; story_status VALIDATION.
- 2026-08-30 · US-5.2 BUILD (BE): `compute-script-readability.test.ts` (18 tests); `find-forbidden-keys` threshold guards; mapper attaches `readability`; story_status BUILD.
- 2026-08-30 · US-5.2 CONTRACT: `plan/stories/US-5.2/CONTRACT.md` frozen; `lib/contracts/reel-script-readability.ts`; SPEC gaps closed (40 chars/beat, parse rules, read-only DTO); story_status CONTRACT; branch `feature/US-5.2-script-readability`.
- 2026-08-30 · US-5.2 PREP: `plan/stories/US-5.2/README.md` + `TASKS.md`; PO decisions frozen; story_status PREP.
- 2026-08-30 · US-5.1 CLOSE: 6/6 AC checked; QA APPROVE WITH NOTES (0 Critical, 0 High, 3 Medium, 3 Low); agents `a12cbc7` · BE `aa1c13e` · FE `18abc7e`; Phase 3 → SELECT US-5.2.
- 2026-08-30 · US-5.1 QA: APPROVE WITH NOTES (0 Critical, 0 High, 3 Medium, 3 Low); `plan/stories/US-5.1/QA.md`; 47/47 story tests; CLOSE recommended yes; agents `a12cbc7` · BE `aa1c13e` · FE `18abc7e` · VALIDATION `f387659`; story_status QA.
- 2026-08-30 · US-5.1 VALIDATION: PASS WITH NOTES (0 blockers, 109/109 tests); `plan/stories/US-5.1/VALIDATION.md`; agents `a12cbc7` · BE `aa1c13e` · FE `18abc7e`; story_status VALIDATION.
- 2026-08-30 · US-5.1 CONTRACT: `plan/stories/US-5.1/CONTRACT.md` frozen; SPEC-REVIEW gaps closed; story_status CONTRACT; branch `feature/US-5.1-reel-scripts`.
- 2026-08-30 · US-5.1 PREP: `plan/stories/US-5.1/README.md` + `TASKS.md`; PO decisions frozen; story_status PREP.
- 2026-08-30 · US-4.2 CLOSE: 5/5 AC checked; QA APPROVE WITH NOTES (0 Critical, 0 High, 0 Medium, 3 Low); BE `ba57bac` · FE `4367287`; Phase 3 → SELECT US-5.1.
- 2026-08-30 · US-4.2 QA: APPROVE WITH NOTES (0 Critical, 0 High, 3 Low); `plan/stories/US-4.2/QA.md`; 74/74 tests; CLOSE recommended yes; BE `ba57bac` · FE `4367287` · VALIDATION `dd7eff5`; story_status QA.
- 2026-08-30 · US-4.2 VALIDATION: PASS WITH NOTES (0 blockers, 74/74 tests); `plan/stories/US-4.2/VALIDATION.md`; BE `ba57bac` · FE `4367287`; story_status VALIDATION.
- 2026-08-30 · US-4.2 CONTRACT: `plan/stories/US-4.2/CONTRACT.md` frozen; SPEC-REVIEW gaps closed; story_status CONTRACT; branch `feature/US-4.2-strategy-approve`.
- 2026-08-30 · US-4.2 PREP: `plan/stories/US-4.2/README.md` + `TASKS.md`; PO decisions frozen; story_status PREP.
- 2026-08-30 · US-4.1 CLOSE: 9/9 AC checked; QA APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 3 Low); BE `af998d9` · FE `dcbd15a` · agents `bbd159d`; Phase 3 → SELECT US-4.2.
- 2026-08-30 · US-4.1 QA: APPROVE WITH NOTES (0 Critical, 0 High, 2 Medium, 3 Low); `plan/stories/US-4.1/QA.md`; story_status QA; CLOSE recommended yes.
- 2026-08-30 · US-4.1 VALIDATION: PASS WITH NOTES (0 blockers, 51/51 tests); `plan/stories/US-4.1/VALIDATION.md`; story_status VALIDATION.
- 2026-08-30 · US-4.1 CONTRACT: `plan/stories/US-4.1/CONTRACT.md` frozen; SPEC-REVIEW gaps closed; story_status CONTRACT; branch `feature/US-4.1-content-strategy`.
- 2026-08-30 · US-4.1 PREP: `plan/stories/US-4.1/README.md` + `TASKS.md`; PO decisions frozen; story_status PREP.
- 2026-08-29 · US-X.4 CLOSE + FF-merge to main (`291313b`). Phase 3 → SELECT US-4.1.
- 2026-08-29 · US-X.4 QA: APPROVE WITH NOTES (0 Critical/High, 26/26 tests).
- 2026-08-29 · US-X.4 VALIDATION: PASS WITH NOTES (0 blockers).
- 2026-08-29 · US-X.4 BUILD: catalog migrations + `getProviderCatalog()` + `llmVariant` routing (`5ba9876`).
