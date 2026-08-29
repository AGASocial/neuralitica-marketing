import "server-only";

import type { ProfileStubSummary } from "@/lib/contracts/interview";
import { getBusinessProfileForClient } from "@/lib/profile/get-business-profile-for-client";

/**
 * Thin existence adapter for dashboard / legacy stub callers (US-2.1).
 * Maps getBusinessProfileForClient — no second SELECT with weaker scoping.
 * Identity from requireActive("page") inside the full helper only.
 * Returns null on soft loadFailed (page should show safe empty CTA).
 */
export async function getProfileStubSummary(): Promise<ProfileStubSummary | null> {
  const result = await getBusinessProfileForClient();

  if (result.exists === false) {
    if ("loadFailed" in result && result.loadFailed) {
      return null;
    }
    return { exists: false, version: null };
  }

  return {
    exists: true,
    version: result.version ?? null,
  };
}
