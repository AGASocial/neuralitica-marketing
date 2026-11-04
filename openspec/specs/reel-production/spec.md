# reel-production Specification

## Purpose

Produce Reel media for avatar (own/generic talking-head), faceless, and B-roll cutaway paths, including TTS voiceover and assembly via the Fly worker. Related: ADR-0003, ADR-0007, ADR-0009 (paid confirm cards).

## Requirements

### Requirement: Avatar talking-head jobs
For non-faceless scripts, the system SHALL create talking-head video jobs preferring HeyGen direct API v3 audio-driven output (`heygen_high`), with AI Gateway HeyGen as fallback when the direct path is unavailable (ADR-0007).

#### Scenario: Direct HeyGen path
- **WHEN** a talking-head job is created and the direct HeyGen credentials are configured
- **THEN** the adapter MUST drive the avatar from the ElevenLabs voiceover audio

#### Scenario: Faceless script rejected for talking-head
- **WHEN** the script modalidad/visualMode is `faceless`
- **THEN** talking-head job creation MUST refuse avatar generation for that script

### Requirement: Faceless and B-roll generation
The system SHALL create B-roll / faceless clip jobs via `createBrollVideoJobs` (AI Gateway Seedance and catalog fallbacks) when the package requires cutaways or faceless visuals (ADR-0007).

#### Scenario: Faceless needs B-roll
- **WHEN** a faceless package requires B-roll beats
- **THEN** the system enqueues B-roll jobs and tracks them as video jobs server-side

#### Scenario: Avatar with cutaways
- **WHEN** an avatar package includes B-roll cutaway beats within duration policy
- **THEN** the pipeline MAY enqueue B-roll jobs alongside talking-head segments

### Requirement: Long assembly on Fly worker
Provider polling, asset fetch, and FFmpeg assembly SHALL run on the Fly.io worker updating `neuramark_*` job/asset state; Vercel MUST only enqueue/orchestrate short requests (ADR-0003).

#### Scenario: Assembly completes
- **WHEN** the worker finishes assembling a 9:16 reel
- **THEN** owned media assets and job status are updated in Supabase for approvals/download

### Requirement: Paid media requires confirmation
Chat-driven video spend SHALL use `proposeConfirmPaidGeneration` / `confirmPaidGenerationFromChat` with a cost card; generation MUST NOT start until Approve (ADR-0009).

#### Scenario: Operator approves paid video card
- **WHEN** the Operator Approves a b-roll or HeyGen cost confirmation card
- **THEN** the system re-checks the estimate and then starts the corresponding jobs
