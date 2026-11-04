## ADDED Requirements

### Requirement: List and Mis videos cards use AgentCard
The `/approvals` pending list cards and Mis videos waiting-for-OK cards SHALL render through the shared `AgentCard` catalog (`reel_approval`), including `MediaThumbnail` when a video asset/preview exists. Approve on Mis videos MUST still call `decideApproval`; list “review” remains a navigation action to the package detail. Cost confirmation semantics are unchanged (explicit estimate before spend). Related: ADR-0011, `agent-cards`, `media-thumbnails`.

#### Scenario: Approvals list uses AgentCard
- **WHEN** `/approvals` lists a pending package with a video asset id
- **THEN** the card is an `AgentCard` with a muted thumbnail via the shared media helper

#### Scenario: Mis videos pending uses AgentCard
- **WHEN** Mis videos shows a waiting-for-OK reel with preview URL
- **THEN** the card is an `AgentCard` with at most two primary actions (Approve / Change) and Approve still runs `decideApproval`
