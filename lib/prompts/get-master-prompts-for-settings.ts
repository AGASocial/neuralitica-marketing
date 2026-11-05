import "server-only";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type MasterPromptsForSettings = {
  global: string;
  perBusinessByClientId: Record<string, string>;
};

export type GetMasterPromptsForSettingsResult =
  | { ok: true; prompts: MasterPromptsForSettings }
  | { ok: false; error: { code: string } };

/**
 * Load global and all per-business master prompts for operator settings UI.
 */
export async function getMasterPromptsForSettings(): Promise<GetMasterPromptsForSettingsResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    };
  }

  const supabase = createServerSupabaseClient();

  // Load global prompt.
  const { data: globalRow, error: globalError } = await supabase
    .from("neuramark_operator_prompts")
    .select("global_master_prompt")
    .single();

  if (globalError && globalError.code !== "PGRST116") {
    console.error("[master-prompts] Failed to load global prompt for settings", {
      code: globalError.code,
      message: globalError.message,
    });
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    };
  }

  const global = globalRow?.global_master_prompt?.trim() ?? "";

  // Load all per-business prompts.
  const { data: businessRows, error: businessError } = await supabase
    .from("neuramark_business_prompts")
    .select("client_id, business_master_prompt");

  if (businessError) {
    console.error("[master-prompts] Failed to load business prompts for settings", {
      code: businessError.code,
      message: businessError.message,
    });
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    };
  }

  const perBusinessByClientId: Record<string, string> = {};
  for (const row of businessRows ?? []) {
    const trimmed = row.business_master_prompt?.trim() ?? "";
    if (trimmed.length > 0) {
      perBusinessByClientId[row.client_id] = trimmed;
    }
  }

  return {
    ok: true,
    prompts: { global, perBusinessByClientId },
  };
}
