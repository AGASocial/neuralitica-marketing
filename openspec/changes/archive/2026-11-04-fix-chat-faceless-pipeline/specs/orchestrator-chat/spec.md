## ADDED Requirements

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
