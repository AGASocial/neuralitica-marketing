-- US-3.1: Preferencias de producción visual (allowlist)
-- Enum tokens are technical only; product copy uses CONTEXT labels.

CREATE TYPE public.neuramark_visual_modality AS ENUM (
  'own_avatar',
  'generic_avatar',
  'faceless'
);

CREATE TABLE public.neuramark_visual_preferences (
  client_id uuid PRIMARY KEY
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  allowed_modes public.neuramark_visual_modality[] NOT NULL
    DEFAULT '{}'::public.neuramark_visual_modality[],
  generic_avatar_id uuid NULL,
  -- V1: no FK to catalog/media; always NULL until US-3.3 / catalog
  faceless_style jsonb NULL,
  rules jsonb NOT NULL
    DEFAULT '{"must_disclose_not_owner": false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neuramark_visual_preferences_allowed_modes_valid_chk
    CHECK (
      allowed_modes <@ ARRAY[
        'own_avatar',
        'generic_avatar',
        'faceless'
      ]::public.neuramark_visual_modality[]
    ),
  CONSTRAINT neuramark_visual_preferences_allowed_modes_unique_chk
    CHECK (cardinality(allowed_modes) = cardinality(ARRAY(SELECT DISTINCT unnest(allowed_modes)))),
  CONSTRAINT neuramark_visual_preferences_faceless_style_size_chk
    CHECK (
      faceless_style IS NULL
      OR pg_column_size(faceless_style) <= 4096
    ),
  CONSTRAINT neuramark_visual_preferences_faceless_consistency_chk
    CHECK (
      (
        'faceless' = ANY (allowed_modes)
        AND faceless_style IS NOT NULL
      )
      OR (
        NOT ('faceless' = ANY (allowed_modes))
        AND faceless_style IS NULL
      )
    )
);

CREATE TRIGGER neuramark_visual_preferences_set_updated_at
  BEFORE UPDATE ON public.neuramark_visual_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_visual_preferences ENABLE ROW LEVEL SECURITY;
-- Zero named policies → deny-by-default for anon/authenticated roles.
-- Access only via service-role Node (Next.js backend).

COMMENT ON TABLE public.neuramark_visual_preferences IS
  'Cliente Preferencias de producción visual allowlist; US-3.1. Not Ficha viva fields.';
COMMENT ON COLUMN public.neuramark_visual_preferences.allowed_modes IS
  'Multi-select modality tokens ⊆ {own_avatar, generic_avatar, faceless}. Empty = none selected.';
COMMENT ON COLUMN public.neuramark_visual_preferences.rules IS
  'Server-derived only (e.g. must_disclose_not_owner). Never client-writable.';
COMMENT ON COLUMN public.neuramark_visual_preferences.faceless_style IS
  'Structured jsonb { voice, onScreenText, broll } when faceless ∈ allowlist.';
