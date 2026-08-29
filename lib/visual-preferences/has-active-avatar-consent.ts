import "server-only";

/**
 * Fail-closed Consentimiento de avatar probe (pre–US-3.2 soft gate).
 * @param clientId — must be server-resolved getCurrentUser().id (or trusted job id later).
 * Never invent consent rows. Never default true.
 *
 * Semantics (binding — SECURITY):
 * - Consent table missing → false
 * - No row for clientId → false
 * - Row revoked (revoked_at set) → false
 * - Active non-revoked row → true
 * - Probe / query / unexpected error → false
 */

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

const CONSENT_TABLE = "neuramark_avatar_consents";

type ConsentRow = {
  revoked_at: unknown;
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
      .select("revoked_at")
      .eq("client_id", clientId)
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

    return true;
  } catch {
    return false;
  }
}
