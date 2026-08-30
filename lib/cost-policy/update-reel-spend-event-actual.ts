import "server-only";

import type {
  ActualCostUnavailableReason,
  UpdateReelSpendEventActualResult,
} from "@/lib/contracts/actual-cost";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export async function updateReelSpendEventActual(params: {
  spendEventId: string;
  clientId: string;
  reelScriptId: string;
  actualCostCents: number | null;
  actualCostUnavailableReason?: ActualCostUnavailableReason | null;
  durationSec?: number | null;
}): Promise<UpdateReelSpendEventActualResult> {
  if (!isSupabaseConfigured()) {
    console.error(
      "[cost-policy] spend actual update skipped: Supabase not configured",
    );
    return { ok: false, code: "NOT_FOUND" };
  }

  const supabase = createServerSupabaseClient();
  const { data: existing, error: selectError } = await supabase
    .from("neuramark_reel_spend_events")
    .select("id, client_id, reel_script_id, actual_cost_cents")
    .eq("id", params.spendEventId)
    .maybeSingle();

  if (selectError || !existing) {
    return { ok: false, code: "NOT_FOUND" };
  }

  if (
    existing.client_id !== params.clientId ||
    existing.reel_script_id !== params.reelScriptId
  ) {
    return { ok: false, code: "TENANT_MISMATCH" };
  }

  if (
    existing.actual_cost_cents !== null &&
    existing.actual_cost_cents !== params.actualCostCents
  ) {
    console.error("[cost-policy] spend actual already finalized with different value", {
      spendEventId: params.spendEventId,
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
    });
    return { ok: false, code: "ALREADY_FINALIZED" };
  }

  if (existing.actual_cost_cents === params.actualCostCents) {
    return {
      ok: true,
      spendEventId: params.spendEventId,
      idempotent: true,
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("neuramark_reel_spend_events")
    .update({
      actual_cost_cents: params.actualCostCents,
      actual_cost_unavailable_reason:
        params.actualCostCents === null
          ? (params.actualCostUnavailableReason ?? null)
          : null,
      duration_sec: params.durationSec ?? null,
    })
    .eq("id", params.spendEventId)
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .is("actual_cost_cents", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    const { data: current } = await supabase
      .from("neuramark_reel_spend_events")
      .select("actual_cost_cents")
      .eq("id", params.spendEventId)
      .maybeSingle();

    if (current?.actual_cost_cents === params.actualCostCents) {
      return {
        ok: true,
        spendEventId: params.spendEventId,
        idempotent: true,
      };
    }

    if (
      current?.actual_cost_cents !== null &&
      current?.actual_cost_cents !== params.actualCostCents
    ) {
      console.error("[cost-policy] spend actual race already finalized", {
        spendEventId: params.spendEventId,
      });
      return { ok: false, code: "ALREADY_FINALIZED" };
    }

    console.error("[cost-policy] spend actual update failed", {
      spendEventId: params.spendEventId,
      dbCode: updateError?.code,
    });
    throw new Error("Failed to update reel spend event actual cost");
  }

  return {
    ok: true,
    spendEventId: params.spendEventId,
    idempotent: false,
  };
}
