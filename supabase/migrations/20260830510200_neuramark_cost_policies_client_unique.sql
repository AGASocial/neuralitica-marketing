-- US-7.1: One cost policy override row per client (partial unique index).

CREATE UNIQUE INDEX neuramark_cost_policies_one_per_client_idx
  ON public.neuramark_cost_policies (client_id)
  WHERE client_id IS NOT NULL;
