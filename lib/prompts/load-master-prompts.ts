import "server-only";

import type { MasterPromptsResult } from "@/lib/contracts/master-prompts";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/**
 * Load global and per-business master prompts for a client.
 * Returns nulls when prompts are missing or empty (trimmed to empty string).
 * Called by strategy, script, and B-roll generation to inject creative steering.
 */
export async function loadMasterPrompts(params: {
  clientId: string;
}): Promise<MasterPromptsResult> {
  if (!isSupabaseConfigured()) {
    console.warn("[master-prompts] Supabase not configured, skipping load");
    return { global: null, business: null };
  }

  const supabase = createServerSupabaseClient();

  // Load global master prompt (singleton row).
  const { data: globalRow, error: globalError } = await supabase
    .from("neuramark_operator_prompts")
    .select("global_master_prompt")
    .single();

  if (globalError && globalError.code !== "PGRST116") {
    // PGRST116 = no rows returned; expected when no global prompt set yet.
    console.error("[master-prompts] Failed to load global prompt", {
      code: globalError.code,
      message: globalError.message,
    });
  }

  const globalPrompt = globalRow?.global_master_prompt?.trim() ?? null;
  const global = globalPrompt && globalPrompt.length > 0 ? globalPrompt : null;

  // Load per-business master prompt for this client.
  const { data: businessRow, error: businessError } = await supabase
    .from("neuramark_business_prompts")
    .select("business_master_prompt")
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (businessError) {
    console.error("[master-prompts] Failed to load business prompt", {
      clientId: params.clientId,
      code: businessError.code,
      message: businessError.message,
    });
  }

  const businessPrompt = businessRow?.business_master_prompt?.trim() ?? null;
  const business =
    businessPrompt && businessPrompt.length > 0 ? businessPrompt : null;

  return { global, business };
}
