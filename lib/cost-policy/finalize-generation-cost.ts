import "server-only";

import type { ActualCostUnavailableReason } from "@/lib/contracts/actual-cost";
import {
  finalizeGenerationCostInputSchema,
  type FinalizeGenerationCostInput,
  type FinalizeGenerationCostResult,
} from "@/lib/contracts/actual-cost";
import { computeLlmActualCost } from "@/lib/cost-policy/compute-llm-actual-cost";
import { recordReelSpendEvent } from "@/lib/cost-policy/record-reel-spend-event";
import { updateReelSpendEventActual } from "@/lib/cost-policy/update-reel-spend-event-actual";

export async function finalizeGenerationCost(
  input: FinalizeGenerationCostInput,
): Promise<FinalizeGenerationCostResult> {
  const parsed = finalizeGenerationCostInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }

  const value = parsed.data;

  if (value.mode === "sync_insert") {
    let actualCostCents: number | null = null;
    let actualCostUnavailableReason: ActualCostUnavailableReason | null = null;

    if (value.manualActualCostCents === 0) {
      actualCostCents = 0;
    } else if (value.assetRole === "llm") {
      if (!value.llmUsage) {
        return { ok: false, code: "VALIDATION_ERROR" };
      }

      const computed = await computeLlmActualCost({
        providerKey: value.providerKey,
        inputTokens: value.llmUsage.inputTokens,
        outputTokens: value.llmUsage.outputTokens,
        adapterReportedCents: value.llmUsage.adapterReportedCents,
      });

      if (computed.ok) {
        actualCostCents = computed.actualCostCents;
      } else {
        actualCostUnavailableReason = computed.reason;
      }
    }

    const { spendEventId } = await recordReelSpendEvent({
      clientId: value.clientId,
      reelScriptId: value.reelScriptId,
      assetRole: value.assetRole,
      jobKind: value.jobKind,
      estimatedCostCents: value.estimatedCostCents,
      actualCostCents,
      actualCostUnavailableReason,
      durationSec: value.durationSec ?? null,
      operatorClientId: value.operatorClientId,
      providerKey: value.providerKey,
    });

    return { ok: true, spendEventId };
  }

  const updateResult = await updateReelSpendEventActual({
    spendEventId: value.spendEventId,
    clientId: value.clientId,
    reelScriptId: value.reelScriptId,
    actualCostCents: value.actualCostCents,
    actualCostUnavailableReason: value.actualCostUnavailableReason,
    durationSec: value.durationSec ?? null,
  });

  if (!updateResult.ok) {
    return { ok: false, code: updateResult.code };
  }

  return { ok: true, spendEventId: updateResult.spendEventId };
}
