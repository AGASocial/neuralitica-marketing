import {
  pollQueuedBrandingJobsBatch,
  runBrandingWorkerLoop,
} from "@/lib/branding/poll-branding-jobs";
import { readBrandingJobPollMode } from "@/lib/branding/branding-job-config-readers";
import { createWorkerWakeGate } from "@/lib/worker/wake-gate";
import { startWorkerWakeHttpServer } from "@/lib/worker/wake-http-server";

const mode = readBrandingJobPollMode(process.env);
if (mode === "fly") {
  const wakeGate = createWorkerWakeGate();
  startWorkerWakeHttpServer({ onWake: () => wakeGate.wake() });
  console.info("[worker] branding job poll loop started", { mode, region: process.env.FLY_REGION ?? null });
  runBrandingWorkerLoop({ wakeGate }).catch((error) => {
    console.error("[worker] branding job loop crashed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
} else {
  pollQueuedBrandingJobsBatch().catch((error) => {
    console.error("[worker] one-shot branding batch failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
}
