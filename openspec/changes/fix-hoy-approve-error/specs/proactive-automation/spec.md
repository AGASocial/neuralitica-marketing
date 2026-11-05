## ADDED Requirements

### Requirement: Autopilot still requires a passed QA gate
Automatic approval MUST treat `qaGateReady` as `gate.ready === true`. A missing QA report MUST NOT waive the gate for autopilot. The missing-report waiver applies only to an explicit client `decideApproval`.

#### Scenario: Missing QA report is not auto-approved
- **WHEN** autopilot evaluates a pending item whose QA gate is not ready because no QA report exists
- **THEN** the item is not auto-approved
