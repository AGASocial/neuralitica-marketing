-- US-16.2: Global Operator-curated Snapshot de tendencias (neuramark_trend_snapshots)
-- No client_id — global weekly tácticas. RLS deny-by-default; service-role Node only.

CREATE TABLE public.neuramark_trend_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   date NOT NULL,
  entries      jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT neuramark_trend_snapshots_week_start_unique
    UNIQUE (week_start),
  CONSTRAINT neuramark_trend_snapshots_entries_is_array_chk
    CHECK (jsonb_typeof(entries) = 'array'),
  CONSTRAINT neuramark_trend_snapshots_entries_size_chk
    CHECK (pg_column_size(entries) <= 262144)
);

CREATE INDEX neuramark_trend_snapshots_week_start_idx
  ON public.neuramark_trend_snapshots (week_start DESC);

CREATE TRIGGER neuramark_trend_snapshots_set_updated_at
  BEFORE UPDATE ON public.neuramark_trend_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_trend_snapshots ENABLE ROW LEVEL SECURITY;
-- Zero policies. Service-role Node client bypasses RLS.
-- Do not add authenticated/anon policies (no browser Supabase SDK).

COMMENT ON TABLE public.neuramark_trend_snapshots IS
  'Global weekly Snapshot de tendencias (Tácticas de tendencia). Operator CRUD only (US-16.2).';
COMMENT ON COLUMN public.neuramark_trend_snapshots.week_start IS
  'ISO week Monday (YYYY-MM-DD). One row per week.';
COMMENT ON COLUMN public.neuramark_trend_snapshots.entries IS
  'jsonb array of táctica entries. Validated via Zod on every write.';

-- Seed canonical week with cold-open-mejor-toma (Spanish-first monolingual catalog content).
INSERT INTO public.neuramark_trend_snapshots (week_start, entries)
VALUES (
  '2026-01-05'::date,
  '[
    {
      "slug": "cold-open-mejor-toma",
      "titulo": "Cold open con mejor toma",
      "week_start": "2026-01-05",
      "activo": true,
      "prioridad_semana": 1,
      "fuente": "manual",
      "explicacion": "Abrir con el clip de mayor impacto (2–3 s), luego rewind para contexto, desarrollo y CTA. Ideal para B-roll o avatar con fotos de trabajo real.",
      "hook_type": "before_after_tease",
      "estructura": [
        "Cold open (mejor toma)",
        "Rewind / contexto",
        "Desarrollo",
        "CTA"
      ],
      "guion_hints": [
        "Elegir la toma más visual o sorprendente para los primeros 2–3 segundos.",
        "Tras el cold open, rebobinar brevemente para situar al espectador."
      ],
      "editing_hints": [
        "Cold open: clip de impacto 2–3 s al inicio sin intro genérica.",
        "Rewind: efecto de rebobinado o repetición rápida tras el cold open para dar contexto."
      ],
      "duracion_ideal_seg": { "cold_open": 2, "total": 25 },
      "modalidades_recomendadas": ["faceless", "own_avatar"],
      "rubros": [],
      "formatos_playbook_compatibles": ["antes-despues", "tip-rapido"]
    }
  ]'::jsonb
);
