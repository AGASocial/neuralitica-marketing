import "server-only";

/**
 * Revision pipeline enqueue seams (US-11.2).
 * media-pipeline-engineer + content-agents-engineer extend step handlers;
 * router enqueues the first step only — completion hooks chain the rest.
 */

import type {
  ChangeRequestInput,
  RevisionContext,
  RevisionPipelineStep,
  RevisionRoutingPlan,
} from "@/lib/contracts/approval-revision";
import { createAssemblyJobForClientTrusted } from "@/lib/assembly/create-assembly-job-for-reel-script";
import { createBrandingJobForAssembly } from "@/lib/assembly/create-branding-job-for-assembly";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import { buildRevisionContext } from "@/lib/approvals/build-revision-context";
import { loadActiveRevisionForAssembledReel } from "@/lib/approvals/load-active-revision-for-assembled-reel";
import { findClientRevisionRound } from "@/lib/approvals/parse-change-requests";
import { loadReelScriptForQa } from "@/lib/qa/load-reel-script-for-qa";
import { runQaForAssembledReelForClient } from "@/lib/qa/run-qa-for-assembled-reel";
import { generateReelCaptionsForClient } from "@/lib/reel-captions/generate-reel-captions-for-client";
import { generateReelScriptsForClient } from "@/lib/reel-scripts/generate-reel-scripts-for-client";
import { synthesizeVoiceoverForClientTrusted } from "@/lib/tts/synthesize-voiceover-for-client-trusted";
import { createTalkingHeadVideoJob } from "@/lib/video-jobs/create-talking-head-video-job";
import { getVideoJobsForReelScripts } from "@/lib/video-jobs/get-video-jobs-for-reel-scripts";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";

export type RevisionPipelineContext = {
  approvalId: string;
  assembledReelId: string;
  clientId: string;
  round: number;
  changeRequest: ChangeRequestInput;
  revisionContext: RevisionContext;
  plan: RevisionRoutingPlan;
  reelScriptId: string;
  strategyId: string;
  slotIndex: number;
  weekStart: string;
};

