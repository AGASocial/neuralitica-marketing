/**
 * Ciclo semanal automatizado Phase B contract (US-15.1) — live pipeline delta.
 * Additive to `lib/contracts/weekly-cycle.ts` (Phase A). Zod mirrors of the
 * shapes frozen in `plan/stories/US-15.1/CONTRACT.md` § "Phase B frozen delta".
 */
import { z } from "zod";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import { trendWeekStartSchema } from "@/lib/contracts/trend";
import {
  weeklyCycleCronHttpResponseSchema,
  weeklyCycleRunModeSchema,
  weeklyCycleStepKeySchema,
  type WeeklyCycleRunMode,
} from "@/lib/contracts/weekly-cycle";
import { normalizeToIsoMonday } from "@/lib/trend/normalize-week-start";

// ---------------------------------------------------------------------------
// Aggregate run state machine
// ---------------------------------------------------------------------------

export const weeklyCycleRunStatusSchema = z.enum([
  "dry_run",
  "running",
  "paused",
  "completed",
  "partial_failed",
  "failed",
]);
export type WeeklyCycleRunStatus = z.infer<typeof weeklyCycleRunStatusSchema>;

// ---------------------------------------------------------------------------
// Per-slot step state, error codes and step_log projection
// ---------------------------------------------------------------------------

export const weeklyCycleLiveStepStatusSchema = z.enum([
  "blocked",
  "ready",
  "dispatch_pending",
  "pending_provider",
  "pending_worker",
  "completed",
  "failed",
  "skipped",
]);
export type WeeklyCycleLiveStepStatus = z.infer<
  typeof weeklyCycleLiveStepStatusSchema
>;

export const weeklyCycleErrorCodeSchema = z.enum([
  "LIVE_DISABLED",
  "CLIENT_INACTIVE",
  "TENANT_SCOPE_MISMATCH",
  "BUDGET_EXCEEDED",
  "CONSENT_REQUIRED",
  "CONSENT_REVOKED",
  "POLICY_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "VALIDATION_ERROR",
  "STRATEGY_INVALID",
  "STRATEGY_STALE",
  "STRATEGY_APPROVAL_CONFLICT",
  "DISPATCH_TRANSIENT",
  "PROVIDER_TRANSIENT",
  "WORKER_TRANSIENT",
  "JOB_TIMEOUT",
  "DEPENDENCY_FAILED",
  "QA_FAILED",
  "INTERNAL_ERROR",
]);
export type WeeklyCycleErrorCode = z.infer<typeof weeklyCycleErrorCodeSchema>;

export const weeklyCycleStepLogEntrySchema = z
  .object({
    slotIndex: z.number().int().min(0).max(2).nullable(),
    step: weeklyCycleStepKeySchema,
    status: weeklyCycleLiveStepStatusSchema,
    attempt: z.number().int().min(1).max(3),
    at: z.string().datetime({ offset: true }),
    errorCode: weeklyCycleErrorCodeSchema.optional(),
    jobId: z.string().uuid().optional(),
  })
  .strict();
export type WeeklyCycleStepLogEntry = z.infer<
  typeof weeklyCycleStepLogEntrySchema
>;

export const weeklyCycleOutboxPayloadSchema = z
  .object({
    stepRunId: z.string().uuid(),
    idempotencyKey: z.string().regex(/^wc:[0-9a-f-]+:(global|[0-2]):[a-z_]+:[1-3]$/),
  })
  .strict();
export type WeeklyCycleOutboxPayload = z.infer<
  typeof weeklyCycleOutboxPayloadSchema
>;

// ---------------------------------------------------------------------------
// Strategy auto-approval (validated System path)
// ---------------------------------------------------------------------------

export type AutoApproveWeeklyCycleStrategyResult =
  | {
      ok: true;
      strategyId: string;
      version: number;
      outcome: "APPROVED" | "ALREADY_APPROVED_BY_RUN";
    }
  | {
      ok: false;
      code:
        | "STRATEGY_INVALID"
        | "STRATEGY_SCOPE_MISMATCH"
        | "STRATEGY_STALE"
        | "STRATEGY_APPROVAL_CONFLICT";
    };

// ---------------------------------------------------------------------------
// Live runner and callback-resume entrypoints
// ---------------------------------------------------------------------------

export type RunWeeklyCycleLiveParams = {
  clientId: string;
  weekStart: string;
  invokedBy: "system";
  mode: WeeklyCycleRunMode;
};
export type RunWeeklyCycleLiveResult =
  | {
      ok: true;
      runId: string;
      outcome: "STARTED" | "ALREADY_RUNNING" | "ALREADY_COMPLETED";
      dispatchedStepCount: number;
    }
  | {
      ok: false;
      error: {
        code:
          | "LIVE_DISABLED"
          | "RUN_NOT_REPLANNABLE"
          | "RUN_NOT_RESUMABLE"
          | "CLIENT_INACTIVE"
          | "INTERNAL_ERROR";
      };
    };

