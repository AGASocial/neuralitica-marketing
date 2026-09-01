"use server";

/**
 * US-15.1 Phase B — Operator manual resume trigger.
 * Separate strict Operator action with first-await `requireOperator`.
 * Accepts only `{ runId }` — no step/slot/attempt input.
 */
import { z } from "zod";

import { isAuthGuardError, requireOperator } from "@/lib/auth/require-user";
import { resumeWeeklyCycleRun as resumeWeeklyCycleRunCore } from "@/lib/orchestration/resume-weekly-cycle-run";

export const resumeWeeklyCycleRunInputSchema = z
  .object({ runId: z.string().uuid() })
  .strict();

export type ResumeWeeklyCycleRunActionResult =
  | { ok: true; runId: string; outcome: "RESUMED" }
  | {
      ok: false;
      error: {
        code:
          | "UNAUTHENTICATED"
          | "FORBIDDEN"
          | "VALIDATION_ERROR"
          | "NOT_FOUND"
          | "LIVE_DISABLED"
          | "CLIENT_INACTIVE"
          | "RUN_NOT_RESUMABLE"
          | "INTERNAL_ERROR";
      };
    };

export async function resumeWeeklyCycleRun(
  rawInput: unknown,
): Promise<ResumeWeeklyCycleRunActionResult> {
  try {
    await requireOperator("handler");
  } catch (error) {
    if (isAuthGuardError(error)) {
      return { ok: false, error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } };
    }
    throw error;
  }

  const parsed = resumeWeeklyCycleRunInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: { code: "VALIDATION_ERROR" } };
  }

  const result = await resumeWeeklyCycleRunCore({ runId: parsed.data.runId });
  if (!result.ok) {
    return { ok: false, error: { code: result.error.code } };
  }
  return { ok: true, runId: result.runId, outcome: result.outcome };
}
