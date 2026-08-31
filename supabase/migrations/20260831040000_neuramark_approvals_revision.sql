-- US-11.2: controlled revision round columns on neuramark_approvals

ALTER TABLE public.neuramark_approvals
  ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0
    CHECK (revision_count >= 0),
  ADD COLUMN IF NOT EXISTS change_requests jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(change_requests) = 'array'),
  ADD COLUMN IF NOT EXISTS extra_revision_granted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.neuramark_approvals.revision_count IS
  'US-11.2: completed client revision rounds; incremented atomically on successful request_changes.';
COMMENT ON COLUMN public.neuramark_approvals.change_requests IS
  'US-11.2: append-only audit array — client_revision rounds + operator_grant entries; server-built only.';
COMMENT ON COLUMN public.neuramark_approvals.extra_revision_granted IS
  'US-11.2: one-shot operator override; consumed (set false) on next successful request_changes.';

-- Atomic request_changes persist — single conditional UPDATE (no read-then-write limit check).
CREATE OR REPLACE FUNCTION public.neuramark_update_approval_request_changes(
  p_approval_id uuid,
  p_client_id uuid,
  p_max_rounds integer,
  p_new_round jsonb,
  p_summary text,
  p_decided_by uuid
)
RETURNS SETOF public.neuramark_approvals
LANGUAGE sql
AS $$
  UPDATE public.neuramark_approvals
  SET
    status = 'changes_requested',
    revision_count = revision_count + 1,
    change_requests = change_requests || jsonb_set(
      p_new_round,
      '{round}',
      to_jsonb(revision_count + 1),
      true
    ),
    client_feedback = p_summary,
    decided_at = now(),
    decided_by = p_decided_by,
    extra_revision_granted = CASE
      WHEN extra_revision_granted THEN false
      ELSE extra_revision_granted
    END
  WHERE id = p_approval_id
    AND client_id = p_client_id
    AND status = 'pending_client'
    AND (
      revision_count < p_max_rounds
      OR extra_revision_granted = true
    )
  RETURNING *;
$$;

COMMENT ON FUNCTION public.neuramark_update_approval_request_changes IS
  'US-11.2: atomic request_changes — increments revision_count, appends audit round, consumes extra grant.';

-- Operator one-shot grant — append audit entry + set flag.
CREATE OR REPLACE FUNCTION public.neuramark_grant_extra_revision(
  p_approval_id uuid,
  p_client_id uuid,
  p_grant_entry jsonb
)
RETURNS SETOF public.neuramark_approvals
LANGUAGE sql
AS $$
  UPDATE public.neuramark_approvals
  SET
    extra_revision_granted = true,
    change_requests = change_requests || p_grant_entry
  WHERE id = p_approval_id
    AND client_id = p_client_id
  RETURNING *;
$$;

COMMENT ON FUNCTION public.neuramark_grant_extra_revision IS
  'US-11.2: operatorGrantExtraRevision — sets extra_revision_granted and appends operator_grant audit.';

-- Requeue after pipeline — pending_client + clear decide fields.
CREATE OR REPLACE FUNCTION public.neuramark_requeue_approval_after_revision(
  p_approval_id uuid,
  p_client_id uuid
)
RETURNS SETOF public.neuramark_approvals
LANGUAGE sql
AS $$
  UPDATE public.neuramark_approvals
  SET
    status = 'pending_client',
    decided_at = NULL,
    decided_by = NULL
  WHERE id = p_approval_id
    AND client_id = p_client_id
    AND status = 'changes_requested'
  RETURNING *;
$$;

COMMENT ON FUNCTION public.neuramark_requeue_approval_after_revision IS
  'US-11.2: server-only requeue — changes_requested → pending_client when pipeline + gate ready.';
