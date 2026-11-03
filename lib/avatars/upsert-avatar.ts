"use server";

import { revalidatePath } from "next/cache";

import type { UpsertAvatarResult } from "@/lib/contracts/avatar";
import { upsertAvatarInputSchema } from "@/lib/contracts/avatar";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import { mapAvatarRow, type AvatarSelectRow } from "@/lib/avatars/map-avatar-row";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const TABLE = "neuramark_avatars";

const FORBIDDEN_KEYS = [
  "id",
  "clientId",
  "client_id",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
] as const;

function findForbiddenKeys(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  return FORBIDDEN_KEYS.filter((key) => key in (raw as Record<string, unknown>));
}

/**
 * Upsert avatar gender / language / optional ElevenLabs clone for current user.
 */
export async function upsertAvatar(rawInput: unknown): Promise<UpsertAvatarResult> {
  try {
    let user;
    try {
      user = await requireActive("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return {
          ok: false,
          code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        };
      }
      throw error;
    }

    if (findForbiddenKeys(rawInput).length > 0) {
      return { ok: false, code: "FORBIDDEN_FIELDS" };
    }

    const parsed = upsertAvatarInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        ok: false,
        code: "VALIDATION_ERROR",
        fields: zodInterviewErrorToFieldErrors(parsed.error),
      };
    }

    if (!isSupabaseConfigured()) {
      return { ok: false, code: "INTERNAL_ERROR" };
    }

    const supabase = createServerSupabaseClient();
    const elevenLabsVoiceId =
      parsed.data.elevenLabsVoiceId === undefined
        ? undefined
        : parsed.data.elevenLabsVoiceId;

    const payload: Record<string, unknown> = {
      client_id: user.id,
      gender: parsed.data.gender,
      language: parsed.data.language,
    };
    if (elevenLabsVoiceId !== undefined) {
      payload.elevenlabs_voice_id = elevenLabsVoiceId;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: "client_id" })
      .select("id, client_id, gender, language, elevenlabs_voice_id, updated_at")
      .single();

    if (error || !data) {
      console.error("[avatar] upsert failed", { code: error?.code });
      return { ok: false, code: "INTERNAL_ERROR" };
    }

    const mapped = mapAvatarRow(data as AvatarSelectRow);
    if (!mapped) {
      return { ok: false, code: "INTERNAL_ERROR" };
    }

    revalidatePath("/settings/preferences");
    return { ok: true, avatar: mapped };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return {
        ok: false,
        code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      };
    }
    console.error("[avatar] upsert unexpected");
    return { ok: false, code: "INTERNAL_ERROR" };
  }
}
