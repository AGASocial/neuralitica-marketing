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
The transcript pane (sheet panel and full-screen conversation) SHALL use stick-to-bottom behavior (~80px threshold): always scroll on send; keep sticking while streaming if near bottom; pause when the user scrolls up; show a “New messages” control when not stuck (ADR-0009).

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

### Requirement: Composer Enter sends message
The orchestrator chat composer SHALL send on Enter and insert a newline on Shift+Enter. It MUST ignore Enter while IME composition is active (`nativeEvent.isComposing` or `keyCode === 229`), MUST NOT send empty trimmed input, and MUST NOT send while the chat is busy (submitted/streaming/attach). The textarea SHALL autosize with input. Enter-to-send applies on mobile as well; the send button MUST remain visible on all viewports.

#### Scenario: Enter sends when ready
- **WHEN** the owner presses Enter with non-empty input and the chat is not busy or composing
- **THEN** the message is sent and the default newline is prevented

#### Scenario: Shift+Enter inserts newline
- **WHEN** the owner presses Shift+Enter
- **THEN** the composer does not send and allows a newline

#### Scenario: IME composition ignored
- **WHEN** Enter fires during IME composition (`isComposing` or keyCode 229)
- **THEN** the composer MUST NOT send

### Requirement: Empty-state suggested prompt chips
When the orchestrator conversation has no user messages, the chat UI SHALL show suggested prompt chips under the greeting. Clicking a chip SHALL send that chip’s text as a user message. Chips MUST hide once any user message exists. Layout MUST be mobile-friendly (wrap, ≥44px tap targets, horizontal scroll when needed). Chips MUST NEVER start paid generation or Instagram publish directly.

#### Scenario: Chips visible on empty transcript
- **WHEN** the conversation has zero user messages
- **THEN** suggested prompt chips are visible under the greeting

#### Scenario: Chip click sends user message
- **WHEN** the owner taps a suggested prompt chip
- **THEN** that chip’s text is sent as a user message and the chips hide

#### Scenario: Chips hidden after user message
- **WHEN** the conversation includes at least one user message
- **THEN** suggested prompt chips MUST NOT be shown

### Requirement: Suggested chip selection (fixed + state-dependent)
The first chip SHALL always be the locale-aware capability question. The system SHALL add 3–5 additional chips computed server-side from setup completion and campaign status. Selection MUST exclude chips that would trigger spend without a cost card.

#### Scenario: Incomplete setup and pending approvals with approved plan
- **WHEN** setup percentComplete is 80, pending approvals count is 4, and an approved plan exists for the week
- **THEN** chips include the fixed capability question, finish-setup, show-pending-approvals, and how-is-campaign (not make-weekly-plan)

#### Scenario: No approved plan
- **WHEN** there is no approved plan for the week
- **THEN** chips include the make-weekly-plan prompt and MUST NOT include how-is-campaign for that week

#### Scenario: Missing scripts with approved plan
- **WHEN** an approved plan exists and video write-ups are still missing
- **THEN** chips include the write-scripts prompt

### Requirement: Capability overview answer and follow-up chips
When the owner asks the fixed capability question, the assistant SHALL answer with a short plain-language ~5-bullet overview (weekly plan, write-ups, videos with or without their face, review/approve, configure business) and SHALL surface follow-up next-step chips via a read-only tool. That tool MUST NOT mutate, spend, or publish.

#### Scenario: What can you do overview
- **WHEN** the owner sends the fixed capability-question chip text
- **THEN** the assistant replies with a short ~5-bullet plain-language overview and follow-up suggested-action chips from the read-only tool

#### Scenario: Follow-up chip does not spend
- **WHEN** the owner taps a follow-up suggested-action chip from the capability overview
- **THEN** that text is sent as a normal user message and any later paid work still requires an existing cost confirmation card

### Requirement: Tool parts render through agent card catalog
Orchestrator chat tool-part UI for proposals, status summaries, progress, next-step chips, and clarifying questions SHALL map outputs into the `agent-cards` catalog and render via `AgentCard`. Proposal Approve MUST still invoke the same Server Actions as before; chat MUST NOT auto-spend or publish to Instagram. Related: ADR-0011, ADR-0012, `agent-cards` capability.

#### Scenario: Proposal card via AgentCard
- **WHEN** an action tool returns a proposal (e.g. approve video, cost confirm, TTS, plan, own-avatar)
- **THEN** the chat UI renders it through `AgentCard` and mutates only after Approve

#### Scenario: Next-step chips via catalog
- **WHEN** `suggestNextActions` returns actions
- **THEN** the UI renders a `next_step_chips` catalog card and selecting a chip still sends that text as a user message

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
The system SHALL provide a full-screen conversation view at `/conversation` (Option A layout: transcript thread plus a canvas/list of agent cards) reachable in one tap from the shell Conversación control. The view MUST reuse the same orchestrator chat transport and persistence as the panel. Outside onboarding mode the canvas MAY remain a preview of tool cards; in onboarding mode cards in thread and canvas MUST support Approve/Change.

#### Scenario: Open conversation route
- **WHEN** an authenticated owner navigates to `/conversation`
- **THEN** the full-screen conversation UI loads the latest conversation for that client

#### Scenario: Onboarding mode query
- **WHEN** the owner opens `/conversation?mode=onboarding`
- **THEN** onboarding layout behaviors (progress, skip, actionable cards) apply

### Requirement: Onboarding conversation layout
When `/conversation` is opened with `mode=onboarding`, the full-screen conversation SHALL show: a setup progress indicator of required setup steps, actionable proposal/AgentCards in the thread (Approve/Change via existing Server Actions), a desktop right canvas of those cards, and on mobile a horizontal card carousel. Cards MUST NOT be read-only-only in onboarding mode.

#### Scenario: Desktop onboarding
- **WHEN** an owner opens `/conversation?mode=onboarding` on a desktop viewport
- **THEN** the UI shows thread + right canvas with actionable cards and a setup progress indicator

#### Scenario: Mobile onboarding carousel
- **WHEN** an owner opens onboarding conversation on a mobile viewport
- **THEN** cards appear in a horizontal carousel and chat remains full-width

### Requirement: Onboarding system prompt
When chat requests include onboarding mode, the system prompt SHALL emphasize the guided first-run order (interview → plan → write-ups → first videos with explicit cost cards) in plain language and MUST restate no auto-spend / no Instagram publish / no avatar generation.

#### Scenario: Onboarding mode prompt
- **WHEN** `/api/chat` runs for an owner in onboarding mode
- **THEN** the model receives the tightened onboarding guidance in addition to base rules

### Requirement: Owner guided proposal tools
Cliente owners SHALL be allowed to receive proposal cards for weekly plan generation/approval, script generation, video prepare, and paid-generation cost confirmation (Approve still required). These tools MUST remain non-mutating until Approve and MUST NOT publish to Instagram.

#### Scenario: Owner plan proposal
- **WHEN** a non-operator owner needs a weekly plan during onboarding or guided chat
- **THEN** `proposeGenerateStrategy` / `proposeApproveStrategy` may return proposal cards (no silent mutation)
