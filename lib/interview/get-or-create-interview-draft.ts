import "server-only";

import type { InterviewDraftView } from "@/lib/contracts/interview";
import { requireActive } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { toInterviewDraftView } from "@/lib/interview/merge-answers";
import { isUniqueViolation } from "@/lib/interview/postgres-errors";

type SessionSelectRow = {
  current_step: unknown;
  answers: unknown;
  status: unknown;
};

async function selectOwnSession(
  clientId: string,
): Promise<SessionSelectRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .select("current_step, answers, status")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    console.error("[interview] load select failed", { code: error.code });
    throw new Error("Interview draft unavailable");
  }

  return data;
}

/**
 * RSC get-or-create for the current Cliente's Entrevista draft.
 * Identity from requireActive("page") only. Never returns session `id`.
 */
export async function getOrCreateInterviewDraft(): Promise<InterviewDraftView> {
  const user = await requireActive("page");

  if (!isSupabaseConfigured()) {
    console.error("[interview] load unavailable: Supabase not configured");
    throw new Error("Interview draft unavailable");
  }

  const existing = await selectOwnSession(user.id);
  if (existing) {
    return toInterviewDraftView(existing);
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .insert({
      client_id: user.id,
      status: "draft",
      current_step: "services",
      answers: {},
    })
    .select("current_step, answers, status")
    .maybeSingle();

  if (error && isUniqueViolation(error)) {
    const raced = await selectOwnSession(user.id);
    if (!raced) {
      console.error("[interview] load unique race missing row");
      throw new Error("Interview draft unavailable");
    }
    return toInterviewDraftView(raced);
  }

  if (error || !data) {
    console.error("[interview] load insert failed", {
      ...(error?.code ? { code: error.code } : {}),
    });
    throw new Error("Interview draft unavailable");
  }

  return toInterviewDraftView(data);
}
