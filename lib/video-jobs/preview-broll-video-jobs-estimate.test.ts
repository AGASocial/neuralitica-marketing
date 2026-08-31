/**
 * US-8.9 — previewBrollVideoJobsEstimate Server Action tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { previewBrollVideoJobsEstimateSuccessSchema } from "../contracts/video-job.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CLIENT_ID = "99999999-9999-4999-8999-999999999999";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";
const STILL_ASSET_ID = "33333333-3333-4333-8333-333333333333";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/video-jobs/") ||
      normalized.includes("/lib/media/get-broll-reference-still") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/providers/") ||
      normalized.includes("/lib/cost-policy/")
    ) {
      delete require.cache[key];
    }
  }
}

function withServerOnlyStub<T>(run: () => T | Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad(request, parent, isMain);
  };
  return Promise.resolve(run()).finally(() => {
    nodeModule._load = originalLoad;
  });
}

type MockOptions = {
  role?: "operator" | "client";
  needsBrollScript?: boolean;
  brollBeats?: string[];
  stillAssetId?: string | null;
  providerKey?: string;
  providerTier?: "low" | "high";
  budgetOk?: boolean;
  scriptMissing?: boolean;
  brollJobInFlight?: boolean;
  adapterEstimateThrows?: boolean;
  providerResolveFails?: boolean;
};

function installMocks(options: MockOptions = {}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  const role = options.role ?? "operator";
  const needsBroll = options.needsBrollScript !== false;
  const beats =
    options.brollBeats ??
    (needsBroll ? ["Storefront morning", "Product close-up", "Sunset"] : []);
  const providerKey = options.providerKey ?? "siliconflow_wan21_turbo";
  const providerTier = options.providerTier ?? "low";
  const unitCostCents =
    providerKey === "ltx_broll_high" ? 126 : 21;

  const mockAdapter = {
    estimateCost: async () => {
      if (options.adapterEstimateThrows) {
        throw new Error("adapter unavailable");
      }
      return {
        estimatedCostCents: unitCostCents,
        currency: "USD",
        providerKey,
      };
    },
    createJob: async () => ({
      externalJobId: "preview-test-external-id",
      status: "queued" as const,
      estimatedCostCents: unitCostCents,
    }),
  };

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);

    if (req.includes("require-user")) {
      return {
        isAuthGuardError: (e: unknown) =>
          Boolean(e && typeof e === "object" && "status" in e),
        requireOperator: async () => {
          if (role !== "operator") {
            const err = new Error("Forbidden") as Error & { status: number };
            err.status = 403;
            throw err;
          }
          return { id: CLIENT_ID, role: "operator" };
        },
      };
    }

    if (req.includes("load-reel-script-for-video-job")) {
      return {
        loadReelScriptForVideoJob: async () => {
          if (options.scriptMissing) {
            return null;
          }
          return {
            reelScriptId: REEL_SCRIPT_ID,
            clientId: CLIENT_ID,
            strategyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            slotIndex: 0,
            visualMode: needsBroll ? "faceless" : "own_avatar",
            modalidad: needsBroll ? "faceless" : "own_avatar",
            hasReferenceLoop: false,
            package: {
              hook: "Hook line",
              body: "Body line for the reel",
              cta: "Call now",
              onScreenText: "On screen",
              voiceoverText: "Voiceover text",
              targetDurationSec: 30,
              brollBeats: beats.length > 0 ? beats : undefined,
            },
          };
        },
      };
    }

    if (req.includes("resolve-provider-for-job")) {
      return {
        resolveProviderForJob: async () => {
          if (options.providerResolveFails) {
            return { ok: false, code: "PROVIDER_UNAVAILABLE" };
          }
          return {
            ok: true,
            decision: { providerKey, providerTier },
          };
        },
      };
    }

    if (req.includes("get-broll-reference-still-asset-for-client")) {
      const stillAssetId =
        options.stillAssetId === undefined
          ? STILL_ASSET_ID
          : options.stillAssetId;
      return {
        getBrollReferenceStillAssetForClient: async () =>
          stillAssetId ? { assetId: stillAssetId } : null,
      };
    }

    if (req.includes("create-provider-registry")) {
      return {
        initializeProviderRegistryFromCatalog: async () => ({
          getVideoAdapter: () => mockAdapter,
        }),
      };
    }

    if (req.includes("assert-reel-budget-allows-estimated-spend")) {
      return {
        assertReelBudgetAllowsEstimatedSpend: async () => {
          if (options.budgetOk === false) {
            return { ok: false, code: "BUDGET_EXCEEDED" };
          }
          return {
            ok: true,
            estimatedCostCents: unitCostCents,
            cumulativeCostCents: 0,
            maxCostCents: 150,
            providerTier,
          };
        },
      };
    }

    if (req.includes("record-reel-spend-event")) {
      return {
        recordReelSpendEvent: async () => ({
          spendEventId: "66666666-6666-4666-8666-666666666666",
        }),
      };
    }

    if (req.includes("enqueue-video-job-poll")) {
      return { enqueueVideoJobPoll: () => undefined };
    }

    if (req.includes("supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table === "neuramark_video_jobs") {
              const inFlightQuery = {
                select: () => inFlightQuery,
                eq: () => inFlightQuery,
                in: () => inFlightQuery,
                limit: () =>
                  Promise.resolve({
                    data: options.brollJobInFlight ? [{ id: "job-1" }] : [],
                    error: null,
                  }),
                insert: (payload: Record<string, unknown>) => ({
                  select: () => ({
                    single: async () => ({
                      data: {
                        id: "44444444-4444-4444-8444-444444444444",
                        client_id: payload.client_id,
                        reel_script_id: payload.reel_script_id,
                        provider_key: payload.provider_key,
                        provider_tier: payload.provider_tier,
                        asset_role: payload.asset_role,
                        external_job_id: payload.external_job_id,
                        status: payload.status,
                        estimated_cost_cents: payload.estimated_cost_cents,
                        actual_cost_cents: null,
                        failure_reason: null,
                        portrait_asset_id: payload.portrait_asset_id,
                        voiceover_asset_id: payload.voiceover_asset_id,
                        output_media_asset_id: null,
                        parent_job_id: payload.parent_job_id ?? null,
                        spend_event_id: null,
                        operator_client_id: payload.operator_client_id ?? null,
                        attempt: payload.attempt ?? 1,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      },
                      error: null,
                    }),
                  }),
                }),
                update: () => ({
                  eq: async () => ({ data: null, error: null }),
                }),
              };
              return inFlightQuery;
            }
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          },
        }),
      };
    }

    return originalLoad(request, parent, isMain);
  };

  clearModuleCache();

  return {
    restore: () => {
      nodeModule._load = originalLoad;
      clearModuleCache();
    },
  };
}

afterEach(() => {
  clearModuleCache();
});

describe("US-8.9 previewBrollVideoJobsEstimate", () => {
  it("1 — non-operator → FORBIDDEN", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({ role: "client" });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN");
      } finally {
        mock.restore();
      }
    });
  });

  it("2 — forbidden provider_key → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks();
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          provider_key: "ltx_broll_high",
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      } finally {
        mock.restore();
      }
    });
  });

  it("2b — forbidden operatorClientId → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks();
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          operatorClientId: OTHER_CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      } finally {
        mock.restore();
      }
    });
  });

  it("3 — forged clientId → FORBIDDEN", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks();
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: OTHER_CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN");
      } finally {
        mock.restore();
      }
    });
  });

  it("4 — unknown reel → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({ scriptMissing: true });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "NOT_FOUND");
      } finally {
        mock.restore();
      }
    });
  });

  it("5 — low tier + needsBroll → Wan providerKey; estimate = 21 × N", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({
        providerKey: "siliconflow_wan21_turbo",
        providerTier: "low",
      });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.needsBroll, true);
        assert.equal(result.providerKey, "siliconflow_wan21_turbo");
        assert.equal(result.unitCostCentsPerClip, 21);
        assert.equal(result.clipCount, 3);
        assert.equal(result.estimatedCostCents, 63);
        assert.equal(result.blockedReasonKey, undefined);
      } finally {
        mock.restore();
      }
    });
  });

  it("6 — high tier + needsBroll → LTX providerKey; estimate = 126 × N", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({
        providerKey: "ltx_broll_high",
        providerTier: "high",
      });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.providerKey, "ltx_broll_high");
        assert.equal(result.unitCostCentsPerClip, 126);
        assert.equal(result.clipCount, 3);
        assert.equal(result.estimatedCostCents, 378);
      } finally {
        mock.restore();
      }
    });
  });

  it("7 — low tier never returns ltx_broll_high", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({
        providerKey: "siliconflow_wan21_turbo",
        providerTier: "low",
      });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.notEqual(result.providerKey, "ltx_broll_high");
      } finally {
        mock.restore();
      }
    });
  });

  it("8 — non-faceless / no beats → needsBroll false; no providerKey", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({
        needsBrollScript: false,
        brollBeats: [],
      });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.needsBroll, false);
        assert.equal(result.providerKey, undefined);
        assert.equal(result.estimatedCostCents, 0);
        assert.equal(result.clipCount, 0);
      } finally {
        mock.restore();
      }
    });
  });

  it("9 — in-flight broll → blockedReasonKey jobInFlight", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({ brollJobInFlight: true });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.needsBroll, true);
        assert.equal(result.blockedReasonKey, "scripts.broll.blocked.jobInFlight");
        assert.equal(result.providerKey, undefined);
        assert.equal(result.estimatedCostCents, 0);
      } finally {
        mock.restore();
      }
    });
  });

  it("10 — missing still → blocked referenceStillMissing", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({ stillAssetId: null });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(
          result.blockedReasonKey,
          "scripts.broll.blocked.referenceStillMissing",
        );
        assert.equal(result.providerKey, undefined);
      } finally {
        mock.restore();
      }
    });
  });

  it("11 — create still rejects forbidden operatorClientId (regression)", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks();
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          operatorClientId: OTHER_CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      } finally {
        mock.restore();
      }
    });
  });

  it("12 — success schema .strict() rejects extra secret-like fields", () => {
    assert.throws(() => {
      previewBrollVideoJobsEstimateSuccessSchema.parse({
        ok: true,
        estimatedCostCents: 63,
        unitCostCentsPerClip: 21,
        clipCount: 3,
        needsBroll: true,
        providerKey: "siliconflow_wan21_turbo",
        prompt: "leaked beat text",
        referenceStillAssetId: STILL_ASSET_ID,
      });
    });
  });

  it("13 — preview unit costs match create defaults for same fixture", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks();
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");

        const preview = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(preview.ok, true);
        assert.equal(preview.unitCostCentsPerClip, 21);

        const create = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(create.ok, true);
        assert.ok(create.jobs.length > 0);
        for (const job of create.jobs) {
          assert.equal(job.estimatedCostCents, preview.unitCostCentsPerClip);
        }
      } finally {
        mock.restore();
      }
    });
  });

  it("14 — budget exceeded → blocked budgetExceeded", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({ budgetOk: false });
      try {
        const { previewBrollVideoJobsEstimate } = require("./preview-broll-video-jobs-estimate.ts");
        const result = await previewBrollVideoJobsEstimate({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(
          result.blockedReasonKey,
          "scripts.broll.blocked.budgetExceeded",
        );
      } finally {
        mock.restore();
      }
    });
  });
});
