-- US-8.3: Operator attribution for manual upload jobs

ALTER TABLE public.neuramark_video_jobs
  ADD COLUMN operator_client_id uuid REFERENCES public.neuramark_clients(id);

CREATE INDEX neuramark_video_jobs_operator_client_id_idx
  ON public.neuramark_video_jobs (operator_client_id)
  WHERE operator_client_id IS NOT NULL;

ALTER TABLE public.neuramark_video_jobs
  ADD CONSTRAINT neuramark_video_jobs_manual_operator_attribution_chk
  CHECK (
    provider_key <> 'manual'
    OR operator_client_id IS NOT NULL
  );

COMMENT ON COLUMN public.neuramark_video_jobs.operator_client_id IS
  'Operator identity for manual upload jobs (US-8.3). Required when provider_key = manual.';
