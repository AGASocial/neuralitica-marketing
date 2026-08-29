"use server";

import { revalidatePath } from "next/cache";

import type { RevokeAvatarConsentResult } from "@/lib/contracts/avatar-consent";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  revokeConsentForbiddenError,
  revokeConsentInternalError,
  revokeConsentNotActiveError,
  revokeConsentUnauthenticatedError,
} from "@/lib/visual-preferences/avatar-consent-errors";
import { toIsoTimestamp } from "@/lib/visual-preferences/avatar-consent-helpers";
import { cancelQueuedOwnAvatarJobs } from "@/lib/visual-preferences/cancel-queued-own-avatar-jobs";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): RevokeAvatarConsentResult {
  if (error.status === 401) {
    return revokeConsentUnauthenticatedError();
  }
  return revokeConsentForbiddenError();
}

async function revokeAvatarConsentInner(): Promise<RevokeAvatarConsentResult> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (!isSupabaseConfigured()) {
    console.error("[consent] revoke unavailable: Supabase not configured");
    return revokeConsentInternalError();
  }

  const supabase = createServerSupabaseClient();

  const { data: activeRow, error: findError } = await supabase
    .from("neuramark_avatar_consents")
    .select("id")
    .eq("client_id", user.id)
    .is("revoked_at", null)
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.error("[consent] revoke find failed", { code: findError.code });
    return revokeConsentInternalError();
  }

  if (!activeRow || typeof (activeRow as { id: unknown }).id !== "string") {
    return revokeConsentNotActiveError();
  }

  const rowId = (activeRow as { id: string }).id;
  const revokedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("neuramark_avatar_consents")
    .update({ revoked_at: revokedAt })
    .eq("id", rowId)
    .eq("client_id", user.id)
    .is("revoked_at", null)
    .select("revoked_at")
    .maybeSingle();

  if (updateError) {
    console.error("[consent] revoke update failed", { code: updateError.code });
    return revokeConsentInternalError();
  }

  if (!updated) {
    return revokeConsentNotActiveError();
  }

  // Must invoke cancel stub after successful revoke (CONTRACT / SECURITY).
  await cancelQueuedOwnAvatarJobs(user.id);

  // Must NOT UPDATE neuramark_visual_preferences (no silent allowlist rewrite).

  revalidatePath("/settings/preferences");

  const iso =
    toIsoTimestamp((updated as { revoked_at: unknown }).revoked_at) ??
    revokedAt;

  return {
    ok: true,
    active: false,
    revokedAt: iso,
  };
}

/**
 * Revoke active Consentimiento de avatar (set revoked_at only).
 * Arity 0 — identity only via requireActive("handler") / getCurrentUser().id.
 * Frontend consumer: Preferencias Consentimiento Client form — Revoke.
 * Never DELETE; never mutate consented_at / consent_version / client_id.
 * Never silently rewrites Preferencias allowlist.
 */
export async function revokeAvatarConsent(): Promise<RevokeAvatarConsentResult> {
  try {
    return await revokeAvatarConsentInner();
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[consent] revoke unexpected error");
    return revokeConsentInternalError();
  }
}
