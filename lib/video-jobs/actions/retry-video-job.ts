"use server";

import {
  previewRetryVideoJobEstimateRequestSchema,
  retryVideoJobRequestSchema,
  retryVideoJobSuccessSchema,
  type PreviewRetryVideoJobEstimateSuccess,
  type RetryVideoJobResult,
} from "@/lib/contracts/video-job";
import { WAN_PROVIDER_KEY } from "@/lib/contracts/siliconflow-wan21-turbo";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { initializeProviderRegistryFromCatalog } from "@/lib/providers/create-provider-registry";
import { resolveProviderForJob } from "@/lib/providers/resolve-provider-for-job";
import { assertActiveAvatarConsentForJobs } from "@/lib/visual-preferences/assert-active-avatar-consent-for-jobs";

import { assertVideoJobBudgetAllowsSpend } from "../assert-video-job-budget";
import { createBrollVideoJobs } from "../create-broll-video-jobs";
import { createTalkingHeadVideoJob } from "../create-talking-head-video-job";
import { videoJobMutationError } from "../errors";
import { loadReelScriptForVideoJob } from "../load-reel-script-for-video-job";
import { loadVideoJobScoped } from "../load-video-job";
import {
  consumeRetryOverride,
  evaluateRetryEligibility,
  findUnconsumedRetryOverride,
  getMaxAttemptForReel,
} from "../retry-eligibility";
import { getVideoMaxRetriesPerReel } from "../video-job-config";

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

  const retryState = await evaluateRetryEligibility({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
    jobId: failedJob.id,
    status: failedJob.status,
    attempt: failedJob.attempt,
    estimatedCostCents: failedJob.estimatedCostCents,
    operatorClientId: operator.id,
  });

  if (!retryState.canRetry) {
    return {
      ok: true,
      estimatedCostCents: failedJob.estimatedCostCents,
      canRetry: false,
      retryBlockedReasonKey: retryState.retryBlockedReasonKey ?? undefined,
    };
  }

  const script = await loadReelScriptForVideoJob({
    reelScriptId: failedJob.reelScriptId,
    clientId: failedJob.clientId,
  });
  if (!script) {
    return videoJobMutationError("NOT_FOUND");
  }

  const isBroll = failedJob.assetRole === "broll";

  const providerResult = await resolveProviderForJob({
    clientId: failedJob.clientId,
    assetRole: isBroll ? "broll" : "talking_head",
    productionContext: {
      visualMode: script.visualMode,
      modalidad: script.modalidad,
      hasReferenceLoop: script.hasReferenceLoop,
      needsBroll: isBroll,
      targetDurationSec: isBroll ? 5 : script.package.targetDurationSec,
      brollClipCount: isBroll ? 1 : 0,
      ttsCharCount: script.package.voiceoverText.length,
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

  /** B-roll retry must stay on Wan — never promote to talking-head. */
  const providerKey = isBroll
    ? failedJob.providerKey === WAN_PROVIDER_KEY
      ? WAN_PROVIDER_KEY
      : providerResult.decision.providerKey
    : providerResult.decision.providerKey;

  if (isBroll && providerKey !== WAN_PROVIDER_KEY) {
    return {
      ok: true,
      estimatedCostCents: failedJob.estimatedCostCents,
      canRetry: false,
      retryBlockedReasonKey: "scripts.videoJob.retry.providerUnavailable",
    };
  }

  const registry = await initializeProviderRegistryFromCatalog();
  const adapter = registry.getVideoAdapter(providerKey);
  const estimate = await adapter.estimateCost({
    reelScriptId: failedJob.reelScriptId,
    clientId: failedJob.clientId,
    providerKey,
    providerTier: isBroll ? "low" : providerResult.decision.providerTier,
    assetRole: isBroll ? "broll" : "primary",
    targetDurationSec: isBroll ? 5 : script.package.targetDurationSec,
    voiceoverAssetId: failedJob.voiceoverAssetId ?? undefined,
    portraitAssetId: failedJob.portraitAssetId ?? undefined,
    referenceImageAssetId: isBroll
      ? (failedJob.portraitAssetId ?? undefined)
      : undefined,
    prompt: isBroll ? "Cinematic B-roll. <<BEAT>>retry<</BEAT>>" : undefined,
    clipCount: isBroll ? 1 : undefined,
  });

  const budgetRetryState = await evaluateRetryEligibility({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
    jobId: failedJob.id,
    status: failedJob.status,
    attempt: failedJob.attempt,
    estimatedCostCents: estimate.estimatedCostCents,
    operatorClientId: operator.id,
  });

  if (!budgetRetryState.canRetry) {
    return {
      ok: true,
      estimatedCostCents: estimate.estimatedCostCents,
      canRetry: false,
      retryBlockedReasonKey: budgetRetryState.retryBlockedReasonKey ?? undefined,
    };
  }

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

  const maxAttempt = await getMaxAttemptForReel({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
  });
  const override = await findUnconsumedRetryOverride({
    clientId: failedJob.clientId,
    reelScriptId: failedJob.reelScriptId,
    failedJobId: failedJob.id,
  });

  if (maxAttempt >= getVideoMaxRetriesPerReel() && !override) {
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

  if (failedJob.assetRole === "broll") {
    if (failedJob.providerKey !== WAN_PROVIDER_KEY) {
      return videoJobMutationError("JOB_NOT_RETRYABLE");
    }

    const brollResult = await createBrollVideoJobs(
      {
        clientId: failedJob.clientId,
        reelScriptId: failedJob.reelScriptId,
      },
      {
        parentJobId: failedJob.id,
        attempt: failedJob.attempt + 1,
        operatorClientId: operator.id,
        jobKind: "broll_retry",
        singleClipRetry: {
          referenceStillAssetId: failedJob.portraitAssetId,
        },
      },
    );

    if (!brollResult.ok) {
      return brollResult;
    }

    const created = brollResult.jobs[0];
    if (!created) {
      const skip = brollResult.skipped[0];
      if (skip?.reasonCode === "BUDGET_EXCEEDED") {
        return videoJobMutationError("BUDGET_EXCEEDED", {
          messageKey: skip.messageKey,
        });
      }
      return videoJobMutationError("INTERNAL_ERROR");
    }

    if (override) {
      await consumeRetryOverride(override.id);
    }

    return retryVideoJobSuccessSchema.parse({
      ok: true,
      jobId: created.jobId,
      status: created.status,
      estimatedCostCents: created.estimatedCostCents,
      attempt: created.attempt,
    });
  }

  if (script.visualMode === "own_avatar" || script.modalidad === "own_avatar") {
    const consent = await assertActiveAvatarConsentForJobs(failedJob.clientId);
    if (!consent.ok) {
      return videoJobMutationError("CONSENT_REVOKED", {
        messageKey: consent.error.messageKey,
      });
    }
  }

  const createResult = await createTalkingHeadVideoJob(
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
      ...(failedJob.providerKey === "heygen_high"
        ? {
            forcedProviderKey: "heygen_high",
            forcedProviderTier: "high" as const,
          }
        : {}),
    },
  );

  if (!createResult.ok) {
    return createResult;
  }

  if (override) {
    await consumeRetryOverride(override.id);
  }

  return createResult;
}
