import "server-only";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Validates that clientId refers to an active neuramark_clients row.
 * Shared by insights read and generate action selector parity (US-13.2).
 */
export async function validateActiveOperatorClientId(
  clientId: string,
): Promise<{ ok: true } | { ok: false; code: "NOT_FOUND" }> {
  const parsed = agentClientIdSchema.safeParse(clientId);
  if (!parsed.success) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (!isSupabaseConfigured()) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_clients")
    .select("id")
    .eq("id", parsed.data)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, code: "NOT_FOUND" };
  }

  return { ok: true };
}
