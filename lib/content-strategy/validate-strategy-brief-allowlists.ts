import "server-only";

import {
  allowlistViolationsToFields,
  type ContentStrategyBrief,
  type ContentStrategyMutationError,
  validateBriefAgainstAllowlists,
} from "@/lib/contracts/content-strategy";
import { contentStrategyAgentOutputInvalidError } from "@/lib/content-strategy/errors";
import { getBusinessProfileForAgents } from "@/lib/profile/get-business-profile-for-agents";
import { getPlaybookForAgents } from "@/lib/playbook/get-playbook-for-agents";
import { getTrendSnapshotForWeek } from "@/lib/trend/get-trend-snapshot-for-week";

export async function validateStrategyBriefAllowlists(params: {
  brief: ContentStrategyBrief;
  clientId: string;
  weekStart: string;
}): Promise<ContentStrategyMutationError | null> {
  const profile = await getBusinessProfileForAgents(params.clientId);
  if ("loadFailed" in profile && profile.loadFailed) {
    return contentStrategyAgentOutputInvalidError({
      brief: ["PROFILE_LOAD_FAILED"],
    });
  }
  if (!profile.exists || profile.visualModeSummary === null) {
    return contentStrategyAgentOutputInvalidError({
      brief: ["PROFILE_INCOMPLETE"],
    });
  }

  const playbook = await getPlaybookForAgents();
  if ("loadFailed" in playbook && playbook.loadFailed) {
    return contentStrategyAgentOutputInvalidError({
      brief: ["PLAYBOOK_LOAD_FAILED"],
    });
  }

  const trend = await getTrendSnapshotForWeek(params.weekStart);

  const allowlistCtx = {
    playbookSlugs: new Set(playbook.formats.map((format) => format.slug)),
    trendSlugs: new Set(trend.entries.map((entry) => entry.slug)),
    allowedModalidades: new Set(profile.visualModeSummary.allowedModes),
  };

  const violations = validateBriefAgainstAllowlists(params.brief, allowlistCtx);
  if (violations.length > 0) {
    return contentStrategyAgentOutputInvalidError(
      allowlistViolationsToFields(violations),
    );
  }

  return null;
}
