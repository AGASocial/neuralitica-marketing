# Change: Faceless b-roll stitch loops short clip totals to voiceover length

## Why
Faceless assembly on the `broll_stitch` path failed with `scripts.assembly.failure.durationOutOfTolerance` when completed b-roll covered less wall time than the voiceover (e.g. one 5s Seedance clip vs ~30s TTS). Paid clips were wasted. Black-frame `tpad`/`apad` padding did not yield a probe duration within tolerance for real concat output.

## What Changes
- Before FFmpeg concat, repeat the ordered b-roll clip list (clip1, clip2, …) in the concat demuxer file until total clip duration meets voiceover/target (plus cold-open skip offset). Trim with `-t` to the resolved output duration; audio remains the voiceover track only.
- No new provider calls; zero completed clips keeps existing assembly readiness / waiting behaviour.
- Unit tests for sequence expansion and `buildBrollConcatArgs` trim behaviour when looped totals exceed voiceover length.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `reel-production`: faceless `broll_stitch` assembly SHALL loop owned completed clips to cover voiceover duration instead of failing or freezing on short totals.

## Impact

- `lib/assembly/ffmpeg/build-broll-concat-args.ts`, `lib/assembly/run-assembly-job.ts`, assembly unit tests
- Fly worker (`worker/assembly-jobs.ts` → shared `lib/assembly`) requires image redeploy after merge
- No migrations

## Out of Scope

- Generating additional b-roll beats or re-running Seedance
- Changing clip-count estimate/create heuristics (separate requirement)
