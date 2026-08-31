import "server-only";

import type { ChangeRequestInput } from "@/lib/contracts/approval-revision";
import type { RegenerateReelCaptionResult } from "@/lib/contracts/reel-caption";
import { buildRevisionContext } from "@/lib/approvals/build-revision-context";
import { generateReelCaptionsForClient } from "@/lib/reel-captions/generate-reel-captions-for-client";

/** Params for server-only revision router — not Cliente-callable. */
export type RegenerateReelCaptionForRevisionParams = {
  clientId: string;
  weekStart: string;
  strategyId: string;
  slotIndex: number;
  approvalId: string;
  round: number;
  changeRequest: ChangeRequestInput;
};

/**
 * US-11.2 caption_regen step — invoked only from routeApprovalChangeRequest.
 */
export async function regenerateReelCaptionForRevision(
  params: RegenerateReelCaptionForRevisionParams,
): Promise<RegenerateReelCaptionResult> {
  const revisionContext = buildRevisionContext({
    approvalId: params.approvalId,
    round: params.round,
    changeRequest: params.changeRequest,
  });

  return generateReelCaptionsForClient({
    clientId: params.clientId,
    weekStart: params.weekStart,
    strategyId: params.strategyId,
    invokedBy: "revision",
    mode: "slot",
    slotIndex: params.slotIndex,
    revisionContext,
  });
}
