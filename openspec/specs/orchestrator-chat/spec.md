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

### Requirement: Faceless cost card shows total pipeline estimate
`proposeConfirmPaidGeneration` for a faceless / images-and-text script SHALL set `estimatedCostCents` and `confirmEstimateCents` to the live b-roll estimate plus TTS estimate when no voiceover asset exists yet.

#### Scenario: Faceless Approve total estimate
- **WHEN** `proposeConfirmPaidGeneration` resolves a faceless script that needs b-roll and has no voiceover asset
- **THEN** the proposal confirm estimate equals b-roll estimate plus TTS estimate for the voiceover text

### Requirement: Faceless Approve starts TTS and b-roll
Approving the faceless paid generation card SHALL synthesize voiceover when missing and enqueue b-roll video jobs for that script after re-checking the total confirm estimate.

#### Scenario: Faceless Approve starts TTS and b-roll
- **WHEN** the owner Approves the faceless cost card with a matching confirm estimate
- **THEN** the system synthesizes voiceover if missing and creates b-roll video jobs for that script

### Requirement: Assembly follows completed chat faceless b-roll
After all b-roll jobs for that script complete with voiceover present, the system SHALL enqueue assembly for that script without requiring a weekly-cycle step_run so branding can auto-chain.

#### Scenario: Assembly follows completed b-roll for chat jobs
- **WHEN** all b-roll jobs for that script reach completed and a voiceover asset exists
- **THEN** the system enqueues an assembly job for that script without requiring a weekly-cycle step_run

### Requirement: Nueva conversación persists as latest
“Nueva conversación” SHALL create a persisted `neuramark_orchestrator_conversations` row for the client (empty transcript allowed) with a fresh `updated_at` so reload loads that conversation instead of the previous thread.

#### Scenario: New empty conversation survives reload
- **WHEN** the owner taps Nueva conversación and reloads the chat sheet
- **THEN** the UI loads the new empty conversation as the latest for that client

### Requirement: Chat video preview shows latest assembled reel
`getVideoPreview` (and the approve-pending proposal path) SHALL resolve the latest brand-completed or pending-approval assembled reel for the client, ensuring an approval package when needed, and return a playable `videoPreviewUrl` for inline preview.

#### Scenario: Preview without prior pending row
- **WHEN** an assembled reel is brand-completed for the client but no pending approval row exists yet
- **THEN** the preview tool ensures a package and returns a playable preview URL
