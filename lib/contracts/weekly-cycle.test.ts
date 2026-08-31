import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findForbiddenWeeklyCycleCronKeys,
  WEEKLY_CYCLE_STEP_KEYS,
  weeklyCycleCronHttpResponseSchema,
  weeklyCycleStepPlanSchema,
} from "./weekly-cycle.ts";

const clientId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

describe("weekly cycle Phase A contract", () => {
  it("accepts the frozen ordered dry-run plan", () => {
    const plan = weeklyCycleStepPlanSchema.parse({
      dryRun: true,
      weekStart: "2026-08-31",
      clientId,
      invokedBy: "system",
      steps: WEEKLY_CYCLE_STEP_KEYS.map((step) => ({
        step,
        status: "planned",
        orchestratorRef: `ref:${step}`,
      })),
    });

    assert.equal(plan.steps.length, 10);
    assert.deepEqual(
      plan.steps.map((step) => step.step),
      WEEKLY_CYCLE_STEP_KEYS,
    );
  });

  it("rejects live mode and unknown response fields", () => {
    const result = weeklyCycleCronHttpResponseSchema.safeParse({
      weekStart: "2026-08-31",
      dryRun: false,
      eligibleCount: 1,
      skippedCount: 0,
      processedCount: 1,
      failedCount: 0,
      clients: [],
      secret: "must-not-pass",
    });

    assert.equal(result.success, false);
  });

  it("accepts all three minimal client result variants", () => {
    const result = weeklyCycleCronHttpResponseSchema.parse({
      weekStart: "2026-08-31",
      dryRun: true,
      eligibleCount: 2,
      skippedCount: 1,
      processedCount: 1,
      failedCount: 1,
      clients: [
        {
          clientId,
          status: "dry_run",
          runId,
          acquireOutcome: "CREATED",
          stepCount: 10,
        },
        { clientId, status: "skipped", skipReason: "PROFILE_MISSING" },
        { clientId, status: "failed", errorCode: "INTERNAL_ERROR" },
      ],
    });

    assert.equal(result.clients.length, 3);
  });

  it("finds forbidden top-level cron authority fields", () => {
    assert.deepEqual(
      findForbiddenWeeklyCycleCronKeys({
        clientId,
        week_start: "2026-08-31",
        harmless: true,
        nested: { dryRun: false },
      }),
      ["clientId", "week_start"],
    );
    assert.deepEqual(findForbiddenWeeklyCycleCronKeys(null), []);
    assert.deepEqual(findForbiddenWeeklyCycleCronKeys([]), []);
  });
});
