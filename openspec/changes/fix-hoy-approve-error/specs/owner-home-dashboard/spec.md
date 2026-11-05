## ADDED Requirements

### Requirement: Hoy approve errors are concrete
When the owner activates Approve on a Hoy pending card, a failed `decideApproval` MUST show the localized `approvals.errors.*` string for `result.error.code` or `messageKey`. An unknown code or a thrown exception MUST show `approvals.errors.approveFailed`. The card MUST NOT show a bare "Error" or the feed load-error string for a decide failure.

#### Scenario: Known decide error
- **WHEN** Approve returns a known approval error code
- **THEN** Hoy shows that code’s `approvals.errors` sentence in the active locale

#### Scenario: Unknown or thrown decide error
- **WHEN** Approve returns an unknown code or the action throws
- **THEN** Hoy shows the approve-failed fallback and not the word "Error"

### Requirement: Hoy force-approve-error query
When the Hoy URL contains `forceApproveError=1`, activating Approve MUST skip `decideApproval` and MUST show the `INVALID_TRANSITION` catalog message (or the approve-failed fallback when that string is missing). The flag is client-only and MUST NOT approve, reject, or request changes.

#### Scenario: Query forces the error
- **WHEN** the owner opens Hoy with `?forceApproveError=1` and activates Approve
- **THEN** the card shows the invalid-transition message and no approval decision is written
