import "server-only";

/**
 * US-15.1 Phase B — per-step wiring onto existing `invokedBy: "system"` /
 * trusted seams. Frozen call sites in CONTRACT.md § "Exact live step wiring
 * and gates". No new provider/adapter logic — every call below delegates to
 * an existing orchestrator that already enforces its own budget/policy/
 * consent gates (ADR-0002/0003, US-4.1/5.1/6.1/8.x/9.x/10.1/11.1).
 *
 * Two kinds of steps:
 *  - "global" (strategy/scripts/captions): synchronous LLM calls today —
 *    dispatched inline by the runner, no outbox needed.
 *  - "slot async" (primary_video/broll/assembly/branding): real provider or
 *    worker jobs — dispatched through the outbox and completed by an
 *    authenticated callback via `resumeWeeklyCycleFromJob`.
 *  - "slot sync" (tts/qa/approval): complete within the dispatch call today
 *    (TTS synthesizes inline; QA runs deterministic+LLM checks inline;
 *    approval is a single idempotent INSERT).
 */
import { generateContentStrategyForClient } from "@/lib/content-strategy/generate-content-strategy-for-client";
import { generateReelScriptsForClient } from "@/lib/reel-scripts/generate-reel-scripts-for-client";
import { generateReelCaptionsForClient } from "@/lib/reel-captions/generate-reel-captions-for-client";
import { listReelScriptsForStrategy } from "@/lib/reel-scripts/persist-reel-script";
import { createTalkingHeadVideoJob } from "@/lib/video-jobs/create-talking-head-video-job";
import { createBrollVideoJobs } from "@/lib/video-jobs/create-broll-video-jobs";
import { isFacelessNeedsBroll } from "@/lib/video-jobs/broll-estimate-shared";
import { synthesizeVoiceoverForClientTrusted } from "@/lib/tts/synthesize-voiceover-for-client-trusted";
import { createAssemblyJobForClientTrusted } from "@/lib/assembly/create-assembly-job-for-reel-script";
import { createBrandingJobForAssembly } from "@/lib/assembly/create-branding-job-for-assembly";
import { runQaForAssembledReelForClient } from "@/lib/qa/run-qa-for-assembled-reel";
import { ensureApprovalPackageForSystemCycle } from "@/lib/orchestration/ensure-approval-package-for-system-cycle";
import { autoApproveWeeklyCycleStrategy } from "@/lib/orchestration/auto-approve-weekly-cycle-strategy";
import type { WeeklyCycleErrorCode } from "@/lib/orchestration/weekly-cycle-live-types";

export type StepDispatchOutcome =
  | { ok: true; terminal: "completed"; jobId?: string }
  | { ok: true; terminal: "pending"; jobKind: "video" | "assembly" | "branding"; jobId: string }
  | { ok: false; errorCode: WeeklyCycleErrorCode; retryable: boolean };

