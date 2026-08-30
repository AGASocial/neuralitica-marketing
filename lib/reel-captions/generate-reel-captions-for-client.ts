import "server-only";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import type { ContentStrategySlot } from "@/lib/contracts/content-strategy";
import {
  reelCaptionAgentOutputSchema,
  type GenerateReelCaptionsResult,
  type ReelCaptionInvoker,
  type RegenerateReelCaptionResult,
} from "@/lib/contracts/reel-caption";
import { buildReelCaptionRecord } from "@/lib/contracts/reel-caption";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import {
  generateReelCaptionForScript,
  type ReelCaptionSlotContext,
} from "@/lib/agents/content/generate-reel-caption";
import {
  acquireCaptionGenerationInFlight,
  recordCaptionGenerationSuccess,
  releaseCaptionGenerationInFlight,
  type CaptionInFlightScope,
} from "@/lib/reel-captions/check-caption-generation-rate-limit";
import {
  reelCaptionInternalError,
  reelCaptionOutputInvalidError,
  reelCaptionProfileIncompleteError,
  reelCaptionProviderUnavailableError,
  reelCaptionScriptNotFoundError,
  reelCaptionSlotNotFoundError,
  reelCaptionStrategyNotApprovedError,
  reelCaptionValidationError,
  reelCaptionBudgetExceededError,
  reelCaptionCostPolicyUnavailableError,
} from "@/lib/reel-captions/errors";
import { loadApprovedStrategyForScriptJob } from "@/lib/reel-scripts/load-approved-strategy-for-script-job";
import { listReelScriptsForStrategy } from "@/lib/reel-scripts/persist-reel-script";
import { loadReelScriptForCaptionJob } from "@/lib/reel-captions/load-reel-script-for-caption-job";
import { persistReelCaption } from "@/lib/reel-captions/persist-reel-caption";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { getCostPolicyForClient } from "@/lib/cost-policy/get-cost-policy-for-client";
import { assertReelBudgetAllowsSpend } from "@/lib/cost-policy/assert-reel-budget-allows-spend";
import { recordReelSpendEvent } from "@/lib/cost-policy/record-reel-spend-event";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import { resolveProvider } from "@/lib/providers/provider-adapters";
import { createSiliconFlowLlmAdapter } from "@/lib/providers/siliconflow-llm-adapter";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import type { BusinessProfileForAgentsView } from "@/lib/contracts/profile";

export type GenerateReelCaptionsForClientParams = {
  clientId: string;
  weekStart: string;
  strategyId: string;
  invokedBy: ReelCaptionInvoker;
  mode: "batch" | "slot";
  slotIndex?: number;
  operatorClientId?: string;
  budgetOverride?: true;
  overrideReason?: string;
};

function resolveLocale(profile: BusinessProfileForAgentsView): "en" | "es" {
  const raw = (profile.fields as Record<string, unknown>).preferredLocale;
  if (raw === "en" || raw === "es") {
    return raw;
  }
  return "es";
}

function buildSlotContext(
  slot: ContentStrategySlot,
  scriptPackage: ReelCaptionSlotContext["scriptPackage"],
  reelScriptId: string,
): ReelCaptionSlotContext {
  return {
    slot,
    scriptPackage,
    reelScriptId,
    slotIndex: slot.slotIndex,
  };
}

