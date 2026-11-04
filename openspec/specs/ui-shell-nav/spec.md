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

### Requirement: User account dropdown
The authenticated app header SHALL replace the separate “Signed in as” text, static avatar, and Log out button with a single shadcn `DropdownMenu` triggered by the avatar (always visible) and display name (hidden on small viewports). The menu MUST work with mobile touch. Items SHALL include: language radio choices (Español / English), a Configuración / Settings link to `/settings`, and Cerrar sesión / Log out using the existing logout confirmation flow.

#### Scenario: Open user menu on mobile
- **WHEN** an active user taps the avatar on a small viewport
- **THEN** the dropdown opens with language, settings, and logout actions (name may be omitted from the trigger)

#### Scenario: Choose language
- **WHEN** the user selects Español or English in the menu
- **THEN** the locale persists (cookie) and the app re-renders in that language without requiring a `?locale=` query param

#### Scenario: Settings and logout
- **WHEN** the user chooses Configuración
- **THEN** they navigate to `/settings`
- **WHEN** the user confirms Cerrar sesión
- **THEN** the existing logout action runs
