import "server-only";

import type { ChangeRequestInput } from "@/lib/contracts/approval-revision";
import type { RegenerateReelScriptSlotResult } from "@/lib/contracts/reel-script";
import { buildRevisionContext } from "@/lib/approvals/build-revision-context";
import { generateReelScriptsForClient } from "@/lib/reel-scripts/generate-reel-scripts-for-client";

/** Params for server-only revision router — not Cliente-callable. */
export type RegenerateReelScriptForRevisionParams = {
  clientId: string;
  weekStart: string;
  strategyId: string;
  slotIndex: number;
  approvalId: string;
  round: number;
  changeRequest: ChangeRequestInput;
};

/**
 * US-11.2 script_regen step — invoked only from routeApprovalChangeRequest.
 */
export async function regenerateReelScriptForRevision(
  params: RegenerateReelScriptForRevisionParams,
): Promise<RegenerateReelScriptSlotResult> {
  const revisionContext = buildRevisionContext({
    approvalId: params.approvalId,
    round: params.round,
    changeRequest: params.changeRequest,
  });

  return generateReelScriptsForClient({
    clientId: params.clientId,
    weekStart: params.weekStart,
    strategyId: params.strategyId,
    invokedBy: "revision",
    mode: "slot",
    slotIndex: params.slotIndex,
    revisionContext,
  });
}
