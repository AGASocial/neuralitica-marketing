/**
 * US-9.2 branding worker — mocked ffmpeg spawn and runBrandingJob.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import Module from "node:module";
import { afterEach, describe, it } from "node:test";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const BASE_ASSET_ID = "55555555-5555-4555-8555-555555555555";
const LOGO_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const BRANDED_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const COVER_ASSET_ID = "88888888-8888-4888-8888-888888888888";

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

function clearBrandingModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/branding/") ||
      normalized.includes("/lib/assembly/probe-media-streams") ||
      normalized.includes("/lib/assembly/run-ffmpeg") ||
      normalized.includes("/lib/media/storage/") ||
      normalized.includes("/lib/supabase/server")
    ) {
      delete require.cache[key];
    }
  }
}

function loadBrandingModule<T = Record<string, unknown>>(
  relativePath: string,
): T {
  clearBrandingModuleCache();
  return require(relativePath) as T;
}

describe("readBrandingJobPollMode", () => {
  it("inherits assembly poll mode when unset", () => {
    const { readBrandingJobPollMode } = loadBrandingModule<{
      readBrandingJobPollMode: Function;
    }>("./branding-job-config-readers.ts");

    assert.equal(readBrandingJobPollMode({}, "development"), "in_process");
    assert.equal(
      readBrandingJobPollMode({ BRANDING_JOB_POLL_MODE: "fly" }),
      "fly",
    );
  });
});

describe("enqueueBrandingJob dev seam", () => {
  afterEach(() => {
    delete process.env.BRANDING_JOB_POLL_MODE;
    delete process.env.ASSEMBLY_JOB_POLL_MODE;
  });

  it("no-ops when fly mode", () => {
    withServerOnlyStub(() => {
      process.env.BRANDING_JOB_POLL_MODE = "fly";
      const { enqueueBrandingJob } = loadBrandingModule<{
        enqueueBrandingJob: (id: string) => void;
      }>("./enqueue-branding-job.ts");

      assert.doesNotThrow(() => enqueueBrandingJob(JOB_ID));
    });
  });
});

describe("runBrandingJob mocked pipeline", () => {
  it("fails without spawn when base asset client_id mismatches job", async () => {
    await withBrandingMocks(
      {
        jobs: [baseBrandingJobRow({ branding_status: "queued" })],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: OTHER_CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: `neuramark/${OTHER_CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`,
          },
        ],
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runBrandingJob, BRANDING_FAILURE_TENANCY_MISMATCH } =
          loadBrandingModule<{
            runBrandingJob: Function;
            BRANDING_FAILURE_TENANCY_MISMATCH: string;
          }>("./run-branding-job.ts");

        await runBrandingJob(JOB_ID, {
          runFfmpeg: async () => {
            ffmpegCalled = true;
            return { exitCode: 0, stderr: "" };
          },
        });

        assert.equal(ffmpegCalled, false);
        const failed = updates.find((u) => u.branding_status === "failed");
        assert.ok(failed);
        assert.equal(failed?.failure_reason, BRANDING_FAILURE_TENANCY_MISMATCH);
      },
    );
  });

  it("completes with mocked ffmpeg — subtitles + logo + cover extract", async () => {
    const baseKey = `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`;
    const logoKey = `neuramark/${CLIENT_ID}/logo-${LOGO_ASSET_ID}.png`;
    const storage = new Map<string, Buffer>();
    storage.set(baseKey, Buffer.from("fake-base-mp4"));
    storage.set(logoKey, Buffer.from("fake-logo-png"));

    await withBrandingMocks(
      {
        jobs: [baseBrandingJobRow({ branding_status: "queued" })],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: baseKey,
          },
          {
            id: LOGO_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "client_logo",
            storage_key: logoKey,
          },
        ],
        logoAssetId: LOGO_ASSET_ID,
        scriptOnScreenText: "Beat one\nBeat two",
        insertedBrandedAssetId: BRANDED_ASSET_ID,
        insertedCoverAssetId: COVER_ASSET_ID,
        storage,
      },
      async ({ updates, spawnCalls }) => {
        const { runBrandingJob } = loadBrandingModule<{ runBrandingJob: Function }>(
          "./run-branding-job.ts",
        );

        await runBrandingJob(JOB_ID, {
          runFfmpeg: async (args: string[]) => {
            const outputPath = args.at(-1);
            if (typeof outputPath === "string") {
              if (outputPath.endsWith("branded.mp4")) {
                await writeFile(outputPath, Buffer.from("fake-branded-mp4"));
              } else if (outputPath.endsWith("cover.jpg")) {
                await writeFile(outputPath, Buffer.from("fake-cover-jpg"));
              }
            }
            return { exitCode: 0, stderr: "" };
          },
          probeLocalMediaFile: async (filePath: string) => {
            if (filePath.endsWith("branded.mp4")) {
              return { durationSec: 30, hasAudioStream: true };
            }
            return null;
          },
        });

        assert.equal(spawnCalls.length, 0);
        assert.ok(updates.some((u) => u.branding_status === "processing"));
        const completed = updates.find((u) => u.branding_status === "completed");
        assert.ok(completed);
        assert.equal(completed?.output_media_asset_id, BRANDED_ASSET_ID);
        assert.equal(completed?.cover_media_asset_id, COVER_ASSET_ID);
      },
    );
  });
});

describe("runFfmpeg spawn contract (branding reuses assembly runner)", () => {
  it("invokes spawn with args array and shell false", async () => {
    await withServerOnlyStub(async () => {
      const calls: Array<{ cmd: string; args: string[]; options: unknown }> =
        [];

      const fakeSpawn = (
        cmd: string,
        args: readonly string[],
        options: { shell?: boolean },
      ) => {
        calls.push({ cmd, args: [...args], options });
        return {
          stderr: { on: () => undefined },
          on: (event: string, cb: (code: number) => void) => {
            if (event === "close") {
              cb(0);
            }
          },
        } as ReturnType<typeof spawn>;
      };

      const { runFfmpeg } = loadBrandingModule<{ runFfmpeg: Function }>(
        "../assembly/run-ffmpeg.ts",
      );

      await runFfmpeg(["-y", "-i", "/tmp/base.mp4", "/tmp/out.mp4"], {
        spawnImpl: fakeSpawn as typeof spawn,
      });

      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0]?.options, { shell: false });
      assert.ok(Array.isArray(calls[0]?.args));
    });
  });
});

function baseBrandingJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    client_id: CLIENT_ID,
    reel_script_id: REEL_SCRIPT_ID,
    status: "completed",
    output_media_asset_id: BASE_ASSET_ID,
    pre_branding_output_media_asset_id: null,
    target_duration_sec: 30,
    branding_status: "queued",
    branding_config: {
      subtitlesEnabled: true,
      logoEnabled: true,
      coverFrameSec: 1.0,
      subtitleBeatCount: 2,
      subtitleSourceHash:
        "173c1ddf22a285919046857aa25bb6ad8417248851f49a47fbe4560505167791",
      voiceoverTimingHash:
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    failure_reason: null,
    cover_media_asset_id: null,
    updated_at: "2026-08-30T12:00:00.000Z",
    ...overrides,
  };
}

async function withBrandingMocks(
  options: {
    jobs: Array<Record<string, unknown>>;
    mediaAssets: Array<Record<string, unknown>>;
    logoAssetId?: string | null;
    scriptOnScreenText?: string;
    insertedBrandedAssetId?: string;
    insertedCoverAssetId?: string;
    storage?: Map<string, Buffer>;
  },
  run: (ctx: {
    updates: Array<Record<string, unknown>>;
    spawnCalls: string[][];
  }) => Promise<void>,
): Promise<void> {
  const updates: Array<Record<string, unknown>> = [];
  const jobState = options.jobs.map((row) => ({ ...row }));
  const storage = options.storage ?? new Map<string, Buffer>();
  const spawnCalls: string[][] = [];
  let insertCount = 0;

  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    if (request.includes("supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from(table: string) {
            if (table === "neuramark_assembled_reels") {
              return createBrandingJobQuery(jobState, updates);
            }
            if (table === "neuramark_media_assets") {
              return createMediaAssetsQuery(options, () => {
                insertCount += 1;
                return insertCount === 1
                  ? options.insertedBrandedAssetId ?? BRANDED_ASSET_ID
                  : options.insertedCoverAssetId ?? COVER_ASSET_ID;
              });
            }
            if (table === "neuramark_business_profiles") {
              return createProfileQuery(options.logoAssetId ?? null);
            }
            if (table === "neuramark_reel_scripts") {
              return createReelScriptQuery(
                options.scriptOnScreenText ?? "Beat one\nBeat two",
              );
            }
            throw new Error(`Unexpected table ${table}`);
          },
        }),
      };
    }
    if (request.includes("get-media-storage")) {
      return {
        getMediaStorage: () => ({
          assertSafeKey: () => undefined,
          readStream: async (key: string) => {
            const buf = storage.get(key);
            if (!buf) {
              throw new Error("missing storage key");
            }
            return new ReadableStream({
              start(controller) {
                controller.enqueue(buf);
                controller.close();
              },
            });
          },
          put: async (key: string, data: Buffer) => {
            storage.set(key, data);
          },
          delete: async () => undefined,
        }),
        resetMediaStorageCacheForTests: () => undefined,
      };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    clearBrandingModuleCache();
    await run({ updates, spawnCalls });
  } finally {
    nodeModule._load = originalLoad;
    clearBrandingModuleCache();
  }
}

function createBrandingJobQuery(
  rows: Array<Record<string, unknown>>,
  updates: Array<Record<string, unknown>>,
) {
  const builder = {
    select: () => builder,
    eq: (_col: string, value: string) => {
      builder._eqCol = _col;
      builder._eqVal = value;
      return builder;
    },
    is: (_col: string, value: null) => {
      builder._isCol = _col;
      builder._isVal = value;
      return builder;
    },
    maybeSingle: async () => {
      let row = rows.find((r) => r.id === builder._eqVal);
      if (builder._eqCol === "client_id") {
        row = rows.find((r) => r.client_id === builder._eqVal);
      }
      return { data: row ?? null, error: null };
    },
    update: (patch: Record<string, unknown>) => {
      updates.push(patch);
      return {
        eq: (_col: string, id: string) => ({
          eq: async (_statusCol: string, status: string) => {
            const target = rows.find((row) => row.id === id);
            if (target && target.branding_status === status) {
              Object.assign(target, patch);
            }
            return { error: null };
          },
          is: async (_statusCol: string, _nullVal: null) => {
            const target = rows.find((row) => row.id === id);
            if (target && target.branding_status == null) {
              Object.assign(target, patch);
            }
            return { error: null };
          },
        }),
      };
    },
    in: () => builder,
    lt: () => builder,
    order: () => builder,
    limit: () => builder,
    _eqCol: "" as string,
    _eqVal: "" as string,
    _isCol: "" as string,
    _isVal: null as null,
  };
  return builder;
}

function createMediaAssetsQuery(
  options: { mediaAssets: Array<Record<string, unknown>> },
  nextInsertId: () => string,
) {
  const builder = {
    select: () => builder,
    eq: (_col: string, value: string) => {
      builder._id = value;
      return builder;
    },
    maybeSingle: async () => ({
      data:
        options.mediaAssets.find((row) => row.id === builder._id) ?? null,
      error: null,
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({
          data: { id: nextInsertId() },
          error: null,
        }),
      }),
    }),
    _id: "" as string,
  };
  return builder;
}

function createProfileQuery(logoAssetId: string | null) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: { logo_asset_id: logoAssetId },
      error: null,
    }),
  };
  return builder;
}

function createReelScriptQuery(onScreenText: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: {
        on_screen_text: onScreenText,
        voiceover_text: "one two three four",
        target_duration_sec: 30,
      },
      error: null,
    }),
  };
  return builder;
}
