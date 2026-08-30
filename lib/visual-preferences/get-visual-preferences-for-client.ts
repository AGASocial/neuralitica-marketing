import "server-only";

import type { VisualPreferencesForClientResult } from "@/lib/contracts/visual-preferences";
import { requireActive } from "@/lib/auth/require-user";
import { computeVoicePickerVisible } from "@/lib/preferences/compute-voice-picker-visible";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";
import {
  mapVisualPreferencesRow,
  type VisualPreferencesSelectRow,
} from "@/lib/visual-preferences/helpers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  listAllVoiceOptions,
  toTtsVoiceOptionDto,
} from "@/lib/tts/voice-catalog";

/**
 * Load own Preferencias de producción visual.
 * Arity 0 — identity only via requireActive("page") / getCurrentUser().id.
 * Frontend consumer: `/settings/preferences` RSC.
 */
export async function getVisualPreferencesForClient(): Promise<VisualPreferencesForClientResult> {
  const user = await requireActive("page");

  const ownAvatarConsentActive = await hasActiveAvatarConsent(user.id);
  const availableVoices = listAllVoiceOptions().map(toTtsVoiceOptionDto);

  if (!isSupabaseConfigured()) {
    console.error("[preferences] load unavailable: Supabase not configured");
    return {
      exists: false,
      loadFailed: true,
      ownAvatarConsentActive,
    };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_visual_preferences")
    .select(
      "allowed_modes, faceless_style, generic_avatar_id, voice_id, rules, updated_at",
    )
    .eq("client_id", user.id)
    .maybeSingle();

  const mapped = mapVisualPreferencesRow({
    data: (data as VisualPreferencesSelectRow | null) ?? null,
    error,
  });

  if (mapped.kind === "loadFailed") {
    return {
      exists: false,
      loadFailed: true,
      ownAvatarConsentActive,
    };
  }

  if (mapped.kind === "missing") {
    return {
      exists: false,
      allowedModes: [],
      facelessStyle: null,
      genericAvatarId: null,
      voiceId: null,
      availableVoices,
      voicePickerVisible: false,
      rules: null,
      updatedAt: null,
      ownAvatarConsentActive,
    };
  }

  const voicePickerVisible = computeVoicePickerVisible(
    mapped.allowedModes,
    mapped.facelessStyle,
  );

  return {
    exists: true,
    allowedModes: mapped.allowedModes,
    facelessStyle: mapped.facelessStyle,
    genericAvatarId: null,
    voiceId: mapped.voiceId,
    availableVoices,
    voicePickerVisible,
    rules: mapped.rules,
    updatedAt: mapped.updatedAt,
    ownAvatarConsentActive,
  };
}
