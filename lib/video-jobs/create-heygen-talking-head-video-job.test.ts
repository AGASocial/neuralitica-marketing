/**
 * US-8.7 Phase B — HeyGen orchestrator unlock + Operator fallback tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const PARENT_JOB_ID = "55555555-5555-4555-8555-555555555555";
const VOICEOVER_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const PORTRAIT_ASSET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXTERNAL_JOB_ID = "v_mock_heygen_001";

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
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/providers/") ||
      normalized.includes("/lib/cost-policy/") ||
      normalized.includes("/lib/visual-preferences/")
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

function chainableQuery(terminal: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = terminal.select ?? self;
  builder.eq = terminal.eq ?? self;
  builder.in = terminal.in ?? self;
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

type HeygenMockOptions = {
  role?: "operator" | "client";
  providerTier?: "low" | "high";
  catalogActive?: boolean;
  latestJob?: {
    id: string;
    status: string;
    providerKey: string;
  } | null;
  script?: {
    visualMode: string;
    modalidad: string;
    hasReferenceLoop: boolean;
    package: { targetDurationSec: number; voiceoverText: string };
  };
  onCreateJob?: (input: Record<string, unknown>) => void;
  onBudget?: (args?: { estimatedCostCents: number }) => void;
  onConsent?: () => void;
  resolveProviderKey?: string;
  /** Simulate neuramark_video_job_heygen_fallback_overrides INSERT failure (QA M2). */
  overrideInsertFails?: boolean;
};

