-- US-15.1 Phase B: Ciclo semanal automatizado — live pipeline delta.
-- Additive to 20260831110000_neuramark_weekly_cycle_runs.sql. Never reverses Phase A.
-- Adds: strategy auto-approval audit columns, per-slot step-run ledger,
-- durable dispatch outbox, and aggregate run state machine columns.

-- ---------------------------------------------------------------------------
-- 1. neuramark_content_strategies — System auto-approval audit columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.neuramark_content_strategies
  ADD COLUMN approved_by_actor text NULL
    CHECK (approved_by_actor IN ('operator', 'system')),
  ADD COLUMN approved_by_run_id uuid NULL
    REFERENCES public.neuramark_weekly_cycle_runs(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.neuramark_content_strategies.approved_by_actor IS
  'US-15.1 Phase B: actor kind that performed draft->approved transition. NULL for legacy/unset rows. Operator approvals set approved_by_actor = ''operator'' and keep approved_by; System auto-approval sets ''system'' and approved_by_run_id.';

COMMENT ON COLUMN public.neuramark_content_strategies.approved_by_run_id IS
  'US-15.1 Phase B: neuramark_weekly_cycle_runs.id that performed a System auto-approval CAS transition. NULL for Operator approvals and legacy rows.';

-- ---------------------------------------------------------------------------
-- 2. neuramark_weekly_cycle_runs — aggregate live state machine columns
-- ---------------------------------------------------------------------------

-- Phase A rows never reach a live status; normalize any legacy 'planned' rows
-- to 'dry_run' before narrowing the CHECK to the Phase B aggregate enum.
UPDATE public.neuramark_weekly_cycle_runs
  SET status = 'dry_run'
  WHERE status = 'planned';

ALTER TABLE public.neuramark_weekly_cycle_runs
  DROP CONSTRAINT IF EXISTS neuramark_weekly_cycle_runs_status_check;

ALTER TABLE public.neuramark_weekly_cycle_runs
  ADD CONSTRAINT neuramark_weekly_cycle_runs_status_chk
    CHECK (status IN ('dry_run', 'running', 'paused', 'completed', 'partial_failed', 'failed'));

ALTER TABLE public.neuramark_weekly_cycle_runs
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN live_started_at timestamptz NULL,
  ADD COLUMN last_resumed_at timestamptz NULL;

COMMENT ON COLUMN public.neuramark_weekly_cycle_runs.updated_at IS
  'US-15.1 Phase B: last aggregate state/step_log projection write.';

COMMENT ON COLUMN public.neuramark_weekly_cycle_runs.live_started_at IS
  'US-15.1 Phase B: server timestamp of the one-way dry_run -> running CAS transition (startWeeklyCycleLiveCas).';

COMMENT ON COLUMN public.neuramark_weekly_cycle_runs.last_resumed_at IS
  'US-15.1 Phase B: server timestamp of the most recent authorized paused/partial_failed -> running resume.';

CREATE TRIGGER neuramark_weekly_cycle_runs_set_updated_at
  BEFORE UPDATE ON public.neuramark_weekly_cycle_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. neuramark_weekly_cycle_step_runs — per-slot step ledger
-- ---------------------------------------------------------------------------

CREATE TABLE public.neuramark_weekly_cycle_step_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid NOT NULL
    REFERENCES public.neuramark_weekly_cycle_runs(id) ON DELETE CASCADE,
  client_id        uuid NOT NULL
    REFERENCES public.neuramark_clients(id) ON DELETE CASCADE,
  slot_index       smallint NULL
    CHECK (slot_index BETWEEN 0 AND 2),
  step             text NOT NULL
    CHECK (step IN (
      'strategy', 'scripts', 'captions', 'primary_video', 'tts',
      'broll', 'assembly', 'branding', 'qa', 'approval'
    )),
  status           text NOT NULL
    CHECK (status IN (
      'blocked', 'ready', 'dispatch_pending', 'pending_provider',
      'pending_worker', 'completed', 'failed', 'skipped'
    )),
  attempt          smallint NOT NULL
    CHECK (attempt BETWEEN 1 AND 3),
  idempotency_key  text NOT NULL,
  job_kind         text NULL
    CHECK (job_kind IN ('video', 'tts', 'assembly', 'branding', 'qa')),
  job_id           uuid NULL,
  error_code       text NULL
    CHECK (error_code IN (
      'LIVE_DISABLED', 'CLIENT_INACTIVE', 'TENANT_SCOPE_MISMATCH', 'BUDGET_EXCEEDED',
      'CONSENT_REQUIRED', 'CONSENT_REVOKED', 'POLICY_REJECTED', 'PROVIDER_UNAVAILABLE',
      'VALIDATION_ERROR', 'STRATEGY_INVALID', 'STRATEGY_STALE', 'STRATEGY_APPROVAL_CONFLICT',
      'DISPATCH_TRANSIENT', 'PROVIDER_TRANSIENT', 'WORKER_TRANSIENT', 'JOB_TIMEOUT',
      'DEPENDENCY_FAILED', 'QA_FAILED', 'INTERNAL_ERROR'
    )),
  available_at     timestamptz NOT NULL DEFAULT now(),
  claimed_at       timestamptz NULL,
  started_at       timestamptz NULL,
  finished_at      timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_weekly_cycle_step_runs_idempotency_key_uidx
    UNIQUE (idempotency_key),
  CONSTRAINT neuramark_weekly_cycle_step_runs_run_slot_step_attempt_uidx
    UNIQUE NULLS NOT DISTINCT (run_id, slot_index, step, attempt)
);

