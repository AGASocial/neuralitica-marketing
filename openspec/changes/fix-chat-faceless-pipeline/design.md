# Design

## Context

Chat `confirmPaidGenerationFromChat` for `paidKind: "broll"` only calls `createBrollVideoJobs`. Clip count is beat-driven (`resolveBeatTexts` → one fallback beat when `brollBeats` empty), so prod saw one Seedance 5¢ job. TTS is a separate card; assembly only advances via weekly-cycle `step_run` resume. Branding already auto-chains from assembly completion in lib.

## Goals / Non-Goals

**Goals**

- One Approve on the faceless cost card starts TTS (if needed) + duration-covering b-roll, then assembly when inputs are ready, then existing branding → QA.
- Cost card `confirmEstimateCents` = live b-roll total + TTS estimate (omit TTS cents when a voiceover asset already exists).
- Mis videos hub shows production / pending OK / ready; chat preview shows latest assembled playable URL.
- Nueva conversación inserts an empty conversation row so `updated_at` wins on reload.
- Home last-updated uses browser TZ; one visible next-action label.

**Non-Goals**

- Instagram publish, HeyGen/avatar generation, schema migrations, redesigning weekly-cycle orchestration, changing Fly worker poll loops (unless lib shared by worker requires redeploy).

## Decisions

1. **Reuse weekly-cycle primitives, not the weekly-cycle runner** — Call `synthesizeVoiceoverForClientTrusted` / `createBrollVideoJobs` / `createAssemblyJobForClientTrusted` from chat confirm + a lib completion hook. Do not invent a second outbox.
2. **Clip count = max(beats, ceil(targetDurationSec / clipSec))** clamped by `WAN_MAX_CLIPS_PER_REEL` — shared in `computeBrollClipCount` so estimate and create stay aligned.
3. **Assembly advance hook** — From `applyVideoJobStatusUpdate` on terminal b-roll success, call `maybeAdvanceFacelessAssemblyAfterBroll` (all b-roll terminal completed, VO present, no in-flight/completed matching assembly → create). Idempotent via existing assembly fingerprint lookup. Safe alongside weekly-cycle resume.
4. **Mis videos** — Expand `/ready-to-publish` data load: in-flight video/assembly jobs; pending via existing `listPendingApprovalsForClientUser` (batch-ensure); approved via existing list. Inline `<video src={previewUrl}>` using `/api/media/assets/...` (session auth; same as approvals).
5. **New conversation** — Server action inserts conversation with `updated_at = now()` and empty messages; panel awaits it before switching id.
6. **Last-updated** — Pass ISO to a tiny client formatter; drop duplicate `sr-only` h2 or move `id` onto the visible label.

## Risks / Trade-offs

- Auto-assembly after last b-roll completes also helps operator manual paths (usually desirable). Weekly-cycle double-dispatch mitigated by assembly idempotency.
- TTS inside faceless Approve still spends only after Approve; dedicated TTS card remains for voice-only asks.

## Migration Plan

None. Redeploy Fly worker after merge if `lib/` used by worker changed (assembly/video status writers).
