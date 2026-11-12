import {
  pollQueuedAssemblyJobsBatch,
  runAssemblyWorkerLoop,
} from "@/lib/assembly/poll-assembly-jobs";
import { createWorkerWakeGate } from "@/lib/worker/wake-gate";
import { startWorkerWakeHttpServer } from "@/lib/worker/wake-http-server";

const mode = process.env.ASSEMBLY_JOB_POLL_MODE ?? "fly";
if (mode === "fly") {
  const wakeGate = createWorkerWakeGate();
  startWorkerWakeHttpServer({ onWake: () => wakeGate.wake() });
  console.info("[worker] assembly job poll loop started", { mode, region: process.env.FLY_REGION ?? null });
  runAssemblyWorkerLoop({ wakeGate }).catch((error) => {
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
