import { pollActiveVideoJobsBatch, runVideoJobWorkerLoop } from "@/lib/video-jobs/poll-video-job-until-terminal";

const mode = process.env.VIDEO_JOB_POLL_MODE ?? "fly";
if (mode === "fly") {
  runVideoJobWorkerLoop().catch((error) => {
    console.error("[worker] video job loop crashed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
} else {
  pollActiveVideoJobsBatch().catch((error) => {
    console.error("[worker] one-shot poll failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
}
