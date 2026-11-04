## MODIFIED Requirements

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
