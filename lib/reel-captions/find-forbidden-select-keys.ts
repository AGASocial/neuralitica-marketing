const FORBIDDEN_SELECT_REEL_CAPTION_CTA_KEYS = new Set([
  "clientId",
  "client_id",
  "captionId",
  "caption_id",
  "ctaText",
  "selectedCtaText",
  "cta",
  "ctaVariants",
  "cta_variants",
  "caption",
  "hashtags",
  "keywords",
  "strategyId",
  "strategy_id",
  "reelScriptId",
  "reel_script_id",
  "providerKey",
  "provider_key",
  "status",
  "approved",
  "hook",
  "body",
  "onScreenText",
  "voiceoverText",
  "on_screen_text",
  "voiceover_text",
  "brief",
  "invokedBy",
  "role",
  "auth_user_id",
]);

export function findForbiddenSelectReelCaptionCtaKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) =>
    FORBIDDEN_SELECT_REEL_CAPTION_CTA_KEYS.has(key),
  );
}
