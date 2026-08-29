import {
  interviewAnswersCompleteSchema,
  type BusinessProfileFields,
  type InterviewAnswers,
  type InterviewAnswersComplete,
} from "@/lib/contracts/interview";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

export type CompletenessResult =
  | { ok: true; fields: InterviewAnswersComplete }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Completeness Zod over **stored** answers (DB SoT).
 * Incomplete → field-level errors; caller must not write profile / status.
 */
export function validateInterviewCompleteness(
  answers: InterviewAnswers | unknown,
): CompletenessResult {
  const parsed = interviewAnswersCompleteSchema.safeParse(answers);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: zodInterviewErrorToFieldErrors(parsed.error),
    };
  }
  return { ok: true, fields: parsed.data };
}

/** Map complete stored answers → profile jsonb fields (1:1 seven keys). */
export function mapAnswersToProfileFields(
  complete: InterviewAnswersComplete,
): BusinessProfileFields {
  return interviewAnswersCompleteSchema.parse(complete);
}
