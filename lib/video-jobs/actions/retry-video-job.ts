"use server";

import {
  previewRetryVideoJobEstimateRequestSchema,
  retryVideoJobRequestSchema,
  type PreviewRetryVideoJobEstimateSuccess,
  type RetryVideoJobResult,
} from "@/lib/contracts/video-job";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import { assertActiveAvatarConsentForJobs } from "@/lib/visual-preferences/assert-active-avatar-consent-for-jobs";

import { assertVideoJobBudgetAllowsSpend } from "../assert-video-job-budget";
import { createTalkingHeadVideoJob } from "../create-talking-head-video-job";
import { videoJobMutationError } from "../errors";
import { loadReelScriptForVideoJob } from "../load-reel-script-for-video-job";
import { loadVideoJobScoped } from "../load-video-job";
import {
  consumeRetryOverride,
  getVideoJobRegenerationStats,
  hasConsumableRetryOverride,
  isRetryLimitExceeded,
} from "../video-job-retry";

export async function previewRetryVideoJobEstimate(
  rawInput: unknown,
): Promise<
  PreviewRetryVideoJobEstimateSuccess | ReturnType<typeof videoJobMutationError>
> {
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

  const parsed = previewRetryVideoJobEstimateRequestSchema.safeParse(rawInput);
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
    return {
      ok: true,
      estimatedCostCents: failedJob.estimatedCostCents,
      canRetry: false,
      retryBlockedReasonKey: "scripts.videoJob.retry.notRetryable",
    };
  }

  const stats = await getVideoJobRegenerationStats({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
  });
  const hasOverride = await hasConsumableRetryOverride({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
    failedJobId: failedJob.id,
  });

  if (isRetryLimitExceeded(stats.maxAttempt) && !hasOverride) {
    return {
      ok: true,
      estimatedCostCents: failedJob.estimatedCostCents,
      canRetry: false,
      retryBlockedReasonKey: "scripts.videoJob.retry.limitExceeded",
    };
  }

  const script = await loadReelScriptForVideoJob({
    reelScriptId: failedJob.reelScriptId,
    clientId: failedJob.clientId,
  });
  if (!script) {
    return videoJobMutationError("NOT_FOUND");
  }

  const providerResult = await resolveProviderForJob({
    clientId: failedJob.clientId,
    assetRole: "talking_head",
    productionContext: {
      visualMode: script.visualMode,
      modalidad: script.modalidad,
      hasReferenceLoop: script.hasReferenceLoop,
      needsBroll: false,
      targetDurationSec: script.package.targetDurationSec,
    },
  });
  if (!providerResult.ok) {
    return {
      ok: true,
      estimatedCostCents: failedJob.estimatedCostCents,
      canRetry: false,
      retryBlockedReasonKey: "scripts.videoJob.retry.providerUnavailable",
    };
  }

  const registry = await initializeProviderRegistryFromCatalog();
  const adapter = registry.getVideoAdapter(providerResult.decision.providerKey);
  const estimate = await adapter.estimateCost({
    reelScriptId: failedJob.reelScriptId,
    clientId: failedJob.clientId,
    providerKey: providerResult.decision.providerKey,
    providerTier: providerResult.decision.providerTier,
    assetRole: "primary",
    targetDurationSec: script.package.targetDurationSec,
    voiceoverAssetId: failedJob.voiceoverAssetId ?? undefined,
    portraitAssetId: failedJob.portraitAssetId ?? undefined,
  });

  return {
    ok: true,
    estimatedCostCents: estimate.estimatedCostCents,
    canRetry: true,
  };
}

export async function retryVideoJob(
  rawInput: unknown,
): Promise<RetryVideoJobResult> {
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

  const parsed = retryVideoJobRequestSchema.safeParse(rawInput);
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

  const stats = await getVideoJobRegenerationStats({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
  });
  const hasOverride = await hasConsumableRetryOverride({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
    failedJobId: failedJob.id,
  });

  if (isRetryLimitExceeded(stats.maxAttempt) && !hasOverride) {
    return videoJobMutationError("RETRY_LIMIT_EXCEEDED", {
      messageKey: "scripts.videoJob.retry.limitExceeded",
    });
  }

  const preview = await previewRetryVideoJobEstimate({
    failedJobId: parsed.data.failedJobId,
  });
  if (!preview.ok) {
    return preview;
  }
  if (!preview.canRetry) {
    return videoJobMutationError("JOB_NOT_RETRYABLE", {
      messageKey: preview.retryBlockedReasonKey,
    });
  }
  if (preview.estimatedCostCents !== parsed.data.confirmEstimateCents) {
    return videoJobMutationError("VALIDATION_ERROR", {
      fields: { confirmEstimateCents: ["MISMATCH"] },
    });
  }

  const budgetResult = await assertVideoJobBudgetAllowsSpend({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
    operatorClientId: operator.id,
    estimatedCostCents: preview.estimatedCostCents,
  });
  if (!budgetResult.ok) {
    return videoJobMutationError("BUDGET_EXCEEDED", {
      messageKey: "scripts.videoJob.retry.budgetExceeded",
    });
  }

  const script = await loadReelScriptForVideoJob({
    reelScriptId: failedJob.reelScriptId,
    clientId: failedJob.clientId,
  });
  if (!script) {
    return videoJobMutationError("NOT_FOUND");
  }

  if (script.visualMode === "own_avatar" || script.modalidad === "own_avatar") {
    const consent = await assertActiveAvatarConsentForJobs(failedJob.clientId);
    if (!consent.ok) {
      return videoJobMutationError("CONSENT_REVOKED", {
        messageKey: consent.error.messageKey,
      });
    }
  }

  if (hasOverride) {
    await consumeRetryOverride({
      clientId: failedJob.clientId,
      failedJobId: failedJob.id,
    });
  }

  return createTalkingHeadVideoJob(
    {
      clientId: failedJob.clientId,
      reelScriptId: failedJob.reelScriptId,
      targetDurationSec: script.package.targetDurationSec,
      voiceoverAssetId: failedJob.voiceoverAssetId ?? undefined,
      portraitAssetId: failedJob.portraitAssetId ?? undefined,
    },
    {
      parentJobId: failedJob.id,
      attempt: failedJob.attempt + 1,
      operatorClientId: operator.id,
      jobKind: "talking_head_retry",
      portraitAssetId: failedJob.portraitAssetId,
      voiceoverAssetId: failedJob.voiceoverAssetId,
    },
  );
}
