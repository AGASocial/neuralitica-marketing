## MODIFIED Requirements

### Requirement: User account dropdown
The authenticated app header SHALL replace the separate “Signed in as” text, static avatar, and Log out button with a single shadcn `DropdownMenu` triggered by the avatar (always visible) and display name (hidden on small viewports). The menu MUST work with mobile touch. The trigger MUST remain reachable on iPhone-width viewports (`shrink-0`, adequate touch target) and MUST expose `aria-label` “Menú de usuario” (ES) / “User menu” (EN). Items SHALL include: language radio choices (Español / English), a Configuración / Settings link to `/settings`, and Cerrar sesión / Log out using the existing logout confirmation flow.

#### Scenario: Open user menu on mobile
- **WHEN** an active user taps the avatar on a small viewport (≈390px wide)
- **THEN** the dropdown opens with language, settings, and logout actions (name may be omitted from the trigger)

#### Scenario: User menu accessible name
- **WHEN** the header renders in Spanish
- **THEN** the user menu trigger has `aria-label="Menú de usuario"`
- **WHEN** the header renders in English
- **THEN** the user menu trigger has `aria-label="User menu"`

#### Scenario: Choose language
- **WHEN** the user selects Español or English in the menu
- **THEN** the locale persists (cookie) and the app re-renders in that language without requiring a `?locale=` query param

#### Scenario: Settings and logout
- **WHEN** the user chooses Configuración
- **THEN** they navigate to `/settings`
- **WHEN** the user confirms Cerrar sesión
- **THEN** the existing logout action runs
