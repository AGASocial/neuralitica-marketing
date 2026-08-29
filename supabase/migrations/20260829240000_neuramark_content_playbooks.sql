-- US-16.1: Global Operator-curated Playbook de formatos (neuramark_content_playbooks)
-- No client_id — global catalog. RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_content_playbooks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  payload    jsonb NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_content_playbooks_version_positive
    CHECK (version >= 1),
  CONSTRAINT neuramark_content_playbooks_slug_unique
    UNIQUE (slug),
  CONSTRAINT neuramark_content_playbooks_slug_format_chk
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT neuramark_content_playbooks_payload_size_chk
    CHECK (pg_column_size(payload) <= 65536),
  CONSTRAINT neuramark_content_playbooks_archive_consistency_chk
    CHECK (
      (active = true AND archived_at IS NULL)
      OR (active = false AND archived_at IS NOT NULL)
    )
);

CREATE INDEX neuramark_content_playbooks_active_idx
  ON public.neuramark_content_playbooks (active)
  WHERE archived_at IS NULL;

CREATE TRIGGER neuramark_content_playbooks_set_updated_at
  BEFORE UPDATE ON public.neuramark_content_playbooks
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_content_playbooks ENABLE ROW LEVEL SECURITY;
-- Zero policies. Service-role Node client bypasses RLS.
-- Do not add authenticated/anon policies (no browser Supabase SDK).

COMMENT ON TABLE public.neuramark_content_playbooks IS
  'Global evergreen Reel format catalog (Playbook de formatos). Operator CRUD only (US-16.1).';
COMMENT ON COLUMN public.neuramark_content_playbooks.slug IS
  'Immutable kebab-case identifier; permanently reserved after create (including archived rows).';
COMMENT ON COLUMN public.neuramark_content_playbooks.payload IS
  'jsonb formato fields (titulo, estructura, hints, etc.). Validated via Zod on every write.';

-- Seed five V1 formatos (Spanish-first monolingual catalog content).
INSERT INTO public.neuramark_content_playbooks (slug, version, payload, active, archived_at)
VALUES
  (
    'tip-rapido',
    1,
    '{
      "titulo": "Tip rápido",
      "explicacion": "Un consejo accionable en menos de 30 segundos.",
      "estructura": ["Hook", "Tip", "CTA"],
      "hook_type": "quick_tip",
      "duracion_ideal_seg": 25,
      "modalidades_recomendadas": [],
      "rubros": [],
      "guion_hints": ["Un solo tip; sin relleno."],
      "cta_tipo": "save"
    }'::jsonb,
    true,
    NULL
  ),
  (
    'antes-despues',
    1,
    '{
      "titulo": "Antes y después",
      "explicacion": "Muestra la transformación del trabajo en poco tiempo.",
      "estructura": ["Hook", "Antes", "Después", "CTA"],
      "hook_type": "before_after_tease",
      "duracion_ideal_seg": 30,
      "modalidades_recomendadas": [],
      "rubros": [],
      "guion_hints": ["Contraste visual claro en los primeros 3 segundos."],
      "cta_tipo": "dm"
    }'::jsonb,
    true,
    NULL
  ),
  (
    'objecion',
    1,
    '{
      "titulo": "Objeción común",
      "explicacion": "Responde una duda frecuente del cliente potencial.",
      "estructura": ["Hook", "Objeción", "Respuesta", "CTA"],
      "hook_type": "objection_callout",
      "duracion_ideal_seg": 35,
      "modalidades_recomendadas": [],
      "rubros": [],
      "guion_hints": ["Nombrar la objeción con empatía antes de responder."],
      "cta_tipo": "comment"
    }'::jsonb,
    true,
    NULL
  ),
  (
    'oferta-local',
    1,
    '{
      "titulo": "Oferta local",
      "explicacion": "Promociona una oferta o servicio en la zona del negocio.",
      "estructura": ["Hook", "Oferta", "Beneficio", "CTA"],
      "hook_type": "local_hook",
      "duracion_ideal_seg": 28,
      "modalidades_recomendadas": [],
      "rubros": [],
      "guion_hints": ["Mencionar zona o barrio sin sonar genérico."],
      "cta_tipo": "visit"
    }'::jsonb,
    true,
    NULL
  ),
  (
    'mito-vs-realidad',
    1,
    '{
      "titulo": "Mito vs realidad",
      "explicacion": "Desmiente un mito común del rubro con un dato concreto.",
      "estructura": ["Hook", "Mito", "Realidad", "CTA"],
      "hook_type": "myth_statement",
      "duracion_ideal_seg": 32,
      "modalidades_recomendadas": [],
      "rubros": [],
      "guion_hints": ["Presentar el mito en una frase corta y directa."],
      "cta_tipo": "follow"
    }'::jsonb,
    true,
    NULL
  );
