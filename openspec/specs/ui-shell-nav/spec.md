# ui-shell-nav Specification

## Purpose

Provide the authenticated app shell: Campaña header navigation grouped for owners, Operator Advanced links, and always-available orchestrator chat chrome. Related: ADR-0008, ADR-0009.

## Requirements

### Requirement: Owner primary navigation
The app shell SHALL show owner top-level links labeled Hoy/Today (`/dashboard`), Campaña/Campaign (`/approvals`), Videos (`/ready-to-publish`), and Negocio/Business (profile + preferences), using localized message catalogs. On `md+` viewports these MAY appear in the header; on small viewports the shell SHALL use a safe-area-aware bottom tab bar (Hoy · Campaña · Videos · Negocio) instead of a duplicate top nav strip. Hoy SHALL render the feed from `owner-home-dashboard`.

#### Scenario: Active client sees owner nav
- **WHEN** an active Cliente loads any `(app)` page
- **THEN** the shell includes the owner Hoy/Campaña/Videos/Negocio destinations without Operator Advanced in the primary tab/rail

#### Scenario: Home is the owner dashboard
- **WHEN** the owner opens Home / Hoy (`/dashboard`)
- **THEN** the page shows the Hoy feed sections defined by the `owner-home-dashboard` capability

#### Scenario: Hoy is the owner feed
- **WHEN** the owner opens Hoy (`/dashboard`)
- **THEN** the page shows Needs OK, What I did, Next, and Results blocks

#### Scenario: Mobile bottom tab bar
- **WHEN** an owner loads an `(app)` page on a small viewport
- **THEN** a bottom tab bar with Hoy, Campaña, Videos, and Negocio is visible and accounts for `env(safe-area-inset-bottom)`

### Requirement: Operator Advanced group
When `user.role === "operator"`, the shell SHALL add an Advanced group linking to strategy, scripts, calendar, playbook, trends, cost policy, and cycle Operator routes. Existing routes remain reachable (ADR-0009).

#### Scenario: Operator sees Advanced
- **WHEN** an Operator opens the app shell
- **THEN** the Advanced menu lists the Operator tools above

#### Scenario: Cliente hides Advanced
- **WHEN** the user role is `client`
- **THEN** the Advanced group MUST NOT render

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

### Requirement: Layout compositor replaces FAB
The authenticated owner shell SHALL render a large always-visible orchestrator compositor on all owner pages (pinned above the mobile tab bar). The shell MUST NOT render a floating chat FAB. Cmd/Ctrl+J SHALL focus the layout compositor. On small viewports, suggested prompt chips in the layout compositor SHALL render as a single horizontally scrollable row (no vertical wrap stack that covers the feed). The main content area SHALL include bottom padding at least equal to the combined height of the layout compositor and the mobile tab bar (including safe-area inset) so feed cards remain reachable and tappable beneath the sticky chrome. Desktop (`md+`) layout MAY keep its existing composer spacing without the tab-bar offset.

#### Scenario: No mobile FAB
- **WHEN** the chat panel is closed on a small viewport
- **THEN** no floating chat FAB is rendered; the layout compositor remains available

#### Scenario: No desktop FAB on Hoy
- **WHEN** an owner views Hoy (`/dashboard`) on a `md+` viewport with the chat panel closed
- **THEN** no floating “Abrir chat” / Open chat FAB is rendered; the header Conversación control MAY remain

#### Scenario: Shortcut focuses composer
- **WHEN** the user presses Cmd/Ctrl+J while focus is not already in an editable field
- **THEN** the layout compositor receives focus

#### Scenario: Send opens conversation panel
- **WHEN** the owner submits text from the layout composer
- **THEN** the orchestrator conversation panel opens and the message is sent through the existing chat transport

#### Scenario: Conversación full screen
- **WHEN** the owner activates Conversación
- **THEN** they navigate to `/conversation` showing the full-screen conversation layout

#### Scenario: Mobile chips single row
- **WHEN** suggested chips are shown on the layout compositor on a small viewport
- **THEN** chips appear in one horizontally scrollable row and MUST NOT stack as a tall vertical column over the feed

#### Scenario: Feed clearance under sticky chrome
- **WHEN** an owner scrolls Hoy on a small viewport with the layout compositor and tab bar visible
- **THEN** the last feed cards remain reachable without being permanently covered by the sticky composer or tab bar

### Requirement: Advanced in user menu on mobile
When `user.role === "operator"`, Advanced operator links SHALL remain available. On small viewports Advanced MUST appear in the user account menu (not the bottom tab bar). On `md+` viewports Advanced MAY remain as a header nav group.

#### Scenario: Operator mobile Advanced
- **WHEN** an Operator opens the user menu on a small viewport
- **THEN** Advanced / operator tool links are reachable from that menu

#### Scenario: Cliente hides Advanced
- **WHEN** the user role is `client`
- **THEN** Advanced MUST NOT render in nav or user menu
