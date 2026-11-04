import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import { listApprovedApprovalsForClient } from "@/lib/approvals/persist-approval";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import { shouldEnterOptionAOnboarding } from "@/lib/dashboard/compute-setup-completion";
import { loadSetupCompletion } from "@/lib/dashboard/load-setup-completion";
import { resolveOrchestratorWeekStart } from "@/lib/orchestrator-chat/week";

export async function loadShouldEnterOptionAOnboarding(params: {
  user: CurrentUser;
}): Promise<boolean> {
  if (params.user.role !== "client") {
    return false;
  }

  const completion = await loadSetupCompletion({ user: params.user });
  const weekStart = resolveOrchestratorWeekStart(undefined);

  let hasApprovedPlan = false;
  try {
    const row = await loadLatestStrategyRowWithApproval({
      clientId: params.user.id,
      weekStart,
    });
    hasApprovedPlan = row?.status === "approved";
  } catch {
    hasApprovedPlan = false;
  }

  let hasApprovedReel = false;
  try {
    const rows = await listApprovedApprovalsForClient({
      clientId: params.user.id,
    });
    hasApprovedReel = rows.length > 0;
  } catch {
    hasApprovedReel = false;
  }

  return shouldEnterOptionAOnboarding({
    role: params.user.role,
    percentComplete: completion.percentComplete,
    hasApprovedPlan,
    hasApprovedReel,
  });
}
