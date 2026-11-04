/**
 * Pure owner-home snapshot helpers (KAN-98) — unit-testable without Supabase.
 */
import type {
  OwnerHomeCampaignProgress,
  OwnerHomeNextAction,
  OwnerHomeNextStepKey,
  OwnerHomeTrafficLight,
  OwnerHomeWeekCounts,
} from "@/lib/contracts/owner-home-dashboard";

export type OwnerHomeProgressInput = {
  interviewDone: boolean;
  planDone: boolean;
  scriptsDone: boolean;
  videosDone: boolean;
  approveDone: boolean;
  readyDone: boolean;
};

export function resolveOwnerHomeNextStepKey(
  input: OwnerHomeProgressInput,
): OwnerHomeNextStepKey {
  if (!input.interviewDone) return "interview";
  if (!input.planDone) return "plan";
  if (!input.scriptsDone) return "scripts";
  if (!input.videosDone) return "videos";
  if (!input.approveDone) return "approve";
  return "ready";
}

export function buildOwnerHomeNextAction(
  stepKey: OwnerHomeNextStepKey,
): OwnerHomeNextAction {
  switch (stepKey) {
    case "interview":
      return {
        stepKey,
        titleKey: "nextAction.interview.title",
        bodyKey: "nextAction.interview.body",
        ctaKey: "nextAction.interview.cta",
        ctaKind: "href",
        href: "/interview",
      };
    case "plan":
      return {
        stepKey,
        titleKey: "nextAction.plan.title",
        bodyKey: "nextAction.plan.body",
        ctaKey: "nextAction.plan.cta",
        ctaKind: "open_chat",
      };
    case "scripts":
      return {
        stepKey,
        titleKey: "nextAction.scripts.title",
        bodyKey: "nextAction.scripts.body",
        ctaKey: "nextAction.scripts.cta",
        ctaKind: "open_chat",
      };
    case "videos":
      return {
        stepKey,
        titleKey: "nextAction.videos.title",
        bodyKey: "nextAction.videos.body",
        ctaKey: "nextAction.videos.cta",
        ctaKind: "open_chat",
      };
    case "approve":
      return {
        stepKey,
        titleKey: "nextAction.approve.title",
        bodyKey: "nextAction.approve.body",
        ctaKey: "nextAction.approve.cta",
        ctaKind: "href",
        href: "/approvals",
      };
    case "ready":
      return {
        stepKey,
        titleKey: "nextAction.ready.title",
        bodyKey: "nextAction.ready.body",
        ctaKey: "nextAction.ready.cta",
        ctaKind: "href",
        href: "/ready-to-publish",
      };
  }
}

export function computeOwnerHomeWeekCounts(input: {
  scheduled: number;
  published: number;
  waitingForOk: number;
  inProduction: number;
}): OwnerHomeWeekCounts {
  return {
    scheduled: Math.max(0, Math.floor(input.scheduled)),
    published: Math.max(0, Math.floor(input.published)),
    waitingForOk: Math.max(0, Math.floor(input.waitingForOk)),
    inProduction: Math.max(0, Math.floor(input.inProduction)),
  };
}

export function computeOwnerHomeTrafficLight(
  counts: OwnerHomeWeekCounts,
): OwnerHomeTrafficLight {
  if (counts.waitingForOk > 0) return "yellow";
  if (counts.inProduction > 0) return "yellow";
  if (counts.published > 0 && counts.waitingForOk === 0) return "green";
  if (counts.scheduled === 0 && counts.published === 0) return "neutral";
  return "green";
}

export function computeOwnerHomeCampaignProgress(input: {
  slotTotal: number;
  completed: number;
  hasPlan: boolean;
}): OwnerHomeCampaignProgress {
  const total = Math.max(0, Math.floor(input.slotTotal));
  const completed = Math.min(total, Math.max(0, Math.floor(input.completed)));
  return {
    completed,
    total,
    hasPlan: input.hasPlan,
  };
}

/** Instagram Graph insights are not stored — always empty for KAN-98. */
export function ownerHomeInsightsAvailable(): false {
  return false;
}
