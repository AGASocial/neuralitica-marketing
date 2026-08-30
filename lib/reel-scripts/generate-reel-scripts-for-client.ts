import "server-only";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import type { ContentStrategySlot } from "@/lib/contracts/content-strategy";
import type { PlaybookForAgentsResult } from "@/lib/contracts/playbook";
import type { TrendSnapshotForWeekResult } from "@/lib/contracts/trend";
import {
  reelScriptPackageSchema,
  type GenerateReelScriptsResult,
  type ReelScriptInvoker,
  type RegenerateReelScriptSlotResult,
} from "@/lib/contracts/reel-script";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import {
  generateReelScriptForSlot,
  type ReelScriptSlotContext,
} from "@/lib/agents/content/generate-reel-script";
import {
  acquireScriptGenerationInFlight,
  recordScriptGenerationSuccess,
  releaseScriptGenerationInFlight,
  type ScriptInFlightScope,
} from "@/lib/reel-scripts/check-script-generation-rate-limit";
import {
  reelScriptInternalError,
  reelScriptOutputInvalidError,
  reelScriptProfileIncompleteError,
  reelScriptProviderUnavailableError,
  reelScriptSlotNotFoundError,
  reelScriptStrategyNotApprovedError,
  reelScriptValidationError,
} from "@/lib/reel-scripts/errors";
import { loadApprovedStrategyForScriptJob } from "@/lib/reel-scripts/load-approved-strategy-for-script-job";
import { persistReelScript } from "@/lib/reel-scripts/persist-reel-script";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { getPlaybookForAgents } from "@/lib/playbook/get-playbook-for-agents";
import { getTrendSnapshotForWeek } from "@/lib/trend/get-trend-snapshot-for-week";
import { getDefaultCostPolicy } from "@/lib/providers/get-default-cost-policy";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import { resolveProvider } from "@/lib/providers/provider-adapters";
import { createSiliconFlowLlmAdapter } from "@/lib/providers/siliconflow-llm-adapter";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import type { BusinessProfileForAgentsView } from "@/lib/contracts/profile";

export type GenerateReelScriptsForClientParams = {
  clientId: string;
  weekStart: string;
  strategyId: string;
  invokedBy: ReelScriptInvoker;
  mode: "batch" | "slot";
  slotIndex?: number;
};

function buildSlotContext(
  slot: ContentStrategySlot,
  profile: BusinessProfileForAgentsView,
  playbook: PlaybookForAgentsResult,
  trend: TrendSnapshotForWeekResult,
): ReelScriptSlotContext {
  const formato =
    "formats" in playbook
      ? playbook.formats.find((f) => f.slug === slot.formatoPlaybookSlug)
      : undefined;

  const tactica = slot.tacticaTendenciaSlug
    ? trend.entries.find((e) => e.slug === slot.tacticaTendenciaSlug)
    : undefined;

  const mustDiscloseForSlot =
    slot.modalidad === "generic_avatar" &&
    profile.visualModeSummary?.mustDiscloseNotOwner === true;

  return {
    slot,
    modalidad: slot.modalidad,
    mustDiscloseForSlot,
    formatoHints: {
      guionHints: formato?.guionHints.join("\n") ?? "",
      editingHints: formato?.editingHints?.join("\n") ?? "",
      duracionIdealSeg: formato?.duracionIdealSeg ?? null,
      ctaTipo: formato?.ctaTipo ?? null,
    },
    tacticaHints: tactica
      ? {
          guionHints: tactica.guionHints.join("\n"),
          editingHints: tactica.editingHints?.join("\n") ?? "",
        }
      : null,
  };
}

function resolveLocale(profile: BusinessProfileForAgentsView): "en" | "es" {
  const raw = (profile.fields as Record<string, unknown>).preferredLocale;
  if (raw === "en" || raw === "es") {
    return raw;
  }
  return "es";
}

