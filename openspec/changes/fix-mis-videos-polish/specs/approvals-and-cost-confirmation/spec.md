## MODIFIED Requirements

### Requirement: Mis videos hub shows production, pending OK, and ready
The owner `/ready-to-publish` (“Mis videos”) page SHALL list three sections: in production, waiting for the owner’s OK, and ready to publish (download). Brand-completed assemblies without an approved/rejected decision MUST appear under waiting-for-OK. Approving a package MUST still enforce the QA gate on `decideApproval`. Each waiting-for-OK card SHALL show a human title (weekly plan slot `tema` when available, otherwise reel script `hook`), a plain-language format/modality badge (not the disclosure “Aviso”/“Disclosure” chip as the primary format badge), and a date derived from the assembled reel’s completion time (`updated_at` of the completed assembly), not the approval row’s creation timestamp alone.

#### Scenario: Pending assembled reel visible
- **WHEN** the client has a brand-completed assembled reel without an approved decision
- **THEN** Mis videos shows it under waiting-for-OK with an inline video preview

#### Scenario: Pending assembled reel visible without QA
- **WHEN** the client has a brand-completed assembled reel (`status=completed`, `branding_status=completed`, output present) with no approval decision and no QA report
- **THEN** Mis videos soft-inserts `pending_client` if needed and shows an inline `<video>` preview via the authenticated media route

#### Scenario: Pending card shows title and format
- **WHEN** a waiting-for-OK card is rendered for a reel with strategy slot tema “Calefacción de invierno” and modalidad `faceless`
- **THEN** the card title is “Calefacción de invierno” (or the script hook if tema is missing) and the format badge is the localized faceless/modality label, not “Aviso”

#### Scenario: Pending card date is assembly completion
- **WHEN** several pending approvals were soft-inserted in the same list request but their assemblies completed on different days
- **THEN** each card’s displayed date reflects that assembly’s completion/`updated_at`, not the shared soft-insert `created_at`

#### Scenario: In-production jobs visible
- **WHEN** the client has queued or processing video or assembly jobs for a script
- **THEN** Mis videos shows an in-production entry for that work

#### Scenario: Approved still downloadable
- **WHEN** the client has approved approval packages
- **THEN** Mis videos still lists them under ready-to-publish with download access
