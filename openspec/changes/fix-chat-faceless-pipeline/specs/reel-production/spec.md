## ADDED Requirements

### Requirement: Faceless b-roll clip count covers target duration
B-roll estimate and create SHALL compute clip count as the clamp of the maximum of beat-derived count and `ceil(targetDurationSec / clipDurationSec)` so a faceless reel is covered for its script target duration (not a single fallback clip when beats are empty).

#### Scenario: Empty beats with 15s target
- **WHEN** a faceless script has empty `brollBeats` and `targetDurationSec` of 15 with 5s clips
- **THEN** estimate and create use at least 3 clips (clamped by max clips per reel)

### Requirement: Post-b-roll faceless assembly advance
When the last in-flight b-roll job for a reel script completes successfully and voiceover input is available, the system SHALL attempt to create an assembly job via the trusted assembly seam if no matching in-flight or completed assembly already exists for the current inputs.

#### Scenario: Last b-roll completed with voiceover
- **WHEN** `applyVideoJobStatusUpdate` marks a b-roll job completed and sibling b-roll jobs for the script are all completed with voiceover present
- **THEN** `createAssemblyJobForClientTrusted` is invoked (idempotent if assembly already queued/completed)
