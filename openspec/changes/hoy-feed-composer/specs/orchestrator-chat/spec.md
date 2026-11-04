## ADDED Requirements

### Requirement: Layout compositor entry
The owner shell SHALL expose a layout compositor on all owner pages using the same Enter / Shift+Enter / IME rules as the sheet composer. Submitting SHALL open the conversation panel and send via `POST /api/chat`. Suggested chips and an optional Web Speech mic follow the scenarios below; no paid STT.

#### Scenario: Chips hidden after first user message
- **WHEN** the conversation already has at least one user message
- **THEN** suggested chips are not shown on the layout compositor

#### Scenario: Mic unsupported
- **WHEN** `SpeechRecognition` / `webkitSpeechRecognition` is unavailable
- **THEN** the mic button is not rendered

#### Scenario: Layout send opens panel
- **WHEN** the owner sends from the layout compositor while the panel is closed
- **THEN** the panel opens and the message is delivered to the orchestrator session

### Requirement: Card-anchored Change
Activating Change / Cambiar on a Hoy (or other surface) `AgentCard` SHALL open the conversation panel with prefills that identify the card (id and title/context) so the owner can request revisions without leaving the card context.

#### Scenario: Change from Hoy card
- **WHEN** the owner activates Change on a pending reel card on Hoy
- **THEN** the conversation panel opens with context referencing that card’s id/title

### Requirement: Full-screen conversation route
The system SHALL provide a full-screen conversation view at `/conversation` (Option A layout: transcript thread plus a canvas/list of agent cards) reachable in one tap from the shell Conversación control. The view MUST reuse the same orchestrator chat transport and persistence as the panel.

#### Scenario: Open conversation route
- **WHEN** an authenticated owner navigates to `/conversation`
- **THEN** the full-screen conversation UI loads the latest conversation for that client

## MODIFIED Requirements

### Requirement: Stick-to-bottom transcript scroll
The transcript pane (sheet panel and full-screen conversation) SHALL use stick-to-bottom behavior (~80px threshold): always scroll on send; keep sticking while streaming if near bottom; pause when the user scrolls up; show a “New messages” control when not stuck (ADR-0009).

#### Scenario: User scrolled up during stream
- **WHEN** the user is more than the threshold from the bottom while new parts arrive
- **THEN** the pane MUST NOT force-scroll and MUST offer a control to jump to latest

#### Scenario: User sends a message
- **WHEN** the user sends a message
- **THEN** the transcript MUST scroll to the bottom and resume sticking
