import "server-only";

import type { CurrentUser } from "@/lib/auth/get-current-user-types";
import type { SetupCompletionDto } from "@/lib/contracts/setup-completion";
import { loadLatestStrategyRowWithApproval } from "@/lib/content-strategy/load-latest-strategy-row-with-approval";
import {
  computeSetupCompletion,
  isInstagramConnectedInProduct,
} from "@/lib/dashboard/compute-setup-completion";
import { getInterviewDashboardSummary } from "@/lib/interview/get-interview-dashboard-summary";
import { resolveOrchestratorWeekStart } from "@/lib/orchestrator-chat/week";
import { getBusinessProfileForClient } from "@/lib/profile/get-business-profile-for-client";
import { getAvatarForClientId } from "@/lib/avatars/get-avatar-for-client";
import { getVisualPreferencesForClient } from "@/lib/visual-preferences/get-visual-preferences-for-client";
import { hasActiveAvatarConsent } from "@/lib/visual-preferences/has-active-avatar-consent";

export async function loadSetupCompletion(params: {
  user: CurrentUser;
}): Promise<SetupCompletionDto> {
  const weekStart = resolveOrchestratorWeekStart(undefined);

  let businessProfileDone = false;
  let interviewDone = false;
  let visualPreferencesDone = false;
  let planApproved = false;
  let presenterDone = false;

  try {
    const profile = await getBusinessProfileForClient();
    businessProfileDone = profile.exists === true;
  } catch {
    businessProfileDone = false;
  }

  try {
    const summary = await getInterviewDashboardSummary();
    interviewDone = summary?.status === "completed";
  } catch {
    interviewDone = false;
  }

  try {
    const prefs = await getVisualPreferencesForClient();
    visualPreferencesDone = prefs.exists === true;
  } catch {
    visualPreferencesDone = false;
  }

  try {
    const row = await loadLatestStrategyRowWithApproval({
      clientId: params.user.id,
      weekStart,
    });
    planApproved = row?.status === "approved";
  } catch {
    planApproved = false;
  }

  try {
    const [consentActive, avatar] = await Promise.all([
      hasActiveAvatarConsent(params.user.id),
      getAvatarForClientId(params.user.id),
    ]);
    presenterDone = consentActive && avatar.exists === true;
  } catch {
    presenterDone = false;
  }

  return computeSetupCompletion({
    businessProfileDone,
    interviewDone,
    visualPreferencesDone,
    instagramConnected: isInstagramConnectedInProduct(),
    planApproved,
    presenterDone,
  });
}
