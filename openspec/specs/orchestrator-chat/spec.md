# orchestrator-chat Specification

## Purpose

Provide a persistent plain-language chat sheet where owners and operators drive the campaign via proposal/confirm cards, without silent mutations or Instagram publish from chat. Related: ADR-0009.

## Requirements

### Requirement: Chat transport and identity
The system SHALL stream chat via `POST /api/chat` using AI SDK `streamText` through the AI Gateway, resolve the user with `getCurrentUser()` / role checks on tools and mutations, and MUST set `sendReasoning: false` while sanitizing owner-visible text (ADR-0009).

#### Scenario: Authenticated stream
- **WHEN** an active user sends a message with a valid locale
- **THEN** the route streams an assistant response and tool parts without exposing internal reasoning

#### Scenario: Tool names hidden
- **WHEN** the model emits tool activity
- **THEN** owner-visible copy MUST NOT name internal tool identifiers

### Requirement: Proposal cards mutate only on Approve
Action tools SHALL return proposal payloads rendered as Campaña cards with primary Approve and secondary Change; Server Actions run only after Approve. Chat MUST NEVER auto-spend or publish to Instagram (ADR-0009).

#### Scenario: Proposal without approve
- **WHEN** a proposal tool returns successfully
- **THEN** domain tables MUST remain unchanged until the user Approves the card

### Requirement: Conversation persistence
The system SHALL persist conversations and messages in `neuramark_orchestrator_conversations` and `neuramark_orchestrator_messages`, reload the latest conversation for the client, and persist on stream finish.

#### Scenario: Reload latest conversation
- **WHEN** the user reopens the chat sheet
- **THEN** the UI loads the latest stored transcript for that Cliente

#### Scenario: Persist after stream
- **WHEN** a chat stream finishes successfully
- **THEN** messages for that conversation are written server-side

### Requirement: Stick-to-bottom transcript scroll
The transcript pane SHALL use stick-to-bottom behavior (~80px threshold): always scroll on send; keep sticking while streaming if near bottom; pause when the user scrolls up; show a “New messages” control when not stuck (ADR-0009).

#### Scenario: User scrolled up during stream
- **WHEN** the user is more than the threshold from the bottom while new parts arrive
- **THEN** the pane MUST NOT force-scroll and MUST offer a control to jump to latest

#### Scenario: User sends a message
- **WHEN** the user sends a message
- **THEN** the transcript MUST scroll to the bottom and resume sticking

### Requirement: Own-avatar and TTS cards
`proposeEnableOwnAvatar` SHALL only propose Preferencias upsert (`upsertVisualPreferences`) and MUST redirect to `grant_presenter_consent` when consent is missing, never starting HeyGen/avatar jobs. TTS spend MUST use `confirm_tts_generation` distinct from video paid cards (ADR-0009).

#### Scenario: Enable own avatar without consent
- **WHEN** the owner asks to appear on camera but consent is missing
- **THEN** the chat shows the presenter consent card instead of enabling the modality

#### Scenario: TTS confirm
- **WHEN** the owner asks to create voice without naming a video
- **THEN** the TTS card defaults to the latest eligible write-up and includes a picker

### Requirement: getSetupStatus read tool
Orchestrator chat SHALL provide a read-only `getSetupStatus` tool that returns the owner’s setup completion (required and optional steps, percentComplete) for answering “what’s left / ¿qué me falta?”. The tool MUST NOT mutate state, spend, publish to Instagram, or start avatar generation.

#### Scenario: Tool returns completion
- **WHEN** `getSetupStatus` is invoked for an authenticated owner
- **THEN** the tool returns ok with steps and percentComplete aligned with `computeSetupCompletion`
