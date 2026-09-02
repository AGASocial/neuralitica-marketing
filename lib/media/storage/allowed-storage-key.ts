import {
  ASSEMBLED_REEL_STORAGE_KEY_REGEX,
  BRANDED_REEL_STORAGE_KEY_REGEX,
  CLIENT_LOGO_STORAGE_KEY_REGEX,
  COVER_FRAME_STORAGE_KEY_REGEX,
  STORAGE_KEY_REGEX,
  VOICEOVER_STORAGE_KEY_REGEX,
} from "@/lib/contracts/media-assets";

/**
 * Frozen storage_key allowlist for MediaStorage I/O.
 * Keep in sync with neuramark_media_assets_storage_key_relative_chk.
 */
export function isAllowedMediaStorageKey(key: string): boolean {
  if (typeof key !== "string" || key.length === 0) {
    return false;
  }
  if (key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    return false;
  }
  return (
    STORAGE_KEY_REGEX.test(key) ||
    VOICEOVER_STORAGE_KEY_REGEX.test(key) ||
    ASSEMBLED_REEL_STORAGE_KEY_REGEX.test(key) ||
    BRANDED_REEL_STORAGE_KEY_REGEX.test(key) ||
    CLIENT_LOGO_STORAGE_KEY_REGEX.test(key) ||
    COVER_FRAME_STORAGE_KEY_REGEX.test(key)
  );
}
