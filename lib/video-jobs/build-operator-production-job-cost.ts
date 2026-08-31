import "server-only";

import type { OperatorProductionJobCostDto } from "@/lib/contracts/actual-cost";
import type { ActualCostUnavailableReason } from "@/lib/contracts/actual-cost";
import type { VideoJobStatus } from "@/lib/contracts/providers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import type { VideoJobRow } from "./video-job-row";

function resolveCostStatus(params: {
  status: VideoJobStatus;
  estimatedCostCents: number;
  actualCostCents: number | null;
  unavailableReason: ActualCostUnavailableReason | null;
}): OperatorProductionJobCostDto["costStatus"] {
  if (params.status === "queued" || params.status === "processing") {
    return "pending";
  }
  if (params.actualCostCents !== null) {
    return "actual";
  }
  if (params.unavailableReason) {
    return "unavailable";
  }
  return "estimated_only";
}

export async function buildOperatorProductionJobCostDto(
  job: VideoJobRow,
): Promise<OperatorProductionJobCostDto> {
  let estimatedCostCents = job.estimatedCostCents;
  let actualCostCents = job.actualCostCents;
  let unavailableReason: ActualCostUnavailableReason | null = null;

  if (job.spendEventId && isSupabaseConfigured()) {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("neuramark_reel_spend_events")
      .select(
        "actual_cost_cents, actual_cost_unavailable_reason, estimated_cost_cents",
      )
      .eq("id", job.spendEventId)
      .eq("client_id", job.clientId)
      .eq("reel_script_id", job.reelScriptId)
      .maybeSingle();

    if (data) {
      const row = data as {
        actual_cost_cents: number | null;
        actual_cost_unavailable_reason: string | null;
        estimated_cost_cents: number;
      };
      // Ledger-wins when spendEventId is present (US-7.3 Phase B).
      if (
        typeof row.estimated_cost_cents === "number" &&
        Number.isSafeInteger(row.estimated_cost_cents) &&
        row.estimated_cost_cents >= 0
      ) {
        estimatedCostCents = row.estimated_cost_cents;
      }
      actualCostCents =
        typeof row.actual_cost_cents === "number" ? row.actual_cost_cents : null;
      if (
        row.actual_cost_unavailable_reason === "usage_missing" ||
        row.actual_cost_unavailable_reason === "catalog_cost_model_unsupported" ||
        row.actual_cost_unavailable_reason === "provider_no_billing"
      ) {
        unavailableReason = row.actual_cost_unavailable_reason;
      } else {
        unavailableReason = null;
      }
    }
  }

  const costStatus = resolveCostStatus({
    status: job.status,
    estimatedCostCents,
    actualCostCents,
    unavailableReason,
  });

  return {
    jobId: job.id,
    reelScriptId: job.reelScriptId,
    estimatedCostCents,
    actualCostCents,
    costStatus,
    ...(unavailableReason ? { unavailableReasonKey: unavailableReason } : {}),
  };
}
