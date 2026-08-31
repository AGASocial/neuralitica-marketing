/**
 * Ciclo semanal automatizado Phase A contract (US-15.1).
 * The cron response is intentionally minimal and plan-only.
 */
import { z } from "zod";

import { agentClientIdSchema } from "@/lib/contracts/profile";
import { trendWeekStartSchema } from "@/lib/contracts/trend";

export const WEEKLY_CYCLE_STEP_KEYS = [
  "strategy",
  "scripts",
  "captions",
  "primary_video",
  "tts",
  "broll",
  "assembly",
  "branding",
  "qa",
  "approval",
] as const;

export const weeklyCycleStepKeySchema = z.enum(WEEKLY_CYCLE_STEP_KEYS);
export type WeeklyCycleStepKey = z.infer<typeof weeklyCycleStepKeySchema>;

export const weeklyCyclePlanStepSchema = z
  .object({
    step: weeklyCycleStepKeySchema,
    status: z.literal("planned"),
    orchestratorRef: z.string().trim().min(1),
  })
  .strict();
export type WeeklyCyclePlanStep = z.infer<typeof weeklyCyclePlanStepSchema>;

export const weeklyCycleStepPlanSchema = z
  .object({
    dryRun: z.literal(true),
    weekStart: trendWeekStartSchema,
    clientId: agentClientIdSchema,
    invokedBy: z.literal("system"),
    steps: z.array(weeklyCyclePlanStepSchema).length(WEEKLY_CYCLE_STEP_KEYS.length),
  })
  .strict();
export type WeeklyCycleStepPlan = z.infer<typeof weeklyCycleStepPlanSchema>;

export const weeklyCycleEligibilitySkipReasonSchema = z.enum([
  "INACTIVE",
  "PROFILE_MISSING",
  "VISUAL_MODE_MISSING",
  "PROFILE_LOAD_FAILED",
]);
export type WeeklyCycleEligibilitySkipReason = z.infer<
  typeof weeklyCycleEligibilitySkipReasonSchema
>;

export const weeklyCycleRunModeSchema = z.enum(["cron", "operator"]);
export type WeeklyCycleRunMode = z.infer<typeof weeklyCycleRunModeSchema>;

export const weeklyCycleRunStatusSchema = z.enum([
  "planned",
  "running",
  "completed",
  "failed",
  "dry_run",
]);
export type WeeklyCycleRunStatus = z.infer<typeof weeklyCycleRunStatusSchema>;

export const weeklyCycleProcessedClientSchema = z
  .object({
    clientId: agentClientIdSchema,
    status: z.literal("dry_run"),
    runId: z.string().uuid(),
    acquireOutcome: z.enum(["CREATED", "ALREADY_EXISTS"]),
    stepCount: z.number().int().nonnegative(),
  })
  .strict();

export const weeklyCycleSkippedClientSchema = z
  .object({
    clientId: agentClientIdSchema,
    status: z.literal("skipped"),
    skipReason: weeklyCycleEligibilitySkipReasonSchema,
  })
  .strict();

export const weeklyCycleFailedClientSchema = z
  .object({
    clientId: agentClientIdSchema,
    status: z.literal("failed"),
    errorCode: z.literal("INTERNAL_ERROR"),
  })
  .strict();

export const weeklyCycleClientBatchItemSchema = z.discriminatedUnion("status", [
  weeklyCycleProcessedClientSchema,
  weeklyCycleSkippedClientSchema,
  weeklyCycleFailedClientSchema,
]);
export type WeeklyCycleClientBatchItem = z.infer<
  typeof weeklyCycleClientBatchItemSchema
>;

export const weeklyCycleCronHttpResponseSchema = z
  .object({
    weekStart: trendWeekStartSchema,
    dryRun: z.literal(true),
    eligibleCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    processedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    clients: z.array(weeklyCycleClientBatchItemSchema),
  })
  .strict();
export type WeeklyCycleCronHttpResponse = z.infer<
  typeof weeklyCycleCronHttpResponseSchema
>;

export const FORBIDDEN_WEEKLY_CYCLE_CRON_KEYS = [
  "clientId",
  "client_id",
  "clientIds",
  "client_ids",
  "weekStart",
  "week_start",
  "dryRun",
  "dry_run",
  "mode",
  "invokedBy",
  "invoked_by",
  "providerKey",
  "provider_key",
  "secret",
  "cronSecret",
  "CRON_SECRET",
  "role",
  "auth_user_id",
] as const;

const forbiddenWeeklyCycleCronKeySet = new Set<string>(
  FORBIDDEN_WEEKLY_CYCLE_CRON_KEYS,
);

/** Return forbidden top-level keys only; primitives, arrays and null have none. */
export function findForbiddenWeeklyCycleCronKeys(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return [];
  }

  return Object.keys(raw).filter((key) =>
    forbiddenWeeklyCycleCronKeySet.has(key),
  );
}
