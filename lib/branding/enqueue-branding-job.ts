import "server-only";

import { getBrandingJobPollMode } from "./branding-job-config";

/**
 * Enqueue branding worker per ADR-0003 runtime matrix.
 * Production (fly): no-op — Fly worker polls neuramark_assembled_reels directly.
 * Dev (in_process): fire-and-forget async run in Node.
 */
export function enqueueBrandingJob(assemblyJobId: string): void {
  if (getBrandingJobPollMode() !== "in_process") {
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
