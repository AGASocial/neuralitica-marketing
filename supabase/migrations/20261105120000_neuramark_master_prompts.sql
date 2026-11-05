-- Operator-editable master prompts for content generation steering
-- Global + per-business master prompts inject creative direction into strategy, script, and B-roll generation.
-- RLS deny-by-default; service-role Node only.

CREATE TABLE IF NOT EXISTS public.neuramark_operator_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_master_prompt text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
    10|  CONSTRAINT neuramark_operator_prompts_global_prompt_len_chk
    CHECK (
      global_master_prompt IS NULL
      OR char_length(global_master_prompt) <= 4000
    )
);

-- Exactly one global singleton row.
CREATE UNIQUE INDEX IF NOT EXISTS neuramark_operator_prompts_singleton_uidx
  ON public.neuramark_operator_prompts ((1));
    20|
DROP TRIGGER IF EXISTS neuramark_operator_prompts_set_updated_at
  ON public.neuramark_operator_prompts;
CREATE TRIGGER neuramark_operator_prompts_set_updated_at
  BEFORE UPDATE ON public.neuramark_operator_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_operator_prompts ENABLE ROW LEVEL SECURITY;

    30|COMMENT ON TABLE public.neuramark_operator_prompts IS
  'Global master prompt (singleton) for content generation steering. Operator-only access.';

CREATE TABLE IF NOT EXISTS public.neuramark_business_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL
    REFERENCES public.neuramark_clients (id) ON DELETE CASCADE,
  business_master_prompt text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
    40|  CONSTRAINT neuramark_business_prompts_business_prompt_len_chk
    CHECK (
      business_master_prompt IS NULL
      OR char_length(business_master_prompt) <= 4000
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS neuramark_business_prompts_client_id_uidx
  ON public.neuramark_business_prompts (client_id);

    50|DROP TRIGGER IF EXISTS neuramark_business_prompts_set_updated_at
  ON public.neuramark_business_prompts;
CREATE TRIGGER neuramark_business_prompts_set_updated_at
  BEFORE UPDATE ON public.neuramark_business_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.neuramark_set_updated_at();

ALTER TABLE public.neuramark_business_prompts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.neuramark_business_prompts IS
    60|  'Per-business master prompt overrides for content generation. One row per client. Operator-only access.';

-- Seed default global master prompt focused on Instagram Reels best practices.
-- Idempotent: only inserts if no row exists.
INSERT INTO public.neuramark_operator_prompts (global_master_prompt)
SELECT
  'Instagram Reels Creative Direction:

- Hook within first 2 seconds: Lead with a pattern interrupt, curiosity gap, or bold statement that stops the scroll. Avoid slow intros.
    70|- Retention-first pacing: Keep every second purposeful. Cut filler. Deliver value or payoff immediately.
- 9:16 vertical framing: Optimize for mobile-first viewing. Keep focal points center-frame. Use dynamic motion and close-ups.
- Faceless modality: Cinematic B-roll with smooth camera motion (push-in, orbit, tracking shot), rich texture, high detail, shallow depth of field, natural light. No people, faces, logos, or on-screen text.
- Avatar modality: Talking-head presenter should speak directly to camera with energy and clarity. Keep segments short (8-15s max). Prefer conversational, first-person voice.
- CTA clarity: Every script ends with one clear, actionable call-to-action (save, DM, follow, comment). No vague "let me know" CTAs.
- Avoid: Slow pacing, generic hooks ("In this video..."), overly long setups, static shots (faceless), monotone delivery (avatar).

This guidance applies across all clients and all content types (strategy, scripts, B-roll). Steer creative direction while preserving schema, safety, and format constraints.'
    80|WHERE NOT EXISTS (SELECT 1 FROM public.neuramark_operator_prompts LIMIT 1);
