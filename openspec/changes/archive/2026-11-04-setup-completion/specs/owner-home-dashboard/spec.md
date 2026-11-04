# Spec Delta

## ADDED Requirements

### Requirement: Setup completion on Home
Owner Home SHALL include the setup completion progress and checklist from the `setup-completion` capability when required percent complete is below 100, and MUST hide that section when required setup is fully complete.

#### Scenario: Show incomplete setup
- **WHEN** the owner opens Home and required setup is incomplete
- **THEN** the setup progress section is visible above or near Atajos

#### Scenario: Hide complete setup
- **WHEN** required setup percent is 100
- **THEN** the setup progress section is not rendered
