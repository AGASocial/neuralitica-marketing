"use server";

import { revalidatePath } from "next/cache";

import {
  submitInterviewInputSchema,
  type InterviewAnswers,
  type SubmitInterviewInput,
  type SubmitInterviewResult,
} from "@/lib/contracts/interview";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  mapAnswersToProfileFields,
  validateInterviewCompleteness,
} from "@/lib/interview/completeness";
import {
  interviewForbiddenError,
  interviewForbiddenFieldsError,
  interviewInternalError,
  interviewNotFoundError,
  interviewUnauthenticatedError,
  interviewValidationError,
} from "@/lib/interview/errors";
import {
  buildSubmitSuccess,
  decideSubmitSessionPath,
  findForbiddenInterviewKeys,
  mayMarkInterviewCompleted,
  stripSubmitInterviewInput,
} from "@/lib/interview/merge-answers";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";
import {
  completeInterviewWithProfile,
  markInterviewCompleted,
  selectOwnProfileVersion,
  upsertBusinessProfile,
} from "@/lib/profile/upsert-from-interview";

type SessionSubmitRow = {
  id: unknown;
  status: unknown;
  answers: unknown;
};

function authGuardEnvelope(
  error: { status: 401 | 403 },
): SubmitInterviewResult {
  if (error.status === 401) {
    return interviewUnauthenticatedError();
  }
  return interviewForbiddenError();
}

async function selectOwnSessionForSubmit(
  clientId: string,
): Promise<SessionSubmitRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .select("id, status, answers")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    console.error("[interview] submit select failed", { code: error.code });
    throw new Error("Interview submit unavailable");
  }

  return data;
}

/**
 * Already-completed path: soft success when profile exists.
 * Missing profile → recovery upsert only if stored answers still complete.
 */
async function handleAlreadyCompleted(params: {
  clientId: string;
  sessionId: string;
  answers: InterviewAnswers;
}): Promise<SubmitInterviewResult> {
  const existingVersion = await selectOwnProfileVersion(params.clientId);
  if (existingVersion != null) {
    return buildSubmitSuccess({
      alreadyCompleted: true,
      version: existingVersion,
    });
  }

  const completeness = validateInterviewCompleteness(params.answers);
  if (!completeness.ok) {
    console.error(
      "[interview] completed session missing profile and incomplete",
    );
    return interviewInternalError();
  }

  const fields = mapAnswersToProfileFields(completeness.fields);
  const result = await completeInterviewWithProfile({
    clientId: params.clientId,
    sessionId: params.sessionId,
    fields,
  });

  return buildSubmitSuccess({
    alreadyCompleted: true,
    version: result.version,
  });
}

/** Profile-first then status — only if mayMarkInterviewCompleted(true). */
async function completeFailClosedTwoStep(params: {
  clientId: string;
  sessionId: string;
  fields: ReturnType<typeof mapAnswersToProfileFields>;
}): Promise<{ version: number; alreadyCompleted: boolean }> {
  const version = await upsertBusinessProfile({
    clientId: params.clientId,
    sessionId: params.sessionId,
    fields: params.fields,
  });

  if (!mayMarkInterviewCompleted(true)) {
    throw new Error("Interview submit ordering violated");
  }

  const marked = await markInterviewCompleted({
    clientId: params.clientId,
    sessionId: params.sessionId,
  });
  if (!marked) {
    throw new Error("Interview submit status update failed");
  }

  return { version, alreadyCompleted: false };
}

async function submitInterviewInner(
  rawInput: unknown,
): Promise<SubmitInterviewResult> {
  let user;
  try {
    user = await requireActive("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenInterviewKeys(rawInput).length > 0) {
    return interviewForbiddenFieldsError();
  }

  const stripped = stripSubmitInterviewInput(rawInput);
  const parsed = submitInterviewInputSchema.safeParse(stripped);
  if (!parsed.success) {
    return interviewValidationError(
      zodInterviewErrorToFieldErrors(parsed.error),
    );
  }

  if (!isSupabaseConfigured()) {
    console.error("[interview] submit unavailable: Supabase not configured");
    return interviewInternalError();
  }

  const sessionRow = await selectOwnSessionForSubmit(user.id);
  const path = decideSubmitSessionPath(
    sessionRow
      ? {
          id: String(sessionRow.id),
          status: String(sessionRow.status),
          answers: sessionRow.answers,
        }
      : null,
  );

  if (path.kind === "not_found") {
    return interviewNotFoundError();
  }

  if (path.kind === "already_completed") {
    const result = await handleAlreadyCompleted({
      clientId: user.id,
      sessionId: path.sessionId,
      answers: path.answers,
    });
    if (result.ok) {
      revalidatePath("/interview");
      revalidatePath("/dashboard");
      revalidatePath("/profile");
    }
    return result;
  }

  const completeness = validateInterviewCompleteness(path.answers);
  if (!completeness.ok) {
    return interviewValidationError(completeness.fieldErrors);
  }

  const fields = mapAnswersToProfileFields(completeness.fields);

  let outcome: { version: number; alreadyCompleted: boolean };
  try {
    outcome = await completeInterviewWithProfile({
      clientId: user.id,
      sessionId: path.sessionId,
      fields,
    });
  } catch {
    try {
      outcome = await completeFailClosedTwoStep({
        clientId: user.id,
        sessionId: path.sessionId,
        fields,
      });
    } catch {
      return interviewInternalError();
    }
  }

  revalidatePath("/interview");
  revalidatePath("/dashboard");
  revalidatePath("/profile");

  return buildSubmitSuccess({
    alreadyCompleted: outcome.alreadyCompleted,
    version: outcome.version,
  });
}

/**
 * Submit complete Entrevista → upsert Ficha viva → mark completed (fail-closed).
 * Frontend consumer: wizard Submit CTA. Prefer empty / omitted body.
 * Completeness and profile map use **DB** answers for getCurrentUser only.
 */
export async function submitInterview(
  input?: SubmitInterviewInput,
): Promise<SubmitInterviewResult> {
  try {
    return await submitInterviewInner(input ?? {});
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    console.error("[interview] submit unexpected error");
    return interviewInternalError();
  }
}
