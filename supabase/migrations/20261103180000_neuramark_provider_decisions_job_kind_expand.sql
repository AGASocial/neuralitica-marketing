-- Expand neuramark_provider_decisions.job_kind CHECK to match reelSpendJobKindSchema.
-- Avatar / TTS / B-roll / QA decision inserts were failing with Postgres 23514
-- because the original US-7.2 CHECK only allowed script/caption LLM kinds.

ALTER TABLE public.neuramark_provider_decisions
  DROP CONSTRAINT IF EXISTS neuramark_provider_decisions_job_kind_check;

ALTER TABLE public.neuramark_provider_decisions
  ADD CONSTRAINT neuramark_provider_decisions_job_kind_check
  CHECK (
    job_kind IN (
      'script_generate',
      'script_regenerate',
      'caption_generate',
      'caption_regenerate',
      'talking_head_generate',
      'talking_head_retry',
      'tts_generate',
      'tts_regenerate',
      'qa_run',
      'broll_generate',
      'broll_retry'
    )
  );

COMMENT ON CONSTRAINT neuramark_provider_decisions_job_kind_check
  ON public.neuramark_provider_decisions IS
  'Aligned with lib/contracts/cost-policy.ts reelSpendJobKindSchema (US-7.x / US-8.x / US-9.x / US-10.x).';
