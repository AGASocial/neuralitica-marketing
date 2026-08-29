"use server";

import { revalidatePath } from "next/cache";

import type {
  UpdateBusinessProfileInput,
  UpdateBusinessProfileResult,
} from "@/lib/contracts/profile";
import { updateBusinessProfileInputSchema } from "@/lib/contracts/profile";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  profileForbiddenError,
  profileForbiddenFieldsError,
  profileInternalError,
  profileNotFoundError,
  profilePayloadTooLargeError,
  profileUnauthenticatedError,
  profileValidationError,
} from "@/lib/profile/errors";
import {
  buildBusinessProfileUpdatePayload,
  findForbiddenUpdateBusinessProfileKeys,
  isProfileFieldsPayloadTooLarge,
  mapUpdateBusinessProfileResult,
} from "@/lib/profile/update-helpers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type VersionRow = {
  version: unknown;
};

function authGuardEnvelope(error: {
  status: 401 | 403;
}): UpdateBusinessProfileResult {
  if (error.status === 401) {
    return profileUnauthenticatedError();
  }
  return profileForbiddenError();
}

async function selectOwnProfileVersion(
  clientId: string,
): Promise<number | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .select("version")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    console.error("[profile] update select failed", { code: error.code });
    throw new Error("Profile update unavailable");
  }

  if (!data) {
    return null;
  }

  const version = Number((data as VersionRow).version);
  if (!Number.isInteger(version) || version < 1) {
    return null;
  }
  return version;
}

async function updateOwnBusinessProfile(params: {
  clientId: string;
  fields: UpdateBusinessProfileInput;
  currentVersion: number;
}): Promise<UpdateBusinessProfileResult> {
  const payload = buildBusinessProfileUpdatePayload({
    fields: params.fields,
    currentVersion: params.currentVersion,
    editorClientId: params.clientId,
  });

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_business_profiles")
    .update({
      fields: payload.fields,
      version: payload.version,
      updated_by: payload.updated_by,
      updated_at: payload.updated_at,
    })
    .eq("client_id", params.clientId)
    .select("fields, version, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[profile] update failed", { code: error.code });
    return profileInternalError();
  }

  const mapped = mapUpdateBusinessProfileResult(data);
  if (!mapped) {
    return profileNotFoundError();
  }

  return mapped;
}

async function updateBusinessProfileInner(
  rawInput: unknown,
): Promise<UpdateBusinessProfileResult> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenUpdateBusinessProfileKeys(rawInput).length > 0) {
    return profileForbiddenFieldsError();
  }

  const parsed = updateBusinessProfileInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return profileValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  if (isProfileFieldsPayloadTooLarge(parsed.data)) {
    return profilePayloadTooLargeError();
  }

  if (!isSupabaseConfigured()) {
    console.error("[profile] update unavailable: Supabase not configured");
    return profileInternalError();
  }

  const currentVersion = await selectOwnProfileVersion(user.id);
  if (currentVersion == null) {
    return profileNotFoundError();
  }

  const result = await updateOwnBusinessProfile({
    clientId: user.id,
    fields: parsed.data,
    currentVersion,
  });

  if (result.ok) {
    revalidatePath("/profile");
    revalidatePath("/dashboard");
  }

  return result;
}

/**
 * Update own Ficha viva fields (US-2.2).
 * Frontend consumer: `/profile` edit Client Component — Save control.
 * No tenant/profile id arguments — identity only via requireActive("handler").
 * Body = full seven-key BusinessProfileFields (Zod .strict()). Never INSERT.
 */
export async function updateBusinessProfile(
  input: UpdateBusinessProfileInput,
): Promise<UpdateBusinessProfileResult> {
  try {
    return await updateBusinessProfileInner(input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[profile] update unexpected error");
    return profileInternalError();
  }
}
