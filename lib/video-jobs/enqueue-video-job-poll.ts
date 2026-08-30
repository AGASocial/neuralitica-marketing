import "server-only";

import { getVideoJobPollMode } from "./video-job-config";
import { pollVideoJobUntilTerminal } from "./poll-video-job-until-terminal";

/**
 * Enqueue poll per ADR-0003 runtime matrix.
 * Production (fly): no-op — Fly worker polls neuramark_video_jobs directly.
 * Dev (in_process): fire-and-forget async poll in Node.
 */
export function enqueueVideoJobPoll(jobId: string): void {
  if (getVideoJobPollMode() !== "in_process") {
    return;
  }

  void pollVideoJobUntilTerminal(jobId).catch((error) => {
    console.error("[video-jobs] in-process poll failed", {
      jobId,
      name: error instanceof Error ? error.name : "unknown",
    });
  });
}
