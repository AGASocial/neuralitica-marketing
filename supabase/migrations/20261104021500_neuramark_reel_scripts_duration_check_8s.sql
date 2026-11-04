-- Avatar reels target 8–15s (neuramark_reel_duration_policies). The legacy
-- 15–45 CHECK rejected avatar scripts below 15s. Widen the DB floor to 8;
-- per-modality bounds are enforced by the policy table in app code.
ALTER TABLE public.neuramark_reel_scripts
  DROP CONSTRAINT IF EXISTS neuramark_reel_scripts_duration_check;
ALTER TABLE public.neuramark_reel_scripts
  ADD CONSTRAINT neuramark_reel_scripts_duration_check
    CHECK (target_duration_sec >= 8 AND target_duration_sec <= 45);
