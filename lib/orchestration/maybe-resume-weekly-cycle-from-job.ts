import "server-only";

import type { ResumeWeeklyCycleFromJobParams } from "@/lib/contracts/weekly-cycle-live";

import { resumeWeeklyCycleFromJob } from "./resume-weekly-cycle-from-job";

/**
 * Best-effort weekly-cycle continuation after async job terminal status.
 * No-ops silently when the job is not linked to a cycle step run.
 */
export async function maybeResumeWeeklyCycleFromJob(
  params: ResumeWeeklyCycleFromJobParams,
): Promise<void> {
  const result = await resumeWeeklyCycleFromJob(params);
  if (!result.ok && result.code !== "JOB_LINK_NOT_FOUND") {
    console.error("[weekly-cycle] resume from job failed", {
      jobKind: params.jobKind,
      jobId: params.jobId,
      code: result.code,
    });
  }
}
