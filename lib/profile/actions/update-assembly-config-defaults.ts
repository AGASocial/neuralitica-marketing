"use server";

import { revalidatePath } from "next/cache";

import type { UpdateAssemblyConfigDefaultsResult } from "@/lib/contracts/branding-job";
import { assemblyConfigSchema } from "@/lib/contracts/branding-job";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import { findForbiddenBrandingKeys } from "@/lib/assembly/find-forbidden-branding-keys";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const PROFILE_TABLE = "neuramark_business_profiles";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpdateAssemblyConfigDefaultsResult {
  if (error.status === 401) {
    return { ok: false, error: { code: "UNAUTHENTICATED" } };
  }
  return { ok: false, error: { code: "FORBIDDEN" } };
}

/**
 * Persist Cliente default branding toggles on Ficha viva (US-9.2).
 */
export async function updateAssemblyConfigDefaults(
  rawInput: unknown,
): Promise<UpdateAssemblyConfigDefaultsResult> {
  try {
    let user;
    try {
      user = await requireActive("handler");
    } catch (error) {
      if (isAuthGuardError(error)) {
        return authGuardEnvelope(error);
      }
      throw error;
    }

    if (findForbiddenBrandingKeys(rawInput).length > 0) {
      return { ok: false, error: { code: "FORBIDDEN_FIELDS" } };
    }

    const parsed = assemblyConfigSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { ok: false, error: { code: "VALIDATION_ERROR" } };
    }

    if (!isSupabaseConfigured()) {
      return { ok: false, error: { code: "INTERNAL_ERROR" } };
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .update({ assembly_config: parsed.data })
      .eq("client_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: { code: "INTERNAL_ERROR" } };
    }

    if (!data) {
      return { ok: false, error: { code: "INTERNAL_ERROR" } };
    }

    revalidatePath("/profile");

    return {
      ok: true,
      assemblyConfig: parsed.data,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[profile] update assembly config unexpected error");
    return { ok: false, error: { code: "INTERNAL_ERROR" } };
  }
}
