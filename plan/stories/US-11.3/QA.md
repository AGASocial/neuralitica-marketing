# QA Report — US-11.3 Approve and mark ready to publish

**Story:** US-11.3  
**Branch:** `feature/US-11.3-ready-to-publish`  
**Gate:** QA — 2026-08-30  
**Reviewer:** qa-engineer  
**Contract:** `plan/stories/US-11.3/CONTRACT.md` (frozen 2026-08-30)  
**Validation upstream:** `plan/stories/US-11.3/VALIDATION.md` — PASS WITH NOTES  
**Security design:** `plan/stories/US-11.3/SECURITY.md` — APPROVE WITH CONDITIONS (12 conditions reconciled in CONTRACT)

---

### Verdict: APPROVE WITH CONDITIONS

US-11.3 implements approved-only ready-to-publish list/detail, authenticated caption export, and Cliente media attachment with approved-approval linkage. Download routes enforce tenancy, uniform 404 on foreign/non-approved, disposition whitelist, and server-composed caption bodies. No new approval status writers; closed write surface verified by source tests and grep. **No Critical/High/Medium security defects found.** Conditions are Low-severity hardening and operational follow-ups only.

**Severity counts:** Critical **0** · High **0** · Medium **0** · Low **3**

---

### Findings

#### Low — Missing explicit `rejected → approve` decide regression test

- **File:** `lib/approvals/approvals.test.ts` (gap); guard at `lib/approvals/decide-approval.ts:106–131`
- **What:** `decideApproval` blocks non-`pending_client` with `INVALID_TRANSITION`, but the two suites run for this gate do not include an automated case starting from `status = 'rejected'`.
- **Why it matters:** Regression coverage gap for a SECURITY.md criterion; mechanism is present in source.
- **Fix direction:** Add one test in `approvals.test.ts` mirroring the existing double-decide case, asserting `rejected → approve` returns `INVALID_TRANSITION` and performs no UPDATE.

#### Low — No live browser download / IDOR smoke in this gate