export type ResumeWeeklyCycleFromJobParams = {
  jobKind: "video" | "tts" | "assembly" | "branding" | "qa";
  jobId: string; // opaque persisted local job-row id; never callback tenant authority
};
export type ResumeWeeklyCycleFromJobResult =
  | {
      ok: true;
      runId: string;
      outcome: "ADVANCED" | "DUPLICATE_CALLBACK" | "PAUSED_LIVE_DISABLED";
    }
  | {
      ok: false;
      code:
        | "JOB_LINK_NOT_FOUND"
        | "JOB_SCOPE_MISMATCH"
        | "ILLEGAL_TRANSITION"
        | "INTERNAL_ERROR";
    };

// ---------------------------------------------------------------------------
// Operator manual trigger
// ---------------------------------------------------------------------------

/** Current ISO Monday UTC or either of the next 2 ISO Mondays — the only legal `weekStart` window for manual trigger. */
function isWithinWeeklyCycleTriggerWindow(weekStart: string): boolean {
  const currentMonday = normalizeToIsoMonday(new Date());
  const currentMondayDate = new Date(`${currentMonday}T12:00:00.000Z`);
  for (let offsetWeeks = 0; offsetWeeks <= 2; offsetWeeks += 1) {
    const candidate = new Date(currentMondayDate);
    candidate.setUTCDate(candidate.getUTCDate() + offsetWeeks * 7);
    if (candidate.toISOString().slice(0, 10) === weekStart) {
      return true;
    }
  }
  return false;
}

export const triggerWeeklyCycleInputSchema = z
  .object({
    clientId: agentClientIdSchema,
    weekStart: trendWeekStartSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // when present: current ISO Monday or either of the next 2 ISO Mondays only
    if (value.weekStart && !isWithinWeeklyCycleTriggerWindow(value.weekStart)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weekStart"],
        message:
          "weekStart must be the current ISO Monday or one of the next 2 ISO Mondays",
      });
    }
  });
export type TriggerWeeklyCycleInput = z.infer<
  typeof triggerWeeklyCycleInputSchema
>;

export type TriggerWeeklyCycleResult =
  | {
      ok: true;
      runId: string;
      clientId: string;
      weekStart: string;
      outcome: "STARTED" | "ALREADY_RUNNING" | "ALREADY_COMPLETED";
    }
  | {
      ok: false;
      error: {
        code:
          | "UNAUTHENTICATED"
          | "FORBIDDEN"
          | "NOT_FOUND"
          | "VALIDATION_ERROR"
          | "LIVE_DISABLED"
          | "RUN_NOT_REPLANNABLE"
          | "RUN_NOT_RESUMABLE"
          | "INTERNAL_ERROR";
      };
    };

// ---------------------------------------------------------------------------
// Minimal Operator DTO
// ---------------------------------------------------------------------------

export const operatorWeeklyCycleRunDtoSchema = z
  .object({
    runId: z.string().uuid(),
    clientId: agentClientIdSchema,
    clientDisplayName: z.string().trim().min(1).max(120),
    weekStart: trendWeekStartSchema,
    mode: weeklyCycleRunModeSchema,
    status: weeklyCycleRunStatusSchema,
    startedAt: z.string().datetime({ offset: true }).nullable(),
    finishedAt: z.string().datetime({ offset: true }).nullable(),
    slots: z
      .array(
        z
          .object({
            slotIndex: z.number().int().min(0).max(2),
            status: z.enum([
              "pending",
              "processing",
              "ready_for_approval",
              "failed",
            ]),
            currentStep: weeklyCycleStepKeySchema.nullable(),
            errorCode: weeklyCycleErrorCodeSchema.optional(),
          })
          .strict(),
      )
      .length(3),
    canResume: z.boolean(),
  })
  .strict();
export type OperatorWeeklyCycleRunDto = z.infer<
  typeof operatorWeeklyCycleRunDtoSchema
>;

// ---------------------------------------------------------------------------
// Cron HTTP response — additive live union over the Phase A exact shape
// ---------------------------------------------------------------------------

export const weeklyCycleLiveCronClientSchema = z
  .object({
    clientId: agentClientIdSchema,
    status: z.enum([
      "dispatched",
      "already_running",
      "already_completed",
      "failed",
    ]),
    runId: z.string().uuid().optional(),
    errorCode: z
      .enum([
        "LIVE_DISABLED",
        "RUN_NOT_REPLANNABLE",
        "RUN_NOT_RESUMABLE",
        "INTERNAL_ERROR",
      ])
      .optional(),
  })
  .strict();
export type WeeklyCycleLiveCronClient = z.infer<
  typeof weeklyCycleLiveCronClientSchema
>;

export const weeklyCycleLiveCronHttpResponseSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    dryRun: z.literal(false),
    eligibleCount: z.number().int().nonnegative(),
    processedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    clients: z.array(weeklyCycleLiveCronClientSchema),
  })
  .strict();
export type WeeklyCycleLiveCronHttpResponse = z.infer<
  typeof weeklyCycleLiveCronHttpResponseSchema
>;

export const weeklyCycleCronResponseSchema = z.union([
  weeklyCycleCronHttpResponseSchema, // Phase A exact
  weeklyCycleLiveCronHttpResponseSchema,
]);
export type WeeklyCycleCronResponse = z.infer<
  typeof weeklyCycleCronResponseSchema
>;
