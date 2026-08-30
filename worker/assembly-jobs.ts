import {
  pollQueuedAssemblyJobsBatch,
  runAssemblyWorkerLoop,
} from "@/lib/assembly/poll-assembly-jobs";

const mode = process.env.ASSEMBLY_JOB_POLL_MODE ?? "fly";
if (mode === "fly") {
  runAssemblyWorkerLoop().catch((error) => {
    console.error("[worker] assembly job loop crashed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
} else {
  pollQueuedAssemblyJobsBatch().catch((error) => {
    console.error("[worker] one-shot assembly batch failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
}
