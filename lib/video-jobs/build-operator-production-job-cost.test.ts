/**
 * US-7.3 Phase B — OperatorProductionJobCostDto ledger-wins.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import type { VideoJobRow } from "./video-job-row";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const SPEND_EVENT_ID = "44444444-4444-4444-8444-444444444444";

type NodeModuleLoad = typeof Module & {
  _load: (
    request: string,
    parent: unknown,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  return run().finally(() => {
    nodeModule._load = originalLoad;
  });
}

function completedJob(overrides: Partial<VideoJobRow> = {}): VideoJobRow {
  return {
    id: JOB_ID,
    clientId: CLIENT_ID,
    reelScriptId: REEL_SCRIPT_ID,
    providerKey: "sadtalker_low",
    providerTier: "low",
    assetRole: "primary",
    externalJobId: "ext-1",
    status: "completed",
    estimatedCostCents: 99,
    actualCostCents: 99,
    failureReason: null,
    portraitAssetId: null,
    voiceoverAssetId: null,
    outputMediaAssetId: null,
    parentJobId: null,
    spendEventId: SPEND_EVENT_ID,
    operatorClientId: CLIENT_ID,
    attempt: 1,
    createdAt: "2026-08-31T16:00:00.000Z",
    updatedAt: "2026-08-31T16:05:00.000Z",
    ...overrides,
  };
}

describe("buildOperatorProductionJobCostDto", () => {
  it("prefers ledger actual and estimate when spendEventId is present", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        if (String(request).includes("lib/supabase/server")) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from: () => ({
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        maybeSingle: async () => ({
                          data: {
                            estimated_cost_cents: 18,
                            actual_cost_cents: 18,
                            actual_cost_unavailable_reason: null,
                          },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        for (const key of Object.keys(require.cache)) {
          if (key.includes("build-operator-production-job-cost")) {
            delete require.cache[key];
          }
        }
        const { buildOperatorProductionJobCostDto } = require(
          "./build-operator-production-job-cost.ts",
        );
        const dto = await buildOperatorProductionJobCostDto(completedJob());
        assert.equal(dto.estimatedCostCents, 18);
        assert.equal(dto.actualCostCents, 18);
        assert.equal(dto.costStatus, "actual");
        assert.equal("cost_model" in dto, false);
        assert.equal("envKeyName" in dto, false);
        assert.equal(dto.unavailableReasonKey, undefined);
      } finally {
        nodeModule._load = originalLoad;
      }
    });
  });

  it("uses job-row costs only when no spendEventId", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        if (String(request).includes("lib/supabase/server")) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => {
              throw new Error("must not query spend when spendEventId is null");
            },
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        for (const key of Object.keys(require.cache)) {
          if (key.includes("build-operator-production-job-cost")) {
            delete require.cache[key];
          }
        }
        const { buildOperatorProductionJobCostDto } = require(
          "./build-operator-production-job-cost.ts",
        );
        const dto = await buildOperatorProductionJobCostDto(
          completedJob({ spendEventId: null, estimatedCostCents: 10, actualCostCents: 7 }),
        );
        assert.equal(dto.estimatedCostCents, 10);
        assert.equal(dto.actualCostCents, 7);
        assert.equal(dto.costStatus, "actual");
      } finally {
        nodeModule._load = originalLoad;
      }
    });
  });
});
