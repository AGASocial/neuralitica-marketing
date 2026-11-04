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
  /** KAN-108: automatic decisions (Piloto automático / custom rules). */
  automation?: Array<{
    id: string;
    approvalId: string | null;
    kind: "auto_approved" | "auto_approve_skipped";
    at: string;
    title?: string | null;
    reason?: string | null;
  }>;
};

const MAX_TIMELINE = 8;

export function buildHoyTimeline(source: HoyTimelineSource): HoyTimelineEntry[] {
  const entries: HoyTimelineEntry[] = [];

  const autoApprovedIds = new Set<string>();
  for (const event of source.automation ?? []) {
    if (event.kind === "auto_approved") {
      if (event.approvalId) autoApprovedIds.add(event.approvalId);
      entries.push({
        id: `auto-${event.id}`,
        kind: "auto_approved",
        at: event.at,
        messageKey: "autoApproved",
        params: { title: event.title?.trim() || "" },
      });
    } else {
      entries.push({
        id: `auto-skip-${event.id}`,
        kind: "auto_approve_skipped",
        at: event.at,
        messageKey: "autoApproveSkipped",
        params: { title: event.title?.trim() || "", reason: event.reason ?? "" },
      });
    }
  }

  for (const item of source.approved
    .filter((a) => !autoApprovedIds.has(a.approvalId))
    .slice(0, 5)) {
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
