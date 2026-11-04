## ADDED Requirements

### Requirement: Autopilot approves within caps without publishing
The system SHALL approve a pending item automatically when the preset is `auto_pilot`, or `custom` with an `auto` rule for the item's content type, and the item cost is within the per-item cap and weekly spend cap. The approval SHALL use the same transition as a human approval and SHALL NOT publish.

#### Scenario: Eligible item is approved
- **WHEN** an eligible, fully rendered, QA-ready item is evaluated
- **THEN** it becomes `approved`, an `auto_approved` event is logged, and the owner sees it in "Lo que hice"

#### Scenario: Approval would require paid render
- **WHEN** the item's final video is not fully rendered
- **THEN** it is not approved, `auto_approve_skipped` is logged with `would_start_paid_render`, and the owner is notified

#### Scenario: Review everything
- **WHEN** the preset is `review_all`
- **THEN** nothing is auto-approved
