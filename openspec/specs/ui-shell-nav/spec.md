# ui-shell-nav Specification

## Purpose

Provide the authenticated app shell: Campaña header navigation grouped for owners, Operator Advanced links, and always-available orchestrator chat chrome. Related: ADR-0008, ADR-0009.

## Requirements

### Requirement: Owner primary navigation
The app shell SHALL show owner top-level links Home (`/dashboard`), My campaign (`/approvals`), My videos (`/ready-to-publish`), and a My business group for profile and preferences, using localized labels from the message catalogs (ADR-0009 IA). The Home route SHALL render the owner home dashboard (next action, week status, progress, results, recent videos, Atajos) rather than only a menu-card shortcut grid.

#### Scenario: Active client sees owner nav
- **WHEN** an active Cliente loads any `(app)` page
- **THEN** the header includes the owner links and business group without Operator Advanced

#### Scenario: Home is the owner dashboard
- **WHEN** the owner opens Home (`/dashboard`)
- **THEN** the page shows the owner home dashboard sections defined by the `owner-home-dashboard` capability

### Requirement: Operator Advanced group
When `user.role === "operator"`, the shell SHALL add an Advanced group linking to strategy, scripts, calendar, playbook, trends, cost policy, and cycle Operator routes. Existing routes remain reachable (ADR-0009).

#### Scenario: Operator sees Advanced
- **WHEN** an Operator opens the app shell
- **THEN** the Advanced menu lists the Operator tools above

#### Scenario: Cliente hides Advanced
- **WHEN** the user role is `client`
- **THEN** the Advanced group MUST NOT render

### Requirement: Chat toggle and mobile FAB
The shell SHALL include a header Chat toggle (always labeled) and a mobile safe-area FAB that opens the orchestrator chat sheet; the FAB MUST hide while the sheet is open (ADR-0009).

#### Scenario: Open chat from header
- **WHEN** the user activates the Chat toggle
- **THEN** the right-side chat sheet opens over the current page

#### Scenario: Mobile FAB
- **WHEN** the sheet is closed on a small viewport
- **THEN** the FAB remains available; when the sheet is open the FAB is hidden

### Requirement: Campaña UI primitives
Shell and nav SHALL compose Tailwind v4 + shadcn/ui Campaña tokens (`components/ui/*`) rather than PrimeReact (ADR-0008).

#### Scenario: Header styling
- **WHEN** the AppHeader renders
- **THEN** it uses Campaña/shadcn primitives and translation-driven labels
