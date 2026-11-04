# Spec Delta

## MODIFIED Requirements

### Requirement: Owner primary navigation
The app shell SHALL show owner top-level links Home (`/dashboard`), My campaign (`/approvals`), My videos (`/ready-to-publish`), and a My business group for profile and preferences, using localized labels from the message catalogs (ADR-0009 IA). The Home route SHALL render the owner home dashboard (next action, week status, progress, results, recent videos, Atajos) rather than only a menu-card shortcut grid.

#### Scenario: Active client sees owner nav
- **WHEN** an active Cliente loads any `(app)` page
- **THEN** the header includes the owner links and business group without Operator Advanced

#### Scenario: Home is the owner dashboard
- **WHEN** the owner opens Home (`/dashboard`)
- **THEN** the page shows the owner home dashboard sections defined by the `owner-home-dashboard` capability