export async function generateReelCaptionsForClient(
  params: GenerateReelCaptionsForClientParams & { mode: "batch" },
): Promise<GenerateReelCaptionsResult>;
export async function generateReelCaptionsForClient(
  params: GenerateReelCaptionsForClientParams & {
    mode: "slot";
    slotIndex: number;
  },
): Promise<RegenerateReelCaptionResult>;
export async function generateReelCaptionsForClient(
  params: GenerateReelCaptionsForClientParams,
): Promise<GenerateReelCaptionsResult | RegenerateReelCaptionResult>;
export async function generateReelCaptionsForClient(
  params: GenerateReelCaptionsForClientParams,
): Promise<GenerateReelCaptionsResult | RegenerateReelCaptionResult> {
  const clientParsed = agentClientIdSchema.safeParse(params.clientId);
  const weekParsed = trendWeekStartSchema.safeParse(params.weekStart);
  if (!clientParsed.success || !weekParsed.success) {
    return reelCaptionValidationError(
      zodInterviewErrorToFieldErrors(
        !clientParsed.success ? clientParsed.error : weekParsed.error!,
      ),
    );
  }

  const clientId = clientParsed.data;
  const weekStart = weekParsed.data;
  const strategyId = params.strategyId;

  const inFlightScope: CaptionInFlightScope =
    params.mode === "batch"
      ? { mode: "batch", clientId, strategyId }
      : {
          mode: "slot",
          clientId,
          strategyId,
          slotIndex: params.slotIndex ?? 0,
        };

  await acquireCaptionGenerationInFlight(inFlightScope);

  try {
    const profile = await getBusinessProfileForAgents(clientId);
    if ("loadFailed" in profile && profile.loadFailed) {
      return reelCaptionInternalError();
    }
    if (!profile.exists) {
      return reelCaptionProfileIncompleteError();
    }

    const catalogResult = await getProviderCatalog();
    if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
      return reelCaptionInternalError();
    }

    const policyResult = await getCostPolicyForClient(clientId);
    if (!policyResult.ok) {
      return reelCaptionCostPolicyUnavailableError();
    }

    let provider;
    try {
      provider = resolveProvider(catalogResult.providers, {
        assetRole: "llm",
        tier: policyResult.policy.providerTier,
        llmVariant: "default",
      });
    } catch {
      return reelCaptionProviderUnavailableError();
    }

    const llmAdapter = createSiliconFlowLlmAdapter(
      provider.key,
      provider.envKeyName,
    );
    if (!llmAdapter) {
      return reelCaptionProviderUnavailableError();
    }

    const strategy = await loadApprovedStrategyForScriptJob({
      strategyId,
      clientId,
    });
    if (!strategy) {
      return reelCaptionStrategyNotApprovedError();
    }

    if (strategy.weekStart !== weekStart) {
      return reelCaptionValidationError({ weekStart: ["MISMATCH"] });
    }

    const scripts = await listReelScriptsForStrategy({ clientId, strategyId });
    const scriptBySlot = new Map(scripts.map((s) => [s.slotIndex, s]));

    let targetSlots: ContentStrategySlot[];
    if (params.mode === "batch") {
      targetSlots = strategy.brief.slots;
    } else {
      const slotIndex = params.slotIndex;
      if (slotIndex === undefined) {
        return reelCaptionValidationError({ slotIndex: ["REQUIRED"] });
      }
      const slot = strategy.brief.slots.find((s) => s.slotIndex === slotIndex);
      if (!slot) {
        return reelCaptionSlotNotFoundError();
      }
      targetSlots = [slot];
    }

    const locale = resolveLocale(profile);
    const spendJobKind =
      params.mode === "batch" ? ("caption_generate" as const) : ("caption_regenerate" as const);
    const operatorClientId = params.operatorClientId ?? clientId;
    const allowBudgetOverride =
      params.invokedBy === "operator" ? params.budgetOverride : undefined;
    const overrideReason =
      params.invokedBy === "operator" ? params.overrideReason : undefined;

    type SlotGateOk = {
      estimatedCostCents: number;
      providerKey: string;
    };
    const gateBySlot = new Map<number, SlotGateOk>();

    const slotsNeedingGate = targetSlots.filter((slot) => {
      const scriptRow = scriptBySlot.get(slot.slotIndex);
      return scriptRow !== undefined;
    });

    if (params.mode === "batch") {
      for (const slot of slotsNeedingGate) {
        const scriptRow = scriptBySlot.get(slot.slotIndex)!;
        const gateResult = await assertReelBudgetAllowsSpend({
          clientId,
          reelScriptId: scriptRow.id,
          reelScriptPersisted: true,
          jobKind: spendJobKind,
          operatorClientId,
          budgetOverride: allowBudgetOverride,
          overrideReason,
        });

        if (!gateResult.ok) {
          if (gateResult.code === "VALIDATION_ERROR") {
            return reelCaptionValidationError(gateResult.fields ?? {});
          }
          if (gateResult.code === "BUDGET_EXCEEDED") {
            return reelCaptionBudgetExceededError({
              blockedSlotIndexes: [slot.slotIndex],
            });
          }
          if (gateResult.code === "PROVIDER_UNAVAILABLE") {
            return reelCaptionProviderUnavailableError();
          }
          return reelCaptionCostPolicyUnavailableError();
        }

        gateBySlot.set(slot.slotIndex, {
          estimatedCostCents: gateResult.estimatedCostCents,
          providerKey: gateResult.providerKey,
        });
      }
    }

    const captionIds: string[] = [];
    const skipped: Array<{ slotIndex: number; code: "SCRIPT_PENDING" }> = [];
    const errors: Array<{
      slotIndex: number;
      code: "CAPTION_OUTPUT_INVALID";
      fields?: Record<string, string[]>;
    }> = [];

    for (const slot of targetSlots) {
      const scriptRow = scriptBySlot.get(slot.slotIndex);
      if (!scriptRow) {
        if (params.mode === "batch") {
          skipped.push({ slotIndex: slot.slotIndex, code: "SCRIPT_PENDING" });
          continue;
        }
        return reelCaptionScriptNotFoundError();
      }

      const verified = await loadReelScriptForCaptionJob({
        reelScriptId: scriptRow.id,
        clientId,
      });
      if (!verified) {
        if (params.mode === "batch") {
          skipped.push({ slotIndex: slot.slotIndex, code: "SCRIPT_PENDING" });
          continue;
        }
        return reelCaptionScriptNotFoundError();
      }

      let gate: SlotGateOk;
      if (params.mode === "batch") {
        gate = gateBySlot.get(slot.slotIndex)!;
      } else {
        const gateResult = await assertReelBudgetAllowsSpend({
          clientId,
          reelScriptId: verified.reelScriptId,
          reelScriptPersisted: true,
          jobKind: spendJobKind,
          operatorClientId,
          budgetOverride: allowBudgetOverride,
          overrideReason,
        });

        if (!gateResult.ok) {
          if (gateResult.code === "VALIDATION_ERROR") {
            return reelCaptionValidationError(gateResult.fields ?? {});
          }
          if (gateResult.code === "BUDGET_EXCEEDED") {
            return reelCaptionBudgetExceededError({
              blockedSlotIndexes: [slot.slotIndex],
            });
          }
          if (gateResult.code === "PROVIDER_UNAVAILABLE") {
            return reelCaptionProviderUnavailableError();
          }
          return reelCaptionCostPolicyUnavailableError();
        }

        gate = {
          estimatedCostCents: gateResult.estimatedCostCents,
          providerKey: gateResult.providerKey,
        };
      }

      const slotContext = buildSlotContext(
        slot,
        verified.package,
        verified.reelScriptId,
      );

      let rawOutput: unknown;
      try {
        rawOutput = await generateReelCaptionForScript({
          profile,
          slotContext,
          provider,
          llmAdapter,
          locale,
        });
      } catch (error) {
        console.error("[reel-captions] agent failed", {
          clientId,
          strategyId,
          slotIndex: slot.slotIndex,
          reelScriptId: verified.reelScriptId,
          providerKey: provider.key,
          code: error instanceof Error ? error.message : "unknown",
        });
        if (params.mode === "slot") {
          return reelCaptionOutputInvalidError({
            slotIndex: [String(slot.slotIndex)],
            brief: ["LLM_FAILED"],
          });
        }
        errors.push({
          slotIndex: slot.slotIndex,
          code: "CAPTION_OUTPUT_INVALID",
          fields: { brief: ["LLM_FAILED"] },
        });
        continue;
      }

      const agentParsed = reelCaptionAgentOutputSchema.safeParse(rawOutput);
      if (!agentParsed.success) {
        const fields = zodInterviewErrorToFieldErrors(agentParsed.error);
        if (params.mode === "slot") {
          return reelCaptionOutputInvalidError(fields);
        }
        errors.push({
          slotIndex: slot.slotIndex,
          code: "CAPTION_OUTPUT_INVALID",
          fields,
        });
        continue;
      }

      let record;
      try {
        record = buildReelCaptionRecord(agentParsed.data);
      } catch {
        if (params.mode === "slot") {
          return reelCaptionOutputInvalidError({ caption: ["INVALID"] });
        }
        errors.push({
          slotIndex: slot.slotIndex,
          code: "CAPTION_OUTPUT_INVALID",
          fields: { caption: ["INVALID"] },
        });
        continue;
      }

      const persisted = await persistReelCaption({
        clientId,
        reelScriptId: verified.reelScriptId,
        record,
      });

      if (!persisted.ok) {
        if (params.mode === "slot") {
          return reelCaptionInternalError();
        }
        errors.push({
          slotIndex: slot.slotIndex,
          code: "CAPTION_OUTPUT_INVALID",
          fields: { persist: ["FAILED"] },
        });
        continue;
      }

      captionIds.push(persisted.captionId);

      await recordReelSpendEvent({
        clientId,
        reelScriptId: verified.reelScriptId,
        assetRole: "llm",
        jobKind: spendJobKind,
        estimatedCostCents: gate.estimatedCostCents,
        operatorClientId,
        providerKey: gate.providerKey,
      });

      if (params.mode === "slot") {
        await recordCaptionGenerationSuccess(inFlightScope);
        console.info("[reel-captions] generated slot", {
          clientId,
          strategyId,
          weekStart,
          slotIndex: slot.slotIndex,
          reelScriptId: verified.reelScriptId,
          providerKey: provider.key,
          invokedBy: params.invokedBy,
        });
        return {
          ok: true,
          strategyId,
          weekStart,
          slotIndex: slot.slotIndex,
          reelScriptId: verified.reelScriptId,
          captionId: persisted.captionId,
        };
      }
    }

    await recordCaptionGenerationSuccess(inFlightScope);

    console.info("[reel-captions] generated batch", {
      clientId,
      strategyId,
      weekStart,
      processedCount: captionIds.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      providerKey: provider.key,
      invokedBy: params.invokedBy,
    });

    return {
      ok: true,
      strategyId,
      weekStart,
      processedCount: captionIds.length,
      captionIds,
      skipped,
      errors,
    };
  } finally {
    await releaseCaptionGenerationInFlight(inFlightScope);
  }
}
