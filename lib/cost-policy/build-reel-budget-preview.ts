import "server-only";

import type { ContentStrategySlot } from "@/lib/contracts/content-strategy";
import {
  reelBudgetBatchPreviewSchema,
  reelBudgetPreviewSchema,
  remainingBudgetCents,
  wouldExceedBudget,
  type ReelBudgetBatchPreview,
  type ReelBudgetPreview,
} from "@/lib/contracts/cost-policy";
import { getApprovedStrategyForWeek } from "@/lib/content-strategy/load-approved-strategy-for-week";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { listReelScriptsForStrategy } from "@/lib/reel-scripts/persist-reel-script";

import {
  estimateLlmJobCost,
  llmVariantForJobKind,
} from "./estimate-llm-job-cost";
import { loadCostPolicyForClientFresh } from "./get-cost-policy-for-client";
import { resolveProjectionHintKey } from "./resolve-projection-hint";
import {
  budgetPreviewPlaceholderReelScriptId,
  resolveReelScriptBudgetContext,
} from "./resolve-reel-script-for-budget";
import { sumReelCumulativeCostCentsSafe } from "./assert-reel-budget-allows-spend";

type PreviewJobKind = "script_generate" | "caption_generate";

export type BuildReelBudgetPreviewInput = {
  clientId: string;
  weekStart: string;
  jobKind: PreviewJobKind;
  mode: "batch" | "slot";
  slotIndex?: number;
};

export type BuildReelBudgetPreviewResult =
  | { ok: true; preview: ReelBudgetPreview }
  | { ok: true; preview: ReelBudgetBatchPreview; isBatch: true }
  | {
      ok: false;
      code:
        | "COST_POLICY_UNAVAILABLE"
        | "PROVIDER_UNAVAILABLE"
        | "STRATEGY_NOT_APPROVED"
        | "SLOT_NOT_FOUND";
    };

function resolvePreviewJobKind(
  inputJobKind: PreviewJobKind,
  mode: "batch" | "slot",
  scriptExists: boolean,
) {
  if (inputJobKind === "script_generate") {
    return mode === "slot" && scriptExists
      ? ("script_regenerate" as const)
      : ("script_generate" as const);
  }
  return mode === "slot" && scriptExists
    ? ("caption_regenerate" as const)
    : ("caption_generate" as const);
}

async function buildPreviewForSlot(params: {
  clientId: string;
  strategyId: string;
  slot: ContentStrategySlot;
  inputJobKind: PreviewJobKind;
  mode: "batch" | "slot";
  scriptExists: boolean;
  hasBrollBeats: boolean;
  visualMode: "own_avatar" | "generic_avatar" | "faceless";
}): Promise<ReelBudgetPreview | null> {
  const policyResult = await loadCostPolicyForClientFresh(params.clientId);
  if (!policyResult.ok) {
    return null;
  }

  const jobKind = resolvePreviewJobKind(
    params.inputJobKind,
    params.mode,
    params.scriptExists,
  );
  const llmVariant = llmVariantForJobKind(jobKind);

  const estimateResult = await estimateLlmJobCost({
    clientId: params.clientId,
    providerTier: policyResult.policy.providerTier,
    llmVariant,
  });
  if (!estimateResult.ok) {
    return null;
  }

  const scriptContext = await resolveReelScriptBudgetContext({
    clientId: params.clientId,
    strategyId: params.strategyId,
    slotIndex: params.slot.slotIndex,
  });
  if (!scriptContext) {
    return null;
  }

  let cumulativeCostCents = 0;
  if (scriptContext.persisted) {
    const sum = await sumReelCumulativeCostCentsSafe(scriptContext.reelScriptId);
    if (sum === null) {
      return null;
    }
    cumulativeCostCents = sum;
  }

  const maxCostCents = policyResult.policy.maxCostCents;
  const estimatedCostCents = estimateResult.estimatedCostCents;
  const reelScriptId = scriptContext.persisted
    ? scriptContext.reelScriptId
    : budgetPreviewPlaceholderReelScriptId(params.strategyId, params.slot.slotIndex);

  const preview = {
    reelScriptId,
    slotIndex: params.slot.slotIndex,
    jobKind,
    estimatedCostCents,
    cumulativeCostCents,
    maxCostCents,
    remainingCents: remainingBudgetCents(maxCostCents, cumulativeCostCents),
    providerTier: policyResult.policy.providerTier,
    resolvedLlmProviderLabel: estimateResult.resolvedLlmProviderLabel,
    visualMode: params.visualMode,
    modalidad: params.slot.modalidad,
    projectionHintKey: resolveProjectionHintKey({
      visualMode: params.visualMode,
      modalidad: params.slot.modalidad,
      hasBrollBeats: params.hasBrollBeats,
    }),
    wouldExceed: wouldExceedBudget(
      cumulativeCostCents,
      estimatedCostCents,
      maxCostCents,
    ),
  };

  const parsed = reelBudgetPreviewSchema.safeParse(preview);
  return parsed.success ? parsed.data : null;
}

