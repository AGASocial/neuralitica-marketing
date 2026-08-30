import "server-only";

/**
 * QA orchestration for branded assembled reels (US-10.1).
 * Closed write surface for neuramark_qa_reports — server-only.
 */

import type {
  QaCheckResult,
  QaInvoker,
  RunQaForAssembledReelResult,
} from "@/lib/contracts/qa-report";
import {
  deriveQaReportStatus,
  runQaForAssembledReelInputSchema,
} from "@/lib/contracts/qa-report";
import { loadAssemblyJobScoped } from "@/lib/assembly/load-assembly-job";
import { assertReelBudgetAllowsEstimatedSpend } from "@/lib/cost-policy/assert-reel-budget-allows-estimated-spend";
import { finalizeGenerationCost } from "@/lib/cost-policy/finalize-generation-cost";
import { findForbiddenQaRunKeys } from "@/lib/qa/find-forbidden-qa-run-keys";
import {
  checkQaRunRateLimit,
  isQaInFlightActive,
  recordQaRunAttempt,
} from "@/lib/qa/check-qa-run-rate-limit";
import {
  qaAssemblyNotReadyError,
  qaBrandingRequiredError,
  qaBudgetExceededError,
  qaCaptionRequiredError,
  qaCostPolicyUnavailableError,
  qaForbiddenFieldsError,
  qaInternalError,
  qaNotFoundError,
  qaOutputInvalidError,
  qaProviderUnavailableError,
  qaRateLimitedError,
  qaScriptNotFoundError,
  qaValidationError,
} from "@/lib/qa/errors";
import { loadReelScriptForQa } from "@/lib/qa/load-reel-script-for-qa";
import { mergeQaChecks } from "@/lib/qa/merge-qa-checks";
import {
  loadQaReportForAssembledReel,
  upsertQaReportRunning,
  upsertQaReportTerminal,
} from "@/lib/qa/persist-qa-report";
import { runDeterministicQaChecks } from "@/lib/qa/run-deterministic-qa-checks";
import { getReelCaptionByScriptId } from "@/lib/reel-captions/persist-reel-caption";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";
import { getProviderCatalog } from "@/lib/providers/get-provider-catalog";
import {
  resolveCatalogRowForDecision,
  resolveProviderForJob,
} from "@/lib/providers/resolve-provider-for-job";
import { createSiliconFlowLlmAdapter } from "@/lib/providers/siliconflow-llm-adapter";
import {
  isAiDisclosureRequired,
  runReelQaAgent,
} from "@/lib/agents/content/run-reel-qa";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

export type RunQaForAssembledReelForClientParams = {
  assembledReelId: string;
  clientId: string;
  invokedBy: QaInvoker;
  operatorClientId?: string;
};

