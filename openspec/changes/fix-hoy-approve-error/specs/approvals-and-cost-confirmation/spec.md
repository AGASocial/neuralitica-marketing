## MODIFIED Requirements

### Requirement: Mis videos hub shows production, pending OK, and ready
The owner `/ready-to-publish` (“Mis videos”) page SHALL list three sections: in production, waiting for the owner’s OK, and ready to publish (download). Brand-completed assemblies without an approved/rejected decision MUST appear under waiting-for-OK. An explicit client `decideApproval` (approved, rejected, or request_changes) MUST proceed when the QA gate is not ready only because no QA report exists (`qaReportId` null and `status` null). The handler MUST NOT run QA or a paid provider on that path. When a QA report exists and is not ready (blocking failures or uncovered overridable failures), `decideApproval` MUST return `QA_GATE_NOT_READY` and MUST NOT write the decision. Autopilot MUST still require a passed QA gate and MUST NOT use this missing-report waiver. A failed approve on Mis videos MUST show the matching `approvals.errors.*` string, or `approvals.errors.approveFailed` for an unknown code or a thrown failure, and MUST NOT show a bare "Error".

#### Scenario: Pending assembled reel visible
- **WHEN** the client has a brand-completed assembled reel without an approved decision
- **THEN** Mis videos shows it under waiting-for-OK with an inline video preview

#### Scenario: Pending assembled reel visible without QA
- **WHEN** the client has a brand-completed assembled reel (`status=completed`, `branding_status=completed`, output present) with no approval decision and no QA report
- **THEN** Mis videos soft-inserts `pending_client` if needed and shows an inline `<video>` preview via the authenticated media route

#### Scenario: Client approves with no QA report
- **WHEN** the client explicitly approves, rejects, or requests changes on a pending package whose QA gate has no report
- **THEN** the decision is stored and no QA or paid provider run is started

#### Scenario: Existing QA report is not ready
- **WHEN** the client decides on a pending package whose QA report exists and is not ready
- **THEN** `decideApproval` returns `QA_GATE_NOT_READY` and the approval status stays `pending_client`

#### Scenario: Approve failure shows catalog copy
- **WHEN** approve on Mis videos fails or throws
- **THEN** the card shows the localized `approvals.errors` message for that code, or the approve-failed fallback, and never the bare word "Error"

#### Scenario: In-production jobs visible
- **WHEN** the client has queued or processing video or assembly jobs for a script
- **THEN** Mis videos shows an in-production entry for that work

#### Scenario: Approved still downloadable
- **WHEN** the client has approved approval packages
- **THEN** Mis videos still lists them under ready-to-publish with download access

## ADDED Requirements

### Requirement: Approval detail does not block a missing QA report
The `/approvals/[approvalId]` approve and request-changes controls MUST stay available when the package gate is not ready only because no QA report exists (`gate.status` null). When a QA report exists and `gate.ready` is false, those controls MUST stay disabled and the not-ready hint MUST show. A failed decide on this page MUST use the same `approvals.errors` mapping, including `approveFailed` for an unknown code or a thrown failure.

#### Scenario: No QA report on the detail page
- **WHEN** the owner opens a pending package whose gate status is null
- **THEN** Approve is enabled and the not-ready hint is hidden

#### Scenario: Failed report on the detail page
- **WHEN** the owner opens a pending package whose QA report exists and is not ready
- **THEN** Approve stays disabled and the not-ready hint is shown
