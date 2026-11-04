import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import { listPendingApprovalsForClientUser } from "@/lib/approvals/list-get-approvals";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import { loadSetupCompletion } from "@/lib/dashboard/load-setup-completion";
import { getTranslations } from "@/lib/i18n/get-translations";
import type { Locale } from "@/lib/i18n/locales";
import { resolveOrchestratorWeekStart } from "@/lib/orchestrator-chat/week";
import { buildReelScriptListForStrategy } from "@/lib/reel-scripts/list-reel-scripts-for-week";
import {
  selectSuggestedPromptChips,
  type SuggestedPromptChip,
  type SuggestedPromptLabels,
} from "@/lib/orchestrator-chat/select-suggested-prompt-chips";

function labelsFromCatalog(locale: Locale): SuggestedPromptLabels {
  const t = getTranslations(locale).orchestratorChat.suggestedPrompts;
  return {
    whatCanYouDo: t.whatCanYouDo,
    finishSetup: t.finishSetup,
    showPendingApprovals: t.showPendingApprovals,
    makeWeeklyPlan: t.makeWeeklyPlan,
    howIsCampaign: t.howIsCampaign,
    writeScripts: t.writeScripts,
  };
}

export async function loadSuggestedPromptSignals(params: {
  user: CurrentUser;
}): Promise<{
  percentComplete: number;
  pendingApprovalsCount: number;
  hasApprovedPlan: boolean;
  scriptsMissing: boolean;
}> {
  const weekStart = resolveOrchestratorWeekStart(undefined);

  let percentComplete = 0;
  try {
    const completion = await loadSetupCompletion({ user: params.user });
    percentComplete = completion.percentComplete;
  } catch {
    percentComplete = 0;
  }

  let pendingApprovalsCount = 0;
  try {
    const pending = await listPendingApprovalsForClientUser({
      user: params.user,
    });
    if (pending.ok) {
      pendingApprovalsCount = pending.items.length;
    }
  } catch {
    pendingApprovalsCount = 0;
  }

  let hasApprovedPlan = false;
  let scriptsMissing = false;
  try {
    const row = await loadLatestStrategyRowWithApproval({
      clientId: params.user.id,
      weekStart,
    });
    if (row?.status === "approved") {
      hasApprovedPlan = true;
      const { items } = await buildReelScriptListForStrategy({
        clientId: params.user.id,
        weekStart,
        strategyId: row.id,
        version: row.version,
        brief: row.brief,
      });
      const ready = items.filter((i) => i.status === "generated").length;
      const pending = items.filter((i) => i.status === "pending").length;
      scriptsMissing = ready === 0 || pending > 0;
    }
  } catch {
    hasApprovedPlan = false;
    scriptsMissing = false;
  }

  return {
    percentComplete,
    pendingApprovalsCount,
    hasApprovedPlan,
    scriptsMissing,
  };
}

export async function loadSuggestedPromptChips(params: {
  user: CurrentUser;
  locale: Locale;
  includeWhatCanYouDo?: boolean;
}): Promise<SuggestedPromptChip[]> {
  const signals = await loadSuggestedPromptSignals({ user: params.user });
  return selectSuggestedPromptChips(signals, labelsFromCatalog(params.locale), {
    includeWhatCanYouDo: params.includeWhatCanYouDo,
  });
}

export { labelsFromCatalog };
