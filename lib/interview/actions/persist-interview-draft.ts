"use server";

import { revalidatePath } from "next/cache";

import {
  interviewAnswersStoredSchema,
  persistInterviewDraftInputSchema,
  type PersistInterviewDraftInput,
  type PersistInterviewDraftResult,
} from "@/lib/contracts/interview";
import { isAuthGuardError, requireActive } from "@/lib/auth/require-user";
import {
  createServerSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import {
  interviewConflictError,
  interviewForbiddenError,
  interviewForbiddenFieldsError,
  interviewInternalError,
  interviewPayloadTooLargeError,
  interviewUnauthenticatedError,
  interviewValidationError,
} from "@/lib/interview/errors";
import {
  decideDraftWrite,
  decideUniqueRaceWrite,
  isAnswersPayloadTooLarge,
  mergeInterviewAnswers,
  parseSessionRow,
  resumeCursorAfterSave,
  stripInterviewIdentityKeys,
  findForbiddenInterviewKeys,
  toInterviewDraftView,
} from "@/lib/interview/merge-answers";
import { isCheckViolation, isUniqueViolation } from "@/lib/interview/postgres-errors";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

type SessionSelectRow = {
  current_step: unknown;
  answers: unknown;
  status: unknown;
};

function authGuardEnvelope(
  error: { status: 401 | 403 },
): PersistInterviewDraftResult {
  if (error.status === 401) {
    return interviewUnauthenticatedError();
  }
  return interviewForbiddenError();
}

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
    console.error("[interview] persist select failed", { code: error.code });
    throw new Error("Interview persist unavailable");
  }

  return data;
}

async function updateDraft(params: {
  clientId: string;
  answers: ReturnType<typeof mergeInterviewAnswers>;
  currentStep: ReturnType<typeof resumeCursorAfterSave>;
}): Promise<SessionSelectRow | "conflict"> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .update({
      answers: params.answers,
      current_step: params.currentStep,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", params.clientId)
    .eq("status", "draft")
    .select("current_step, answers, status")
    .maybeSingle();

  if (error) {
    if (isCheckViolation(error)) {
      console.error("[interview] persist check failed", { code: error.code });
      throw Object.assign(new Error("answers size check"), { code: "23514" });
    }
    console.error("[interview] persist update failed", { code: error.code });
    throw new Error("Interview persist unavailable");
  }

  if (!data) {
    return "conflict";
  }

  return data;
}

async function insertDraft(params: {
  clientId: string;
  answers: ReturnType<typeof mergeInterviewAnswers>;
  currentStep: ReturnType<typeof resumeCursorAfterSave>;
}): Promise<SessionSelectRow | "conflict" | "retry-update"> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("neuramark_interview_sessions")
    .insert({
      client_id: params.clientId,
      status: "draft",
      current_step: params.currentStep,
      answers: params.answers,
    })
    .select("current_step, answers, status")
    .maybeSingle();

  if (error && isUniqueViolation(error)) {
    const raced = await selectOwnSession(params.clientId);
    const decision = decideUniqueRaceWrite(
      raced ? { status: String(raced.status) } : null,
    );
    if (decision === "conflict") {
      return "conflict";
    }
    if (decision === "update") {
      return "retry-update";
    }
    return "conflict";
  }

  if (error) {
    if (isCheckViolation(error)) {
      console.error("[interview] persist check failed", { code: error.code });
      throw Object.assign(new Error("answers size check"), { code: "23514" });
    }
    console.error("[interview] persist insert failed", { code: error.code });
    throw new Error("Interview persist unavailable");
  }

  if (!data) {
    throw new Error("Interview persist unavailable");
  }

  return data;
}

async function persistInterviewDraftInner(
  rawInput: unknown,
): Promise<PersistInterviewDraftResult> {
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

  const stripped = stripInterviewIdentityKeys(rawInput);
  const parsed = persistInterviewDraftInputSchema.safeParse(stripped);
  if (!parsed.success) {
    return interviewValidationError(zodInterviewErrorToFieldErrors(parsed.error));
  }

  const input = parsed.data;

  if (!isSupabaseConfigured()) {
    console.error("[interview] persist unavailable: Supabase not configured");
    return interviewInternalError();
  }

  const existing = await selectOwnSession(user.id);
  const write = decideDraftWrite(
    existing ? { status: String(existing.status) } : null,
  );
  if (write === "conflict") {
    return interviewConflictError();
  }

  const storedRow = existing ? parseSessionRow(existing) : null;
  const merged = mergeInterviewAnswers(storedRow?.answers, input.answers);

  const mergedParsed = interviewAnswersStoredSchema.safeParse(merged);
  if (!mergedParsed.success) {
    return interviewValidationError(
      zodInterviewErrorToFieldErrors(mergedParsed.error),
    );
  }

  if (isAnswersPayloadTooLarge(mergedParsed.data)) {
    return interviewPayloadTooLargeError();
  }

  const cursor = resumeCursorAfterSave(
    input.currentStep,
    storedRow?.current_step ?? null,
  );

  let saved: SessionSelectRow | "conflict" | "retry-update";
  if (write === "insert") {
    saved = await insertDraft({
      clientId: user.id,
      answers: mergedParsed.data,
      currentStep: cursor,
    });
    if (saved === "retry-update") {
      saved = await updateDraft({
        clientId: user.id,
        answers: mergedParsed.data,
        currentStep: cursor,
      });
    }
  } else {
    saved = await updateDraft({
      clientId: user.id,
      answers: mergedParsed.data,
      currentStep: cursor,
    });
  }

  if (saved === "conflict") {
    return interviewConflictError();
  }

  revalidatePath("/interview");
  return {
    ok: true,
    draft: toInterviewDraftView(saved),
  };
}

export async function persistInterviewDraft(
  input: PersistInterviewDraftInput,
): Promise<PersistInterviewDraftResult> {
  try {
    return await persistInterviewDraftInner(input);
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (code === "23514") {
      return interviewInternalError();
    }
    console.error("[interview] persist unexpected error", {
      ...(code ? { code } : {}),
    });
    return interviewInternalError();
  }
}
