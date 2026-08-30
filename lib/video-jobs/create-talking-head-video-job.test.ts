/**
 * US-8.6 Phase B — MuseTalk orchestrator unlock tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { afterEach, describe, it } from "node:test";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const LOOP_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const VOICEOVER_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const PORTRAIT_ASSET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FOREIGN_LOOP_ASSET_ID = "99999999-9999-4999-8999-999999999999";
const PARENT_JOB_ID = "55555555-5555-4555-8555-555555555555";
const EXTERNAL_JOB_ID = "pred-musetalk-001";

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
      normalized.includes("/lib/media/get-primary-reference-loop") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server")
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

type OrchestratorMockOptions = {
  providerKey?: "musetalk_low" | "sadtalker_low";
  script?: {
    visualMode: string;
    modalidad: string;
    hasReferenceLoop: boolean;
    package: { targetDurationSec: number; voiceoverText: string };
  };
  loopAssetId?: string | null;
  onCreateJob?: (input: Record<string, unknown>) => void;
};

function installOrchestratorMocks(options: OrchestratorMockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  let insertedPayload: Record<string, unknown> | null = null;
  let createJobInput: Record<string, unknown> | null = null;

  const providerKey = options.providerKey ?? "musetalk_low";
  const script = options.script ?? {
    visualMode: "generic_avatar",
    modalidad: "generic_avatar",
    hasReferenceLoop: true,
    package: { targetDurationSec: 30, voiceoverText: "Loop path test" },
  };
  const loopAssetId =
    options.loopAssetId === undefined ? LOOP_ASSET_ID : options.loopAssetId;

  const mockAdapter = {
    estimateCost: async () => ({ estimatedCostCents: 19 }),
    createJob: async (input: Record<string, unknown>) => {
      createJobInput = input;
      options.onCreateJob?.(input);
      return { externalJobId: EXTERNAL_JOB_ID, status: "queued" as const };
    },
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
      };
    }
    if (req.includes("load-reel-script-for-video-job")) {
      return { loadReelScriptForVideoJob: async () => script };
    }
    if (req.includes("resolve-provider-for-job")) {
      return {
        resolveProviderForJob: async () => ({
          ok: true,
          decision: { providerKey, providerTier: "low" },
        }),
      };
    }
    if (req.includes("get-primary-reference-loop-video-asset-for-client")) {
      return {
        getPrimaryReferenceLoopVideoAssetForClient: async () =>
          loopAssetId ? { assetId: loopAssetId } : null,
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
          estimatedCostCents: 19,
          cumulativeCostCents: 0,
          maxCostCents: 100,
          providerTier: "low",
        }),
      };
    }
    if (req.includes("assert-active-avatar-consent-for-jobs")) {
      return {
        assertActiveAvatarConsentForJobs: async () => ({ ok: true }),
      };
    }
    if (req.includes("record-reel-spend-event")) {
      return {
        recordReelSpendEvent: async () => ({ spendEventId: "spend-musetalk" }),
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
                  data: { id: "verified" },
                  error: null,
                }),
                eq: () =>
                  chainableQuery({
                    maybeSingle: async (ctx?: { assetId?: string }) => {
                      void ctx;
                      return { data: { id: "verified" }, error: null };
                    },
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
                            data: {
                              id: JOB_ID,
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
                              parent_job_id: payload.parent_job_id,
                              spend_event_id: null,
                              attempt: payload.attempt,
                              created_at: new Date().toISOString(),
                              updated_at: new Date().toISOString(),
                            },
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

  return {
    restore: () => {
      nodeModule._load = originalLoad;
      clearVideoJobModuleCache();
    },
    getInsertedPayload: () => insertedPayload,
    getCreateJobInput: () => createJobInput,
  };
}

describe("US-8.6 Phase B — createTalkingHeadVideoJob MuseTalk unlock", () => {
  afterEach(() => {
    clearVideoJobModuleCache();
  });

  it("creates musetalk_low job with server-resolved loop and voiceover", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installOrchestratorMocks({ providerKey: "musetalk_low" });

      try {
        const { createTalkingHeadVideoJob } = loadVideoJobModule(
          "./create-talking-head-video-job.ts",
        );

        const result = await createTalkingHeadVideoJob({
          clientId: CLIENT_ID,
          reelScriptId: REEL_SCRIPT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
        });

        assert.equal(result.ok, true);
        const createInput = mocks.getCreateJobInput();
        assert.equal(createInput?.providerKey, "musetalk_low");
        assert.equal(createInput?.referenceVideoAssetId, LOOP_ASSET_ID);
        assert.equal(createInput?.voiceoverAssetId, VOICEOVER_ASSET_ID);
        assert.equal(createInput?.portraitAssetId, undefined);

        const inserted = mocks.getInsertedPayload();
        assert.equal(inserted?.provider_key, "musetalk_low");
        assert.equal(inserted?.portrait_asset_id, LOOP_ASSET_ID);
        assert.equal(inserted?.voiceover_asset_id, VOICEOVER_ASSET_ID);
      } finally {
        mocks.restore();
      }
    });
  });

  it("rejects client referenceVideoAssetId with FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installOrchestratorMocks({ providerKey: "musetalk_low" });

      try {
        const { createTalkingHeadVideoJob } = loadVideoJobModule(
          "./create-talking-head-video-job.ts",
        );

        const result = await createTalkingHeadVideoJob({
          clientId: CLIENT_ID,
          reelScriptId: REEL_SCRIPT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
          referenceVideoAssetId: FOREIGN_LOOP_ASSET_ID,
        });

        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        }
        assert.equal(mocks.getCreateJobInput(), null);
      } finally {
        mocks.restore();
      }
    });
  });

  it("rejects own_avatar when policy selects musetalk_low", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installOrchestratorMocks({
        providerKey: "musetalk_low",
        script: {
          visualMode: "own_avatar",
          modalidad: "own_avatar",
          hasReferenceLoop: true,
          package: { targetDurationSec: 30, voiceoverText: "Own avatar" },
        },
      });

      try {
        const { createTalkingHeadVideoJob } = loadVideoJobModule(
          "./create-talking-head-video-job.ts",
        );

        const result = await createTalkingHeadVideoJob({
          clientId: CLIENT_ID,
          reelScriptId: REEL_SCRIPT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
        });

        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "VALIDATION_ERROR");
        }
      } finally {
        mocks.restore();
      }
    });
  });

  it("returns NOT_FOUND when musetalk_low selected but no loop asset exists", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installOrchestratorMocks({
        providerKey: "musetalk_low",
        loopAssetId: null,
      });

      try {
        const { createTalkingHeadVideoJob } = loadVideoJobModule(
          "./create-talking-head-video-job.ts",
        );

        const result = await createTalkingHeadVideoJob({
          clientId: CLIENT_ID,
          reelScriptId: REEL_SCRIPT_ID,
          targetDurationSec: 30,
          voiceoverAssetId: VOICEOVER_ASSET_ID,
        });

        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
        }
      } finally {
        mocks.restore();
      }
    });
  });

  it("retry reuses portrait_asset_id from failed row as loop id", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installOrchestratorMocks({ providerKey: "musetalk_low" });

      try {
        const { createTalkingHeadVideoJob } = loadVideoJobModule(
          "./create-talking-head-video-job.ts",
        );

        const result = await createTalkingHeadVideoJob(
          {
            clientId: CLIENT_ID,
            reelScriptId: REEL_SCRIPT_ID,
            targetDurationSec: 30,
            voiceoverAssetId: VOICEOVER_ASSET_ID,
          },
          {
            parentJobId: PARENT_JOB_ID,
            attempt: 2,
            operatorClientId: CLIENT_ID,
            jobKind: "talking_head_retry",
            portraitAssetId: LOOP_ASSET_ID,
            voiceoverAssetId: VOICEOVER_ASSET_ID,
          },
        );

        assert.equal(result.ok, true);
        const createInput = mocks.getCreateJobInput();
        assert.equal(createInput?.referenceVideoAssetId, LOOP_ASSET_ID);

        const inserted = mocks.getInsertedPayload();
        assert.equal(inserted?.portrait_asset_id, LOOP_ASSET_ID);
        assert.equal(inserted?.parent_job_id, PARENT_JOB_ID);
        assert.equal(inserted?.attempt, 2);
      } finally {
        mocks.restore();
      }
    });
  });

  it("sadtalker_low path still requires portrait and omits referenceVideoAssetId", async () => {
    await withServerOnlyStub(async () => {
      const mocks = installOrchestratorMocks({
        providerKey: "sadtalker_low",
        script: {
          visualMode: "stock",
          modalidad: "stock",
          hasReferenceLoop: false,
          package: { targetDurationSec: 30, voiceoverText: "SadTalker path" },
        },
      });

      try {
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
        const createInput = mocks.getCreateJobInput();
        assert.equal(createInput?.providerKey, "sadtalker_low");
        assert.equal(createInput?.portraitAssetId, PORTRAIT_ASSET_ID);
        assert.equal(createInput?.referenceVideoAssetId, undefined);

        const inserted = mocks.getInsertedPayload();
        assert.equal(inserted?.portrait_asset_id, PORTRAIT_ASSET_ID);
      } finally {
        mocks.restore();
      }
    });
  });
});

describe("resolveMediaAssetUrlForProvider kind seam", () => {
  it("rejects video MIME when resolving as audio kind", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);

      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
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
                          maybeSingle: async () => ({
                            data: {
                              id: LOOP_ASSET_ID,
                              client_id: CLIENT_ID,
                              storage_key: `${LOOP_ASSET_ID}.mp4`,
                              metadata: { detectedMime: "video/quicktime" },
                            },
                            error: null,
                          }),
                        }),
                    }),
                }),
            }),
          };
        }
        if (req.includes("provider-asset-url-secret")) {
          return { getProviderAssetUrlSecret: () => "test-secret" };
        }
        if (req.includes("site-origin")) {
          return { getAllowlistedSiteOrigin: () => "https://example.test" };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        for (const key of Object.keys(require.cache)) {
          if (key.includes("resolve-media-asset-url-for-provider")) {
            delete require.cache[key];
          }
        }

        const { resolveMediaAssetUrlForProvider } = await import(
          "../media/resolve-media-asset-url-for-provider.ts"
        );

        await assert.rejects(
          () =>
            resolveMediaAssetUrlForProvider({
              assetId: LOOP_ASSET_ID,
              clientId: CLIENT_ID,
              kind: "audio",
            }),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /not allowed/i);
            return true;
          },
        );
      } finally {
        nodeModule._load = originalLoad;
      }
    });
  });
});