- **Files:** `app/api/approvals/[approvalId]/caption.txt/route.ts`, `app/api/media/assets/[assetId]/route.ts`, `/ready-to-publish/**`
- **What:** Security coverage is unit/source tests with mocks; no manual or browser-automation smoke (approve → download video + caption → cross-client spot-check) was executed in QA.
- **Why it matters:** Cookie/session integration and streaming headers are not exercised end-to-end; residual risk is low given route-level tests mirror production orchestration.
- **Fix direction:** Optional pre-prod smoke checklist (VALIDATION recommended action #1); not a merge blocker.

#### Low — Production build fails on pre-existing unrelated type error

- **File:** `lib/tts/synthesize-voiceover-for-client-trusted.ts:149`
- **What:** `npm run build` fails with `'inserted' is possibly 'null'` — outside US-11.3 diff.
- **Why it matters:** Blocks Vercel deploy for the whole repo, not introduced by this story.
- **Fix direction:** Fix in TTS module or separate hygiene PR before production promotion; does not block US-11.3 story closure on feature merit.

---

### Security audit — download routes and approved-only guards

| Control | Status | Evidence |
|---------|--------|----------|
| Caption export auth-first | **PASS** | `requireActive("handler")` before any DB/rate work (`caption.txt/route.ts:64–72`); source test confirms no prior `await` |
| Caption tenancy + approved gate | **PASS** | `loadApprovalByIdScoped({ approvalId, clientId: user.id })` + `status !== "approved" → 404` (`caption.txt/route.ts:87–93`) |
| Caption body server-only | **PASS** | `composeApprovalPackage` → `effectiveCaption`; no request body; route grep shows no `.update`/`.insert` |
| Caption rate limit | **PASS** | `approval_export` bucket; 429 on exceed; attempt recorded only after successful compose (`caption.txt/route.ts:79–85,106–109`) |
| Caption 404 uniformity | **PASS** | Foreign + non-approved return same `{ error: "NOT_FOUND" }` shape |
| Media disposition whitelist | **PASS** | Exact `disposition === "attachment"` only (`route.ts:73–75`, constant `MEDIA_ASSET_DISPOSITION_ATTACHMENT`) |
| Client filename query ignored | **PASS** | Filename from server metadata + `sanitizeFilenameForHeader`; no `searchParams.get("filename")` |
| Malicious disposition injection | **PASS** | Test: `attachment; filename=evil` + `filename=../../etc/passwd` → stays `inline`, no evil in header (`approvals-ready-to-publish.test.ts`) |
| Cliente attachment approved linkage | **PASS** | `hasApprovedApprovalForOutputAsset` when `attachmentMode && accessViaCliente` (`route.ts:273–280`) |
| Non-approved attachment blocked | **PASS** | Test: pending-owned asset + `?disposition=attachment` → 404 |
| Approved attachment succeeds | **PASS** | Test: approved linkage → 200 + `Content-Disposition: attachment` |
| Foreign asset attachment | **PASS** | Test: foreign `client_id` → 404 |
| Inline preview unchanged | **PASS** | Default without param → `inline` even when pending (`approvals-ready-to-publish.test.ts`) |
| No static / storage_key in FE hrefs | **PASS** | `buildReadyToPublishDownloadUrls` → `/api/media/assets/…` and `/api/approvals/…/caption.txt` only; Zod regex lock (`lib/contracts/approval.ts:352–364,408–438`) |
| No second approve writer | **PASS** | US-11.3 adds list + export only; log hook does not mutate status (`decide-approval.ts:212–221`) |
| No browser Supabase | **PASS** | No `@supabase/supabase-js` in `components/ready-to-publish/` or ready-to-publish pages |
| List approved-only filter | **PASS** | DB `.eq("status", "approved")` (`persist-approval.ts:142–144`); DTO `z.literal("approved")` |
| Detail 404 when not approved | **PASS** | `notFound()` when `package.status !== "approved"` (`ready-to-publish/[approvalId]/page.tsx:66–68`) |
| Operator attachment without approved guard | **PASS (by design)** | Operator path skips US-11.3 guard per CONTRACT § Media attachment — Cliente story scope only |
| No QA gate re-check on download | **PASS (by design)** | No `getQaGateStatusForAssembledReel` on export paths — per PO #10 / CONTRACT |

---

### Contract / correctness alignment

| Acceptance criterion | QA assessment |
|---------------------|---------------|
| Approved Reels in ready-to-publish list | **Met** — action + page + nav wired |
| Caption + video downloadable (V1) | **Met** — separate authenticated routes |
| Rejected not in publish queue | **Met** — hard SQL filter + detail guard |
| [SEC] State machine server-enforced | **Met** — inherited decide unchanged; double-decide regression passes |
| [SEC] Client-scoped authenticated downloads | **Met** — IDOR tests + URL helpers |

No undeclared API fields, no client-writable status, no CONTRACT divergence identified.

---

### Checks Run

| Command | Result |
|---------|--------|
| `npx tsx --test lib/approvals/approvals-ready-to-publish.test.ts lib/approvals/approvals.test.ts` | **44 pass / 0 fail** (~417 ms) |
| `npx eslint` on US-11.3 production paths (routes, ready-to-publish pages/components, approvals lib touched) | **0 errors** |
| `npm run lint` (full repo) | **Fail** — pre-existing errors in unrelated modules + test `require()` style (not US-11.3 production code) |
| `npx tsc --noEmit` | **Fail** — pre-existing test/agent TS errors outside US-11.3 scope |
| `npm run build` | **Fail** — pre-existing `lib/tts/synthesize-voiceover-for-client-trusted.ts:149` (`inserted` possibly null) |
| Grep: new `neuramark_approvals.status` writers in `app/api/` | **None** |
| Grep: `storage_key` / `/public/` in ready-to-publish FE | **None** |
| Grep: `@supabase/supabase-js` in ready-to-publish components | **None** |

---

### What Was Not Covered

- Live Supabase integration tests (mocked Supabase in unit tests).
- Browser/manual smoke: approve flow → post-approve panel → `/ready-to-publish` → download MP4 + `.txt`.
- Cross-tenant IDOR with real sessions (two Cliente accounts).
- Load/perf review of `hasApprovedApprovalForOutputAsset` two-query pattern under many approved rows.
- Explicit automated `rejected → approve` and `changes_requested → approve` cases in the gate test run (`changes_requested` covered in `approvals-revision.test.ts`, not re-run here).
- Full-repo lint/tsc/build green (blocked by pre-existing failures outside US-11.3).

---

### Closure recommendation

**Recommend story CLOSE** for US-11.3 feature scope. Security bar from SECURITY.md and CONTRACT § Security tests is satisfied; VALIDATION PASS WITH NOTES aligns with this QA outcome.

**Before production deploy (repo-wide, not US-11.3-only):**

1. Fix `lib/tts/synthesize-voiceover-for-client-trusted.ts` build type error.
2. Optional: add `rejected → approve` regression test (Low).
3. Optional: manual download smoke on staging with two tenants.

**PO at CLOSE:** Mark USER_STORIES § US-11.3 AC boxes; update TASKS.md SPEC-REVIEW / SECURITY checklist items per VALIDATION deferred list.

---

**Reviewed by:** qa-engineer — 2026-08-30
