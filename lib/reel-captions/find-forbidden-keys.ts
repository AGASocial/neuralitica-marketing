const FORBIDDEN_REEL_CAPTION_KEYS = new Set([
  "clientId",
  "client_id",
  "strategyId",
  "strategy_id",
  "reelScriptId",
  "reel_script_id",
  "providerKey",
  "provider_key",
  "tier",
  "envKeyName",
  "model",
  "status",
  "approved",
  "caption",
  "hashtags",
  "keywords",
  "ctaVariants",
  "cta_variants",
  "selectedCtaIndex",
  "selected_cta_index",
  "maxHashtags",
  "maxCaptionChars",
  "hook",
  "body",
  "cta",
  "onScreenText",
  "voiceoverText",
  "on_screen_text",
  "voiceover_text",
  "brief",
  "invokedBy",
  "role",
  "auth_user_id",
]);

export function findForbiddenReelCaptionKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_REEL_CAPTION_KEYS.has(key));
}
