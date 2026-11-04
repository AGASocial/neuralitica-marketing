## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Layout compositor replaces FAB
The authenticated owner shell SHALL render a large always-visible orchestrator compositor on all owner pages (pinned above the mobile tab bar). The shell MUST NOT render a floating chat FAB. Cmd/Ctrl+J SHALL focus the layout compositor.

#### Scenario: No mobile FAB
- **WHEN** the chat panel is closed on a small viewport
- **THEN** no floating chat FAB is rendered; the layout compositor remains available

#### Scenario: Shortcut focuses composer
- **WHEN** the user presses Cmd/Ctrl+J while focus is not already in an editable field
- **THEN** the layout compositor receives focus

#### Scenario: Send opens conversation panel
- **WHEN** the owner submits text from the layout composer
- **THEN** the orchestrator conversation panel opens and the message is sent through the existing chat transport

#### Scenario: Conversación full screen
- **WHEN** the owner activates Conversación
- **THEN** they navigate to `/conversation` showing the full-screen conversation layout

### Requirement: Advanced in user menu on mobile
When `user.role === "operator"`, Advanced operator links SHALL remain available. On small viewports Advanced MUST appear in the user account menu (not the bottom tab bar). On `md+` viewports Advanced MAY remain as a header nav group.

#### Scenario: Operator mobile Advanced
- **WHEN** an Operator opens the user menu on a small viewport
- **THEN** Advanced / operator tool links are reachable from that menu

#### Scenario: Cliente hides Advanced
- **WHEN** the user role is `client`
- **THEN** Advanced MUST NOT render in nav or user menu

## REMOVED Requirements

### Requirement: Chat toggle and mobile FAB
**Reason**: Agentic-first Option C replaces the help-widget FAB with an always-visible layout compositor (KAN-104/105, ADR-0011).
**Migration**: Use the layout compositor + Conversación control; do not reintroduce a mobile FAB.
