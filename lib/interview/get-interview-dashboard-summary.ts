import "server-only";

import type { InterviewDashboardSummary } from "@/lib/contracts/interview";
import { requireActive } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { summarizeInterviewSessionRow } from "@/lib/interview/merge-answers";

/**
 * RSC SELECT-only summary for the dashboard interview card.
 * Identity from requireActive("page") only — no client/session id params.
 * Never get-or-creates. Never returns answers, id, or client_id.
 */
export async function getInterviewDashboardSummary(): Promise<InterviewDashboardSummary> {
  const user = await requireActive("page");

  if (!isSupabaseConfigured()) {
    console.error(
      "[interview] dashboard summary unavailable: Supabase not configured",
    );
    throw new Error("Interview dashboard summary unavailable");
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .select("current_step, answers, status")
    .eq("client_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[interview] dashboard summary select failed", {
      code: error.code,
    });
    throw new Error("Interview dashboard summary unavailable");
  }

  return summarizeInterviewSessionRow(data);
}
