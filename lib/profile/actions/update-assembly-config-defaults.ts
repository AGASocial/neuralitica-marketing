"use server";

import { revalidatePath } from "next/cache";

import type { UpdateAssemblyConfigDefaultsResult } from "@/lib/contracts/branding-job";
import { assemblyConfigSchema } from "@/lib/contracts/branding-job";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  brandingJobForbiddenError,
  brandingJobInternalError,
  brandingJobNotFoundError,
  brandingJobUnauthenticatedError,
  brandingJobValidationError,
} from "@/lib/assembly/branding-errors";
import { findForbiddenBrandingKeys } from "@/lib/assembly/find-forbidden-branding-keys";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const PROFILE_TABLE = "neuramark_business_profiles";

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
        return error.status === 401
          ? brandingJobUnauthenticatedError()
          : brandingJobForbiddenError();
      }
      throw error;
    }

    if (findForbiddenBrandingKeys(rawInput).length > 0) {
      return brandingJobValidationError();
    }

    const parsed = assemblyConfigSchema.safeParse(rawInput);
    if (!parsed.success) {
      return brandingJobValidationError();
    }

    if (!isSupabaseConfigured()) {
      return brandingJobInternalError();
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .update({ assembly_config: parsed.data })
      .eq("client_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      return brandingJobInternalError();
    }

    if (!data) {
      return brandingJobNotFoundError();
    }

    revalidatePath("/profile");

    return {
      ok: true,
      assemblyConfig: parsed.data,
    };
  } catch (error) {
    if (isAuthGuardError(error)) {
      return error.status === 401
        ? brandingJobUnauthenticatedError()
        : brandingJobForbiddenError();
    }
    console.error("[profile] update assembly config unexpected error");
    return brandingJobInternalError();
  }
}