export async function runQaForAssembledReelForClient(
  params: RunQaForAssembledReelForClientParams,
): Promise<RunQaForAssembledReelResult> {
  const rawPointer = { assembledReelId: params.assembledReelId };
  if (findForbiddenQaRunKeys(rawPointer).length > 0) {
    return qaForbiddenFieldsError();
  }

  const parsed = runQaForAssembledReelInputSchema.safeParse(rawPointer);
  if (!parsed.success) {
    return qaValidationError(zodInterviewErrorToFieldErrors(parsed.error));
  }

  const { assembledReelId } = parsed.data;
  const clientId = params.clientId;
  const operatorClientId = params.operatorClientId ?? clientId;

  const rateCheck = await checkQaRunRateLimit({ clientId });
  if (!rateCheck.ok) {
    return qaRateLimitedError();
  }

  const assembly = await loadAssemblyJobScoped({
    jobId: assembledReelId,
    clientId,
  });
  if (!assembly) {
    return qaNotFoundError();
  }

  if (assembly.status !== "completed") {
    return qaAssemblyNotReadyError();
  }
  if (assembly.brandingStatus !== "completed") {
    return qaBrandingRequiredError();
  }

  const existing = await loadQaReportForAssembledReel({
    assembledReelId,
    clientId,
  });
  if (
    existing &&
    (existing.status === "running" || existing.status === "pending") &&
    isQaInFlightActive(existing.updatedAt)
  ) {
    return {
      ok: true,
      assembledReelId,
      qaReportId: existing.id,
      status: existing.status,
      checks: existing.checks,
      idempotent: true,
    };
  }

  const script = await loadReelScriptForQa({
    reelScriptId: assembly.reelScriptId,
    clientId,
  });
  if (!script) {
    return qaScriptNotFoundError();
  }

  const caption = await getReelCaptionByScriptId({
    clientId,
    reelScriptId: script.id,
  });
  if (!caption) {
    return qaCaptionRequiredError();
  }

  const runningRow = await upsertQaReportRunning({
    assembledReelId,
    clientId,
  });
  if (!runningRow) {
    return qaInternalError();
  }

  await recordQaRunAttempt({ clientId });

  const consentActive =
    script.modalidad === "own_avatar"
      ? await hasActiveAvatarConsent(clientId)
      : false;

  const deterministic = runDeterministicQaChecks({
    modalidad: script.modalidad,
    consentActive,
    mustDiscloseNotOwner: script.mustDiscloseNotOwner,
    scriptPackage: script.package,
    selectedCtaIndex: caption.selectedCtaIndex,
    ctaVariants: caption.record.ctaVariants,
  });

  const usedTts = assembly.voiceoverAssetId != null;
  const aiDisclosureSkipped = !isAiDisclosureRequired({
    modalidad: script.modalidad,
    mustDiscloseNotOwner: script.mustDiscloseNotOwner,
    usedTts,
  });

  const persistNonPass = async (
    checks: QaCheckResult[],
  ): Promise<{
    qaReportId: string;
    status: "failed" | "blocked";
    checks: QaCheckResult[];
  } | null> => {
    const derived = deriveQaReportStatus(checks);
    const terminal: "failed" | "blocked" =
      derived === "passed" ? "failed" : derived;
    const row = await upsertQaReportTerminal({
      assembledReelId,
      clientId,
      checks,
      status: terminal,
    });
    if (!row) return null;
    return { qaReportId: row.id, status: terminal, checks: row.checks };
  };

  const catalogResult = await getProviderCatalog();
  if ("loadFailed" in catalogResult && catalogResult.loadFailed) {
    await persistNonPass(deterministic);
    return qaInternalError();
  }

  const llmDecisionResult = await resolveProviderForJob({
    clientId,
    assetRole: "llm",
    llmVariant: "default",
  });
  if (!llmDecisionResult.ok) {
    await persistNonPass(deterministic);
    return qaProviderUnavailableError();
  }

  const provider = resolveCatalogRowForDecision(
    catalogResult.providers,
    llmDecisionResult.decision.providerKey,
  );
  if (!provider) {
    await persistNonPass(deterministic);
    return qaProviderUnavailableError();
  }

  const llmAdapter = createSiliconFlowLlmAdapter(
    provider.key,
    provider.envKeyName,
  );
  if (!llmAdapter) {
    await persistNonPass(deterministic);
    return qaProviderUnavailableError();
  }

  const estimate = await llmAdapter.estimateCost({
    clientId,
    providerKey: provider.key,
    locale: "es",
    systemPrompt: "",
    userPrompt: "",
  });

  const budgetResult = await assertReelBudgetAllowsEstimatedSpend({
    clientId,
    reelScriptId: script.id,
    estimatedCostCents: estimate.estimatedCostCents,
    operatorClientId,
  });

  if (!budgetResult.ok) {
    await persistNonPass(deterministic);
    if (budgetResult.code === "BUDGET_EXCEEDED") {
      return qaBudgetExceededError();
    }
    return qaCostPolicyUnavailableError();
  }

  const agentResult = await runReelQaAgent({
    context: {
      clientId,
      assembledReelId,
      reelScriptId: script.id,
      modalidad: script.modalidad,
      mustDiscloseNotOwner: script.mustDiscloseNotOwner,
      scriptPackage: script.package,
      caption: caption.record,
      selectedCtaIndex: caption.selectedCtaIndex,
      usedTts,
      aiDisclosureSkipped,
    },
    llmAdapter,
    providerKey: provider.key,
    locale: "es",
  });

  if (!agentResult.ok) {
    const checks = mergeQaChecks({
      deterministic,
      llmChecks: null,
      aiDisclosureSkipped,
    });
    const persisted = await persistNonPass(checks);
    if (!persisted) {
      return qaInternalError();
    }
    if (agentResult.code === "QA_OUTPUT_INVALID") {
      return qaOutputInvalidError();
    }
    return qaProviderUnavailableError();
  }

  const checks = mergeQaChecks({
    deterministic,
    llmChecks: agentResult.checks,
    aiDisclosureSkipped,
  });
  const status = deriveQaReportStatus(checks);

  const terminalRow = await upsertQaReportTerminal({
    assembledReelId,
    clientId,
    checks,
    status,
  });
  if (!terminalRow) {
    return qaInternalError();
  }

  await finalizeGenerationCost({
    mode: "sync_insert",
    clientId,
    reelScriptId: script.id,
    assetRole: "llm",
    jobKind: "qa_run",
    estimatedCostCents: estimate.estimatedCostCents,
    operatorClientId,
    providerKey: provider.key,
    llmUsage: {
      inputTokens: agentResult.llmUsage.inputTokens,
      outputTokens: agentResult.llmUsage.outputTokens,
      adapterReportedCents: agentResult.llmUsage.adapterReportedCents,
    },
  });

  return {
    ok: true,
    assembledReelId,
    qaReportId: terminalRow.id,
    status: terminalRow.status as "passed" | "failed" | "blocked",
    checks: terminalRow.checks,
  };
}
