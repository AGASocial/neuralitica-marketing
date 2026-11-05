## MODIFIED Requirements

### Requirement: Long assembly on Fly worker
Provider polling, asset fetch, and FFmpeg assembly SHALL run on the Fly.io worker updating `neuramark_*` job/asset state; Vercel MUST only enqueue/orchestrate short requests (ADR-0003). For faceless `broll_stitch`, when the sum of completed b-roll clip durations is less than the resolved output duration (voiceover length when present, else script target), the worker SHALL loop the ordered clip sequence in the concat demuxer input until video covers that duration, then trim to the exact output duration with voiceover audio muxed — without enqueueing new b-roll or provider jobs.

#### Scenario: Assembly completes
- **WHEN** the worker finishes assembling a 9:16 reel
- **THEN** owned media assets and job status are updated in Supabase for approvals/download

#### Scenario: Short b-roll total vs voiceover
- **WHEN** faceless assembly runs with at least one completed owned b-roll clip and total clip duration is shorter than the voiceover (or target when no voiceover probe)
- **THEN** FFmpeg concat repeats clips in order until duration is sufficient, trims to the output duration, and passes the existing duration tolerance check without new paid generation

#### Scenario: No completed b-roll clips
- **WHEN** faceless assembly inputs have zero completed b-roll clips
- **THEN** existing readiness / incomplete assembly behaviour is unchanged (no stitch, no new generation)
