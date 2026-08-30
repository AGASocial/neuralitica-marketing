import "server-only";

import type { VideoJobStatus } from "@/lib/contracts/providers";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { assertVideoJobBudgetAllowsSpend } from "./assert-video-job-budget";
import { readVideoMaxRetriesPerReel } from "./video-job-config-readers";
import { VIDEO_JOBS_TABLE, VIDEO_JOB_RETRY_OVERRIDES_TABLE } from "./video-job-row";

const RETRY_BUDGET_BLOCKED_REASON_KEY = "scripts.videoJob.retry.budgetExceeded";

const TERMINAL_STATUSES = new Set<VideoJobStatus>([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminalVideoJobStatus(status: VideoJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export async function countPrimaryVideoJobsForReel(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 0;
  }

  const supabase = createServerSupabaseClient();
  const { count, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "primary");

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function getMaxAttemptForReel(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 0;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOBS_TABLE)
    .select("attempt")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("asset_role", "primary")
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || typeof (data as { attempt?: unknown }).attempt !== "number") {
    return 0;
  }

  return (data as { attempt: number }).attempt;
}

export async function findUnconsumedRetryOverride(params: {
  clientId: string;
  reelScriptId: string;
  failedJobId: string;
}): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOB_RETRY_OVERRIDES_TABLE)
    .select("id")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .eq("failed_job_id", params.failedJobId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || typeof (data as { id?: unknown }).id !== "string") {
    return null;
  }

  return { id: (data as { id: string }).id };
}

export async function consumeRetryOverride(overrideId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const supabase = createServerSupabaseClient();
  await supabase
    .from(VIDEO_JOB_RETRY_OVERRIDES_TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", overrideId)
    .is("consumed_at", null);
}

export type RetryEligibility = {
  canRetry: boolean;
  retryBlockedReasonKey: string | null;
};

export async function evaluateRetryEligibility(params: {
  clientId: string;
  reelScriptId: string;
  jobId: string;
  status: VideoJobStatus;
  attempt: number;
  estimatedCostCents?: number;
  operatorClientId?: string;
}): Promise<RetryEligibility> {
  if (params.status !== "failed") {
    return { canRetry: false, retryBlockedReasonKey: null };
  }

  const maxRetries = readVideoMaxRetriesPerReel();
  const maxAttempt = await getMaxAttemptForReel({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
  });

  if (maxAttempt >= maxRetries) {
    const override = await findUnconsumedRetryOverride({
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      failedJobId: params.jobId,
    });

    if (!override) {
      return {
        canRetry: false,
        retryBlockedReasonKey: "scripts.videoJob.retry.limitExceeded",
      };
    }
  }

  if (
    params.estimatedCostCents !== undefined &&
    params.operatorClientId !== undefined
  ) {
    const budgetResult = await assertVideoJobBudgetAllowsSpend({
      clientId: params.clientId,
      reelScriptId: params.reelScriptId,
      operatorClientId: params.operatorClientId,
      estimatedCostCents: params.estimatedCostCents,
    });

    if (!budgetResult.ok && budgetResult.code === "BUDGET_EXCEEDED") {
      return {
        canRetry: false,
        retryBlockedReasonKey: RETRY_BUDGET_BLOCKED_REASON_KEY,
      };
    }
  }

  return { canRetry: true, retryBlockedReasonKey: null };
}
