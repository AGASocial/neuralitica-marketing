-- US-12.1: Operator content calendar slots (neuramark_content_calendar_slots)
-- Scheduling identity per tenant + week; pipeline display status derived at read time.
-- RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_content_calendar_slots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL
                    REFERENCES public.neuramark_clients(id),
  week_start      date NOT NULL,
  scheduled_date  date NOT NULL,
  slot_index      int NOT NULL,
  strategy_id     uuid NOT NULL
                    REFERENCES public.neuramark_content_strategies(id),
  reel_script_id  uuid NULL
                    REFERENCES public.neuramark_reel_scripts(id),
  publish_status  text NOT NULL DEFAULT 'ready'
                    CHECK (publish_status IN ('ready', 'published')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_content_calendar_slots_client_week_slot_uq
    UNIQUE (client_id, week_start, slot_index),
  CONSTRAINT neuramark_content_calendar_slots_slot_index_check
    CHECK (slot_index >= 0 AND slot_index <= 6),
  CONSTRAINT neuramark_content_calendar_slots_week_start_monday_check
    CHECK (EXTRACT(ISODOW FROM week_start) = 1)
);

CREATE INDEX neuramark_content_calendar_slots_week_start_idx
  ON public.neuramark_content_calendar_slots (week_start);

CREATE INDEX neuramark_content_calendar_slots_client_week_idx
  ON public.neuramark_content_calendar_slots (client_id, week_start);

CREATE INDEX neuramark_content_calendar_slots_scheduled_date_idx
  ON public.neuramark_content_calendar_slots (scheduled_date);

ALTER TABLE public.neuramark_content_calendar_slots ENABLE ROW LEVEL SECURITY;
-- Zero policies: service-role Node only (deny-by-default).

CREATE OR REPLACE FUNCTION public.neuramark_content_calendar_slots_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER neuramark_content_calendar_slots_set_updated_at
  BEFORE UPDATE ON public.neuramark_content_calendar_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_content_calendar_slots_set_updated_at();

COMMENT ON TABLE public.neuramark_content_calendar_slots IS
  'Materialized weekly calendar slots from approved strategies (US-12.1). Sync-on-read; publish_status writes in US-12.2.';
