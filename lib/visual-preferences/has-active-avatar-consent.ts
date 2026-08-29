import "server-only";

/**
 * Fail-closed Consentimiento de avatar probe (US-3.2 hardened).
 * @param clientId — must be server-resolved getCurrentUser().id (or trusted job id later).
 * Never invent consent rows. Never default true.
 *
 * Active iff row with revoked_at IS NULL AND consent_version = CURRENT constant.
 * Query: filter active subset, order consented_at desc, limit 1 — then version-match.
 */

import { CURRENT_AVATAR_CONSENT_VERSION } from "@/lib/visual-preferences/avatar-consent-version";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const CONSENT_TABLE = "neuramark_avatar_consents";

type ConsentRow = {
  consent_version: unknown;
  revoked_at: unknown;
  consented_at: unknown;
};

function isMissingRelationError(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  // Postgres undefined_table / PostgREST schema cache miss
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") {
    return true;
  }
  if (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  ) {
    return true;
  }
  return false;
}

export async function hasActiveAvatarConsent(
  clientId: string,
): Promise<boolean> {
  if (!clientId || typeof clientId !== "string") {
    return false;
  }

  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from(CONSENT_TABLE)
      .select("consent_version, revoked_at, consented_at")
      .eq("client_id", clientId)
      .is("revoked_at", null)
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error)) {
        return false;
      }
      console.error("[preferences] consent probe failed", { code: error.code });
      return false;
    }

    if (!data) {
      return false;
    }

    const row = data as ConsentRow;
    if (row.revoked_at != null) {
      return false;
    }

    return row.consent_version === CURRENT_AVATAR_CONSENT_VERSION;
  } catch {
    return false;
  }
}
