import "server-only";

import { createHash } from "node:crypto";

import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

/** Stable preview id for slots without a persisted reel_script row yet. */
export function budgetPreviewPlaceholderReelScriptId(
  strategyId: string,
  slotIndex: number,
): string {
  const hash = createHash("sha256")
    .update(`neuramark-budget-preview:${strategyId}:${slotIndex}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) +
      hash.slice(18, 20),
    hash.slice(20, 32),
  ].join("-");
}

export type ReelScriptBudgetContext =
  | {
      reelScriptId: string;
      persisted: true;
    }
  | {
      reelScriptId: string;
      persisted: false;
    };

export async function resolveReelScriptBudgetContext(params: {
  clientId: string;
  strategyId: string;
  slotIndex: number;
}): Promise<ReelScriptBudgetContext | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("id, client_id")
    .eq("strategy_id", params.strategyId)
    .eq("slot_index", params.slotIndex)
    .maybeSingle();

  if (error) {
    return null;
  }

  if (data && typeof (data as { id: unknown }).id === "string") {
    const row = data as { id: string; client_id: string };
    if (row.client_id !== params.clientId) {
      return null;
    }
    return { reelScriptId: row.id, persisted: true };
  }

  return {
    reelScriptId: budgetPreviewPlaceholderReelScriptId(
      params.strategyId,
      params.slotIndex,
    ),
    persisted: false,
  };
}

export async function verifyReelScriptBelongsToClient(params: {
  reelScriptId: string;
  clientId: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_reel_scripts")
    .select("client_id")
    .eq("id", params.reelScriptId)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  return (data as { client_id: string }).client_id === params.clientId;
}
