import "server-only";

import { pingWorkerWake } from "@/lib/worker/ping-worker-wake";
import { scheduleWorkerWakeWithAfter } from "@/lib/worker/schedule-worker-wake-after";

import { getAssemblyJobPollMode } from "./assembly-job-config";

/**
 * Enqueue assembly worker per ADR-0003 runtime matrix.
 * Production (fly): fire-and-forget wake ping so the Fly assembly process polls ASAP.
 * Dev (in_process): fire-and-forget async run in Node.
 */
export function enqueueAssemblyJob(assemblyJobId: string): void {
  if (getAssemblyJobPollMode() !== "in_process") {
    pingWorkerWake("assembly", { schedule: scheduleWorkerWakeWithAfter });
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
