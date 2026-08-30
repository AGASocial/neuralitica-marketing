import "server-only";

import type {
  OperatorVideoJobStatusDto,
  OperatorVideoJobSummaryDto,
} from "@/lib/contracts/video-job";

import { buildOperatorProductionJobCostDto } from "./build-operator-production-job-cost";
import {
  countPrimaryVideoJobsForReel,
  evaluateRetryEligibility,
} from "./retry-eligibility";
import type { VideoJobRow } from "./video-job-row";

export async function mapOperatorVideoJobStatusDto(
  job: VideoJobRow,
  options?: { operatorClientId?: string },
): Promise<OperatorVideoJobStatusDto> {
  const regenerationCount = await countPrimaryVideoJobsForReel({
    clientId: job.clientId,
    reelScriptId: job.reelScriptId,
  });

  const retryState = await evaluateRetryEligibility({
    clientId: job.clientId,
    reelScriptId: job.reelScriptId,
    jobId: job.id,
    status: job.status,
    attempt: job.attempt,
    estimatedCostCents:
      job.status === "failed" ? job.estimatedCostCents : undefined,
    operatorClientId: options?.operatorClientId,
  });

  return {
    status: job.status,
    progressPercent: undefined,
    sanitizedErrorMessage: job.failureReason ?? undefined,
    jobId: job.id,
    reelScriptId: job.reelScriptId,
    attempt: job.attempt,
    regenerationCount,
    failureReason: job.failureReason,
    canRetry: retryState.canRetry,
    retryBlockedReasonKey: retryState.retryBlockedReasonKey,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function mapOperatorVideoJobSummaryDto(
  job: VideoJobRow,
  options?: { operatorClientId?: string },
): Promise<OperatorVideoJobSummaryDto> {
  const statusDto = await mapOperatorVideoJobStatusDto(job, options);
  const cost = await buildOperatorProductionJobCostDto(job);
  return {
    ...statusDto,
    cost,
  };
}
