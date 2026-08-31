import "server-only";

import { createAssemblyJobForClientTrusted } from "@/lib/assembly/create-assembly-job-for-reel-script";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import { createBrandingJobForAssembly } from "@/lib/assembly/create-branding-job-for-assembly";
import type { RevisionPipelineStep } from "@/lib/contracts/approval-revision";

import { tryMarkRevisionRoutingStarted } from "./persist-revision-routing";

export type ExecuteRevisionMediaStepsParams = {
  approvalId: string;
  assembledReelId: string;
  clientId: string;
  round: number;
  reelScriptId: string;
  steps: readonly RevisionPipelineStep[];
};

export type ExecuteRevisionMediaStepsResult =
  | { ok: true; skipped: true; reason: "routing_already_started" }
  | { ok: true; skipped: false; enqueued: RevisionPipelineStep[] }
  | { ok: false; step: RevisionPipelineStep; code: string };

/**
 * Router hook (US-11.2) — enqueue assembly/branding for media-path revisions.
 * QA re-run chains from onBrandingCompleted; requeue from QA/caption completion hooks.
 */
export async function executeRevisionMediaSteps(
  params: ExecuteRevisionMediaStepsParams,
): Promise<ExecuteRevisionMediaStepsResult> {
  const mediaSteps = params.steps.filter(
    (step): step is "assembly" | "branding" =>
      step === "assembly" || step === "branding",
  );

  if (mediaSteps.length === 0) {
    return { ok: true, skipped: false, enqueued: [] };
  }

  const started = await tryMarkRevisionRoutingStarted({
    approvalId: params.approvalId,
    clientId: params.clientId,
    round: params.round,
  });
  if (!started) {
    return { ok: true, skipped: true, reason: "routing_already_started" };
  }

  const enqueued: RevisionPipelineStep[] = [];

  for (const step of mediaSteps) {
    if (step === "assembly") {
      const result = await createAssemblyJobForClientTrusted({
        clientId: params.clientId,
        reelScriptId: params.reelScriptId,
        invokedBy: "revision",
      });
      if (!result.ok) {
        return { ok: false, step, code: result.error.code };
      }
      enqueued.push("assembly");
      continue;
    }

    const assembly = await loadAssemblyJobScoped({
      jobId: params.assembledReelId,
      clientId: params.clientId,
    });
    if (!assembly || assembly.status !== "completed") {
      return { ok: false, step, code: "ASSEMBLY_NOT_READY" };
    }

    const brandingResult = await createBrandingJobForAssembly({
      assemblyJobId: params.assembledReelId,
      source: "revision",
      clientId: params.clientId,
    });
    if (!brandingResult.ok) {
      return { ok: false, step, code: brandingResult.error.code };
    }
    enqueued.push("branding");
  }

  return { ok: true, skipped: false, enqueued };
}

/**
 * Enqueue branding only (branding-only revision path).
 */
export async function enqueueRevisionBranding(params: {
  approvalId: string;
  assembledReelId: string;
  clientId: string;
  round: number;
}): Promise<ExecuteRevisionMediaStepsResult> {
  return executeRevisionMediaSteps({
    approvalId: params.approvalId,
    assembledReelId: params.assembledReelId,
    clientId: params.clientId,
    round: params.round,
    reelScriptId: "",
    steps: ["branding"],
  });
}

/**
 * Enqueue assembly (assembly/script revision path — branding auto-chains on complete).
 */
export async function enqueueRevisionAssembly(params: {
  approvalId: string;
  assembledReelId: string;
  clientId: string;
  round: number;
  reelScriptId: string;
}): Promise<ExecuteRevisionMediaStepsResult> {
  return executeRevisionMediaSteps({
    approvalId: params.approvalId,
    assembledReelId: params.assembledReelId,
    clientId: params.clientId,
    round: params.round,
    reelScriptId: params.reelScriptId,
    steps: ["assembly"],
  });
}
