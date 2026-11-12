import "server-only";

import { pingWorkerWake } from "@/lib/worker/ping-worker-wake";
import { scheduleWorkerWakeWithAfter } from "@/lib/worker/schedule-worker-wake-after";

import { getVideoJobPollMode } from "./video-job-config";
import { pollVideoJobUntilTerminal } from "./poll-video-job-until-terminal";

/**
 * Enqueue poll per ADR-0003 runtime matrix.
 * Production (fly): fire-and-forget wake ping so the Fly video process polls ASAP.
 * Dev (in_process): fire-and-forget async poll in Node.
 */
export function enqueueVideoJobPoll(jobId: string): void {
  if (getVideoJobPollMode() !== "in_process") {
    pingWorkerWake("video", { schedule: scheduleWorkerWakeWithAfter });
    return;
  }

  void pollVideoJobUntilTerminal(jobId).catch((error) => {
    console.error("[video-jobs] in-process poll failed", {
      jobId,
      name: error instanceof Error ? error.name : "unknown",
    });
  });
}