function installHeygenMocks(options: HeygenMockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  let insertedPayload: Record<string, unknown> | null = null;
  let overridePayload: Record<string, unknown> | null = null;
  let lastJobUpdate: Record<string, unknown> | null = null;
  let createJobCalled = false;
  let budgetCalled = false;
  let consentCalled = false;
  let spendCalled = false;
  let pollEnqueued = false;
  let lastEstimateDurationSec: number | undefined;

  const role = options.role ?? "operator";
  const providerTier = options.providerTier ?? "low";
  const catalogActive = options.catalogActive ?? true;
  const script = options.script ?? {
    visualMode: "own_avatar",
    modalidad: "own_avatar",
    hasReferenceLoop: false,
    package: { targetDurationSec: 30, voiceoverText: "HeyGen path" },
  };
  const latestJob =
    options.latestJob === undefined
      ? {
          id: PARENT_JOB_ID,
          status: "failed",
          providerKey: "sadtalker_low",
        }
      : options.latestJob;

  const mockAdapter = {
    estimateCost: async (input: { targetDurationSec?: number }) => {
      lastEstimateDurationSec = input.targetDurationSec;
      return {
        estimatedCostCents: 2 * (input.targetDurationSec ?? 30),
        currency: "USD" as const,
        providerKey: "heygen_high",
      };
    },
    createJob: async (input: Record<string, unknown>) => {
      createJobCalled = true;
      options.onCreateJob?.(input);
      return {
        externalJobId: EXTERNAL_JOB_ID,
        status: "queued" as const,
        estimatedCostCents: 60,
      };
    },
  };

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);

    if (req.includes("require-user")) {
      return {
        requireOperator: async () => {
          if (role !== "operator") {
            const err = Object.assign(new Error("Forbidden"), {
              status: 403,
              code: "FORBIDDEN",
            });
            throw err;
          }
          return { id: CLIENT_ID, role: "operator" };
        },
        isAuthGuardError: (error: unknown) =>
          !!error &&
          typeof error === "object" &&
          "status" in error &&
          ((error as { status: number }).status === 401 ||
            (error as { status: number }).status === 403),
      };
    }

    if (req.includes("load-reel-script-for-video-job")) {
      return { loadReelScriptForVideoJob: async () => script };
    }

    if (req.includes("resolve-provider-for-job")) {
      return {
        resolveProviderForJob: async () => ({
          ok: true,
          decision: {
            providerKey: options.resolveProviderKey ?? "sadtalker_low",
            providerTier,
          },
        }),
      };
    }

    if (req.includes("get-cost-policy-for-client")) {
      return {
        getCostPolicyForClient: async () => ({
          ok: true,
          policy: {
            id: "00000000-0000-4000-8000-000000000099",
            clientId: CLIENT_ID,
            providerTier,
            maxCostCents: 500,
            rules: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          scope: "client",
        }),
      };
    }

    if (req.includes("get-provider-catalog")) {
      return {
        getProviderCatalog: async () => ({
          providers: [
            {
              key: "heygen_high",
              assetRole: "talking_head",
              tier: "high",
              active: catalogActive,
              capabilities: {},
              costModel: { billingUnit: "per_second", unitCostCents: 2 },
              envKeyName: "HEYGEN_API_KEY",
            },
            {
              key: "sadtalker_low",
              assetRole: "talking_head",
              tier: "low",
              active: true,
              capabilities: {},
              costModel: { billingUnit: "per_run", unitCostCents: 10 },
              envKeyName: "REPLICATE_API_TOKEN",
            },
          ],
        }),
      };
    }

    if (req.includes("create-provider-registry")) {
      return {
        initializeProviderRegistryFromCatalog: async () => ({
          getVideoAdapter: (key: string) => {
            if (key !== "heygen_high" && key !== "sadtalker_low") {
              throw new Error(`missing adapter ${key}`);
            }
            if (key === "heygen_high") return mockAdapter;
            return {
              estimateCost: async () => ({ estimatedCostCents: 10 }),
              createJob: async () => ({
                externalJobId: "pred-low",
                status: "queued",
              }),
            };
          },
        }),
      };
    }

    if (req.includes("assert-reel-budget-allows-estimated-spend")) {
      return {
        assertReelBudgetAllowsEstimatedSpend: async (args: {
          estimatedCostCents: number;
        }) => {
          budgetCalled = true;
          options.onBudget?.(args);
          return { ok: true };
        },
      };
    }

    if (req.includes("assert-active-avatar-consent-for-jobs")) {
      return {
        assertActiveAvatarConsentForJobs: async () => {
          consentCalled = true;
          options.onConsent?.();
          return { ok: true };
        },
      };
    }

    if (req.includes("record-reel-spend-event")) {
      return {
        recordReelSpendEvent: async () => {
          spendCalled = true;
          return {
            spendEventId: "99999999-9999-4999-8999-999999999999",
          };
        },
      };
    }

    if (req.includes("log-provider-decision")) {
      return { logProviderDecision: async () => {} };
    }

    if (req.includes("enqueue-video-job-poll")) {
      return {
        enqueueVideoJobPoll: () => {
          pollEnqueued = true;
        },
      };
    }

    if (req.includes("supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table === "neuramark_media_assets") {
              return chainableQuery({
                maybeSingle: async () => ({
                  data: { id: "asset" },
                  error: null,
                }),
              });
            }
            if (table === "neuramark_video_jobs") {
              return chainableQuery({
                insert: (payload: Record<string, unknown>) => {
                  insertedPayload = payload;
                  return chainableQuery({
                    select: () =>
                      chainableQuery({
                        single: async () => ({
                          data: {
                            id: JOB_ID,
                            client_id: CLIENT_ID,
                            reel_script_id: REEL_SCRIPT_ID,
                            provider_key: payload.provider_key,
                            provider_tier: payload.provider_tier,
                            asset_role: "primary",
                            external_job_id: EXTERNAL_JOB_ID,
                            status: "queued",
                            estimated_cost_cents: payload.estimated_cost_cents,
                            actual_cost_cents: null,
                            failure_reason: null,
                            portrait_asset_id: payload.portrait_asset_id ?? null,
                            voiceover_asset_id: payload.voiceover_asset_id,
                            output_media_asset_id: null,
                            parent_job_id: payload.parent_job_id ?? null,
                            spend_event_id: null,
                            operator_client_id: CLIENT_ID,
                            attempt: payload.attempt ?? 1,
                            created_at: "2026-08-31T00:00:00.000Z",
                            updated_at: "2026-08-31T00:00:00.000Z",
                          },
                          error: null,
                        }),
                      }),
                  });
                },
                update: (payload: Record<string, unknown>) => {
                  lastJobUpdate = payload;
                  return chainableQuery({
                    eq: async () => ({ error: null }),
                  });
                },
                maybeSingle: async () => {
                  if (!latestJob) {
                    return { data: null, error: null };
                  }
                  return {
                    data: {
                      id: latestJob.id,
                      status: latestJob.status,
                      provider_key: latestJob.providerKey,
                    },
                    error: null,
                  };
                },
              });
            }
            if (table === "neuramark_video_job_heygen_fallback_overrides") {
              return chainableQuery({
                insert: (payload: Record<string, unknown>) => {
                  overridePayload = payload;
                  if (options.overrideInsertFails) {
                    return {
                      error: { message: "override insert failed" },
                    };
                  }
                  return { error: null };
                },
              });
            }
            return chainableQuery({});
          },
        }),
      };
    }

    return originalLoad(request, parent, isMain);
  };

  return {
    restore: () => {
      nodeModule._load = originalLoad;
      clearModuleCache();
    },
    getInserted: () => insertedPayload,
    getOverride: () => overridePayload,
    getLastJobUpdate: () => lastJobUpdate,
    getLastEstimateDurationSec: () => lastEstimateDurationSec,
    wasCreateJobCalled: () => createJobCalled,
    wasBudgetCalled: () => budgetCalled,
    wasConsentCalled: () => consentCalled,
    wasSpendCalled: () => spendCalled,
    wasPollEnqueued: () => pollEnqueued,
  };
}

