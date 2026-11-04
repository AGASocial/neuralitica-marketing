# approvals-and-cost-confirmation Specification

## Purpose

Let the Cliente approve, request changes, or reject assembled Reels before publish, and require explicit cost confirmation before paid media or TTS spend. Related: ADR-0009; SC-2 approval gate.

## Requirements

### Requirement: Cliente approval decisions
The system SHALL expose `/approvals` and `/approvals/[approvalId]` for active Clientes to approve, reject, or request changes via `decideApproval`, re-checking auth and business gates server-side before any status write.

#### Scenario: Approve package
- **WHEN** an active Cliente Approves a pending package
- **THEN** the approval status becomes approved and the piece becomes eligible for ready-to-publish download flows

#### Scenario: Request changes once
- **WHEN** the Cliente requests changes with feedback
- **THEN** the system records the change request and routes regeneration of the affected work per product rules

#### Scenario: Inactive user blocked
- **WHEN** an inactive or unauthenticated caller invokes `decideApproval`
- **THEN** the action MUST return 401/403 and MUST NOT update approval rows

### Requirement: Chat approval proposals
`proposeApprovePendingVideo` and `proposeRequestVideoChanges` SHALL return non-mutating proposal cards that map to `decideApproval` only after Approve (ADR-0009).

#### Scenario: Owner approves video from chat
- **WHEN** the owner Approves an “Approve this video?” card
- **THEN** `decideApproval` runs with the proposed decision payload

### Requirement: Paid video cost confirmation
Operators MUST confirm estimated spend through `confirm_paid_generation`-style cards before b-roll or HeyGen jobs start from chat; the approve path SHALL re-validate the estimate (`confirmPaidGenerationFromChat`).

#### Scenario: Cost card shown before spend
- **WHEN** chat proposes paid video generation
- **THEN** the UI shows an approximate cost card with Approve / Change and MUST NOT start jobs until Approve

### Requirement: TTS cost confirmation is separate
Voice/TTS spend SHALL use a distinct `confirm_tts_generation` card (not the video paid card), defaulting to the latest eligible write-up with an in-card picker when no script is named (ADR-0009).

#### Scenario: Owner asks voice cost
- **WHEN** the owner asks how much voice costs or to create voice
- **THEN** the assistant MUST surface the TTS confirmation card rather than answering with price text alone

### Requirement: Mis videos hub shows production, pending OK, and ready
The owner `/ready-to-publish` (“Mis videos”) page SHALL list three sections: in production, waiting for the owner’s OK, and ready to publish (download). Brand-completed assemblies without an approved/rejected decision MUST appear under waiting-for-OK. Approving a package MUST still enforce the QA gate on `decideApproval`.

#### Scenario: Pending assembled reel visible
- **WHEN** the client has a brand-completed assembled reel without an approved decision
- **THEN** Mis videos shows it under waiting-for-OK with an inline video preview

#### Scenario: Pending assembled reel visible without QA
- **WHEN** the client has a brand-completed assembled reel (`status=completed`, `branding_status=completed`, output present) with no approval decision and no QA report
- **THEN** Mis videos soft-inserts `pending_client` if needed and shows an inline `<video>` preview via the authenticated media route

#### Scenario: In-production jobs visible
- **WHEN** the client has queued or processing video or assembly jobs for a script
- **THEN** Mis videos shows an in-production entry for that work

#### Scenario: Approved still downloadable
- **WHEN** the client has approved approval packages
- **THEN** Mis videos still lists them under ready-to-publish with download access
