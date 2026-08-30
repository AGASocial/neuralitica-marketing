const FORBIDDEN_REEL_SCRIPT_KEYS = new Set([
  "clientId",
  "client_id",
  "strategyId",
  "strategy_id",
  "providerKey",
  "provider_key",
  "tier",
  "envKeyName",
  "model",
  "status",
  "approved",
  "mustDiscloseNotOwner",
  "must_disclose_not_owner",
  "ruleFlags",
  "hook",
  "body",
  "cta",
  "onScreenText",
  "voiceoverText",
  "on_screen_text",
  "voiceover_text",
  "targetDurationSec",
  "brollBeats",
  "coldOpenNotes",
  "editingNotes",
  "brief",
  "modalidad",
  "invokedBy",
  "role",
  "auth_user_id",
  // US-5.2: threshold smuggle keys — readability limits are server-frozen
  "maxCharsPerBeat",
  "maxCharsPerBeatLine",
  "wordsPerSecond",
  "wordsPerSecondTarget",
  "thresholds",
  "readabilityConfig",
  "readability",
  "maxBeatLinesTotal",
  "maxLinesPerBeat",
  "voWarnOverRatio",
  "voWarnUnderRatio",
]);

export function findForbiddenReelScriptKeys(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return Object.keys(raw).filter((key) => FORBIDDEN_REEL_SCRIPT_KEYS.has(key));
}
