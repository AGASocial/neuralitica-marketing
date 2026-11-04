## MODIFIED Requirements

### Requirement: Mis videos hub shows production, pending OK, and ready
The owner `/ready-to-publish` (“Mis videos”) page SHALL list three sections: videos still in production (progress), videos waiting for the owner’s OK (inline playable preview plus Approve / request-changes actions), and approved videos ready to publish (download). Brand-completed assemblies (`status=completed`, `branding_status=completed`, output asset present) without an approved/rejected decision MUST appear under waiting-for-OK with an inline `<video>` preview via the authenticated media route, even when QA reports or captions are missing (strict package ensure may fail — soft-insert `pending_client` for visibility). Approving a package MUST still enforce the QA gate on `decideApproval`.

#### Scenario: Pending assembled reel visible
- **WHEN** the client has a brand-completed assembled reel without an approved decision
- **THEN** Mis videos shows it under waiting-for-OK with an inline video preview

#### Scenario: Pending assembled reel visible without QA
- **WHEN** the client has a brand-completed assembled reel with output and no approval decision, and no QA report exists
- **THEN** Mis videos shows it under waiting-for-OK with an inline video preview from `/api/media/assets/…`

#### Scenario: In-production jobs visible
- **WHEN** the client has queued or processing video or assembly jobs for a script
- **THEN** Mis videos shows an in-production entry for that work

#### Scenario: Approved still downloadable
- **WHEN** the client has approved approval packages
- **THEN** Mis videos still lists them under ready-to-publish with download access