async function loadStrategyWeekStart(params: {
  strategyId: string;
  clientId: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_content_strategies")
    .select("week_start")
    .eq("id", params.strategyId)
    .eq("client_id", params.clientId)
    .maybeSingle();

  if (error || !data || typeof (data as { week_start?: unknown }).week_start !== "string") {
    return null;
  }

  return (data as { week_start: string }).week_start;
}

export async function resolveRevisionPipelineContext(params: {
  approvalId: string;
  assembledReelId: string;
  clientId: string;
  round: number;
  changeRequest: ChangeRequestInput;
  revisionContext: RevisionContext;
  plan: RevisionRoutingPlan;
}): Promise<RevisionPipelineContext | null> {
  const assembly = await loadAssemblyJobScoped({
    jobId: params.assembledReelId,
    clientId: params.clientId,
  });
  if (!assembly) {
    return null;
  }

  const script = await loadReelScriptForQa({
    reelScriptId: assembly.reelScriptId,
    clientId: params.clientId,
  });
  if (!script) {
    return null;
  }

  const weekStart = await loadStrategyWeekStart({
    strategyId: script.strategyId,
    clientId: params.clientId,
  });
  if (!weekStart) {
    return null;
  }

  return {
    ...params,
    reelScriptId: script.id,
    strategyId: script.strategyId,
    slotIndex: script.slotIndex,
    weekStart,
  };
}

/**
 * Enqueue a single revision pipeline step.
 * media-pipeline-engineer: extend assembly / branding / video_job / tts branches.
 */
export async function enqueueRevisionPipelineStep(
  ctx: RevisionPipelineContext,
  step: RevisionPipelineStep,
): Promise<void> {
  switch (step) {
    case "script_regen": {
      const result = await generateReelScriptsForClient({
        clientId: ctx.clientId,
        weekStart: ctx.weekStart,
        strategyId: ctx.strategyId,
        invokedBy: "revision",
        mode: "slot",
        slotIndex: ctx.slotIndex,
        revisionContext: ctx.revisionContext,
      });
      if (!result.ok) {
        console.error("[approvals] revision script_regen failed", {
          approvalId: ctx.approvalId,
          round: ctx.round,
          code: result.error.code,
        });
        return;
      }
      await continueRevisionPipelineAfterStep(ctx, "script_regen");
      return;
    }
    case "caption_regen": {
      const result = await generateReelCaptionsForClient({
        clientId: ctx.clientId,
        weekStart: ctx.weekStart,
        strategyId: ctx.strategyId,
        invokedBy: "revision",
        mode: "slot",
        slotIndex: ctx.slotIndex,
        revisionContext: ctx.revisionContext,
      });
      if (!result.ok) {
        console.error("[approvals] revision caption_regen failed", {
          approvalId: ctx.approvalId,
          round: ctx.round,
          code: result.error.code,
        });
      }
      return;
    }
    case "qa_rerun": {
      const result = await runQaForAssembledReelForClient({
        assembledReelId: ctx.assembledReelId,
        clientId: ctx.clientId,
        invokedBy: "revision",
        operatorClientId: ctx.clientId,
      });
      if (!result.ok) {
        console.error("[approvals] revision qa_rerun failed", {
          approvalId: ctx.approvalId,
          round: ctx.round,
          code: result.error.code,
        });
      }
      return;
    }
    case "assembly": {
      const result = await createAssemblyJobForClientTrusted({
        clientId: ctx.clientId,
        reelScriptId: ctx.reelScriptId,
        invokedBy: "revision",
      });
      if (!result.ok) {
        console.error("[approvals] revision assembly failed", {
          approvalId: ctx.approvalId,
          round: ctx.round,
          code: result.error.code,
        });
      }
      return;
    }
    case "branding": {
      const result = await createBrandingJobForAssembly({
        assemblyJobId: ctx.assembledReelId,
        source: "revision",
        clientId: ctx.clientId,
      });
      if (!result.ok) {
        console.error("[approvals] revision branding failed", {
          approvalId: ctx.approvalId,
          round: ctx.round,
          code: result.error.code,
        });
      }
      return;
    }
    case "video_job": {
      const jobs = await getVideoJobsForReelScripts({
        clientId: ctx.clientId,
        reelScriptIds: [ctx.reelScriptId],
      });
      const prior = jobs[ctx.reelScriptId];
      if (!prior) {
        await continueRevisionPipelineAfterStep(ctx, "video_job");
        return;
      }
      const result = await createTalkingHeadVideoJob(
        { clientId: ctx.clientId, reelScriptId: ctx.reelScriptId },
        {
          operatorClientId: ctx.clientId,
          jobKind: "talking_head_generate",
        },
      );
      if (!result.ok) {
        console.error("[approvals] revision video_job failed", {
          approvalId: ctx.approvalId,
          round: ctx.round,
          code: result.error.code,
        });
      }
      return;
    }
    case "tts": {
      const result = await synthesizeVoiceoverForClientTrusted({
        clientId: ctx.clientId,
        reelScriptId: ctx.reelScriptId,
        invokedBy: "revision",
      });
      if (!result.ok) {
        console.error("[approvals] revision tts failed", {
          approvalId: ctx.approvalId,
          round: ctx.round,
          code: result.error.code,
        });
        return;
      }
      await continueRevisionPipelineAfterStep(ctx, "tts");
      return;
    }
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

async function loadLatestAssembledReelIdForScript(params: {
  clientId: string;
  reelScriptId: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_assembled_reels")
    .select("id")
    .eq("client_id", params.clientId)
    .eq("reel_script_id", params.reelScriptId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || typeof (data as { id?: unknown }).id !== "string") {
    return null;
  }

  return (data as { id: string }).id;
}

async function resolveRevisionPipelineContextFromScript(params: {
  reelScriptId: string;
  clientId: string;
}): Promise<RevisionPipelineContext | null> {
  const assembledReelId = await loadLatestAssembledReelIdForScript(params);
  if (!assembledReelId) {
    return null;
  }

  const active = await loadActiveRevisionForAssembledReel({
    assembledReelId,
    clientId: params.clientId,
  });
  if (!active) {
    return null;
  }

  const roundEntry = findClientRevisionRound(
    active.changeRequests,
    active.round,
  );
  if (!roundEntry) {
    return null;
  }

  const revisionContext = buildRevisionContext({
    approvalId: active.id,
    round: active.round,
    changeRequest: {
      tags: roundEntry.tags,
      notesByTag: roundEntry.notesByTag,
      summary: roundEntry.summary,
    },
  });

  return resolveRevisionPipelineContext({
    approvalId: active.id,
    assembledReelId,
    clientId: params.clientId,
    round: active.round,
    changeRequest: {
      tags: roundEntry.tags,
      notesByTag: roundEntry.notesByTag,
      summary: roundEntry.summary,
    },
    revisionContext,
    plan: active.routingPlan,
  });
}

/** Continue revision pipeline after a completed step (sync or async hook). */
export async function continueRevisionPipelineAfterStep(
  ctxOrParams:
    | RevisionPipelineContext
    | {
        reelScriptId: string;
        clientId: string;
        completedStep: RevisionPipelineStep;
      },
  completedStep?: RevisionPipelineStep,
): Promise<void> {
  let ctx: RevisionPipelineContext | null;
  let step: RevisionPipelineStep;

  if ("approvalId" in ctxOrParams) {
    ctx = ctxOrParams;
    step = completedStep!;
  } else {
    step = ctxOrParams.completedStep;
    ctx = await resolveRevisionPipelineContextFromScript({
      reelScriptId: ctxOrParams.reelScriptId,
      clientId: ctxOrParams.clientId,
    });
  }

  if (!ctx) {
    return;
  }

  const remaining = getRemainingRevisionStepsAfter(ctx.plan, step);
  const next = remaining[0];
  if (!next) {
    return;
  }

  await enqueueRevisionPipelineStep(ctx, next);
}

/** Resolve active revision context for an assembled reel (completion hooks). */
export async function resolveActiveRevisionPipelineContext(params: {
  assembledReelId: string;
  clientId: string;
}): Promise<RevisionPipelineContext | null> {
  const active = await loadActiveRevisionForAssembledReel(params);
  if (!active) {
    return null;
  }

  const roundEntry = findClientRevisionRound(
    active.changeRequests,
    active.round,
  );
  if (!roundEntry) {
    return null;
  }

  const changeRequest: ChangeRequestInput = {
    tags: roundEntry.tags,
    notesByTag: roundEntry.notesByTag,
    summary: roundEntry.summary,
  };

  const revisionContext = buildRevisionContext({
    approvalId: active.id,
    round: active.round,
    changeRequest,
  });

  return resolveRevisionPipelineContext({
    approvalId: active.id,
    assembledReelId: params.assembledReelId,
    clientId: params.clientId,
    round: active.round,
    changeRequest,
    revisionContext,
    plan: active.routingPlan,
  });
}

/** First step in plan — media-pipeline chains subsequent steps on job completion. */
export function getFirstRevisionPipelineStep(
  plan: RevisionRoutingPlan,
): RevisionPipelineStep {
  return plan.steps[0]!;
}

/** Remaining steps after a completed step (for completion-hook chaining). */
export function getRemainingRevisionStepsAfter(
  plan: RevisionRoutingPlan,
  completedStep: RevisionPipelineStep,
): RevisionPipelineStep[] {
  const index = plan.steps.indexOf(completedStep);
  if (index < 0) {
    return [];
  }
  return plan.steps.slice(index + 1);
}