afterEach(() => {
  clearModuleCache();
  delete process.env.HEYGEN_DEFAULT_AVATAR_ID;
});

describe("US-8.7 Phase B — HeyGen unlock + fallback", () => {
  it("1 — allowlist includes heygen_high after unlock", () => {
    const source = readFileSync(
      path.join(__dirname, "create-talking-head-video-job.ts"),
      "utf8",
    );
    assert.match(source, /providerKey === ["']heygen_high["']/);
    assert.match(source, /isAllowedTalkingHeadProviderKey/);
  });

  it("2 — provider_tier=low + active heygen → never heygen_high (policy)", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      const { resolveProvider } = require("../providers/provider-adapters.ts") as {
        resolveProvider: (
          catalog: unknown[],
          opts: Record<string, unknown>,
        ) => { key: string };
      };

      const catalog = [
        {
          key: "sadtalker_low",
          assetRole: "talking_head",
          tier: "low",
          active: true,
          capabilities: {},
          costModel: { billingUnit: "per_run", unitCostCents: 10 },
          envKeyName: "REPLICATE_API_TOKEN",
        },
        {
          key: "heygen_high",
          assetRole: "talking_head",
          tier: "high",
          active: true,
          capabilities: {},
          costModel: { billingUnit: "per_second", unitCostCents: 2 },
          envKeyName: "HEYGEN_API_KEY",
        },
      ];

      const resolved = resolveProvider(catalog, {
        assetRole: "talking_head",
        tier: "low",
        hasReferenceLoop: false,
      });
      assert.equal(resolved.key, "sadtalker_low");
      assert.notEqual(resolved.key, "heygen_high");
    });
  });

  it("3 — provider_tier=high + active → policy selects heygen_high", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      const { resolveProvider } = require("../providers/provider-adapters.ts") as {
        resolveProvider: (
          catalog: unknown[],
          opts: Record<string, unknown>,
        ) => { key: string };
      };

      const catalog = [
        {
          key: "heygen_high",
          assetRole: "talking_head",
          tier: "high",
          active: true,
          capabilities: {},
          costModel: { billingUnit: "per_second", unitCostCents: 2 },
          envKeyName: "HEYGEN_API_KEY",
        },
      ];

      const resolved = resolveProvider(catalog, {
        assetRole: "talking_head",
        tier: "high",
        hasReferenceLoop: false,
      });
      assert.equal(resolved.key, "heygen_high");
    });
  });

  it("4 — Operator fallback + failed low parent → create HeyGen + audit row", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      process.env.HEYGEN_DEFAULT_AVATAR_ID = "studio_avatar";
      const harness = installHeygenMocks({
        providerTier: "low",
        catalogActive: true,
        script: {
          visualMode: "generic_avatar",
          modalidad: "generic_avatar",
          hasReferenceLoop: false,
          package: { targetDurationSec: 30, voiceoverText: "x" },
        },
        latestJob: {
          id: PARENT_JOB_ID,
          status: "failed",
          providerKey: "sadtalker_low",
        },
      });

      try {
        const mod = require("./create-heygen-talking-head-video-job.ts") as {
          createHeygenTalkingHeadVideoJob: (
            input: unknown,
          ) => Promise<Record<string, unknown>>;
        };
        const result = await mod.createHeygenTalkingHeadVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          confirmEstimateCents: 60,
        });
        assert.equal(result.ok, true);
        assert.equal(result.usedOperatorFallback, true);
        assert.equal(harness.getInserted()?.provider_key, "heygen_high");
        assert.equal(harness.getInserted()?.provider_tier, "high");
        assert.equal(harness.getInserted()?.parent_job_id, PARENT_JOB_ID);
        assert.equal(harness.getOverride()?.parent_job_id, PARENT_JOB_ID);
        assert.equal(
          harness.getOverride()?.rationale_key,
          "operator_heygen_fallback",
        );
      } finally {
        harness.restore();
      }
    });
  });

  it("5 — Cliente fallback → 403 FORBIDDEN", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      const harness = installHeygenMocks({ role: "client" });
      try {
        const mod = require("./create-heygen-talking-head-video-job.ts") as {
          createHeygenTalkingHeadVideoJob: (
            input: unknown,
          ) => Promise<{ ok: boolean; error?: { code: string } }>;
        };
        const result = await mod.createHeygenTalkingHeadVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          confirmEstimateCents: 60,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error?.code, "FORBIDDEN");
        assert.equal(harness.wasCreateJobCalled(), false);
      } finally {
        harness.restore();
      }
    });
  });

  it("6 — fallback without failed low parent (and not high tier) → HEYGEN_FALLBACK_INELIGIBLE", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      const harness = installHeygenMocks({
        providerTier: "low",
        latestJob: {
          id: PARENT_JOB_ID,
          status: "completed",
          providerKey: "sadtalker_low",
        },
      });
      try {
        const mod = require("./create-heygen-talking-head-video-job.ts") as {
          createHeygenTalkingHeadVideoJob: (
            input: unknown,
          ) => Promise<{ ok: boolean; error?: { code: string } }>;
        };
        const result = await mod.createHeygenTalkingHeadVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          portraitAssetId: PORTRAIT_ASSET_ID,
          confirmEstimateCents: 60,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error?.code, "HEYGEN_FALLBACK_INELIGIBLE");
        assert.equal(harness.wasCreateJobCalled(), false);
      } finally {
        harness.restore();
      }
    });
  });

  it("7 — budget + consent spies called before createJob on HeyGen path", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      const order: string[] = [];
      const harness = installHeygenMocks({
        providerTier: "high",
        latestJob: null,
        onBudget: () => order.push("budget"),
        onConsent: () => order.push("consent"),
        onCreateJob: () => order.push("create"),
      });
      try {
        const mod = require("./create-heygen-talking-head-video-job.ts") as {
          createHeygenTalkingHeadVideoJob: (
            input: unknown,
          ) => Promise<{ ok: boolean }>;
        };
        const result = await mod.createHeygenTalkingHeadVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          portraitAssetId: PORTRAIT_ASSET_ID,
          confirmEstimateCents: 60,
        });
        assert.equal(result.ok, true);
        assert.deepEqual(order, ["budget", "consent", "create"]);
        assert.equal(harness.wasBudgetCalled(), true);
        assert.equal(harness.wasConsentCalled(), true);
      } finally {
        harness.restore();
      }
    });
  });

  it("8 — client provider_key → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      const harness = installHeygenMocks({ providerTier: "high", latestJob: null });
      try {
        const mod = require("./create-heygen-talking-head-video-job.ts") as {
          createHeygenTalkingHeadVideoJob: (
            input: unknown,
          ) => Promise<{ ok: boolean; error?: { code: string } }>;
        };
        const result = await mod.createHeygenTalkingHeadVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          portraitAssetId: PORTRAIT_ASSET_ID,
          confirmEstimateCents: 60,
          provider_key: "heygen_high",
          engine: { type: "avatar_iv" },
        });
        assert.equal(result.ok, false);
        assert.equal(result.error?.code, "FORBIDDEN_FIELDS");
        assert.equal(harness.wasCreateJobCalled(), false);
      } finally {
        harness.restore();
      }
    });
  });

  it("9 — low-tier retry stays on low provider (source: no silent HeyGen)", () => {
    const source = readFileSync(
      path.join(__dirname, "actions/retry-video-job.ts"),
      "utf8",
    );
    assert.match(source, /forcedProviderKey:\s*["']heygen_high["']/);
    assert.match(source, /failedJob\.providerKey === ["']heygen_high["']/);
  });

  it("10 — HeyGen retry stays on heygen_high (forced when parent is heygen)", () => {
    const source = readFileSync(
      path.join(__dirname, "create-talking-head-video-job.ts"),
      "utf8",
    );
    assert.match(source, /forcedProviderKey/);
    assert.match(source, /heygen_high/);
  });

  it("11 — M1: client targetDurationSec: 1 cannot shrink estimate below package duration", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      let budgetEstimate: number | undefined;
      let createDuration: number | undefined;
      const harness = installHeygenMocks({
        providerTier: "high",
        latestJob: null,
        script: {
          visualMode: "own_avatar",
          modalidad: "own_avatar",
          hasReferenceLoop: false,
          package: { targetDurationSec: 30, voiceoverText: "HeyGen path" },
        },
        onBudget: (args) => {
          budgetEstimate = args?.estimatedCostCents;
        },
        onCreateJob: (input) => {
          createDuration = input.targetDurationSec as number | undefined;
        },
      });
      try {
        const mod = require("./create-heygen-talking-head-video-job.ts") as {
          createHeygenTalkingHeadVideoJob: (
            input: unknown,
          ) => Promise<{ ok: boolean; estimatedCostCents?: number }>;
        };
        const result = await mod.createHeygenTalkingHeadVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          targetDurationSec: 1,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          portraitAssetId: PORTRAIT_ASSET_ID,
          confirmEstimateCents: 2,
        });
        assert.equal(result.ok, true);
        assert.equal(harness.getLastEstimateDurationSec(), 30);
        assert.equal(createDuration, 30);
        assert.equal(budgetEstimate, 60);
        assert.equal(result.estimatedCostCents, 60);
        assert.equal(harness.getInserted()?.estimated_cost_cents, 60);
      } finally {
        harness.restore();
      }
    });
  });

  it("12 — M2: fallback override INSERT failure marks job failed (no spend/poll)", async () => {
    await withServerOnlyStub(async () => {
      clearModuleCache();
      process.env.HEYGEN_DEFAULT_AVATAR_ID = "studio_avatar";
      const harness = installHeygenMocks({
        providerTier: "low",
        catalogActive: true,
        overrideInsertFails: true,
        script: {
          visualMode: "generic_avatar",
          modalidad: "generic_avatar",
          hasReferenceLoop: false,
          package: { targetDurationSec: 30, voiceoverText: "x" },
        },
        latestJob: {
          id: PARENT_JOB_ID,
          status: "failed",
          providerKey: "sadtalker_low",
        },
      });
      try {
        const mod = require("./create-heygen-talking-head-video-job.ts") as {
          createHeygenTalkingHeadVideoJob: (
            input: unknown,
          ) => Promise<{ ok: boolean; error?: { code: string } }>;
        };
        const result = await mod.createHeygenTalkingHeadVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          confirmEstimateCents: 60,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error?.code, "INTERNAL_ERROR");
        assert.equal(harness.wasCreateJobCalled(), true);
        assert.ok(harness.getInserted());
        assert.equal(harness.getLastJobUpdate()?.status, "failed");
        assert.equal(
          harness.getLastJobUpdate()?.failure_reason,
          "heygen_fallback_audit_failed",
        );
        assert.equal(harness.wasSpendCalled(), false);
        assert.equal(harness.wasPollEnqueued(), false);
      } finally {
        harness.restore();
      }
    });
  });
});
