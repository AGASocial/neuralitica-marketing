"use server";

import {
  overrideVideoJobRetryLimitRequestSchema,
  type OverrideVideoJobRetryLimitResult,
} from "@/lib/contracts/video-job";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

import { videoJobMutationError } from "../errors";
import { loadVideoJobScoped } from "../load-video-job";
import { VIDEO_JOB_RETRY_OVERRIDES_TABLE } from "../video-job-row";

export async function overrideVideoJobRetryLimit(
  rawInput: unknown,
): Promise<OverrideVideoJobRetryLimitResult> {
  let operator;
  try {
    operator = await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return videoJobMutationError(
        error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      );
    }
    throw error;
  }

  const parsed = overrideVideoJobRetryLimitRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return videoJobMutationError("VALIDATION_ERROR");
  }

  const failedJob = await loadVideoJobScoped({
    jobId: parsed.data.failedJobId,
    clientId: operator.id,
  });
  if (!failedJob) {
    return videoJobMutationError("NOT_FOUND");
  }

  if (failedJob.status !== "failed") {
    return videoJobMutationError("JOB_NOT_RETRYABLE");
  }

  if (!isSupabaseConfigured()) {
    return videoJobMutationError("INTERNAL_ERROR");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(VIDEO_JOB_RETRY_OVERRIDES_TABLE)
    .insert({
      client_id: failedJob.clientId,
      reel_script_id: failedJob.reelScriptId,
      failed_job_id: failedJob.id,
      operator_client_id: operator.id,
      prior_attempt: failedJob.attempt,
      reason: parsed.data.reason,
    })
    .select("id")
    .single();

  if (error || !data || typeof (data as { id: unknown }).id !== "string") {
    return videoJobMutationError("INTERNAL_ERROR");
  }

  return {
    ok: true,
    overrideId: (data as { id: string }).id,
  };
}
