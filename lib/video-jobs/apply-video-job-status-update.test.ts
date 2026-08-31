/**
 * US-7.3 Phase B — video complete duration + spend actual backfill.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "22222222-2222-4222-8222-222222222222";
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const SPEND_EVENT_ID = "44444444-4444-4444-8444-444444444444";
const OUTPUT_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const EXTERNAL_JOB_ID = "pred-us73-001";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function mapRow(raw: Record<string, unknown>) {
  const { mapVideoJobRow } = require("./video-job-row.ts") as {
    mapVideoJobRow: (row: Record<string, unknown>) => unknown;
  };
  return mapVideoJobRow(raw);
}

function baseJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    client_id: CLIENT_ID,
    reel_script_id: REEL_SCRIPT_ID,
    provider_key: "sadtalker_low",
    provider_tier: "low",
    asset_role: "primary",
    external_job_id: EXTERNAL_JOB_ID,
    status: "processing",
    estimated_cost_cents: 18,
    actual_cost_cents: null,
    failure_reason: null,
    portrait_asset_id: "77777777-7777-4777-8777-777777777777",
    voiceover_asset_id: "88888888-8888-4888-8888-888888888888",
    output_media_asset_id: null,
    parent_job_id: null,
    spend_event_id: SPEND_EVENT_ID,
    attempt: 1,
    created_at: "2026-08-31T16:00:00.000Z",
    updated_at: "2026-08-31T16:00:00.000Z",
    ...overrides,
  };
}

function chainableFrom(options: {
  updatePayloads: unknown[];
  spendInserts: unknown[];
}) {
  return (table: string) => {
    const self: Record<string, unknown> = {};
    const chain = () => self;
    self.select = chain;
    self.eq = chain;
    self.in = chain;
    self.is = chain;
    self.update = (payload: unknown) => {
      options.updatePayloads.push({ table, payload });
      return self;
    };
    self.insert = (payload: unknown) => {
      options.spendInserts.push({ table, payload });
      return self;
    };
    self.maybeSingle = async () => ({ data: null, error: null });
    self.single = async () => ({ data: null, error: null });
    return self;
  };
}

function clearCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/video-jobs/") ||
      normalized.includes("/lib/cost-policy/finalize-generation-cost") ||
      normalized.includes("/lib/cost-policy/record-reel-spend-event") ||
      normalized.includes("/lib/cost-policy/update-reel-spend-event-actual") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/approvals/revision/on-video-job-completed-revision")
    ) {
      delete require.cache[key];
    }
  }
}

async function withApplyMocks(
  options: {
    jobRow: Record<string, unknown>;
    persist?: {
      outputMediaAssetId: string;
      actualCostCents: number | null;
      durationSec: number | null;
    };
    spendSelect?: {
      actual_cost_cents: number | null;
    };
    useRealFinalize?: boolean;
  },
  run: (ctx: {
    finalizeCalls: unknown[];
    spendInserts: unknown[];
    updatePayloads: unknown[];
    spendUpdates: unknown[];
    applyVideoJobStatusUpdate: (input: unknown) => Promise<{
      ok: true;
      jobId: string;
      status: string;
      idempotent: boolean;
    }>;
  }) => Promise<void>,
): Promise<void> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  const finalizeCalls: unknown[] = [];
  const spendInserts: unknown[] = [];
  const updatePayloads: unknown[] = [];
  const spendUpdates: unknown[] = [];
  const persist =
    options.persist ??
    ({
      outputMediaAssetId: OUTPUT_ASSET_ID,
      actualCostCents: 18,
      durationSec: 28.5,
    } as const);

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    const req = String(request);
    if (req.includes("load-video-job")) {
      return {
        loadVideoJobByIdUnscoped: async () => mapRow(options.jobRow),
      };
    }
    if (req.includes("persist-video-job-output")) {
      return {
        persistVideoJobOutputAsset: async () => persist,
      };
    }
    if (req.includes("finalize-generation-cost") && !options.useRealFinalize) {
      return {
        finalizeGenerationCost: async (input: unknown) => {
          finalizeCalls.push(input);
          return { ok: true, spendEventId: SPEND_EVENT_ID };
        },
      };
    }
    if (req.includes("record-reel-spend-event")) {
      return {
        recordReelSpendEvent: async (payload: unknown) => {
          spendInserts.push(payload);
          return { spendEventId: "late-insert-should-not-happen" };
        },
      };
    }
    if (req.includes("update-reel-spend-event-actual")) {
      return {
        updateReelSpendEventActual: async (payload: {
          actualCostCents: number | null;
        }) => {
          spendUpdates.push(payload);
          const current = options.spendSelect?.actual_cost_cents ?? null;
          if (current !== null && current !== payload.actualCostCents) {
            return { ok: false, code: "ALREADY_FINALIZED" };
          }
          if (current === payload.actualCostCents) {
            return {
              ok: true,
              spendEventId: SPEND_EVENT_ID,
              idempotent: true,
            };
          }
          return {
            ok: true,
            spendEventId: SPEND_EVENT_ID,
            idempotent: false,
          };
        },
      };
    }
    if (req.includes("on-video-job-completed-revision")) {
      return {
        onVideoJobCompletedRevision: async () => undefined,
      };
    }
    if (req.includes("supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: chainableFrom({ updatePayloads, spendInserts }),
        }),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    clearCache();
    const { applyVideoJobStatusUpdate } = require("./apply-video-job-status-update.ts") as {
      applyVideoJobStatusUpdate: (input: unknown) => Promise<{
        ok: true;
        jobId: string;
        status: string;
        idempotent: boolean;
      }>;
    };
    await run({
      finalizeCalls,
      spendInserts,
      updatePayloads,
      spendUpdates,
      applyVideoJobStatusUpdate,
    });
  } finally {
    nodeModule._load = originalLoad;
    clearCache();
  }
}

describe("applyVideoJobStatusUpdate Phase B spend backfill", () => {
  it("complete with spendEventId calls async_update with actual and durationSec", async () => {
    await withApplyMocks({ jobRow: baseJobRow() }, async (ctx) => {
      const result = await ctx.applyVideoJobStatusUpdate({
        jobId: JOB_ID,
        source: "poller",
        normalizedStatus: {
          status: "completed",
          progressPercent: 100,
          rawOutputUrl: "https://replicate.delivery/pbxt/out.mp4",
        },
      });

      assert.equal(result.ok, true);
      assert.equal(result.idempotent, false);
      assert.equal(ctx.finalizeCalls.length, 1);
      assert.deepEqual(ctx.finalizeCalls[0], {
        mode: "async_update",
        spendEventId: SPEND_EVENT_ID,
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        actualCostCents: 18,
        actualCostUnavailableReason: null,
        durationSec: 28.5,
      });
      assert.equal(ctx.spendInserts.length, 0);
    });
  });

  it("complete with null persist actual sets closed provider_no_billing reason", async () => {
    await withApplyMocks(
      {
        jobRow: baseJobRow(),
        persist: {
          outputMediaAssetId: OUTPUT_ASSET_ID,
          actualCostCents: null,
          durationSec: null,
        },
      },
      async (ctx) => {
        await ctx.applyVideoJobStatusUpdate({
          jobId: JOB_ID,
          source: "poller",
          normalizedStatus: {
            status: "completed",
            rawOutputUrl: "https://replicate.delivery/pbxt/out.mp4",
          },
        });

        assert.equal(ctx.finalizeCalls.length, 1);
        const call = ctx.finalizeCalls[0] as {
          actualCostCents: number | null;
          actualCostUnavailableReason: string | null;
          durationSec: number | null;
        };
        assert.equal(call.actualCostCents, null);
        assert.equal(call.actualCostUnavailableReason, "provider_no_billing");
        assert.equal(call.durationSec, null);
      },
    );
  });

  it("complete with null spendEventId logs and does not INSERT spend", async () => {
    const logs: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      await withApplyMocks(
        { jobRow: baseJobRow({ spend_event_id: null }) },
        async (ctx) => {
          await ctx.applyVideoJobStatusUpdate({
            jobId: JOB_ID,
            source: "poller",
            normalizedStatus: {
              status: "completed",
              rawOutputUrl: "https://replicate.delivery/pbxt/out.mp4",
            },
          });

          assert.equal(ctx.finalizeCalls.length, 0);
          assert.equal(ctx.spendInserts.length, 0);
          const joined = JSON.stringify(logs);
          assert.match(joined, /missing spendEventId/);
          assert.doesNotMatch(joined, /replicate\.delivery/);
          assert.doesNotMatch(joined, /pbxt/);
        },
      );
    } finally {
      console.error = originalError;
    }
  });

  it("fail does not call finalizeGenerationCost or spend INSERT", async () => {
    await withApplyMocks({ jobRow: baseJobRow() }, async (ctx) => {
      const result = await ctx.applyVideoJobStatusUpdate({
        jobId: JOB_ID,
        source: "poller",
        normalizedStatus: {
          status: "failed",
          sanitizedErrorMessage: "Provider request failed",
        },
      });

      assert.equal(result.status, "failed");
      assert.equal(ctx.finalizeCalls.length, 0);
      assert.equal(ctx.spendInserts.length, 0);
      const jobUpdate = ctx.updatePayloads.find(
        (row) =>
          (row as { table: string }).table === "neuramark_video_jobs",
      ) as { payload: { actual_cost_cents: number | null } } | undefined;
      assert.equal(jobUpdate?.payload.actual_cost_cents, null);
    });
  });

  it("cancel does not call finalizeGenerationCost", async () => {
    await withApplyMocks({ jobRow: baseJobRow() }, async (ctx) => {
      await ctx.applyVideoJobStatusUpdate({
        jobId: JOB_ID,
        source: "poller",
        normalizedStatus: { status: "cancelled" },
      });
      assert.equal(ctx.finalizeCalls.length, 0);
      assert.equal(ctx.spendInserts.length, 0);
    });
  });

  it("second async_update with a different actual does not overwrite", async () => {
    let storedActual: number | null = 18;
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);
    const spendUpdates: { actualCostCents: number | null }[] = [];

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      const req = String(request);
      if (req.includes("load-video-job")) {
        return {
          loadVideoJobByIdUnscoped: async () => mapRow(baseJobRow()),
        };
      }
      if (req.includes("persist-video-job-output")) {
        return {
          persistVideoJobOutputAsset: async () => ({
            outputMediaAssetId: OUTPUT_ASSET_ID,
            actualCostCents: 99,
            durationSec: 10,
          }),
        };
      }
      if (req.includes("on-video-job-completed-revision")) {
        return { onVideoJobCompletedRevision: async () => undefined };
      }
      if (req.includes("update-reel-spend-event-actual")) {
        return {
          updateReelSpendEventActual: async (payload: {
            actualCostCents: number | null;
          }) => {
            spendUpdates.push(payload);
            if (
              storedActual !== null &&
              storedActual !== payload.actualCostCents
            ) {
              return { ok: false, code: "ALREADY_FINALIZED" };
            }
            storedActual = payload.actualCostCents;
            return {
              ok: true,
              spendEventId: SPEND_EVENT_ID,
              idempotent: false,
            };
          },
        };
      }
      if (req.includes("record-reel-spend-event")) {
        return {
          recordReelSpendEvent: async () => {
            throw new Error("late spend INSERT is forbidden");
          },
        };
      }
      if (req.includes("supabase/server")) {
        return {
          isSupabaseConfigured: () => true,
          createServerSupabaseClient: () => ({
            from: () => {
              const self: Record<string, unknown> = {};
              const chain = () => self;
              self.select = chain;
              self.eq = chain;
              self.in = chain;
              self.is = chain;
              self.update = chain;
              self.maybeSingle = async () => ({ data: { id: JOB_ID }, error: null });
              return self;
            },
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearCache();
      const { applyVideoJobStatusUpdate } = require("./apply-video-job-status-update.ts") as {
        applyVideoJobStatusUpdate: (input: unknown) => Promise<{ ok: true }>;
      };
      await applyVideoJobStatusUpdate({
        jobId: JOB_ID,
        source: "poller",
        normalizedStatus: {
          status: "completed",
          rawOutputUrl: "https://replicate.delivery/pbxt/out.mp4",
        },
      });
      assert.equal(storedActual, 18);
      assert.equal(spendUpdates.length, 1);
      assert.equal(spendUpdates[0]?.actualCostCents, 99);
    } finally {
      nodeModule._load = originalLoad;
      clearCache();
    }
  });

  it("second complete is idempotent and does not call async_update again", async () => {
    await withApplyMocks(
      {
        jobRow: baseJobRow({
          status: "completed",
          actual_cost_cents: 18,
          output_media_asset_id: OUTPUT_ASSET_ID,
        }),
      },
      async (ctx) => {
        const result = await ctx.applyVideoJobStatusUpdate({
          jobId: JOB_ID,
          source: "poller",
          normalizedStatus: {
            status: "completed",
            rawOutputUrl: "https://replicate.delivery/pbxt/other.mp4",
          },
        });
        assert.equal(result.idempotent, true);
        assert.equal(ctx.finalizeCalls.length, 0);
      },
    );
  });

  it("Wan B-roll complete uses the same applyVideoJobStatusUpdate writer", async () => {
    await withApplyMocks(
      {
        jobRow: baseJobRow({
          provider_key: "siliconflow_wan21_turbo",
          asset_role: "broll",
        }),
        persist: {
          outputMediaAssetId: OUTPUT_ASSET_ID,
          actualCostCents: 21,
          durationSec: 5,
        },
      },
      async (ctx) => {
        await ctx.applyVideoJobStatusUpdate({
          jobId: JOB_ID,
          source: "poller",
          normalizedStatus: {
            status: "completed",
            rawOutputUrl: "https://sc-maas.oss-cn-beijing.aliyuncs.com/out.mp4",
          },
        });
        assert.equal(ctx.finalizeCalls.length, 1);
        const call = ctx.finalizeCalls[0] as { actualCostCents: number };
        assert.equal(call.actualCostCents, 21);
      },
    );
  });
});

describe("persistVideoJobOutputAsset adapter actualCostCents", () => {
  it("forwards fetchAsset.actualCostCents and durationSec from the adapter", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load.bind(nodeModule);

    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      const req = String(request);
      if (req.includes("get-video-adapter-for-job")) {
        return {
          getVideoAdapterForJob: async () => ({
            fetchAsset: async () => ({
              storageKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.mp4",
              mimeType: "video/mp4",
              sizeBytes: 2048,
              actualCostCents: 19,
              durationSec: 12.25,
            }),
          }),
        };
      }
      if (req.includes("insert-generated-video-media-asset")) {
        return {
          insertGeneratedVideoMediaAsset: async () => ({
            mediaAssetId: OUTPUT_ASSET_ID,
          }),
        };
      }
      return originalLoad(request, parent, isMain);
    };

    try {
      clearCache();
      const { persistVideoJobOutputAsset } = require("./persist-video-job-output.ts") as {
        persistVideoJobOutputAsset: (params: {
          job: unknown;
          rawOutputUrl: string;
        }) => Promise<{
          outputMediaAssetId: string;
          actualCostCents: number | null;
          durationSec: number | null;
        }>;
      };
      const { mapVideoJobRow } = require("./video-job-row.ts") as {
        mapVideoJobRow: (row: Record<string, unknown>) => unknown;
      };

      const persisted = await persistVideoJobOutputAsset({
        job: mapVideoJobRow(baseJobRow({ provider_key: "heygen_high" })),
        rawOutputUrl: "https://files.heygen.ai/out.mp4",
      });

      assert.equal(persisted.outputMediaAssetId, OUTPUT_ASSET_ID);
      assert.equal(persisted.actualCostCents, 19);
      assert.equal(persisted.durationSec, 12.25);
    } finally {
      nodeModule._load = originalLoad;
      clearCache();
    }
  });
});

describe("Phase B writer / adapter floors", () => {
  it("Wan adapter and b-roll create do not call finalizeGenerationCost", () => {
    const wan = readFileSync(
      path.join(repoRoot, "lib/providers/video/siliconflow-wan21-turbo-adapter.ts"),
      "utf8",
    );
    const broll = readFileSync(
      path.join(repoRoot, "lib/video-jobs/create-broll-video-jobs.ts"),
      "utf8",
    );
    const poller = readFileSync(
      path.join(repoRoot, "lib/video-jobs/poll-video-job-until-terminal.ts"),
      "utf8",
    );
    assert.doesNotMatch(wan, /finalizeGenerationCost/);
    assert.doesNotMatch(broll, /finalizeGenerationCost/);
    assert.match(poller, /applyVideoJobStatusUpdate/);
    assert.doesNotMatch(poller, /asset_role/);
  });

  it("does not add ltx_broll_high adapter or FFmpeg spend on complete", () => {
    const applySrc = readFileSync(
      path.join(__dirname, "apply-video-job-status-update.ts"),
      "utf8",
    );
    assert.doesNotMatch(applySrc, /ltx_broll_high/);
    assert.doesNotMatch(applySrc, /ffmpeg/i);
    assert.doesNotMatch(applySrc, /branding/);
  });

  it("talking-head HeyGen Wan fetchAsset still set actualCostCents", () => {
    for (const rel of [
      "lib/providers/video/sadtalker-low-adapter.ts",
      "lib/providers/video/musetalk-low-adapter.ts",
      "lib/providers/video/heygen-high-adapter.ts",
      "lib/providers/video/siliconflow-wan21-turbo-adapter.ts",
    ]) {
      const src = readFileSync(path.join(repoRoot, rel), "utf8");
      assert.match(src, /actualCostCents:/);
      assert.match(src, /fetchAsset/);
    }
  });
});
