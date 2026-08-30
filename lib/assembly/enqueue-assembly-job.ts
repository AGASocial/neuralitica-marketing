import "server-only";

import { getAssemblyJobPollMode } from "./assembly-job-config";

/**
 * Enqueue assembly worker per ADR-0003 runtime matrix.
 * Production (fly): no-op — Fly worker polls neuramark_assembled_reels directly.
 * Dev (in_process): fire-and-forget async run in Node.
 */
export function enqueueAssemblyJob(assemblyJobId: string): void {
  if (getAssemblyJobPollMode() !== "in_process") {
    return;
  }

  void import("./run-assembly-job")
    .then(({ runAssemblyJob }) => runAssemblyJob(assemblyJobId))
    .catch((error) => {
      console.error("[assembly] in-process run failed", {
        assemblyJobId,
        name: error instanceof Error ? error.name : "unknown",
      });
    });
}
