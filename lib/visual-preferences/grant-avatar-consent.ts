"use server";

import { revalidatePath } from "next/cache";

import type {
  GrantAvatarConsentInput,
  GrantAvatarConsentResult,
} from "@/lib/contracts/avatar-consent";
import { grantAvatarConsentInputSchema } from "@/lib/contracts/avatar-consent";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  grantConsentAffirmationRequiredError,
  grantConsentAlreadyActiveError,
  grantConsentForbiddenError,
  grantConsentForbiddenFieldsError,
  grantConsentInternalError,
  grantConsentUnauthenticatedError,
  grantConsentValidationError,
  grantConsentVersionMismatchError,
} from "@/lib/visual-preferences/avatar-consent-errors";
import {
  classifyGrantAvatarConsentParseFailure,
  findForbiddenGrantAvatarConsentKeys,
  toIsoTimestamp,
} from "@/lib/visual-preferences/avatar-consent-helpers";
import { CURRENT_AVATAR_CONSENT_VERSION } from "@/lib/visual-preferences/avatar-consent-version";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): GrantAvatarConsentResult {
  if (error.status === 401) {
    return grantConsentUnauthenticatedError();
  }
  return grantConsentForbiddenError();
}

async function grantAvatarConsentInner(
  rawInput: unknown,
): Promise<GrantAvatarConsentResult> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenGrantAvatarConsentKeys(rawInput).length > 0) {
    return grantConsentForbiddenFieldsError();
  }

  const parsed = grantAvatarConsentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const classified = classifyGrantAvatarConsentParseFailure(
      rawInput,
      parsed.error,
    );
    if (classified.kind === "version_mismatch") {
      return grantConsentVersionMismatchError();
    }
    if (classified.kind === "affirmation") {
      return grantConsentAffirmationRequiredError();
    }
    return grantConsentValidationError(classified.fields);
  }

  if (await hasActiveAvatarConsent(user.id)) {
    return grantConsentAlreadyActiveError();
  }

  if (!isSupabaseConfigured()) {
    console.error("[consent] grant unavailable: Supabase not configured");
    return grantConsentInternalError();
  }

  const consentedAt = new Date().toISOString();
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_avatar_consents")
    .insert({
      client_id: user.id,
      consented_at: consentedAt,
      consent_version: CURRENT_AVATAR_CONSENT_VERSION,
      revoked_at: null,
    })
    .select("consented_at, consent_version")
    .single();

  if (error) {
    // Partial unique violation — concurrent grant
    if (error.code === "23505") {
      return grantConsentAlreadyActiveError();
    }
    console.error("[consent] grant insert failed", { code: error.code });
    return grantConsentInternalError();
  }

  const iso =
    toIsoTimestamp(
      (data as { consented_at: unknown } | null)?.consented_at,
    ) ?? consentedAt;

  revalidatePath("/settings/preferences");

  return {
    ok: true,
    active: true,
    consentedAt: iso,
    consentVersion: CURRENT_AVATAR_CONSENT_VERSION,
  };
}

/**
 * Explicit Consentimiento de avatar grant (append-only INSERT).
 * No tenant id arguments — identity only via requireActive("handler").
 * Frontend consumer: Preferencias Consentimiento Client form — Grant.
 * Never writes Preferencias, never enqueues jobs/providers.
 */
export async function grantAvatarConsent(
  input: GrantAvatarConsentInput,
): Promise<GrantAvatarConsentResult> {
  try {
    return await grantAvatarConsentInner(input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[consent] grant unexpected error");
    return grantConsentInternalError();
  }
}
