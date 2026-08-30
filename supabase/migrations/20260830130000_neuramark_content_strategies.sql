-- US-4.1: Weekly Instagram content strategy (neuramark_content_strategies)
-- + agent rate limits (neuramark_agent_rate_limits). RLS deny-by-default; service-role Node only.

CREATE TYPE public.neuramark_content_strategy_status AS ENUM ('draft', 'approved');

CREATE TABLE public.neuramark_content_strategies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.neuramark_clients(id),
  week_start  date NOT NULL,
  brief       jsonb NOT NULL,
  status      public.neuramark_content_strategy_status NOT NULL DEFAULT 'draft',
  version     integer NOT NULL CHECK (version >= 1),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_content_strategies_client_week_version_unique
    UNIQUE (client_id, week_start, version),
  CONSTRAINT neuramark_content_strategies_brief_is_object_chk
    CHECK (jsonb_typeof(brief) = 'object'),
  CONSTRAINT neuramark_content_strategies_brief_size_chk
    CHECK (pg_column_size(brief) <= 131072)
);

CREATE INDEX neuramark_content_strategies_client_id_week_start_version_idx
  ON public.neuramark_content_strategies (client_id, week_start, version DESC);

CREATE TRIGGER neuramark_content_strategies_set_updated_at
  BEFORE UPDATE ON public.neuramark_content_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_content_strategies ENABLE ROW LEVEL SECURITY;
-- Zero policies. Service-role Node client bypasses RLS.

COMMENT ON TABLE public.neuramark_content_strategies IS
  'Versioned weekly Instagram Reels content strategy briefs (US-4.1). INSERT-only versioning.';

CREATE TABLE public.neuramark_agent_rate_limits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.neuramark_clients(id),
  agent_key     text NOT NULL,
  window_start  timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  in_flight_key text NULL,
  in_flight_at  timestamptz NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_agent_rate_limits_client_agent_window_unique
    UNIQUE (client_id, agent_key, window_start)
);

CREATE INDEX neuramark_agent_rate_limits_client_agent_idx
  ON public.neuramark_agent_rate_limits (client_id, agent_key, window_start DESC);

CREATE TRIGGER neuramark_agent_rate_limits_set_updated_at
  BEFORE UPDATE ON public.neuramark_agent_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_agent_rate_limits ENABLE ROW LEVEL SECURITY;
-- Zero policies. Service-role Node only.

COMMENT ON TABLE public.neuramark_agent_rate_limits IS
  'Server-side agent generate rate limits and in-flight guards (US-4.1+).';
