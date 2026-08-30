import {
  pollQueuedBrandingJobsBatch,
  runBrandingWorkerLoop,
} from "@/lib/branding/poll-branding-jobs";
import { readBrandingJobPollMode } from "@/lib/branding/branding-job-config-readers";

const mode = readBrandingJobPollMode(process.env);
if (mode === "fly") {
  runBrandingWorkerLoop().catch((error) => {
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
