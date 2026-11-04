# publishing-instagram Specification

## Purpose

Deliver approved Reels for Instagram. Current code prioritizes manual backup download and Operator “mark published” metadata; Instagram Graph auto-publish remains V1 product scope per ADR-0002 / D1 but is not the live default path unless implemented. Related: ADR-0002, ADR-0009 (chat never publishes).

## Requirements

### Requirement: Ready-to-publish downloads
For approved packages, the system SHALL expose `/ready-to-publish` and detail routes with video and caption download URLs built server-side (`buildReadyToPublishDownloadUrls`), without requiring Graph publish to succeed first.

#### Scenario: Cliente downloads approved reel
- **WHEN** an active Cliente opens an approved ready-to-publish package
- **THEN** the UI offers download actions for the video asset and caption text

#### Scenario: Unapproved package
- **WHEN** a package is not approved
- **THEN** it MUST NOT appear as ready-to-publish downloadable content for the Cliente

### Requirement: No Instagram publish from chat
Orchestrator chat MUST NEVER publish to Instagram; tools and prompts forbid auto-publish (ADR-0009).

#### Scenario: Chat conversation about posting
- **WHEN** the owner discusses posting from chat
- **THEN** the assistant may guide toward approvals/ready-to-publish UI but MUST NOT invoke Graph publish

### Requirement: Operator mark-published metadata
The Operator calendar MAY record that a slot was published (date / Instagram URL) via mark-published dialogs for operational tracking; this SHALL NOT itself call Instagram Graph publish APIs in the current implementation.

#### Scenario: Operator marks slot published
- **WHEN** an Operator submits mark-published with an optional Instagram URL for an approved slot
- **THEN** calendar metadata updates and the UI can show a view-on-Instagram link when a URL is present

### Requirement: Graph publish remains V1 scope
Per ADR-0002 and governance D1, Instagram Business Graph Reels publish (publish-now / optional schedule) after Cliente approval remains in V1 product scope. Implementations MUST NOT remove that scope from planning solely because download is the current shipping path.

#### Scenario: Planning agents
- **WHEN** agents plan publishing work
- **THEN** they MUST treat Graph publish as in-scope V1 while documenting that current UI is download-first unless code already exposes publish actions
