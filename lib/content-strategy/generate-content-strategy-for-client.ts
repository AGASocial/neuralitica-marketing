import "server-only";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import {
  contentStrategyBriefSchema,
  type ContentStrategyInvoker,
  type GenerateContentStrategyResult,
} from "@/lib/contracts/content-strategy";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import { generateWeeklyContentStrategy } from "@/lib/agents/content/generate-weekly-strategy";
import {
  acquireGenerationInFlight,
  recordGenerationSuccess,
  releaseGenerationInFlight,
} from "@/lib/content-strategy/check-generation-rate-limit";
import {
  contentStrategyAgentOutputInvalidError,
  contentStrategyInternalError,
  contentStrategyProfileIncompleteError,
  contentStrategyProviderUnavailableError,
} from "@/lib/content-strategy/errors";
import {
  loadNextStrategyVersion,
} from "@/lib/content-strategy/load-latest-strategy-row";
import { persistStrategyDraft } from "@/lib/content-strategy/persist-strategy-draft";
import {
  allowlistViolationsToFields,
  validateBriefAgainstAllowlists,
} from "@/lib/contracts/content-strategy";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { getPlaybookForAgents } from "@/lib/playbook/get-playbook-for-agents";
import { getTrendSnapshotForWeek } from "@/lib/trend/get-trend-snapshot-for-week";
import { getDefaultCostPolicy } from "@/lib/providers/get-default-cost-policy";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import { resolveProvider } from "@/lib/providers/provider-adapters";
import { createSiliconFlowLlmAdapter } from "@/lib/providers/siliconflow-llm-adapter";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

export async function generateContentStrategyForClient(params: {
  clientId: string;
  weekStart: string;
  invokedBy: ContentStrategyInvoker;
}): Promise<GenerateContentStrategyResult> {
  const clientParsed = agentClientIdSchema.safeParse(params.clientId);
  const weekParsed = trendWeekStartSchema.safeParse(params.weekStart);
  if (!clientParsed.success || !weekParsed.success) {
    return contentStrategyInternalError();
  }

  const clientId = clientParsed.data;
  const weekStart = weekParsed.data;

  await acquireGenerationInFlight({ clientId, weekStart });

  try {
    const profile = await getBusinessProfileForAgents(clientId);
    if ("loadFailed" in profile && profile.loadFailed) {
      return contentStrategyInternalError();
    }
    if (!profile.exists) {
      return contentStrategyProfileIncompleteError();
    }
    if (profile.visualModeSummary === null) {
      return contentStrategyProfileIncompleteError();
    }

    const playbook = await getPlaybookForAgents();
    if ("loadFailed" in playbook && playbook.loadFailed) {
      return contentStrategyInternalError();
    }
    if (playbook.formats.length === 0) {
      return contentStrategyAgentOutputInvalidError({
        playbook: ["NO_ACTIVE_FORMATS"],
      });
    }

    const trend = await getTrendSnapshotForWeek(weekStart);

    const catalogResult = await getProviderCatalog();
    if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
      return contentStrategyInternalError();
    }

    const policyResult = await getDefaultCostPolicy();
    if ("loadFailed" in policyResult && policyResult.loadFailed) {
      return contentStrategyInternalError();
    }
    if (!policyResult.policy) {
      return contentStrategyInternalError();
    }

    let provider;
    try {
      provider = resolveProvider(catalogResult.providers, {
        assetRole: "llm",
        tier: policyResult.policy.providerTier,
        llmVariant: "default",
      });
    } catch {
      return contentStrategyProviderUnavailableError();
    }

    const llmAdapter = createSiliconFlowLlmAdapter(
      provider.key,
      provider.envKeyName,
    );
    if (!llmAdapter) {
      return contentStrategyProviderUnavailableError();
    }

    const fieldsRecord = profile.fields as Record<string, unknown>;
    const preferredLocale = fieldsRecord.preferredLocale;
    const locale =
      preferredLocale === "en" || preferredLocale === "es"
        ? preferredLocale
        : "es";

    let rawBrief: unknown;
    try {
      rawBrief = await generateWeeklyContentStrategy({
        profile,
        playbook,
        trend,
        weekStart,
        provider,
        llmAdapter,
        locale,
      });
    } catch (error) {
      console.error("[content-strategy] agent failed", {
        clientId,
        weekStart,
        providerKey: provider.key,
        code: error instanceof Error ? error.message : "unknown",
      });
      return contentStrategyAgentOutputInvalidError({
        brief: ["LLM_FAILED"],
      });
    }

    const briefParsed = contentStrategyBriefSchema.safeParse(rawBrief);
    if (!briefParsed.success) {
      return contentStrategyAgentOutputInvalidError(
        zodInterviewErrorToFieldErrors(briefParsed.error),
      );
    }

    const allowlistCtx = {
      playbookSlugs: new Set(playbook.formats.map((f) => f.slug)),
      trendSlugs: new Set(trend.entries.map((e) => e.slug)),
      allowedModalidades: new Set(profile.visualModeSummary.allowedModes),
    };
    const violations = validateBriefAgainstAllowlists(
      briefParsed.data,
      allowlistCtx,
    );
    if (violations.length > 0) {
      return contentStrategyAgentOutputInvalidError(
        allowlistViolationsToFields(violations),
      );
    }

    const version = await loadNextStrategyVersion({ clientId, weekStart });
    const persisted = await persistStrategyDraft({
      clientId,
      weekStart,
      version,
      brief: briefParsed.data,
    });

    if (!persisted.ok) {
      return contentStrategyInternalError();
    }

    await recordGenerationSuccess({ clientId, weekStart });

    console.info("[content-strategy] generated", {
      clientId,
      weekStart,
      version: persisted.version,
      providerKey: provider.key,
      invokedBy: params.invokedBy,
    });

    return {
      ok: true,
      strategyId: persisted.strategyId,
      clientId,
      weekStart,
      version: persisted.version,
      status: "draft",
      slotCount: briefParsed.data.slots.length,
    };
  } finally {
    await releaseGenerationInFlight({ clientId, weekStart });
  }
}
