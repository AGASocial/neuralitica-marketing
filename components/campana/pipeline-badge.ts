import type { CampanaReelBadge } from "@/components/campana/ReelCard";
import type { CalendarPipelineStatus } from "@/lib/contracts/calendar";

/**
 * Display-only mapping from calendar pipeline status to Campaña reel badge.
 * published→published, approved→scheduled, pending/qa→review,
 * generating→rendering, draft→draft.
 */
export function mapPipelineStatusToReelBadge(
  status: CalendarPipelineStatus,
): CampanaReelBadge {
  switch (status) {
    case "published":
      return "published";
    case "approved":
      return "scheduled";
    case "pending":
    case "qa":
      return "review";
    case "generating":
      return "rendering";
    case "draft":
    default:
      return "draft";
  }
}

/** Tailwind classes per badge (mirrors ReelCard badge colors). */
export const CAMPANA_BADGE_CLASS: Record<CampanaReelBadge, string> = {
  published: "bg-butter text-deep",
  scheduled: "bg-fog text-deep",
  review: "bg-rose text-deep",
  rendering: "bg-panel text-butter border border-butter/40",
  draft: "bg-panel text-dim border border-edge",
  planned: "bg-deep text-dim border border-edge",
};
