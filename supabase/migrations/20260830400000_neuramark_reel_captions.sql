-- US-6.1: Instagram Reel captions (neuramark_reel_captions). RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_reel_captions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES public.neuramark_clients(id),
  reel_script_id  uuid NOT NULL REFERENCES public.neuramark_reel_scripts(id) ON DELETE RESTRICT,
  caption         text NOT NULL,
  hashtags        jsonb NOT NULL,
  keywords        jsonb NOT NULL,
  cta_variants    jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_reel_captions_reel_script_unique
    UNIQUE (reel_script_id),
  CONSTRAINT neuramark_reel_captions_caption_length_check
    CHECK (char_length(caption) >= 1 AND char_length(caption) <= 2200)
);

CREATE INDEX neuramark_reel_captions_client_id_idx
  ON public.neuramark_reel_captions (client_id);

CREATE INDEX neuramark_reel_captions_reel_script_id_idx
  ON public.neuramark_reel_captions (reel_script_id);

CREATE TRIGGER neuramark_reel_captions_set_updated_at
  BEFORE UPDATE ON public.neuramark_reel_captions
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_reel_captions ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated.

COMMENT ON TABLE public.neuramark_reel_captions IS
  'Instagram Reels captions per script package (US-6.1). UPSERT on reel_script_id.';