export async function buildReelBudgetPreview(
  input: BuildReelBudgetPreviewInput,
): Promise<BuildReelBudgetPreviewResult> {
  const approved = await getApprovedStrategyForWeek({
    clientId: input.clientId,
    weekStart: input.weekStart,
  });

  if (!approved || approved.status !== "approved") {
    return { ok: false, code: "STRATEGY_NOT_APPROVED" };
  }

  const profile = await getBusinessProfileForAgents(input.clientId);
  if (!profile.exists || profile.visualModeSummary === null) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }
  const visualMode = profile.visualModeSummary.visualMode;

  const scripts = await listReelScriptsForStrategy({
    clientId: input.clientId,
    strategyId: approved.id,
  });
  const scriptBySlot = new Map(scripts.map((s) => [s.slotIndex, s]));

  let targetSlots = approved.brief.slots;
  if (input.mode === "slot") {
    if (input.slotIndex === undefined) {
      return { ok: false, code: "SLOT_NOT_FOUND" };
    }
    const slot = approved.brief.slots.find((s) => s.slotIndex === input.slotIndex);
    if (!slot) {
      return { ok: false, code: "SLOT_NOT_FOUND" };
    }
    targetSlots = [slot];
  } else if (input.jobKind === "script_generate") {
    targetSlots = approved.brief.slots.filter((slot) => !scriptBySlot.has(slot.slotIndex));
  } else {
    targetSlots = approved.brief.slots.filter((slot) => scriptBySlot.has(slot.slotIndex));
  }

  if (targetSlots.length === 0) {
    return { ok: false, code: "SLOT_NOT_FOUND" };
  }

  const items: ReelBudgetPreview[] = [];

  for (const slot of targetSlots) {
    const script = scriptBySlot.get(slot.slotIndex);
    const hasBrollBeats =
      slot.modalidad === "faceless" ||
      (script !== undefined &&
        Array.isArray(script.package.brollBeats) &&
        script.package.brollBeats.length > 0);

    const item = await buildPreviewForSlot({
      clientId: input.clientId,
      strategyId: approved.id,
      slot,
      inputJobKind: input.jobKind,
      mode: input.mode,
      scriptExists: script !== undefined,
      hasBrollBeats,
      visualMode,
    });

    if (!item) {
      return { ok: false, code: "PROVIDER_UNAVAILABLE" };
    }

    items.push(item);
  }

  if (input.mode === "slot" && items.length === 1) {
    return { ok: true, preview: items[0]! };
  }

  const blockedSlotIndexes = items.filter((i) => i.wouldExceed).map((i) => i.slotIndex);
  const batchPreview = {
    weekStart: input.weekStart,
    jobKind: input.jobKind,
    items,
    wouldExceedAny: blockedSlotIndexes.length > 0,
    blockedSlotIndexes,
    aggregateEstimatedCostCents: items.reduce(
      (sum, item) => sum + item.estimatedCostCents,
      0,
    ),
  };

  const parsed = reelBudgetBatchPreviewSchema.safeParse(batchPreview);
  if (!parsed.success) {
    return { ok: false, code: "COST_POLICY_UNAVAILABLE" };
  }

  return { ok: true, preview: parsed.data, isBatch: true };
}
