# Spec Delta

## ADDED Requirements

### Requirement: Business selector UI
The operator master prompts UI SHALL present a human-readable business selector (dropdown or similar) instead of requiring manual UUID entry, displaying business names with fallback to email when names are unavailable.

#### Scenario: Operator selects business by name
- **WHEN** operator opens the business selector dropdown
- **THEN** the system displays active businesses sorted by display name
- **AND** each entry shows the business display name as the primary label
- **AND** the system uses the business's client ID internally for prompt loading and saving

#### Scenario: Business with no display name
- **WHEN** a business has no display name in `neuramark_clients.display_name`
- **THEN** the system displays the business email as the label
- **AND** prompt save and load continue to work with the client ID

#### Scenario: No active businesses available
- **WHEN** operator loads `/operator/settings/master-prompts` and no active businesses exist
- **THEN** the system displays the global prompt section
- **AND** the system displays an empty state message in the business selector section
- **AND** the business prompt textarea remains hidden

#### Scenario: Switching businesses
- **WHEN** operator selects a different business from the dropdown
- **THEN** the system loads that business's current prompt (or empty if none exists)
- **AND** the system populates the business prompt textarea with the loaded prompt
