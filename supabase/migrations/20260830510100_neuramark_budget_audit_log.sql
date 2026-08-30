-- US-7.1: Budget audit log (neuramark_budget_audit_log). Append-only; service-role Node only.

CREATE TABLE public.neuramark_budget_audit_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type            text NOT NULL,
  client_id             uuid NOT NULL
                          REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  reel_script_id        uuid NULL
                          REFERENCES public.neuramark_reel_scripts (id) ON DELETE SET NULL,
  operator_client_id    uuid NOT NULL
                          REFERENCES public.neuramark_clients (id) ON DELETE RESTRICT,
  estimated_cost_cents  integer NULL,
  cumulative_cost_cents integer NULL,
  max_cost_cents        integer NULL,
  provider_tier         text NULL,
  override_reason       text NULL,
  metadata              jsonb NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_budget_audit_log_event_type_chk
    CHECK (event_type IN ('blocked', 'override_proceed', 'policy_updated')),
  CONSTRAINT neuramark_budget_audit_log_provider_tier_chk
    CHECK (provider_tier IS NULL OR provider_tier IN ('low', 'high'))
);

CREATE INDEX neuramark_budget_audit_log_client_created_idx
  ON public.neuramark_budget_audit_log (client_id, created_at DESC);

CREATE INDEX neuramark_budget_audit_log_reel_script_idx
  ON public.neuramark_budget_audit_log (reel_script_id)
  WHERE reel_script_id IS NOT NULL;

ALTER TABLE public.neuramark_budget_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_budget_audit_log IS
  'Append-only budget gate and policy audit trail (US-7.1).';