export async function generateReelScriptsForClient(
  params: GenerateReelScriptsForClientParams & { mode: "batch" },
): Promise<GenerateReelScriptsResult>;
export async function generateReelScriptsForClient(
  params: GenerateReelScriptsForClientParams & {
    mode: "slot";
    slotIndex: number;
  },
): Promise<RegenerateReelScriptSlotResult>;
export async function generateReelScriptsForClient(
  params: GenerateReelScriptsForClientParams,
): Promise<GenerateReelScriptsResult | RegenerateReelScriptSlotResult>;
export async function generateReelScriptsForClient(
  params: GenerateReelScriptsForClientParams,
): Promise<GenerateReelScriptsResult | RegenerateReelScriptSlotResult> {
  const clientParsed = agentClientIdSchema.safeParse(params.clientId);
  const weekParsed = trendWeekStartSchema.safeParse(params.weekStart);
  if (!clientParsed.success || !weekParsed.success) {
    return reelScriptValidationError(
      zodInterviewErrorToFieldErrors(
        !clientParsed.success ? clientParsed.error : weekParsed.error!,
      ),
    );
  }

  const clientId = clientParsed.data;
  const weekStart = weekParsed.data;
  const strategyId = params.strategyId;

  const inFlightScope: ScriptInFlightScope =
    params.mode === "batch"
      ? { mode: "batch", clientId, strategyId }
      : {
          mode: "slot",
          clientId,
          strategyId,
          slotIndex: params.slotIndex ?? 0,
        };

  await acquireScriptGenerationInFlight(inFlightScope);

  try {
    const profile = await getBusinessProfileForAgents(clientId);
    if ("loadFailed" in profile && profile.loadFailed) {
      return reelScriptInternalError();
    }
    if (!profile.exists || profile.visualModeSummary === null) {
      return reelScriptProfileIncompleteError();
    }

    const playbook = await getPlaybookForAgents();
    if ("loadFailed" in playbook && playbook.loadFailed) {
      return reelScriptInternalError();
    }
    if (playbook.formats.length === 0) {
      return reelScriptInternalError();
    }

    const trend = await getTrendSnapshotForWeek(weekStart);

    const catalogResult = await getProviderCatalog();
    if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
      return reelScriptInternalError();
    }

    const policyResult = await getDefaultCostPolicy();
    if ("loadFailed" in policyResult && policyResult.loadFailed) {
      return reelScriptInternalError();
    }
    if (!policyResult.policy) {
      return reelScriptInternalError();
    }

    let provider;
    try {
      provider = resolveProvider(catalogResult.providers, {
        assetRole: "llm",
        tier: policyResult.policy.providerTier,
        llmVariant: "fallback",
      });
    } catch {
      return reelScriptProviderUnavailableError();
    }

    const llmAdapter = createSiliconFlowLlmAdapter(
      provider.key,
      provider.envKeyName,
    );
    if (!llmAdapter) {
      return reelScriptProviderUnavailableError();
    }

    const strategy = await loadApprovedStrategyForScriptJob({
      strategyId,
      clientId,
    });
    if (!strategy) {
      return reelScriptStrategyNotApprovedError();
    }

    if (strategy.weekStart !== weekStart) {
      return reelScriptValidationError({ weekStart: ["MISMATCH"] });
    }

    let slots: ContentStrategySlot[];
    if (params.mode === "batch") {
      slots = strategy.brief.slots;
    } else {
      const slotIndex = params.slotIndex;
      if (slotIndex === undefined) {
        return reelScriptValidationError({ slotIndex: ["REQUIRED"] });
      }
      const slot = strategy.brief.slots.find((s) => s.slotIndex === slotIndex);
      if (!slot) {
        return reelScriptSlotNotFoundError();
      }
      slots = [slot];
    }

    const locale = resolveLocale(profile);
    const generatedPackages: Array<{
      slot: ContentStrategySlot;
      package: ReturnType<typeof reelScriptPackageSchema.parse>;
      mustDiscloseNotOwner: boolean;
    }> = [];

    for (const slot of slots) {
      const slotContext = buildSlotContext(slot, profile, playbook, trend);

      let rawOutput: unknown;
      try {
        rawOutput = await generateReelScriptForSlot({
          profile,
          slotContext,
          provider,
          llmAdapter,
          locale,
        });
      } catch (error) {
        console.error("[reel-scripts] agent failed", {
          clientId,
          strategyId,
          slotIndex: slot.slotIndex,
          providerKey: provider.key,
          code: error instanceof Error ? error.message : "unknown",
        });
        return reelScriptOutputInvalidError({
          slotIndex: [String(slot.slotIndex)],
          brief: ["LLM_FAILED"],
        });
      }

      const packageParsed = reelScriptPackageSchema.safeParse(rawOutput);
      if (!packageParsed.success) {
        return reelScriptOutputInvalidError({
          slotIndex: [String(slot.slotIndex)],
          ...zodInterviewErrorToFieldErrors(packageParsed.error),
        });
      }

      generatedPackages.push({
        slot,
        package: packageParsed.data,
        mustDiscloseNotOwner: slotContext.mustDiscloseForSlot,
      });
    }

    const scriptIds: string[] = [];
    for (const item of generatedPackages) {
      const persisted = await persistReelScript({
        clientId,
        strategyId,
        slotIndex: item.slot.slotIndex,
        modalidad: item.slot.modalidad,
        mustDiscloseNotOwner: item.mustDiscloseNotOwner,
        package: item.package,
      });

      if (!persisted.ok) {
        return reelScriptInternalError();
      }
      scriptIds.push(persisted.scriptId);
    }

    await recordScriptGenerationSuccess(inFlightScope);

    console.info("[reel-scripts] generated", {
      clientId,
      strategyId,
      weekStart,
      mode: params.mode,
      slotCount: scriptIds.length,
      providerKey: provider.key,
      invokedBy: params.invokedBy,
    });

    if (params.mode === "slot") {
      return {
        ok: true,
        strategyId,
        weekStart,
        slotIndex: params.slotIndex!,
        scriptId: scriptIds[0]!,
      };
    }

    return {
      ok: true,
      strategyId,
      weekStart,
      slotCount: scriptIds.length,
      scriptIds,
    };
  } finally {
    await releaseScriptGenerationInFlight(inFlightScope);
  }
}
