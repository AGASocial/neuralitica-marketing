## ADDED Requirements

### Requirement: Pending approvals list cards show reel title and preview
The `/approvals` list SHALL show each pending package with a read-time reel title, muted authenticated thumbnail when a video asset exists, plain-language i18n summary, and package `createdAt` in local timezone without hydration mismatch. Soft-inserted packages MUST NOT require persisted title/summary columns.

#### Scenario: Soft-inserted package has empty caption
- **WHEN** a pending approval was soft-inserted for a brand-completed assembly and caption preview is empty
- **THEN** the card still shows the joined reel title from assembly → script → weekly plan (`tema`, else `hook`, else untitled fallback), not a bare em dash as the only title

#### Scenario: Thumbnail on list card
- **WHEN** the list item includes a video asset id
- **THEN** the card renders a muted thumbnail through `/api/media/assets/{id}` (shared MediaThumbnail)

#### Scenario: Received date is package creation
- **WHEN** the list renders a pending card
- **THEN** the received line uses approval `createdAt` via client-local formatting (no SSR/client timezone mismatch)

### Requirement: Disclosure chip uses plain-language i18n
When `hasDisclosure` is true on a pending approvals list card, the chip label SHALL come from EN/ES messages with a localized tooltip explaining AI indication — not the English word “Disclosure”.

#### Scenario: Spanish disclosure chip
- **WHEN** locale is `es` and the package requires disclosure
- **THEN** the chip reads “Aviso de IA” and the tooltip explains AI indication in Spanish

### Requirement: Approval detail shows reel title with preview
The `/approvals/[approvalId]` detail view SHALL surface the same read-time reel title used on list cards together with the existing authenticated video preview.

#### Scenario: Detail title matches list enrichment
- **WHEN** an owner opens Revisar for a package whose assembly joins to a strategy tema or script hook
- **THEN** the detail view shows that reel title (not only the generic “Review package” chrome)
