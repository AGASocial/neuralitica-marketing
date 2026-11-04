/**
 * Pure timeline builder for Hoy “What I did” (agent first-person keys).
 */

import type { HoyTimelineEntry } from "@/lib/contracts/hoy-feed";

export type HoyTimelineSource = {
  approved: Array<{
    approvalId: string;
    decidedAt: string;
    title?: string;
  }>;
  inProductionCount: number;
  inProductionUpdatedAt?: string;
  planApprovedAt?: string | null;
  generatedVideoCount?: number;
  generatedAt?: string | null;
};

const MAX_TIMELINE = 8;

export function buildHoyTimeline(source: HoyTimelineSource): HoyTimelineEntry[] {
  const entries: HoyTimelineEntry[] = [];

  for (const item of source.approved.slice(0, 5)) {
    entries.push({
      id: `approved-${item.approvalId}`,
      kind: "published_or_approved",
      at: item.decidedAt,
      messageKey: "approvedVideo",
      params: { title: item.title?.trim() || "" },
    });
  }

  if (source.planApprovedAt) {
    entries.push({
      id: `plan-${source.planApprovedAt}`,
      kind: "plan_approved",
      at: source.planApprovedAt,
      messageKey: "planApproved",
      params: {},
    });
  }

  if (
    typeof source.generatedVideoCount === "number" &&
    source.generatedVideoCount > 0 &&
    source.generatedAt
  ) {
    entries.push({
      id: `generated-${source.generatedAt}`,
      kind: "generated_videos",
      at: source.generatedAt,
      messageKey: "generatedVideos",
      params: { count: String(source.generatedVideoCount) },
    });
  }

  if (source.inProductionCount > 0 && source.inProductionUpdatedAt) {
    entries.push({
      id: `jobs-${source.inProductionUpdatedAt}`,
      kind: "job_progress",
      at: source.inProductionUpdatedAt,
      messageKey: "workingOnVideos",
      params: { count: String(source.inProductionCount) },
    });
  }

  return entries
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, MAX_TIMELINE);
}
