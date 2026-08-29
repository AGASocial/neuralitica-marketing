import "server-only";

import type { InterviewDashboardSummary } from "@/lib/contracts/interview";

/**
 * US-1.2 — RSC helper for the dashboard interview card.
 *
 * Thin compile stub until BE lands the SELECT-only implementation
 * (`requireActive("page")`, no get-or-create, no answers in the payload).
 * Returning `null` maps to the Start CTA (safe empty / not-started).
 */
export async function getInterviewDashboardSummary(): Promise<InterviewDashboardSummary> {
  return null;
}
