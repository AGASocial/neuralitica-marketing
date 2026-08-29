import "server-only";

import type { AvatarConsentForClientResult } from "@/lib/contracts/avatar-consent";
import { requireActive } from "@/lib/auth/require-user";
import { CURRENT_AVATAR_CONSENT_VERSION } from "@/lib/visual-preferences/avatar-consent-version";
import { toIsoTimestamp } from "@/lib/visual-preferences/avatar-consent-helpers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

type ConsentSelectRow = {
  consent_version: unknown;
  revoked_at: unknown;
  consented_at: unknown;
};

async function preferenciasListsOwnAvatar(
  clientId: string,
): Promise<boolean | undefined> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("neuramark_visual_preferences")
      .select("allowed_modes")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error || !data) {
      return undefined;
    }

    const modes = (data as { allowed_modes: unknown }).allowed_modes;
    return Array.isArray(modes) && modes.includes("own_avatar");
  } catch {
    return undefined;
  }
}

/**
 * Load own Consentimiento de avatar status.
 * Arity 0 — identity only via requireActive("page") / getCurrentUser().id.
 * Frontend consumer: `/settings/preferences` RSC / Consentimiento Client form.
 */
export async function getAvatarConsentForClient(): Promise<AvatarConsentForClientResult> {
  const user = await requireActive("page");

  if (!isSupabaseConfigured()) {
    console.error("[consent] load unavailable: Supabase not configured");
    return {
      active: false,
      consentedAt: null,
      consentVersion: null,
      currentConsentVersion: CURRENT_AVATAR_CONSENT_VERSION,
      reason: "load_failed",
    };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("neuramark_avatar_consents")
      .select("consent_version, revoked_at, consented_at")
      .eq("client_id", user.id)
      .is("revoked_at", null)
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[consent] load failed", { code: error.code });
      const softWarn = await preferenciasListsOwnAvatar(user.id);
      return {
        active: false,
        consentedAt: null,
        consentVersion: null,
        currentConsentVersion: CURRENT_AVATAR_CONSENT_VERSION,
        reason: "load_failed",
        ...(softWarn !== undefined
          ? { preferenciasMayStillListOwnAvatar: softWarn }
          : {}),
      };
    }

    const softWarn = await preferenciasListsOwnAvatar(user.id);
    const softWarnField =
      softWarn !== undefined
        ? { preferenciasMayStillListOwnAvatar: softWarn }
        : {};

    if (!data) {
      // Distinguish never-consented vs only-revoked for UX reason.
      const { data: anyRow, error: historyError } = await supabase
        .from("neuramark_avatar_consents")
        .select("id")
        .eq("client_id", user.id)
        .limit(1)
        .maybeSingle();

      const reason =
        !historyError && anyRow
          ? ("revoked" as const)
          : ("none" as const);

      return {
        active: false,
        consentedAt: null,
        consentVersion: null,
        currentConsentVersion: CURRENT_AVATAR_CONSENT_VERSION,
        reason,
        ...softWarnField,
      };
    }

    const row = data as ConsentSelectRow;
    const version =
      typeof row.consent_version === "string" ? row.consent_version : null;

    if (version !== CURRENT_AVATAR_CONSENT_VERSION) {
      return {
        active: false,
        consentedAt: null,
        consentVersion: null,
        currentConsentVersion: CURRENT_AVATAR_CONSENT_VERSION,
        reason: "version_mismatch",
        ...softWarnField,
      };
    }

    const consentedAt = toIsoTimestamp(row.consented_at);
    if (!consentedAt || !version) {
      return {
        active: false,
        consentedAt: null,
        consentVersion: null,
        currentConsentVersion: CURRENT_AVATAR_CONSENT_VERSION,
        reason: "load_failed",
        ...softWarnField,
      };
    }

    return {
      active: true,
      consentedAt,
      consentVersion: version,
      currentConsentVersion: CURRENT_AVATAR_CONSENT_VERSION,
      ...softWarnField,
    };
  } catch {
    return {
      active: false,
      consentedAt: null,
      consentVersion: null,
      currentConsentVersion: CURRENT_AVATAR_CONSENT_VERSION,
      reason: "load_failed",
    };
  }
}
