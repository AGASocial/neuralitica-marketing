-- US-5.1: Reel script packages (neuramark_reel_scripts). RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_reel_scripts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid NOT NULL REFERENCES public.neuramark_clients(id),
  strategy_id             uuid NOT NULL REFERENCES public.neuramark_content_strategies(id) ON DELETE RESTRICT,
  slot_index              integer NOT NULL,
  modalidad               text NOT NULL,
  hook                    text NOT NULL,
  body                    text NOT NULL,
  cta                     text NOT NULL,
  on_screen_text          text NOT NULL,
  voiceover_text          text NOT NULL,
  target_duration_sec     integer NOT NULL,
  broll_beats             jsonb,
  cold_open_notes         text,
  editing_notes           text,
  must_disclose_not_owner boolean NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_reel_scripts_strategy_slot_unique
    UNIQUE (strategy_id, slot_index),
  CONSTRAINT neuramark_reel_scripts_slot_index_check
    CHECK (slot_index >= 0 AND slot_index <= 6),
  CONSTRAINT neuramark_reel_scripts_duration_check
    CHECK (target_duration_sec >= 15 AND target_duration_sec <= 45),
  CONSTRAINT neuramark_reel_scripts_modalidad_check
    CHECK (modalidad IN ('own_avatar', 'generic_avatar', 'faceless'))
);

CREATE INDEX neuramark_reel_scripts_strategy_id_idx
  ON public.neuramark_reel_scripts (strategy_id);

CREATE INDEX neuramark_reel_scripts_client_strategy_idx
  ON public.neuramark_reel_scripts (client_id, strategy_id);

CREATE TRIGGER neuramark_reel_scripts_set_updated_at
  BEFORE UPDATE ON public.neuramark_reel_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_reel_scripts ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated.

COMMENT ON TABLE public.neuramark_reel_scripts IS
  'Instagram Reels script packages per strategy slot (US-5.1). UPSERT on (strategy_id, slot_index).';
