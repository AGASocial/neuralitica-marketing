import "server-only";

/**
 * US-15.1 Phase B — System auto-approval CAS persistence.
 * Named and frozen in CONTRACT.md § "Frozen strategy decision — validated
 * System auto-approval": a single conditional UPDATE, never a blind
 * `draft -> approved` write. Sibling of `approve-strategy-row.ts` (Operator
 * path), which stays untouched — this is a distinct actor/audit trail.
 */
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type ApproveStrategyForSystemCycleCasResult =
  | { ok: true; outcome: "APPROVED"; approvedAt: string }
  | { ok: true; outcome: "ALREADY_APPROVED_BY_RUN"; approvedAt: string }
  | { ok: false; code: "STRATEGY_APPROVAL_CONFLICT" | "INTERNAL_ERROR" };

export async function approveStrategyForSystemCycleCas(params: {
  strategyId: string;
  clientId: string;
  weekStart: string;
  expectedVersion: number;
  runId: string;
}): Promise<ApproveStrategyForSystemCycleCasResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  const supabase = createServerSupabaseClient();
  const approvedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .update({
      status: "approved",
      approved_at: approvedAt,
      approved_by_actor: "system",
      approved_by_run_id: params.runId,
      updated_at: approvedAt,
    })
    .eq("id", params.strategyId)
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .eq("version", params.expectedVersion)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[content-strategy] system CAS approve failed", {
      code: error.code,
      strategyId: params.strategyId,
      runId: params.runId,
    });
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  if (data) {
    return { ok: true, outcome: "APPROVED", approvedAt };
  }

  // Zero rows affected: either already approved by this exact run (idempotent
  // retry) or a genuine conflict (stale version, other actor, wrong scope).
  const { data: existing, error: loadError } = await supabase
    .from("neuramark_content_strategies")
    .select("status, approved_by_actor, approved_by_run_id, approved_at")
    .eq("id", params.strategyId)
    .eq("client_id", params.clientId)
    .eq("week_start", params.weekStart)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, code: "INTERNAL_ERROR" };
  }

  const row = existing as {
    status: string;
    approved_by_actor: string | null;
    approved_by_run_id: string | null;
    approved_at: string | null;
  };

  if (
    row.status === "approved" &&
    row.approved_by_actor === "system" &&
    row.approved_by_run_id === params.runId
  ) {
    return {
      ok: true,
      outcome: "ALREADY_APPROVED_BY_RUN",
      approvedAt: row.approved_at ?? approvedAt,
    };
  }

  return { ok: false, code: "STRATEGY_APPROVAL_CONFLICT" };
}
