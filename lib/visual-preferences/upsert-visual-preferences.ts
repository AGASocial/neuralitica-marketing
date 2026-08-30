"use server";

import { revalidatePath } from "next/cache";

import type {
  UpsertVisualPreferencesInput,
  UpsertVisualPreferencesResult,
} from "@/lib/contracts/visual-preferences";
import { upsertVisualPreferencesInputSchema } from "@/lib/contracts/visual-preferences";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  preferencesForbiddenError,
  preferencesForbiddenFieldsError,
  preferencesInternalError,
  preferencesOwnAvatarConsentRequiredError,
  preferencesPayloadTooLargeError,
  preferencesUnauthenticatedError,
  preferencesValidationError,
} from "@/lib/visual-preferences/errors";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";
import {
  buildVisualPreferencesUpsertPayload,
  findForbiddenUpsertVisualPreferencesKeys,
  isFacelessStylePayloadTooLarge,
  mapUpsertVisualPreferencesResult,
  type VisualPreferencesSelectRow,
  zodPreferencesErrorToFieldErrors,
} from "@/lib/visual-preferences/helpers";
import { ttsVoiceIdSchema, type TtsVoiceId } from "@/lib/contracts/tts-voiceover";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpsertVisualPreferencesResult {
  if (error.status === 401) {
    return preferencesUnauthenticatedError();
  }
  return preferencesForbiddenError();
}

async function upsertOwnVisualPreferences(params: {
  clientId: string;
  input: UpsertVisualPreferencesInput;
}): Promise<UpsertVisualPreferencesResult> {
  const supabase = createServerSupabaseClient();

  let existingVoiceId: TtsVoiceId | null = null;
  if (params.input.voiceId === undefined) {
    const { data: existing } = await supabase
      .from("neuramark_visual_preferences")
      .select("voice_id")
      .eq("client_id", params.clientId)
      .maybeSingle();
    const rawVoiceId = (existing as { voice_id?: unknown } | null)?.voice_id;
    if (rawVoiceId === null || rawVoiceId === undefined) {
      existingVoiceId = null;
    } else if (typeof rawVoiceId === "string") {
      const parsed = ttsVoiceIdSchema.safeParse(rawVoiceId);
      existingVoiceId = parsed.success ? parsed.data : null;
    }
  }

  const payload = buildVisualPreferencesUpsertPayload({
    clientId: params.clientId,
    input: params.input,
    existingVoiceId,
  });

  const { data, error } = await supabase
    .from("neuramark_visual_preferences")
    .upsert(payload, { onConflict: "client_id" })
    .select(
      "allowed_modes, faceless_style, generic_avatar_id, voice_id, rules, updated_at",
    )
    .single();

  if (error) {
    console.error("[preferences] upsert failed", { code: error.code });
    return preferencesInternalError();
  }

  const mapped = mapUpsertVisualPreferencesResult(
    (data as VisualPreferencesSelectRow | null) ?? null,
  );
  if (!mapped) {
    return preferencesInternalError();
  }

  return mapped;
}

async function upsertVisualPreferencesInner(
  rawInput: unknown,
): Promise<UpsertVisualPreferencesResult> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenUpsertVisualPreferencesKeys(rawInput).length > 0) {
    return preferencesForbiddenFieldsError();
  }

  const parsed = upsertVisualPreferencesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return preferencesValidationError(
      zodPreferencesErrorToFieldErrors(parsed.error),
    );
  }

  if (isFacelessStylePayloadTooLarge(parsed.data.facelessStyle)) {
    return preferencesPayloadTooLargeError();
  }

  if (
    parsed.data.voiceId !== undefined &&
    parsed.data.voiceId !== null &&
    !ttsVoiceIdSchema.safeParse(parsed.data.voiceId).success
  ) {
    return preferencesValidationError({
      voiceId: ["invalid_type"],
    });
  }

  if (parsed.data.allowedModes.includes("own_avatar")) {
    const consentActive = await hasActiveAvatarConsent(user.id);
    if (!consentActive) {
      return preferencesOwnAvatarConsentRequiredError();
    }
  }

  if (!isSupabaseConfigured()) {
    console.error("[preferences] upsert unavailable: Supabase not configured");
    return preferencesInternalError();
  }

  const result = await upsertOwnVisualPreferences({
    clientId: user.id,
    input: parsed.data,
  });

  if (result.ok) {
    revalidatePath("/settings/preferences");
  }

  return result;
}

/**
 * Upsert own Preferencias de producción visual.
 * Frontend consumer: `/settings/preferences` Client form — Save.
 * No tenant/prefs id arguments — identity only via requireActive("handler").
 * Body = client-writable slice only (Zod .strict()).
 * Never enqueues jobs / regenerates strategy/scripts/media / calls providers.
 */
export async function upsertVisualPreferences(
  input: UpsertVisualPreferencesInput,
): Promise<UpsertVisualPreferencesResult> {
  try {
    return await upsertVisualPreferencesInner(input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[preferences] upsert unexpected error");
    return preferencesInternalError();
  }
}