CREATE INDEX neuramark_weekly_cycle_step_runs_run_slot_step_idx
  ON public.neuramark_weekly_cycle_step_runs (run_id, slot_index, step);

CREATE INDEX neuramark_weekly_cycle_step_runs_client_status_idx
  ON public.neuramark_weekly_cycle_step_runs (client_id, status);

CREATE INDEX neuramark_weekly_cycle_step_runs_status_available_at_idx
  ON public.neuramark_weekly_cycle_step_runs (status, available_at);

CREATE TRIGGER neuramark_weekly_cycle_step_runs_set_updated_at
  BEFORE UPDATE ON public.neuramark_weekly_cycle_step_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_weekly_cycle_step_runs ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node helpers only (matches US-10.1 / US-13.1 / Phase A pattern).

COMMENT ON TABLE public.neuramark_weekly_cycle_step_runs IS
  'US-15.1 Phase B: per-slot, per-step live dispatch ledger. Source of truth for the sanitized step_log projection.';

-- ---------------------------------------------------------------------------
-- 4. neuramark_weekly_cycle_outbox — durable claim/dispatch worker queue
-- ---------------------------------------------------------------------------

CREATE TABLE public.neuramark_weekly_cycle_outbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL
    REFERENCES public.neuramark_weekly_cycle_runs(id) ON DELETE CASCADE,
  step_run_id       uuid NOT NULL
    REFERENCES public.neuramark_weekly_cycle_step_runs(id) ON DELETE CASCADE,
  event_kind        text NOT NULL
    CHECK (event_kind IN ('dispatch_provider', 'dispatch_worker', 'resume_successor')),
  payload           jsonb NOT NULL,
  status            text NOT NULL
    CHECK (status IN ('pending', 'claimed', 'dispatched', 'failed')),
  dispatch_attempt  smallint NOT NULL DEFAULT 0
    CHECK (dispatch_attempt BETWEEN 0 AND 3),
  available_at      timestamptz NOT NULL DEFAULT now(),
  claim_token       uuid NULL,
  claimed_at        timestamptz NULL,
  dispatched_at     timestamptz NULL,
  last_error_code   text NULL
    CHECK (last_error_code IN (
      'LIVE_DISABLED', 'CLIENT_INACTIVE', 'TENANT_SCOPE_MISMATCH', 'BUDGET_EXCEEDED',
      'CONSENT_REQUIRED', 'CONSENT_REVOKED', 'POLICY_REJECTED', 'PROVIDER_UNAVAILABLE',
      'VALIDATION_ERROR', 'STRATEGY_INVALID', 'STRATEGY_STALE', 'STRATEGY_APPROVAL_CONFLICT',
      'DISPATCH_TRANSIENT', 'PROVIDER_TRANSIENT', 'WORKER_TRANSIENT', 'JOB_TIMEOUT',
      'DEPENDENCY_FAILED', 'QA_FAILED', 'INTERNAL_ERROR'
    )),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_weekly_cycle_outbox_step_run_id_uidx
    UNIQUE (step_run_id),
  CONSTRAINT neuramark_weekly_cycle_outbox_payload_is_object_chk
    CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX neuramark_weekly_cycle_outbox_status_available_at_idx
  ON public.neuramark_weekly_cycle_outbox (status, available_at);

CREATE TRIGGER neuramark_weekly_cycle_outbox_set_updated_at
  BEFORE UPDATE ON public.neuramark_weekly_cycle_outbox
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_weekly_cycle_outbox ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node helpers only (matches US-10.1 / US-13.1 / Phase A pattern).

COMMENT ON TABLE public.neuramark_weekly_cycle_outbox IS
  'US-15.1 Phase B: durable claim/dispatch outbox for provider/worker enqueue and successor resume. Recoverable via claim_token + idempotency_key linkage on the source step run.';
