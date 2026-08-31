import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import type {
  UpsertReelMetricsInput,
  UpsertReelMetricsResult,
} from "@/lib/contracts/reel-metrics";
import {
  checkReelMetricsUpsertRateLimit,
  recordReelMetricsUpsertAttempt,
} from "@/lib/metrics/check-reel-metrics-upsert-rate-limit";
import {
  reelMetricsEditWindowExpiredError,
  reelMetricsInternalError,
  reelMetricsNotFoundError,
  reelMetricsNotPublishedError,
  reelMetricsRateLimitedError,
} from "@/lib/metrics/errors";
import {
  isWithinReelMetricsEditWindow,
  loadPublishedSlotGateForReelScript,
} from "@/lib/metrics/load-published-slot-for-reel";
import {
  buildReelMetricsDtoFromRow,
  REEL_METRICS_TABLE,
  type ReelMetricsRow,
} from "@/lib/metrics/load-reel-metrics";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type UpsertReelMetricsCoreParams = {
  input: UpsertReelMetricsInput;
  operator: CurrentUser;
};

type AssembledReelRow = {
  id: string;
  clientId: string;
  reelScriptId: string;
};

async function loadAssembledReelById(
  assembledReelId: string,
): Promise<AssembledReelRow | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_assembled_reels")
    .select("id, client_id, reel_script_id")
    .eq("id", assembledReelId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.client_id !== "string" ||
    typeof row.reel_script_id !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    clientId: row.client_id,
    reelScriptId: row.reel_script_id,
  };
}

function mapMetricsRow(raw: Record<string, unknown>): ReelMetricsRow | null {
  if (typeof raw.assembled_reel_id !== "string") {
    return null;
  }
  const counters = ["views", "likes", "comments", "saves", "dms"] as const;
  for (const key of counters) {
    if (typeof raw[key] !== "number" || !Number.isInteger(raw[key])) {
      return null;
    }
  }
  if (typeof raw.recorded_at !== "string") {
    return null;
  }
  return {
    assembledReelId: raw.assembled_reel_id,
    views: raw.views as number,
    likes: raw.likes as number,
    comments: raw.comments as number,
    saves: raw.saves as number,
    dms: raw.dms as number,
    recordedAt: raw.recorded_at,
  };
}

/**
 * Operator reel metrics upsert orchestrator (US-13.1).
 * Caller must gate with requireOperator and validate input before invoking.
 */
export async function upsertReelMetricsCore(
  params: UpsertReelMetricsCoreParams,
): Promise<UpsertReelMetricsResult> {
  const rateCheck = await checkReelMetricsUpsertRateLimit({
    clientId: params.operator.id,
  });
  if (!rateCheck.ok) {
    return reelMetricsRateLimitedError();
  }

  const reel = await loadAssembledReelById(params.input.assembledReelId);
  if (!reel) {
    return reelMetricsNotFoundError();
  }

  const publishedGate = await loadPublishedSlotGateForReelScript(
    reel.reelScriptId,
  );
  if (!publishedGate.ok) {
    return reelMetricsNotPublishedError();
  }

  if (
    !isWithinReelMetricsEditWindow({
      latestPublishedAt: publishedGate.latestPublishedAt,
    })
  ) {
    return reelMetricsEditWindowExpiredError();
  }

  if (!isSupabaseConfigured()) {
    return reelMetricsInternalError();
  }

  const supabase = createServerSupabaseClient();
  const recordedAt = new Date().toISOString();
  const { data: upserted, error } = await supabase
    .from(REEL_METRICS_TABLE)
    .upsert(
      {
        client_id: reel.clientId,
        assembled_reel_id: params.input.assembledReelId,
        views: params.input.views,
        likes: params.input.likes,
        comments: params.input.comments,
        saves: params.input.saves,
        dms: params.input.dms,
        recorded_at: recordedAt,
      },
      { onConflict: "assembled_reel_id" },
    )
    .select(
      "assembled_reel_id, views, likes, comments, saves, dms, recorded_at",
    )
    .maybeSingle();

  if (error || !upserted) {
    return reelMetricsInternalError();
  }

  await recordReelMetricsUpsertAttempt({ clientId: params.operator.id });

  const row = mapMetricsRow(upserted as Record<string, unknown>);
  if (!row) {
    return reelMetricsInternalError();
  }

  return {
    ok: true,
    metrics: buildReelMetricsDtoFromRow({
      row,
      editable: true,
    }),
  };
}
