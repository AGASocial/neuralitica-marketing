## ADDED Requirements

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
