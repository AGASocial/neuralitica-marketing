import "server-only";

import {
  previewBrollVideoJobsEstimateRequestSchema,
  previewBrollVideoJobsEstimateSuccessSchema,
  type PreviewBrollVideoJobsEstimateSuccess,
} from "@/lib/contracts/video-job";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";

import {
  BROLL_BLOCKED_JOB_IN_FLIGHT,
  estimateBrollVideoJobsPreview,
  hasBrollJobInFlight,
} from "./broll-estimate-shared";
import { findForbiddenVideoJobKeys } from "./find-forbidden-keys";
import { videoJobForbiddenFieldsError, videoJobMutationError } from "./errors";
import { loadReelScriptForVideoJob } from "./load-reel-script-for-video-job";

export async function previewBrollVideoJobsEstimate(
  rawInput: unknown,
): Promise<
  PreviewBrollVideoJobsEstimateSuccess | ReturnType<typeof videoJobMutationError>
> {
  let operator: { id: string; role: "operator" };
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

  if (findForbiddenVideoJobKeys(rawInput).length > 0) {
    return videoJobForbiddenFieldsError();
  }

  const parsed = previewBrollVideoJobsEstimateRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return videoJobMutationError("VALIDATION_ERROR");
  }

  if (parsed.data.clientId !== operator.id) {
    return videoJobMutationError("FORBIDDEN");
  }

  const script = await loadReelScriptForVideoJob({
    reelScriptId: parsed.data.reelScriptId,
    clientId: parsed.data.clientId,
  });
  if (!script) {
    return videoJobMutationError("NOT_FOUND");
  }

  const estimate = await estimateBrollVideoJobsPreview({
    script,
    clientId: parsed.data.clientId,
    reelScriptId: parsed.data.reelScriptId,
    operatorClientId: operator.id,
  });

  if (estimate.needsBroll && !estimate.blockedReasonKey) {
    const inFlight = await hasBrollJobInFlight({
      clientId: parsed.data.clientId,
      reelScriptId: parsed.data.reelScriptId,
    });
    if (inFlight) {
      return previewBrollVideoJobsEstimateSuccessSchema.parse({
        ok: true,
        estimatedCostCents: 0,
        unitCostCentsPerClip: 0,
        clipCount: 0,
        needsBroll: true,
        blockedReasonKey: BROLL_BLOCKED_JOB_IN_FLIGHT,
      });
    }
  }

  return previewBrollVideoJobsEstimateSuccessSchema.parse({
    ok: true,
    ...estimate,
  });
}
