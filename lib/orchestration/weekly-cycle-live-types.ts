import "server-only";

/**
 * US-15.1 Phase B — internal constants + re-exports of the frozen shapes in
 * `lib/contracts/weekly-cycle-live.ts` (nextjs-backend, landed on this
 * branch from the same CONTRACT.md). Everything zod/type-shaped lives there
 * now; this file only adds implementation-internal constants that CONTRACT
 * does not itself export as named symbols (table names, step groupings,
 * retry ceilings).
 */
import { z } from "zod";

export {
  weeklyCycleRunStatusSchema,
  weeklyCycleLiveStepStatusSchema,
  weeklyCycleErrorCodeSchema,
  weeklyCycleStepLogEntrySchema,
  weeklyCycleOutboxPayloadSchema,
  operatorWeeklyCycleRunDtoSchema,
} from "@/lib/contracts/weekly-cycle-live";
export type {
  WeeklyCycleRunStatus,
  WeeklyCycleLiveStepStatus,
  WeeklyCycleErrorCode,
  WeeklyCycleStepLogEntry,
  WeeklyCycleOutboxPayload,
  OperatorWeeklyCycleRunDto,
} from "@/lib/contracts/weekly-cycle-live";

import type { WeeklyCycleErrorCode } from "@/lib/contracts/weekly-cycle-live";

export const RETRYABLE_WEEKLY_CYCLE_ERROR_CODES: ReadonlySet<WeeklyCycleErrorCode> =
  new Set(["DISPATCH_TRANSIENT", "PROVIDER_TRANSIENT", "WORKER_TRANSIENT"]);

export const WEEKLY_CYCLE_STEP_RUN_TABLE = "neuramark_weekly_cycle_step_runs";
export const WEEKLY_CYCLE_OUTBOX_TABLE = "neuramark_weekly_cycle_outbox";
export const WEEKLY_CYCLE_RUNS_TABLE = "neuramark_weekly_cycle_runs";

/** Steps that are global to the run (one row, `slotIndex: null`). */
export const WEEKLY_CYCLE_GLOBAL_STEPS = [
  "strategy",
  "scripts",
  "captions",
] as const;

/** Steps that run per production slot (0..2). */
export const WEEKLY_CYCLE_SLOT_STEPS = [
  "primary_video",
  "tts",
  "broll",
  "assembly",
  "branding",
  "qa",
  "approval",
] as const;

/** Steps dispatched through the durable outbox (real provider/worker jobs). */
export const WEEKLY_CYCLE_ASYNC_STEPS = [
  "primary_video",
  "broll",
  "assembly",
  "branding",
] as const;

export const MAX_WEEKLY_CYCLE_ATTEMPTS = 3;
export const WEEKLY_CYCLE_DISPATCH_BACKOFF_SEC = { 2: 30, 3: 120 } as const;

export type WeeklyCycleJobKind = "video" | "tts" | "assembly" | "branding" | "qa";

export const operatorWeeklyCycleSlotStatusSchema = z.enum([
  "pending",
  "processing",
  "ready_for_approval",
  "failed",
]);
export type OperatorWeeklyCycleSlotStatus = z.infer<
  typeof operatorWeeklyCycleSlotStatusSchema
>;
