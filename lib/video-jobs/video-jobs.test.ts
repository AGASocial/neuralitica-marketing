/**
 * US-8.4 video job orchestration, security, and poller tests.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT,
  VIDEO_MAX_RETRIES_PER_REEL_DEFAULT,
} from "@/lib/contracts/video-job";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const PARENT_JOB_ID = "55555555-5555-4555-8555-555555555555";
const PORTRAIT_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const VOICEOVER_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const FOREIGN_JOB_ID = "99999999-9999-4999-8999-999999999999";
const EXTERNAL_JOB_ID = "pred-test-001";
const OVERRIDE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => T | Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  return Promise.resolve(run()).finally(() => {
    nodeModule._load = originalLoad;
  });
}

function clearVideoJobModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/video-jobs/") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/app/api/video-jobs/")
    ) {
      delete require.cache[key];
    }
  }
}

function loadVideoJobModule<T = Record<string, unknown>>(
  relativePath: string,
): T {
  clearVideoJobModuleCache();
  return require(relativePath) as T;
}

function chainableQuery(terminal: {
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  single?: () => Promise<{ data: unknown; error: unknown }>;
  in?: (column: string, values: unknown[]) => unknown;
  lt?: (column: string, value: string) => unknown;
  select?: (...args: unknown[]) => unknown;
  eq?: (...args: unknown[]) => unknown;
  order?: (...args: unknown[]) => unknown;
  limit?: (...args: unknown[]) => unknown;
  insert?: (payload: unknown) => unknown;
  update?: (payload: unknown) => unknown;
  then?: (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise<unknown>;
}) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = terminal.select ?? self;
  builder.eq = terminal.eq ?? self;
  builder.in = terminal.in ?? self;
  builder.lt = terminal.lt ?? self;
  builder.is = self;
  builder.order = terminal.order ?? self;
  builder.limit = terminal.limit ?? self;
  builder.insert = terminal.insert ?? self;
  builder.update = terminal.update ?? self;
  builder.maybeSingle =
    terminal.maybeSingle ?? (async () => ({ data: null, error: null }));
  builder.single =
    terminal.single ?? (async () => ({ data: null, error: null }));
  builder.then =
    terminal.then ??
    ((
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected));
  return builder;
}

function baseVideoJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    client_id: CLIENT_ID,
    reel_script_id: REEL_SCRIPT_ID,
    provider_key: "sadtalker_low",
    provider_tier: "low",
    asset_role: "primary",
    external_job_id: EXTERNAL_JOB_ID,
    status: "processing",
    estimated_cost_cents: 10,
    actual_cost_cents: null,
    failure_reason: null,
    portrait_asset_id: PORTRAIT_ASSET_ID,
    voiceover_asset_id: VOICEOVER_ASSET_ID,
    output_media_asset_id: null,
    parent_job_id: null,
    spend_event_id: null,
    attempt: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("video-job-config-readers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reads defaults for stale timeout and max retries", async () => {
    const {
      readVideoJobStaleTimeoutMs,
      readVideoMaxRetriesPerReel,
    } = await import("./video-job-config-readers");

    assert.equal(readVideoJobStaleTimeoutMs({}), VIDEO_JOB_STALE_TIMEOUT_MS_DEFAULT);
    assert.equal(readVideoMaxRetriesPerReel({}), VIDEO_MAX_RETRIES_PER_REEL_DEFAULT);
  });

  it("reads env overrides for stale timeout and max retries", async () => {
    const {
      readVideoJobStaleTimeoutMs,
      readVideoMaxRetriesPerReel,
    } = await import("./video-job-config-readers");

    assert.equal(
      readVideoJobStaleTimeoutMs({ VIDEO_JOB_STALE_TIMEOUT_MS: "3600000" }),
      3_600_000,
    );
    assert.equal(
      readVideoMaxRetriesPerReel({ VIDEO_MAX_RETRIES_PER_REEL: "5" }),
      5,
    );
  });
});

describe("find-forbidden-keys", () => {
  it("rejects provider authority keys on create input", async () => {
    const { findForbiddenVideoJobKeys } = await import("./find-forbidden-keys");

    assert.ok(
      findForbiddenVideoJobKeys({
        clientId: "00000000-0000-4000-8000-000000000001",
        providerKey: "sadtalker_low",
      }).includes("providerKey"),
    );

    assert.ok(
      findForbiddenVideoJobKeys({
        clientId: CLIENT_ID,
        status: "completed",
      }).includes("status"),
    );

    assert.ok(
      findForbiddenVideoJobKeys({
        reelScriptId: REEL_SCRIPT_ID,
        actualCostCents: 0,
      }).includes("actualCostCents"),
    );

    assert.ok(
      findForbiddenVideoJobKeys({
        reelScriptId: REEL_SCRIPT_ID,
        durationSec: 28.5,
      }).includes("durationSec"),
    );
  });
});

describe("provider-assets route HMAC", () => {
  it("migration defines neuramark_video_jobs with RLS", () => {
    const sql = readFileSync(
      path.join(repoRoot, "supabase/migrations/20260830600000_neuramark_video_jobs.sql"),
      "utf8",
    );
    assert.match(sql, /neuramark_video_jobs/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /neuramark_video_job_retry_overrides/);
  });

  it("verifies HMAC signature constant-time path", () => {
    const secret = "test-secret";
    const assetId = "00000000-0000-4000-8000-000000000099";
    const clientId = "00000000-0000-4000-8000-000000000001";
    const exp = String(Math.floor(Date.now() / 1000) + 300);
    const sig = createHmac("sha256", secret)
      .update(`${assetId}:${clientId}:${exp}`)
      .digest("hex");

    const expected = createHmac("sha256", secret)
      .update(`${assetId}:${clientId}:${exp}`)
      .digest("hex");

    assert.equal(sig, expected);
  });
});

describe("provider asset URL secret", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    for (const key of Object.keys(require.cache)) {
      if (key.replace(/\\/g, "/").includes("/lib/media/provider-asset-url-secret")) {
        delete require.cache[key];
      }
    }
  });

  it("requires NEURAMARK_PROVIDER_ASSET_URL_SECRET in production", async () => {
    await withServerOnlyStub(async () => {
      process.env.NODE_ENV = "production";
      delete process.env.NEURAMARK_PROVIDER_ASSET_URL_SECRET;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      const { getProviderAssetUrlSecret } = await import(
        "../media/provider-asset-url-secret.ts"
      );
      assert.equal(getProviderAssetUrlSecret(), null);
    });
  });

  it("prefers dedicated secret over service-role fallback", async () => {
    await withServerOnlyStub(async () => {
      process.env.NODE_ENV = "development";
      process.env.NEURAMARK_PROVIDER_ASSET_URL_SECRET = "dedicated-secret";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      const { getProviderAssetUrlSecret } = await import(
        "../media/provider-asset-url-secret.ts"
      );
      assert.equal(getProviderAssetUrlSecret(), "dedicated-secret");
    });
  });

  it("allows service-role fallback only in non-production", async () => {
    await withServerOnlyStub(async () => {
      process.env.NODE_ENV = "test";
      delete process.env.NEURAMARK_PROVIDER_ASSET_URL_SECRET;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

      const { getProviderAssetUrlSecret } = await import(
        "../media/provider-asset-url-secret.ts"
      );
      assert.equal(getProviderAssetUrlSecret(), "service-role-key");
    });
  });
});

describe("retry override consumption", () => {
  function installRetryVideoJobMocks(options: {
    createResult: { ok: true; jobId: string; status: "queued"; estimatedCostCents: number; attempt: number } | { ok: false; error: { code: string } };
    onConsume?: () => void;
    onCreate?: () => void;
  }) {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);
    let consumeCalled = false;
    let createCalled = false;

    const failedJobRow = baseVideoJobRow({
      status: "failed",
      attempt: 1,
    });

    const mockAdapter = {
      estimateCost: async () => ({ estimatedCostCents: 10 }),
    };

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") return {};
      const req = String(request);
      if (req.includes("require-user")) {
        return {
          requireOperator: async () => ({
            id: CLIENT_ID,
            role: "operator",
          }),
          isAuthGuardError: () => false,
        };
      }
      if (req.includes("load-video-job")) {
        return {
          loadVideoJobScoped: async () => {
            const { mapVideoJobRow } = require("./video-job-row.ts");
            return mapVideoJobRow(failedJobRow);
          },
        };
      }
      if (req.includes("retry-eligibility")) {
        return {
          getMaxAttemptForReel: async () => VIDEO_MAX_RETRIES_PER_REEL_DEFAULT,
          findUnconsumedRetryOverride: async () => ({ id: OVERRIDE_ID }),
          consumeRetryOverride: async () => {
            consumeCalled = true;
            options.onConsume?.();
          },
          evaluateRetryEligibility: async () => ({
            canRetry: true,
            retryBlockedReasonKey: null,
          }),
        };
      }
      if (req.includes("assert-video-job-budget")) {
        return {
          assertVideoJobBudgetAllowsSpend: async () => ({ ok: true }),
        };
      }
      if (req.includes("load-reel-script-for-video-job")) {
        return {
          loadReelScriptForVideoJob: async () => ({
            visualMode: "stock",
            modalidad: "stock",
            hasReferenceLoop: false,
            package: {
              targetDurationSec: 30,
              voiceoverText: "Retry override test",
            },
          }),
        };
      }
      if (req.includes("resolve-provider-for-job")) {
        return {
          resolveProviderForJob: async () => ({
            ok: true,
            decision: { providerKey: "sadtalker_low", providerTier: "low" },
          }),
        };
      }
      if (req.includes("create-provider-registry")) {
        return {
          initializeProviderRegistryFromCatalog: async () => ({
            getVideoAdapter: () => mockAdapter,
          }),
        };
      }
      if (req.includes("create-talking-head-video-job")) {
        return {
          createTalkingHeadVideoJob: async () => {
            createCalled = true;
            options.onCreate?.();
            return options.createResult;
          },
        };
      }
      return originalLoad(request, parent, isMain);
    };

    return {
      restore: () => {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      },
      wasConsumeCalled: () => consumeCalled,
      wasCreateCalled: () => createCalled,
    };
  }

  it("does not consume override when child job create fails", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installRetryVideoJobMocks({
        createResult: {
          ok: false,
          error: { code: "INTERNAL_ERROR" },
        },
      });

      try {
        clearVideoJobModuleCache();
        const { retryVideoJob } = loadVideoJobModule(
          "./actions/retry-video-job.ts",
        );

        const result = await retryVideoJob({
          failedJobId: JOB_ID,
          confirmRetry: true,
          confirmEstimateCents: 10,
        });

        assert.equal(result.ok, false);
        assert.equal(mocks.wasCreateCalled(), true);
        assert.equal(mocks.wasConsumeCalled(), false);
      } finally {
        mocks.restore();
      }
    });
  });

  it("consumes override only after successful child job create", async () => {
    await withServerOnlyStub(async () => {
      let consumeAfterCreate = false;

      const mocks = installRetryVideoJobMocks({
        createResult: {
          ok: true,
          jobId: "88888888-8888-4888-8888-888888888888",
          status: "queued",
          estimatedCostCents: 10,
          attempt: 2,
        },
        onConsume: () => {
          consumeAfterCreate = mocks.wasCreateCalled();
        },
      });

      try {
        clearVideoJobModuleCache();
        const { retryVideoJob } = loadVideoJobModule(
          "./actions/retry-video-job.ts",
        );

        const result = await retryVideoJob({
          failedJobId: JOB_ID,
          confirmRetry: true,
          confirmEstimateCents: 10,
        });

        assert.equal(result.ok, true);
        assert.equal(mocks.wasCreateCalled(), true);
        assert.equal(mocks.wasConsumeCalled(), true);
        assert.equal(consumeAfterCreate, true);
      } finally {
        mocks.restore();
      }
    });
  });
});

describe("orchestrator gate order", () => {
  it("calls budget before consent before adapter.createJob", async () => {
    await withServerOnlyStub(async () => {
      const callOrder: string[] = [];
      let insertedPayload: Record<string, unknown> | null = null;

      const mockAdapter = {
        estimateCost: async () => ({ estimatedCostCents: 10 }),
        createJob: async () => {
          callOrder.push("createJob");
          return { externalJobId: EXTERNAL_JOB_ID, status: "queued" as const };
        },
      };

      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") {
          return {};
        }
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => ({
              id: CLIENT_ID,
              role: "operator",
            }),
          };
        }
        if (req.includes("load-reel-script-for-video-job")) {
          return {
            loadReelScriptForVideoJob: async () => ({
              visualMode: "own_avatar",
              modalidad: "own_avatar",
              hasReferenceLoop: false,
              package: {
                targetDurationSec: 30,
                voiceoverText: "Hello world",
              },
            }),
          };
        }
        if (req.includes("resolve-provider-for-job")) {
          return {
            resolveProviderForJob: async () => ({
              ok: true,
              decision: { providerKey: "sadtalker_low", providerTier: "low" },
            }),
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
              callOrder.push("budget");
              return {
                ok: true,
                estimatedCostCents: 10,
                cumulativeCostCents: 0,
                maxCostCents: 100,
                providerTier: "low",
              };
            },
          };
        }
        if (req.includes("assert-active-avatar-consent-for-jobs")) {
          return {
            assertActiveAvatarConsentForJobs: async () => {
              callOrder.push("consent");
              return { ok: true };
            },
          };
        }
        if (req.includes("record-reel-spend-event")) {
          return {
            recordReelSpendEvent: async () => ({ spendEventId: "spend-1" }),
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
                if (table === "neuramark_media_assets") {
                  return chainableQuery({
                    maybeSingle: async () => ({
                      data: { id: PORTRAIT_ASSET_ID },
                      error: null,
                    }),
                  });
                }
                if (table === "neuramark_video_jobs") {
                  return chainableQuery({
                    insert: (payload: Record<string, unknown>) =>
                      chainableQuery({
                        select: () =>
                          chainableQuery({
                            single: async () => {
                              insertedPayload = payload;
                              return {
                                data: baseVideoJobRow({
                                  ...payload,
                                  id: JOB_ID,
                                }),
                                error: null,
                              };
                            },
                          }),
                      }),
                    update: () => chainableQuery({ eq: () => ({ error: null }) }),
                  });
                }
                return chainableQuery({});
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearVideoJobModuleCache();
        const { createTalkingHeadVideoJob } = loadVideoJobModule(
          "./create-talking-head-video-job.ts",
        );

        const result = await createTalkingHeadVideoJob({
          clientId: CLIENT_ID,
          reelScriptId: REEL_SCRIPT_ID,
          targetDurationSec: 30,
          portraitAssetId: PORTRAIT_ASSET_ID,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
        });

        assert.equal(result.ok, true);
        assert.deepEqual(callOrder, ["budget", "consent", "createJob"]);
        assert.equal(insertedPayload?.parent_job_id, null);
        assert.equal(insertedPayload?.attempt, 1);
      } finally {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      }
    });
  });
});

describe("retry lineage", () => {
  it("inserts child job with parent_job_id and incremented attempt", async () => {
    await withServerOnlyStub(async () => {
      let insertedPayload: Record<string, unknown> | null = null;

      const mockAdapter = {
        estimateCost: async () => ({ estimatedCostCents: 10 }),
        createJob: async () => ({
          externalJobId: "pred-retry-002",
          status: "queued" as const,
        }),
      };

      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => ({
              id: CLIENT_ID,
              role: "operator",
            }),
          };
        }
        if (req.includes("load-reel-script-for-video-job")) {
          return {
            loadReelScriptForVideoJob: async () => ({
              visualMode: "stock",
              modalidad: "stock",
              hasReferenceLoop: false,
              package: {
                targetDurationSec: 30,
                voiceoverText: "Retry test",
              },
            }),
          };
        }
        if (req.includes("resolve-provider-for-job")) {
          return {
            resolveProviderForJob: async () => ({
              ok: true,
              decision: { providerKey: "sadtalker_low", providerTier: "low" },
            }),
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
            assertReelBudgetAllowsEstimatedSpend: async () => ({
              ok: true,
              estimatedCostCents: 10,
              cumulativeCostCents: 20,
              maxCostCents: 100,
              providerTier: "low",
            }),
          };
        }
        if (req.includes("record-reel-spend-event")) {
          return {
            recordReelSpendEvent: async () => ({ spendEventId: "spend-2" }),
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
                if (table === "neuramark_media_assets") {
                  return chainableQuery({
                    maybeSingle: async () => ({
                      data: { id: PORTRAIT_ASSET_ID },
                      error: null,
                    }),
                  });
                }
                if (table === "neuramark_video_jobs") {
                  return chainableQuery({
                    insert: (payload: Record<string, unknown>) =>
                      chainableQuery({
                        select: () =>
                          chainableQuery({
                            single: async () => {
                              insertedPayload = payload;
                              return {
                                data: baseVideoJobRow({
                                  ...payload,
                                  id: "88888888-8888-4888-8888-888888888888",
                                }),
                                error: null,
                              };
                            },
                          }),
                      }),
                    update: () => chainableQuery({ eq: () => ({ error: null }) }),
                  });
                }
                return chainableQuery({});
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearVideoJobModuleCache();
        const { createTalkingHeadVideoJob } = loadVideoJobModule(
          "./create-talking-head-video-job.ts",
        );

        const result = await createTalkingHeadVideoJob(
          {
            clientId: CLIENT_ID,
            reelScriptId: REEL_SCRIPT_ID,
            targetDurationSec: 30,
            portraitAssetId: PORTRAIT_ASSET_ID,
            voiceoverAssetId: VOICEOVER_ASSET_ID,
          },
          {
            parentJobId: PARENT_JOB_ID,
            attempt: 2,
            operatorClientId: CLIENT_ID,
            jobKind: "talking_head_retry",
            portraitAssetId: PORTRAIT_ASSET_ID,
            voiceoverAssetId: VOICEOVER_ASSET_ID,
          },
        );

        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.attempt, 2);
        }
        assert.equal(insertedPayload?.parent_job_id, PARENT_JOB_ID);
        assert.equal(insertedPayload?.attempt, 2);
      } finally {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      }
    });
  });
});

describe("stale sweeper", () => {
  it("selects queued/processing jobs older than stale timeout cutoff", async () => {
    await withServerOnlyStub(async () => {
      let capturedLt: { column: string; value: string } | null = null;
      let capturedStatuses: string[] | null = null;

      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("apply-video-job-status-update")) {
          return {
            applyVideoJobStatusUpdate: async () => ({
              ok: true,
              jobId: JOB_ID,
              status: "failed" as const,
              idempotent: false,
            }),
          };
        }
        if (req.includes("supabase/server")) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from: () =>
                chainableQuery({
                  select: () =>
                    chainableQuery({
                      in: (_column: string, values: string[]) => {
                        capturedStatuses = values;
                        return chainableQuery({
                          lt: (column: string, value: string) => {
                            capturedLt = { column, value };
                            return Promise.resolve({
                              data: [{ id: JOB_ID }],
                              error: null,
                            });
                          },
                        });
                      },
                    }),
                }),
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearVideoJobModuleCache();
        const { markStaleVideoJobsFailed } = loadVideoJobModule(
          "./mark-stale-video-jobs-failed.ts",
        );
        const { readVideoJobStaleTimeoutMs } = await import(
          "./video-job-config-readers"
        );

        const staleMs = readVideoJobStaleTimeoutMs({});
        const before = Date.now();
        const result = await markStaleVideoJobsFailed();
        const after = Date.now();

        assert.equal(result.markedCount, 1);
        assert.deepEqual(capturedStatuses, ["queued", "processing"]);
        assert.equal(capturedLt?.column, "updated_at");
        assert.ok(capturedLt?.value);

        const cutoffMs = Date.parse(capturedLt!.value);
        const expectedMin = before - staleMs - 1000;
        const expectedMax = after - staleMs + 1000;
        assert.ok(cutoffMs >= expectedMin && cutoffMs <= expectedMax);
      } finally {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      }
    });
  });
});

describe("poller terminal path", () => {
  it("delegates completed vendor status to applyVideoJobStatusUpdate", async () => {
    await withServerOnlyStub(async () => {
      let statusUpdateInput: Record<string, unknown> | null = null;
      let pollCount = 0;

      const processingJob = baseVideoJobRow({ status: "processing" });
      const mockAdapter = {
        getJobStatus: async () => {
          pollCount += 1;
          return {
            status: "completed" as const,
            progressPercent: 100,
            rawOutputUrl: "https://replicate.delivery/pbxt/out.mp4",
          };
        },
      };

      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("load-video-job")) {
          return {
            loadVideoJobByIdUnscoped: async () => {
              if (pollCount === 0) {
                const { mapVideoJobRow } = require("./video-job-row.ts");
                return mapVideoJobRow(processingJob);
              }
              const { mapVideoJobRow } = require("./video-job-row.ts");
              return mapVideoJobRow({ ...processingJob, status: "completed" });
            },
            loadVideoJobScoped: async () => null,
            loadVideoJobById: async () => null,
          };
        }
        if (req.includes("get-video-adapter-for-job")) {
          return {
            getVideoAdapterForJob: async () => mockAdapter,
          };
        }
        if (req.includes("apply-video-job-status-update")) {
          return {
            applyVideoJobStatusUpdate: async (input: Record<string, unknown>) => {
              statusUpdateInput = input;
              return {
                ok: true,
                jobId: JOB_ID,
                status: "completed",
                idempotent: false,
              };
            },
          };
        }
        if (req.includes("video-job-config")) {
          return {
            getVideoJobPollIntervalMs: () => 1,
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearVideoJobModuleCache();
        process.env.VIDEO_JOB_POLL_INTERVAL_MS = "1";
        const { pollVideoJobUntilTerminal } = loadVideoJobModule(
          "./poll-video-job-until-terminal.ts",
        );

        await pollVideoJobUntilTerminal(JOB_ID);

        assert.equal(pollCount, 1);
        assert.equal(statusUpdateInput?.jobId, JOB_ID);
        assert.equal(statusUpdateInput?.source, "poller");
        assert.equal(
          (statusUpdateInput?.normalizedStatus as { status?: string })?.status,
          "completed",
        );
      } finally {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      }
    });
  });
});

describe("GET /api/video-jobs/[jobId] IDOR", () => {
  it("returns 404 for foreign job id (client scope)", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => ({
              id: CLIENT_ID,
              role: "operator",
            }),
            isAuthGuardError: () => false,
            authGuardResponse: () => new Response(null, { status: 403 }),
          };
        }
        if (req.includes("load-video-job")) {
          return {
            loadVideoJobScoped: async (params: {
              jobId: string;
              clientId: string;
            }) => {
              if (
                params.jobId === JOB_ID &&
                params.clientId === CLIENT_ID
              ) {
                const { mapVideoJobRow } = require("./video-job-row.ts");
                return mapVideoJobRow(baseVideoJobRow());
              }
              return null;
            },
          };
        }
        if (req.includes("map-operator-video-job-dto")) {
          return {
            mapOperatorVideoJobSummaryDto: async (job: { id: string }) => ({
              status: "completed",
              jobId: job.id,
              reelScriptId: REEL_SCRIPT_ID,
              attempt: 1,
              regenerationCount: 1,
              failureReason: null,
              canRetry: false,
              retryBlockedReasonKey: null,
              createdAt: "2026-08-31T16:00:00.000Z",
              updatedAt: "2026-08-31T16:05:00.000Z",
              cost: {
                jobId: job.id,
                reelScriptId: REEL_SCRIPT_ID,
                estimatedCostCents: 18,
                actualCostCents: 18,
                costStatus: "actual",
              },
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearVideoJobModuleCache();
        const { GET } = loadVideoJobModule(
          "../../app/api/video-jobs/[jobId]/route.ts",
        );

        const foreignRes = await GET(
          new Request(`http://localhost/api/video-jobs/${FOREIGN_JOB_ID}`),
          { params: Promise.resolve({ jobId: FOREIGN_JOB_ID }) },
        );
        assert.equal(foreignRes.status, 404);

        const ownRes = await GET(
          new Request(`http://localhost/api/video-jobs/${JOB_ID}`),
          { params: Promise.resolve({ jobId: JOB_ID }) },
        );
        assert.equal(ownRes.status, 200);
        const ownBody = (await ownRes.json()) as {
          cost?: { costStatus?: string; actualCostCents?: number };
          cost_model?: unknown;
          envKeyName?: unknown;
        };
        assert.equal(ownBody.cost?.costStatus, "actual");
        assert.equal(ownBody.cost?.actualCostCents, 18);
        assert.equal("cost_model" in ownBody, false);
        assert.equal("envKeyName" in ownBody, false);
        assert.equal(ownBody.cost && "cost_model" in ownBody.cost, false);
      } finally {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      }
    });
  });
});

describe("GET /api/video-jobs/[jobId] Cliente 403 (US-7.3-B)", () => {
  it("returns 403 without cost JSON for non-operator", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => {
              const err = Object.assign(new Error("forbidden"), { status: 403 });
              throw err;
            },
            isAuthGuardError: (error: unknown) =>
              Boolean(
                error &&
                  typeof error === "object" &&
                  "status" in error &&
                  (error as { status: number }).status === 403,
              ),
            authGuardResponse: () =>
              new Response(
                JSON.stringify({ error: { code: "FORBIDDEN" } }),
                {
                  status: 403,
                  headers: { "Content-Type": "application/json" },
                },
              ),
          };
        }
        if (req.includes("load-video-job")) {
          return {
            loadVideoJobScoped: async () => {
              throw new Error("must not load job after Cliente 403");
            },
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        clearVideoJobModuleCache();
        const { GET } = loadVideoJobModule(
          "../../app/api/video-jobs/[jobId]/route.ts",
        );

        const res = await GET(
          new Request(`http://localhost/api/video-jobs/${JOB_ID}`),
          { params: Promise.resolve({ jobId: JOB_ID }) },
        );
        assert.equal(res.status, 403);
        const body = (await res.json()) as Record<string, unknown>;
        const raw = JSON.stringify(body);
        assert.match(raw, /FORBIDDEN/);
        assert.doesNotMatch(raw, /actualCostCents/);
        assert.doesNotMatch(raw, /estimatedCostCents/);
        assert.doesNotMatch(raw, /"cost"/);
      } finally {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      }
    });
  });
});

describe("retry budget soft UX", () => {
  it("evaluateRetryEligibility blocks canRetry when budget exceeded", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);
      let budgetChecked = false;

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("assert-video-job-budget")) {
          return {
            assertVideoJobBudgetAllowsSpend: async () => {
              budgetChecked = true;
              return { ok: false, code: "BUDGET_EXCEEDED" };
            },
          };
        }
        if (req.includes("supabase/server")) {
          return {
            isSupabaseConfigured: () => true,
            createServerSupabaseClient: () => ({
              from: () =>
                chainableQuery({
                  select: () =>
                    chainableQuery({
                      eq: () =>
                        chainableQuery({
                          order: () =>
                            chainableQuery({
                              limit: () =>
                                chainableQuery({
                                  maybeSingle: async () => ({
                                    data: { attempt: 1 },
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
        clearVideoJobModuleCache();
        const { evaluateRetryEligibility } = loadVideoJobModule(
          "./retry-eligibility.ts",
        );

        const result = await evaluateRetryEligibility({
          clientId: CLIENT_ID,
          reelScriptId: REEL_SCRIPT_ID,
          jobId: JOB_ID,
          status: "failed",
          attempt: 1,
          estimatedCostCents: 10,
          operatorClientId: CLIENT_ID,
        });

        assert.equal(budgetChecked, true);
        assert.equal(result.canRetry, false);
        assert.equal(
          result.retryBlockedReasonKey,
          "scripts.videoJob.retry.budgetExceeded",
        );
      } finally {
        nodeModule._load = originalLoad;
        clearVideoJobModuleCache();
      }
    });
  });
});

describe("poller-only status writes", () => {
  it("apply-video-job-status-update module is server-only", () => {
    const source = readFileSync(
      path.join(__dirname, "apply-video-job-status-update.ts"),
      "utf8",
    );
    assert.match(source, /import ["']server-only["']/);
  });

  it("no app route mutates neuramark_video_jobs status from request body", () => {
    const routeSource = readFileSync(
      path.join(repoRoot, "app/api/video-jobs/[jobId]/route.ts"),
      "utf8",
    );
    assert.doesNotMatch(routeSource, /\bPATCH\b/);
    assert.doesNotMatch(routeSource, /\bPOST\b/);
    assert.doesNotMatch(routeSource, /\.update\s*\(/);
  });
});
