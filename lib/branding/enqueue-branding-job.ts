import "server-only";

import { pingWorkerWake } from "@/lib/worker/ping-worker-wake";
import { scheduleWorkerWakeWithAfter } from "@/lib/worker/schedule-worker-wake-after";

import { getBrandingJobPollMode } from "./branding-job-config";

/**
 * Enqueue branding worker per ADR-0003 runtime matrix.
 * Production (fly): fire-and-forget wake ping so the Fly branding process polls ASAP.
 * Dev (in_process): fire-and-forget async run in Node.
 */
export function enqueueBrandingJob(assemblyJobId: string): void {
  if (getBrandingJobPollMode() !== "in_process") {
    pingWorkerWake("branding", { schedule: scheduleWorkerWakeWithAfter });
    return;
  }

  void import("./run-branding-job")
    .then(({ runBrandingJob }) => runBrandingJob(assemblyJobId))
    .catch((error) => {
      console.error("[branding] in-process run failed", {
        assemblyJobId,
        name: error instanceof Error ? error.name : "unknown",
      });
    });
}
