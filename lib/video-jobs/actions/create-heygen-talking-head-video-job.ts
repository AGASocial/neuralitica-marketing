"use server";

/**
 * US-8.7 Phase B — Operator “Generate with HeyGen” Server Actions.
 *
 * FE imports these paths only. Full eligibility / create orchestration is owned
 * by nextjs-backend (CONTRACT: `createHeygenTalkingHeadVideoJob` + preview).
 * Until BE Phase B lands, stubs return contract-shaped ineligible / unavailable
 * results so the Operator UI compiles and stays fail-closed.
 */

import {
  createHeygenTalkingHeadVideoJobRequestSchema,
  previewHeygenTalkingHeadEstimateRequestSchema,
  type CreateHeygenTalkingHeadVideoJobResult,
  type PreviewHeygenTalkingHeadEstimateSuccess,
} from "@/lib/contracts/video-job";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";

import { findForbiddenVideoJobKeys } from "../find-forbidden-keys";
import { videoJobMutationError } from "../errors";

type PreviewHeygenResult =
  | PreviewHeygenTalkingHeadEstimateSuccess
  | ReturnType<typeof videoJobMutationError>;

/**
 * Preview estimate + eligibility for the confirm dialog (no vendor create).
 * @see plan/stories/US-8.7/CONTRACT.md § Operator fallback — eligibility + audit
 */
export async function previewHeygenTalkingHeadEstimate(
  rawInput: unknown,
): Promise<PreviewHeygenResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return videoJobMutationError(
        error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      );
    }
    throw error;
  }

  const forbidden = findForbiddenVideoJobKeys(rawInput);
  if (forbidden.length > 0) {
    return videoJobMutationError("FORBIDDEN_FIELDS", {
      fields: Object.fromEntries(forbidden.map((key) => [key, ["forbidden"]])),
    });
  }

  const parsed = previewHeygenTalkingHeadEstimateRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return videoJobMutationError("VALIDATION_ERROR");
  }

  // BE Phase B dependency: replace with real eligibility + adapter.estimateCost.
  const durationSec = parsed.data.targetDurationSec ?? 30;
  return {
    ok: true,
    estimatedCostCents: 0,
    unitCostCentsPerSecond: 2,
    durationSec,
    eligible: false,
    eligibilityPath: "ineligible",
    blockedReasonKey: "scripts.heygen.blocked.providerUnavailable",
  };
}

/**
 * Create talking-head job forced to heygen_high (high-tier or operator fallback).
 * Never accepts client provider_key / engine / tier.
 */
export async function createHeygenTalkingHeadVideoJob(
  rawInput: unknown,
): Promise<CreateHeygenTalkingHeadVideoJobResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return videoJobMutationError(
        error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
      );
    }
    throw error;
  }

  const forbidden = findForbiddenVideoJobKeys(rawInput);
  if (forbidden.length > 0) {
    return videoJobMutationError("FORBIDDEN_FIELDS", {
      fields: Object.fromEntries(forbidden.map((key) => [key, ["forbidden"]])),
    });
  }

  const parsed = createHeygenTalkingHeadVideoJobRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return videoJobMutationError("VALIDATION_ERROR");
  }

  // BE Phase B dependency: replace with createHeygenTalkingHeadVideoJob core
  // (eligibility → force heygen_high → estimate → budget → consent → create).
  void parsed.data;
  return videoJobMutationError("PROVIDER_UNAVAILABLE", {
    messageKey: "scripts.heygen.errors.providerUnavailable",
  });
}
