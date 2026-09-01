import "server-only";

/**
 * US-15.1 Phase B — per-slot sequential step advancer.
 * Walks the frozen step order (CONTRACT.md § "Exact live step wiring and
 * gates") one step at a time per slot: primary_video -> tts -> broll ->
 * assembly -> branding -> qa -> approval. `primary_video` is skipped for
 * faceless slots; `broll` is skipped when the script needs none.
 *
 * Sync steps (tts, qa, approval) execute immediately and recurse to the
 * next step. Async steps (primary_video, broll, assembly, branding) are
 * left `ready` for the outbox worker (`dispatch-weekly-cycle-outbox.ts`)
 * and the call returns — no synchronous provider polling.
 */
import type { WeeklyCycleStepKey } from "@/lib/contracts/weekly-cycle";
import {
  createOrGetReadyStepRun,
  loadLatestStepRunForSlot,
  markStepRunTerminal,
  type WeeklyCycleStepRunRow,
} from "@/lib/orchestration/weekly-cycle-step-runs";
import { dispatchWeeklyCycleOutbox } from "@/lib/orchestration/dispatch-weekly-cycle-outbox";
import {
  runWeeklyCycleApprovalStep,
  runWeeklyCycleQaStep,
  runWeeklyCycleTtsStep,
  slotNeedsPrimaryVideo,
  type WeeklyCycleSlotScript,
} from "@/lib/orchestration/weekly-cycle-trusted-steps";
import { isWeeklyCycleLiveAllowedForClient } from "@/lib/orchestration/weekly-cycle-live-env";

const SLOT_STEP_ORDER: readonly WeeklyCycleStepKey[] = [
  "primary_video",
  "tts",
  "broll",
  "assembly",
  "branding",
  "qa",
  "approval",
];

const ASYNC_STEPS = new Set<WeeklyCycleStepKey>([
  "primary_video",
  "broll",
  "assembly",
  "branding",
]);

function nextStepAfter(
  step: WeeklyCycleStepKey | null,
  script: WeeklyCycleSlotScript,
): WeeklyCycleStepKey | null {
  const startIndex = step === null ? 0 : SLOT_STEP_ORDER.indexOf(step) + 1;
  for (let i = startIndex; i < SLOT_STEP_ORDER.length; i += 1) {
    const candidate = SLOT_STEP_ORDER[i]!;
    if (candidate === "primary_video" && !slotNeedsPrimaryVideo(script.modalidad)) continue;
    if (candidate === "broll" && !script.needsBroll) continue;
    return candidate;
  }
  return null;
}

/** Resolves the linkage pointer a step's `ready` row needs before dispatch. */
async function resolveLinkageForStep(params: {
  runId: string;
  slotIndex: number;
  step: WeeklyCycleStepKey;
  script: WeeklyCycleSlotScript;
}): Promise<string> {
  if (params.step === "branding") {
    const assemblyRow = await loadLatestStepRunForSlot({
      runId: params.runId,
      slotIndex: params.slotIndex,
      step: "assembly",
    });
    if (!assemblyRow?.jobId) throw new Error("WEEKLY_CYCLE_ASSEMBLY_LINKAGE_MISSING");
    return assemblyRow.jobId;
  }
  if (params.step === "qa" || params.step === "approval") {
    const brandingRow = await loadLatestStepRunForSlot({
      runId: params.runId,
      slotIndex: params.slotIndex,
      step: "branding",
    });
    if (!brandingRow?.jobId) throw new Error("WEEKLY_CYCLE_BRANDING_LINKAGE_MISSING");
    return brandingRow.jobId;
  }
  return params.script.reelScriptId;
}

/**
 * Advances one slot by exactly one step from its current terminal state.
 * Idempotent: safe to call repeatedly (`createOrGetReadyStepRun` upserts).
 */
export async function advanceWeeklyCycleSlot(params: {
  runId: string;
  clientId: string;
  slotIndex: number;
  script: WeeklyCycleSlotScript;
  /** The step that just reached a terminal state, or null to seed the slot. */
  fromStep: WeeklyCycleStepKey | null;
  attempt?: number;
}): Promise<void> {
  if (!isWeeklyCycleLiveAllowedForClient(params.clientId)) {
    return;
  }

  const next = nextStepAfter(params.fromStep, params.script);
  if (!next) {
    // Slot chain exhausted (approval was last and already handled by caller).
    return;
  }

  const attempt = params.attempt ?? 1;
  const linkageId = await resolveLinkageForStep({
    runId: params.runId,
    slotIndex: params.slotIndex,
    step: next,
    script: params.script,
  });

  const stepRun = await createOrGetReadyStepRun({
    runId: params.runId,
    clientId: params.clientId,
    slotIndex: params.slotIndex,
    step: next,
    attempt,
    linkageId,
  });
  if (!stepRun || stepRun.status !== "ready") {
    return;
  }

  if (ASYNC_STEPS.has(next)) {
    await dispatchWeeklyCycleOutbox(3);
    return;
  }

  await runSyncStep(stepRun, params, next);
}

async function runSyncStep(
  stepRun: WeeklyCycleStepRunRow,
  params: {
    runId: string;
    clientId: string;
    slotIndex: number;
    script: WeeklyCycleSlotScript;
  },
  step: WeeklyCycleStepKey,
): Promise<void> {
  const outcome =
    step === "tts"
      ? await runWeeklyCycleTtsStep({ clientId: params.clientId, reelScriptId: params.script.reelScriptId })
      : step === "qa"
        ? await runWeeklyCycleQaStep({ clientId: params.clientId, assembledReelId: stepRun.jobId ?? "" })
        : await runWeeklyCycleApprovalStep({ clientId: params.clientId, assembledReelId: stepRun.jobId ?? "" });

  if (outcome.ok) {
    await markStepRunTerminal({ stepRunId: stepRun.id, status: "completed" });
    await advanceWeeklyCycleSlot({ ...params, fromStep: step });
    return;
  }

  await markStepRunTerminal({ stepRunId: stepRun.id, status: "failed", errorCode: outcome.errorCode });
}
