"use server";

import type { CreateBrollVideoJobsResult } from "@/lib/contracts/video-job";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { createBrollVideoJobs as createBrollVideoJobsCore } from "@/lib/video-jobs/create-broll-video-jobs";
import { videoJobMutationError } from "@/lib/video-jobs/errors";

/**
 * Operator Server Action for Wan B-roll create (US-8.5).
 * Accepts only request body fields (`reelScriptId`, `clientId`).
 * Never accepts client-supplied `options` / `operatorClientId` — that path
 * stays on the internal core helper used by retry after its own requireOperator.
 */
export async function createBrollVideoJobs(
  rawInput: unknown,
): Promise<CreateBrollVideoJobsResult> {
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

  return createBrollVideoJobsCore(rawInput, {
    operatorClientId: operator.id,
  });
}
