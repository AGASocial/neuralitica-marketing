-- US-7.3: actual cost unavailable reason + duration on spend ledger.

ALTER TABLE public.neuramark_reel_spend_events
  ADD COLUMN IF NOT EXISTS actual_cost_unavailable_reason text NULL,
  ADD COLUMN IF NOT EXISTS duration_sec numeric(10, 3) NULL;

ALTER TABLE public.neuramark_reel_spend_events
  ADD CONSTRAINT neuramark_reel_spend_events_unavailable_reason_chk
    CHECK (
      actual_cost_unavailable_reason IS NULL
      OR actual_cost_unavailable_reason IN (
        'usage_missing',
        'catalog_cost_model_unsupported',
        'provider_no_billing'
      )
    );

ALTER TABLE public.neuramark_reel_spend_events
  ADD CONSTRAINT neuramark_reel_spend_events_actual_reason_consistency_chk
    CHECK (
      (actual_cost_cents IS NOT NULL AND actual_cost_unavailable_reason IS NULL)
      OR (actual_cost_cents IS NULL)
    );

ALTER TABLE public.neuramark_reel_spend_events
  ADD CONSTRAINT neuramark_reel_spend_events_duration_positive_chk
    CHECK (duration_sec IS NULL OR duration_sec > 0);

CREATE INDEX IF NOT EXISTS neuramark_reel_spend_events_client_created_at_idx
  ON public.neuramark_reel_spend_events (client_id, created_at);