const RETRYABLE_DOWNSTREAM_CODES = new Set([
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

/** Best-effort mapping from a downstream module's own error code enum to ours. */
export function mapDownstreamErrorCode(code: string): WeeklyCycleErrorCode {
  switch (code) {
    case "BUDGET_EXCEEDED":
      return "BUDGET_EXCEEDED";
    case "CONSENT_REQUIRED":
      return "CONSENT_REQUIRED";
    case "CONSENT_REVOKED":
      return "CONSENT_REVOKED";
    case "PROVIDER_UNAVAILABLE":
      return "PROVIDER_UNAVAILABLE";
    case "VALIDATION_ERROR":
      return "VALIDATION_ERROR";
    case "NOT_FOUND":
      return "DEPENDENCY_FAILED";
    case "FORBIDDEN":
    case "UNAUTHENTICATED":
      return "TENANT_SCOPE_MISMATCH";
    case "RATE_LIMITED":
      return "PROVIDER_TRANSIENT";
    case "COST_POLICY_UNAVAILABLE":
      return "POLICY_REJECTED";
    default:
      return "INTERNAL_ERROR";
  }
}

function isRetryableDownstream(code: string): boolean {
  return RETRYABLE_DOWNSTREAM_CODES.has(code);
}

// ---------------------------------------------------------------------------
// Global steps (strategy, scripts, captions) — synchronous, one row/run.
// ---------------------------------------------------------------------------

export type RunStrategyStepResult =
  | { ok: true; strategyId: string }
  | { ok: false; errorCode: WeeklyCycleErrorCode; retryable: boolean };

export async function runWeeklyCycleStrategyStep(params: {
  runId: string;
  clientId: string;
  weekStart: string;
}): Promise<RunStrategyStepResult> {
  const generated = await generateContentStrategyForClient({
    clientId: params.clientId,
    weekStart: params.weekStart,
    invokedBy: "system",
  });

  if (!generated.ok) {
    const code = mapDownstreamErrorCode(generated.error.code);
    return { ok: false, errorCode: code, retryable: isRetryableDownstream(generated.error.code) };
  }

  const approved = await autoApproveWeeklyCycleStrategy({
    runId: params.runId,
    clientId: params.clientId,
    weekStart: params.weekStart,
    strategyId: generated.strategyId,
  });

  if (!approved.ok) {
    // CONTRACT.md's AutoApproveWeeklyCycleStrategyResult error union includes
    // STRATEGY_SCOPE_MISMATCH, which the master weeklyCycleErrorCodeSchema
    // (also frozen in CONTRACT.md) does not enumerate — map it onto the
    // semantically equivalent TENANT_SCOPE_MISMATCH allowlisted code.
    const errorCode: WeeklyCycleErrorCode =
      approved.code === "STRATEGY_SCOPE_MISMATCH" ? "TENANT_SCOPE_MISMATCH" : approved.code;
    return { ok: false, errorCode, retryable: false };
  }

  return { ok: true, strategyId: approved.strategyId };
}

export type RunGlobalStepResult =
  | { ok: true }
  | { ok: false; errorCode: WeeklyCycleErrorCode; retryable: boolean };

export async function runWeeklyCycleScriptsStep(params: {
  clientId: string;
  weekStart: string;
  strategyId: string;
}): Promise<RunGlobalStepResult> {
  const result = await generateReelScriptsForClient({
    clientId: params.clientId,
    weekStart: params.weekStart,
    strategyId: params.strategyId,
    invokedBy: "system",
    mode: "batch",
  });
  if (!result.ok) {
    return {
      ok: false,
      errorCode: mapDownstreamErrorCode(result.error.code),
      retryable: isRetryableDownstream(result.error.code),
    };
  }
  return { ok: true };
}

export async function runWeeklyCycleCaptionsStep(params: {
  clientId: string;
  weekStart: string;
  strategyId: string;
}): Promise<RunGlobalStepResult> {
  const result = await generateReelCaptionsForClient({
    clientId: params.clientId,
    weekStart: params.weekStart,
    strategyId: params.strategyId,
    invokedBy: "system",
    mode: "batch",
  });
  if (!result.ok) {
    return {
      ok: false,
      errorCode: mapDownstreamErrorCode(result.error.code),
      retryable: isRetryableDownstream(result.error.code),
    };
  }
  return { ok: true };
}

export type WeeklyCycleSlotScript = {
  reelScriptId: string;
  slotIndex: number;
  modalidad: "own_avatar" | "generic_avatar" | "faceless";
  needsBroll: boolean;
};

export async function loadWeeklyCycleSlotScripts(params: {
  clientId: string;
  strategyId: string;
}): Promise<WeeklyCycleSlotScript[]> {
  const rows = await listReelScriptsForStrategy(params);
  return rows.map((row) => ({
    reelScriptId: row.id,
    slotIndex: row.slotIndex,
    modalidad: row.modalidad,
    needsBroll: isFacelessNeedsBroll({
      visualMode: row.modalidad,
      modalidad: row.modalidad,
      brollBeatCount: row.package.brollBeats?.length ?? 0,
    }),
  }));
}

export function slotNeedsPrimaryVideo(modalidad: string): boolean {
  return modalidad !== "faceless";
}

// ---------------------------------------------------------------------------
// Slot async steps — dispatched via outbox, complete via callback.
// ---------------------------------------------------------------------------

export async function dispatchWeeklyCyclePrimaryVideoStep(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<StepDispatchOutcome> {
  const result = await createTalkingHeadVideoJob(
    { clientId: params.clientId, reelScriptId: params.reelScriptId },
    { operatorClientId: params.clientId, jobKind: "talking_head_generate" },
  );

  if (!result.ok) {
    const code = result.error.code;
    return { ok: false, errorCode: mapDownstreamErrorCode(code), retryable: isRetryableDownstream(code) };
  }

  if (result.status === "completed") {
    return { ok: true, terminal: "completed", jobId: result.jobId };
  }
  return { ok: true, terminal: "pending", jobKind: "video", jobId: result.jobId };
}

export async function dispatchWeeklyCycleBrollStep(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<StepDispatchOutcome> {
  const result = await createBrollVideoJobs(
    { clientId: params.clientId, reelScriptId: params.reelScriptId },
    { operatorClientId: params.clientId, jobKind: "broll_generate" },
  );

  if (!result.ok) {
    const code = result.error.code;
    return { ok: false, errorCode: mapDownstreamErrorCode(code), retryable: isRetryableDownstream(code) };
  }

  if (result.skippedNoNeedsBroll || result.jobs.length === 0) {
    return { ok: true, terminal: "completed" };
  }

  // Multiple B-roll clips may be created; track the run via the first job id
  // and treat completion as the callback's responsibility per clip. Weekly
  // cycle only needs to know "in flight" vs "none needed".
  const firstJob = result.jobs[0]!;
  return { ok: true, terminal: "pending", jobKind: "video", jobId: firstJob.jobId };
}

export async function dispatchWeeklyCycleAssemblyStep(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<StepDispatchOutcome> {
  const result = await createAssemblyJobForClientTrusted({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
    invokedBy: "system",
  });

  if (!result.ok) {
    const code = result.error.code;
    return { ok: false, errorCode: mapDownstreamErrorCode(code), retryable: isRetryableDownstream(code) };
  }

  if (result.status === "completed") {
    return { ok: true, terminal: "completed", jobId: result.jobId };
  }
  return { ok: true, terminal: "pending", jobKind: "assembly", jobId: result.jobId };
}

export async function dispatchWeeklyCycleBrandingStep(params: {
  clientId: string;
  assemblyJobId: string;
}): Promise<StepDispatchOutcome> {
  const result = await createBrandingJobForAssembly({
    assemblyJobId: params.assemblyJobId,
    source: "auto_chain",
    clientId: params.clientId,
  });

  if (!result.ok) {
    const code = result.error.code;
    return { ok: false, errorCode: mapDownstreamErrorCode(code), retryable: isRetryableDownstream(code) };
  }

  if (result.brandingStatus === "completed") {
    return { ok: true, terminal: "completed", jobId: result.assemblyJobId };
  }
  return { ok: true, terminal: "pending", jobKind: "branding", jobId: result.assemblyJobId };
}

// ---------------------------------------------------------------------------
// Slot sync steps — TTS, QA, approval ensure.
// ---------------------------------------------------------------------------

export async function runWeeklyCycleTtsStep(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<StepDispatchOutcome> {
  const result = await synthesizeVoiceoverForClientTrusted({
    clientId: params.clientId,
    reelScriptId: params.reelScriptId,
    invokedBy: "system",
  });

  if (!result.ok) {
    const code = result.error.code;
    return { ok: false, errorCode: mapDownstreamErrorCode(code), retryable: isRetryableDownstream(code) };
  }

  return { ok: true, terminal: "completed", jobId: result.voiceoverAssetId };
}

export async function runWeeklyCycleQaStep(params: {
  clientId: string;
  assembledReelId: string;
}): Promise<StepDispatchOutcome> {
  const result = await runQaForAssembledReelForClient({
    assembledReelId: params.assembledReelId,
    clientId: params.clientId,
    invokedBy: "system",
    operatorClientId: params.clientId,
  });

  if (!result.ok) {
    const code = result.error.code;
    return { ok: false, errorCode: mapDownstreamErrorCode(code), retryable: isRetryableDownstream(code) };
  }

  if (result.status === "passed") {
    return { ok: true, terminal: "completed", jobId: result.qaReportId };
  }
  // failed / blocked — system path never overrides; this is terminal for the slot.
  return { ok: false, errorCode: "QA_FAILED", retryable: false };
}

export async function runWeeklyCycleApprovalStep(params: {
  clientId: string;
  assembledReelId: string;
}): Promise<StepDispatchOutcome> {
  const result = await ensureApprovalPackageForSystemCycle({
    clientId: params.clientId,
    assembledReelId: params.assembledReelId,
  });

  if (!result.ok) {
    return { ok: false, errorCode: result.errorCode, retryable: false };
  }
  return { ok: true, terminal: "completed" };
}
