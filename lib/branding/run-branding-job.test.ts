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

/** sha256 of tokenizeVoiceoverWords("one two three four").join("\\n") */
const VOICEOVER_TIMING_HASH_ONE_TWO_THREE_FOUR =
  "c2fa7d384065e108cf8746af983dfe308f3cc709631df3f2615d450e1f07fd0d";

const SUBTITLE_SOURCE_HASH_BEAT_ONE_TWO =
  "173c1ddf22a285919046857aa25bb6ad8417248851f49a47fbe4560505167791";

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
      normalized.includes("/lib/assembly/compute-vo-proportional-beat-timings") ||
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
        scriptVoiceoverText: "one two three four",
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

  it("Phase B-M1: voiceoverTimingHash mismatch → failed, spawn never called", async () => {
    await withBrandingMocks(
      {
        jobs: [
          baseBrandingJobRow({
            branding_status: "queued",
            branding_config: {
              subtitlesEnabled: true,
              logoEnabled: false,
              coverFrameSec: 1.0,
              subtitleBeatCount: 2,
              subtitleSourceHash: SUBTITLE_SOURCE_HASH_BEAT_ONE_TWO,
              // Snapshot frozen at enqueue for "one two three four"
              voiceoverTimingHash: VOICEOVER_TIMING_HASH_ONE_TWO_THREE_FOUR,
            },
          }),
        ],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`,
          },
        ],
        scriptOnScreenText: "Beat one\nBeat two",
        // Live VO mutated after enqueue — hash diverges
        scriptVoiceoverText: "mutated voiceover tokens after enqueue",
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runBrandingJob, BRANDING_FAILURE_VOICEOVER_TIMING_HASH } =
          loadBrandingModule<{
            runBrandingJob: Function;
            BRANDING_FAILURE_VOICEOVER_TIMING_HASH: string;
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
        assert.equal(
          failed?.failure_reason,
          BRANDING_FAILURE_VOICEOVER_TIMING_HASH,
        );
        assert.equal(
          BRANDING_FAILURE_VOICEOVER_TIMING_HASH,
          "scripts.branding.failure.voiceoverTimingHashMismatch",
        );
      },
    );
  });

  it("Phase B-M1: matching voiceoverTimingHash still proceeds past guard", async () => {
    const baseKey = `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`;
    const storage = new Map<string, Buffer>();
    storage.set(baseKey, Buffer.from("fake-base-mp4"));

    await withBrandingMocks(
      {
        jobs: [
          baseBrandingJobRow({
            branding_status: "queued",
            branding_config: {
              subtitlesEnabled: true,
              logoEnabled: false,
              coverFrameSec: 1.0,
              subtitleBeatCount: 2,
              subtitleSourceHash: SUBTITLE_SOURCE_HASH_BEAT_ONE_TWO,
              voiceoverTimingHash: VOICEOVER_TIMING_HASH_ONE_TWO_THREE_FOUR,
            },
          }),
        ],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: baseKey,
          },
        ],
        scriptOnScreenText: "Beat one\nBeat two",
        scriptVoiceoverText: "one two three four",
        insertedBrandedAssetId: BRANDED_ASSET_ID,
        insertedCoverAssetId: COVER_ASSET_ID,
        storage,
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runBrandingJob } = loadBrandingModule<{
          runBrandingJob: Function;
        }>("./run-branding-job.ts");

        await runBrandingJob(JOB_ID, {
          runFfmpeg: async (args: string[]) => {
            ffmpegCalled = true;
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
          probeLocalMediaFile: async () => ({
            durationSec: 30,
            hasAudioStream: true,
          }),
        });

        assert.equal(ffmpegCalled, true);
        assert.ok(updates.some((u) => u.branding_status === "completed"));
        assert.equal(
          updates.some((u) => u.branding_status === "failed"),
          false,
        );
      },
    );
  });

  it("Phase B-M1: legacy missing voiceoverTimingHash skips re-check", async () => {
    const baseKey = `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`;
    const storage = new Map<string, Buffer>();
    storage.set(baseKey, Buffer.from("fake-base-mp4"));

    await withBrandingMocks(
      {
        jobs: [
          baseBrandingJobRow({
            branding_status: "queued",
            branding_config: {
              subtitlesEnabled: true,
              logoEnabled: false,
              coverFrameSec: 1.0,
              subtitleBeatCount: 2,
              subtitleSourceHash: SUBTITLE_SOURCE_HASH_BEAT_ONE_TWO,
              // Phase A row — key absent (soft-default must not false-fail)
            },
          }),
        ],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: baseKey,
          },
        ],
        scriptOnScreenText: "Beat one\nBeat two",
        scriptVoiceoverText: "one two three four",
        insertedBrandedAssetId: BRANDED_ASSET_ID,
        insertedCoverAssetId: COVER_ASSET_ID,
        storage,
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runBrandingJob } = loadBrandingModule<{
          runBrandingJob: Function;
        }>("./run-branding-job.ts");

        await runBrandingJob(JOB_ID, {
          runFfmpeg: async (args: string[]) => {
            ffmpegCalled = true;
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
          probeLocalMediaFile: async () => ({
            durationSec: 30,
            hasAudioStream: true,
          }),
        });

        assert.equal(ffmpegCalled, true);
        assert.ok(updates.some((u) => u.branding_status === "completed"));
      },
    );
  });

  it("Phase B-M2: entry with processing status → no spawn (peer owns row)", async () => {
    await withBrandingMocks(
      {
        jobs: [baseBrandingJobRow({ branding_status: "processing" })],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`,
          },
        ],
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runBrandingJob } = loadBrandingModule<{ runBrandingJob: Function }>(
          "./run-branding-job.ts",
        );

        await runBrandingJob(JOB_ID, {
          runFfmpeg: async () => {
            ffmpegCalled = true;
            return { exitCode: 0, stderr: "" };
          },
        });

        assert.equal(ffmpegCalled, false);
        assert.equal(
          updates.some((u) => u.branding_status === "processing"),
          false,
        );
      },
    );
  });

  it("Phase B-M2: lost claim → no spawn", async () => {
    await withBrandingMocks(
      {
        jobs: [baseBrandingJobRow({ branding_status: "queued" })],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`,
          },
        ],
        loseProcessingClaim: true,
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runBrandingJob } = loadBrandingModule<{ runBrandingJob: Function }>(
          "./run-branding-job.ts",
        );

        await runBrandingJob(JOB_ID, {
          runFfmpeg: async () => {
            ffmpegCalled = true;
            return { exitCode: 0, stderr: "" };
          },
        });

        assert.equal(ffmpegCalled, false);
        assert.equal(
          updates.some((u) => u.branding_status === "processing"),
          false,
        );
      },
    );
  });

  it("Phase B-M1: malformed non-empty voiceoverTimingHash → CONFIG fail, no spawn", async () => {
    await withBrandingMocks(
      {
        jobs: [
          baseBrandingJobRow({
            branding_status: "queued",
            branding_config: {
              subtitlesEnabled: true,
              logoEnabled: false,
              coverFrameSec: 1.0,
              subtitleBeatCount: 2,
              subtitleSourceHash: SUBTITLE_SOURCE_HASH_BEAT_ONE_TWO,
              voiceoverTimingHash: "not-a-valid-64-hex-hash",
            },
          }),
        ],
        mediaAssets: [
          {
            id: BASE_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "assembled_reel",
            storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/assembled-${BASE_ASSET_ID}.mp4`,
          },
        ],
        scriptOnScreenText: "Beat one\nBeat two",
        scriptVoiceoverText: "one two three four",
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runBrandingJob, BRANDING_FAILURE_CONFIG } = loadBrandingModule<{
          runBrandingJob: Function;
          BRANDING_FAILURE_CONFIG: string;
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
        assert.equal(failed?.failure_reason, BRANDING_FAILURE_CONFIG);
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
      subtitleSourceHash: SUBTITLE_SOURCE_HASH_BEAT_ONE_TWO,
      voiceoverTimingHash: VOICEOVER_TIMING_HASH_ONE_TWO_THREE_FOUR,
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
    scriptVoiceoverText?: string;
    insertedBrandedAssetId?: string;
    insertedCoverAssetId?: string;
    storage?: Map<string, Buffer>;
    loseProcessingClaim?: boolean;
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
              return createBrandingJobQuery(jobState, updates, {
                loseProcessingClaim: options.loseProcessingClaim ?? false,
              });
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
                options.scriptVoiceoverText ?? "one two three four",
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
  options: { loseProcessingClaim?: boolean } = {},
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
    update: (patch: Record<string, unknown>) =>
      createUpdateQueryBuilder(rows, updates, patch, options),
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

function createUpdateQueryBuilder(
  rows: Array<Record<string, unknown>>,
  updates: Array<Record<string, unknown>>,
  patch: Record<string, unknown>,
  options: { loseProcessingClaim?: boolean } = {},
) {
  const filters: Array<{ col: string; val: unknown; isNull?: boolean }> = [];

  const builder = {
    eq(col: string, val: unknown) {
      filters.push({ col, val });
      return builder;
    },
    is(col: string, val: null) {
      filters.push({ col, val, isNull: true });
      return builder;
    },
    select: async (_cols?: string) => {
      if (options.loseProcessingClaim && patch.branding_status === "processing") {
        return { data: [], error: null };
      }

      const target = findUpdateTarget(rows, filters);
      if (!target || !rowMatchesFilters(target, filters)) {
        return { data: [], error: null };
      }

      updates.push(patch);
      Object.assign(target, patch);
      return { data: [{ id: target.id }], error: null };
    },
    then(
      resolve: (value: { error: null }) => void,
      reject?: (reason: unknown) => void,
    ) {
      return builder.executeLegacyUpdate().then(resolve, reject);
    },
    executeLegacyUpdate: async () => {
      const target = findUpdateTarget(rows, filters);
      if (target && rowMatchesFilters(target, filters)) {
        updates.push(patch);
        Object.assign(target, patch);
      }
      return { error: null };
    },
  };

  return builder;
}

function findUpdateTarget(
  rows: Array<Record<string, unknown>>,
  filters: Array<{ col: string; val: unknown; isNull?: boolean }>,
) {
  const idFilter = filters.find((f) => f.col === "id");
  if (typeof idFilter?.val !== "string") {
    return undefined;
  }
  return rows.find((row) => row.id === idFilter.val);
}

function rowMatchesFilters(
  row: Record<string, unknown>,
  filters: Array<{ col: string; val: unknown; isNull?: boolean }>,
) {
  return filters.every(({ col, val, isNull }) => {
    if (isNull) {
      return row[col] == null;
    }
    return row[col] === val;
  });
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

function createReelScriptQuery(onScreenText: string, voiceoverText: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({
      data: {
        on_screen_text: onScreenText,
        voiceover_text: voiceoverText,
        target_duration_sec: 30,
      },
      error: null,
    }),
  };
  return builder;
}
