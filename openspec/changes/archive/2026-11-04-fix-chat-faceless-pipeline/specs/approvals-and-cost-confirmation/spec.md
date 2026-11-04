## ADDED Requirements

### Requirement: Mis videos hub shows production, pending OK, and ready
The owner `/ready-to-publish` (“Mis videos”) page SHALL list three sections: videos still in production (progress), videos waiting for the owner’s OK (inline playable preview plus Approve / request-changes actions), and approved videos ready to publish (download). Pending brand-completed assemblies MUST be visible after package ensure — not only `status=approved` rows.

#### Scenario: Pending assembled reel visible
- **WHEN** the client has a brand-completed assembled reel without an approved decision
- **THEN** Mis videos shows it under waiting-for-OK with an inline video preview

#### Scenario: In-production jobs visible
- **WHEN** the client has queued or processing video or assembly jobs for a script
- **THEN** Mis videos shows an in-production entry for that work

#### Scenario: Approved still downloadable
- **WHEN** the client has approved approval packages
- **THEN** Mis videos still lists them under ready-to-publish with download access
