# Change: Hoy approve shows a real error, and a missing QA report does not block the client

## Why
Clicking Aprobar on a Hoy card showed the bare word "Error". Pending cards are soft-inserted for brand-completed assemblies that have no QA report. `decideApprovalForClient` then treated that empty gate as `QA_GATE_NOT_READY`, and Hoy ignored `result.error` and fell back to `copy.loadError ?? "Error"` (`loadError` is only set when the feed itself fails to load).

## What Changes
- An explicit client decision (approve, reject, or request changes) proceeds when the QA gate is not ready only because no QA report exists (`qaReportId` null and `status` null). The client has already watched the video. This path does not run QA or any paid provider.
- When a QA report exists and is not ready (blocking failures or uncovered overridable failures), `decideApproval` still returns `QA_GATE_NOT_READY`.
- Autopilot is unchanged: it still requires `gate.ready === true` and does not use the missing-report waiver.
- Hoy, Mis videos, and the approval detail page map `result.error.code` / `messageKey` to `approvals.errors.*`. Unknown codes and thrown failures use `approvals.errors.approveFailed` ("No se pudo aprobar. Inténtalo de nuevo en un momento." / English equivalent). They never show a bare "Error".
- `?forceApproveError=1` on Hoy skips `decideApproval` and shows the Spanish `INVALID_TRANSITION` message (or that fallback). Client-only; nothing is approved.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `approvals-and-cost-confirmation`: human decide allows a missing QA report; an existing not-ready report still blocks; approve failures use catalog copy.
- `owner-home-dashboard`: Hoy approve errors are concrete messages; `forceApproveError=1` previews the error without deciding.
- `proactive-automation`: autopilot still requires a passed QA gate.
- `i18n`: EN/ES `approvals.errors.approveFailed`.

## Impact

- `lib/approvals/decide-approval.ts`, `lib/approvals/approval-decide-error-message.ts`, approval unit tests
- `components/dashboard/HoyFeedView.tsx`, `components/ready-to-publish/MyVideosHubView.tsx`, `components/approvals/ApprovalPackageView.tsx`
- `app/(app)/dashboard/page.tsx`, `app/(app)/ready-to-publish/page.tsx`, `messages/{en,es}.json`
- No migrations, no QA/LLM calls, no autopilot behavior change

## Out of Scope

- Running QA to backfill missing reports
- Changing `lib/automation/*` auto-approve rules
- Instagram publish
