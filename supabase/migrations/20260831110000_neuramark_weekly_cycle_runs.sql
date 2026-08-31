-- US-15.1 Phase A: Ciclo semanal automatizado idempotency ledger

CREATE TABLE public.neuramark_weekly_cycle_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  status text NOT NULL
    CHECK (status IN ('planned', 'running', 'completed', 'failed', 'dry_run')),
  mode text NOT NULL
    CHECK (mode IN ('cron', 'operator')),
  step_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_weekly_cycle_runs_client_week_uidx
    UNIQUE (client_id, week_start),
  CONSTRAINT neuramark_weekly_cycle_runs_step_log_is_array_chk
    CHECK (jsonb_typeof(step_log) = 'array')
);

CREATE INDEX neuramark_weekly_cycle_runs_client_id_idx
  ON public.neuramark_weekly_cycle_runs (client_id);

CREATE INDEX neuramark_weekly_cycle_runs_week_start_idx
  ON public.neuramark_weekly_cycle_runs (week_start DESC);

CREATE INDEX neuramark_weekly_cycle_runs_status_idx
  ON public.neuramark_weekly_cycle_runs (status);

COMMENT ON TABLE public.neuramark_weekly_cycle_runs IS
  'US-15.1: Ciclo semanal automatizado run ledger — idempotent per (client_id, week_start). Phase A dry_run only.';

ALTER TABLE public.neuramark_weekly_cycle_runs ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default for anon/authenticated).
