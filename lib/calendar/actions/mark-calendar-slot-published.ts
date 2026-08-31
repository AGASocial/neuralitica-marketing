"use server";

import {
  findForbiddenMarkPublishedKeys,
  markCalendarSlotPublishedInputSchema,
  type MarkCalendarSlotPublishedResult,
} from "@/lib/contracts/calendar";
import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import {
  calendarForbiddenError,
  calendarForbiddenFieldsError,
  calendarInternalError,
  calendarInvalidIgUrlError,
  calendarUnauthenticatedError,
  calendarValidationError,
} from "@/lib/calendar/errors";
import { markCalendarSlotPublishedCore } from "@/lib/calendar/mark-calendar-slot-published";
import { zodInterviewErrorToFieldErrors } from "@/lib/interview/zod-field-errors";

function authGuardEnvelope(error: {
  status: 401 | 403;
}): MarkCalendarSlotPublishedResult {
  if (error.status === 401) {
    return calendarUnauthenticatedError();
  }
  return calendarForbiddenError();
}

/**
 * Operator mark-published mutation (US-12.2).
 * Frontend consumer: `/operator/calendar` Sidebar Dialog.
 */
export async function markCalendarSlotPublished(
  rawInput: unknown,
): Promise<MarkCalendarSlotPublishedResult> {
  let operator;
  try {
    operator = await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return authGuardEnvelope(error);
    }
    throw error;
  }

  if (findForbiddenMarkPublishedKeys(rawInput).length > 0) {
    return calendarForbiddenFieldsError();
  }

  const parsed = markCalendarSlotPublishedInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fields = zodInterviewErrorToFieldErrors(parsed.error);
    if (fields.instagramPostUrl !== undefined) {
      return calendarInvalidIgUrlError(fields);
    }
    return calendarValidationError(fields);
  }

  try {
    return await markCalendarSlotPublishedCore({
      input: parsed.data,
      operator,
    });
  } catch {
    return calendarInternalError();
  }
}
