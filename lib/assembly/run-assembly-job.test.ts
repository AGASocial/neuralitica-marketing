/**
 * US-9.1 assembly worker — mocked ffmpeg spawn and runAssemblyJob.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import Module from "node:module";
import { afterEach, describe, it } from "node:test";

import {
  NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT,
} from "@/lib/contracts/assembly-job";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const PRIMARY_ASSET_ID = "55555555-5555-4555-8555-555555555555";
const VOICEOVER_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const OUTPUT_ASSET_ID = "77777777-7777-4777-8777-777777777777";

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

function clearAssemblyModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/assembly/") ||
      normalized.includes("/lib/media/storage/") ||
      normalized.includes("/lib/supabase/server")
    ) {
      delete require.cache[key];
    }
  }
}

function loadAssemblyModule<T = Record<string, unknown>>(
  relativePath: string,
): T {
  clearAssemblyModuleCache();
  return require(relativePath) as T;
}

describe("runFfmpeg spawn contract", () => {
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

      const { runFfmpeg } = loadAssemblyModule<{ runFfmpeg: Function }>(
        "./run-ffmpeg.ts",
      );

      const result = await runFfmpeg(
        ["-y", "-i", "/tmp/primary.mp4", "/tmp/out.mp4"],
        { spawnImpl: fakeSpawn as typeof spawn },
      );

      assert.equal(result.exitCode, 0);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.cmd, "ffmpeg");
      assert.deepEqual(calls[0]?.args, [
        "-y",
        "-i",
        "/tmp/primary.mp4",
        "/tmp/out.mp4",
      ]);
      assert.deepEqual(calls[0]?.options, { shell: false });
    });
  });
});

describe("readAssemblyJobPollMode", () => {
  it("defaults to in_process outside production", () => {
    const { readAssemblyJobPollMode } = loadAssemblyModule<{
      readAssemblyJobPollMode: Function;
    }>("./assembly-job-config-readers.ts");

    assert.equal(readAssemblyJobPollMode({}, "development"), "in_process");
    assert.equal(readAssemblyJobPollMode({ ASSEMBLY_JOB_POLL_MODE: "fly" }), "fly");
  });
});

describe("enqueueAssemblyJob dev seam", () => {
  afterEach(() => {
    delete process.env.ASSEMBLY_JOB_POLL_MODE;
  });

  it("no-ops when fly mode", () => {
    withServerOnlyStub(() => {
      process.env.ASSEMBLY_JOB_POLL_MODE = "fly";
      const { readAssemblyJobPollMode } = loadAssemblyModule<{
        readAssemblyJobPollMode: Function;
      }>("./assembly-job-config-readers.ts");
      const { enqueueAssemblyJob } = loadAssemblyModule<{
        enqueueAssemblyJob: (id: string) => void;
      }>("./enqueue-assembly-job.ts");

      assert.equal(readAssemblyJobPollMode(process.env), "fly");
      assert.doesNotThrow(() => enqueueAssemblyJob(JOB_ID));
    });
  });
});

describe("runAssemblyJob mocked pipeline", () => {
  afterEach(() => {
    delete process.env.NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC;
  });

  it("fails without spawn when input asset client_id mismatches job", async () => {
    await withAssemblyMocks(
      {
        assemblyJobs: [baseJobRow({ status: "queued" })],
        mediaAssets: [
          {
            id: PRIMARY_ASSET_ID,
            client_id: OTHER_CLIENT_ID,
            asset_type: "generated_video",
            storage_key: `${PRIMARY_ASSET_ID}.mp4`,
          },
        ],
      },
      async ({ updates }) => {
        let ffmpegCalled = false;
        const { runAssemblyJob, ASSEMBLY_FAILURE_TENANCY_MISMATCH } =
          loadAssemblyModule<{
            runAssemblyJob: Function;
            ASSEMBLY_FAILURE_TENANCY_MISMATCH: string;
          }>("./run-assembly-job.ts");

        await runAssemblyJob(JOB_ID, {
          runFfmpeg: async () => {
            ffmpegCalled = true;
            return { exitCode: 0, stderr: "" };
          },
          probeLocalMediaFile: async () => ({
            durationSec: 30,
            hasAudioStream: true,
          }),
        });

        assert.equal(ffmpegCalled, false);
        const failed = updates.find((u) => u.status === "failed");
        assert.ok(failed);
        assert.equal(
          failed?.failure_reason,
          ASSEMBLY_FAILURE_TENANCY_MISMATCH,
        );
      },
    );
  });

  it("completes with mocked ffmpeg and probe", async () => {
    process.env.NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC = String(
      NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT,
    );

    const storage = new Map<string, Buffer>();
    storage.set(`${PRIMARY_ASSET_ID}.mp4`, Buffer.from("fake-primary-bytes"));

    await withAssemblyMocks(
      {
        assemblyJobs: [baseJobRow({ status: "queued" })],
        mediaAssets: [
          {
            id: PRIMARY_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "generated_video",
            storage_key: `${PRIMARY_ASSET_ID}.mp4`,
          },
        ],
        insertedMediaAssetId: OUTPUT_ASSET_ID,
        storage,
      },
      async ({ updates }) => {
        let spawnArgs: string[] | null = null;
        const { runAssemblyJob } = loadAssemblyModule<{ runAssemblyJob: Function }>(
          "./run-assembly-job.ts",
        );

        await runAssemblyJob(JOB_ID, {
          runFfmpeg: async (args: string[]) => {
            spawnArgs = args;
            const outputPath = args.at(-1);
            if (typeof outputPath === "string") {
              await writeFile(outputPath, Buffer.from("fake-output-mp4"));
            }
            return { exitCode: 0, stderr: "" };
          },
          probeLocalMediaFile: async (filePath: string) => {
            if (filePath.endsWith("output.mp4")) {
              return { durationSec: 29.9, hasAudioStream: true };
            }
            return { durationSec: 29.9, hasAudioStream: true };
          },
        });

        assert.ok(Array.isArray(spawnArgs));
        assert.equal(spawnArgs?.[0], "-y");
        assert.ok(spawnArgs?.includes("0:a:0?"));

        const completed = updates.find((u) => u.status === "completed");
        assert.ok(completed);
        assert.equal(completed?.output_media_asset_id, OUTPUT_ASSET_ID);
        assert.equal(completed?.actual_duration_sec, 29.9);
      },
    );
  });
});

function baseJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    client_id: CLIENT_ID,
    reel_script_id: REEL_SCRIPT_ID,
    template_id: "reel_v1_basic",
    status: "queued",
    primary_video_asset_id: PRIMARY_ASSET_ID,
    voiceover_asset_id: null,
    output_media_asset_id: null,
    script_updated_at: "2026-08-30T12:00:00.000Z",
    input_fingerprint: "b".repeat(64),
    target_duration_sec: 30,
    actual_duration_sec: null,
    failure_reason: null,
    created_at: "2026-08-30T12:00:00.000Z",
    updated_at: "2026-08-30T12:00:00.000Z",
    ...overrides,
  };
}

async function withAssemblyMocks(
  options: {
    assemblyJobs: Array<Record<string, unknown>>;
    mediaAssets: Array<Record<string, unknown>>;
    insertedMediaAssetId?: string;
    storage?: Map<string, Buffer>;
  },
  run: (ctx: {
    updates: Array<Record<string, unknown>>;
  }) => Promise<void>,
): Promise<void> {
  const updates: Array<Record<string, unknown>> = [];
  const assemblyState = options.assemblyJobs.map((row) => ({ ...row }));
  const storage = options.storage ?? new Map<string, Buffer>();

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
              return createAssemblyQuery(assemblyState, updates);
            }
            if (table === "neuramark_media_assets") {
              return createMediaAssetsQuery(options);
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
    clearAssemblyModuleCache();
    await run({ updates });
  } finally {
    nodeModule._load = originalLoad;
    clearAssemblyModuleCache();
  }
}

function createAssemblyQuery(
  rows: Array<Record<string, unknown>>,
  updates: Array<Record<string, unknown>>,
) {
  const builder = {
    select: () => builder,
    eq: (_col: string, value: string) => {
      builder._id = value;
      return builder;
    },
    maybeSingle: async () => ({
      data: rows.find((row) => row.id === builder._id) ?? null,
      error: null,
    }),
    update: (patch: Record<string, unknown>) => {
      updates.push(patch);
      return {
        eq: (_col: string, id: string) => ({
          in: async (_statusCol: string, statuses: string[]) => {
            const target = rows.find((row) => row.id === id);
            if (
              target &&
              statuses.includes(String(target.status))
            ) {
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
    _id: "" as string,
  };
  return builder;
}

function createMediaAssetsQuery(options: {
  mediaAssets: Array<Record<string, unknown>>;
  insertedMediaAssetId?: string;
}) {
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
          data: { id: options.insertedMediaAssetId ?? OUTPUT_ASSET_ID },
          error: null,
        }),
      }),
    }),
    _id: "" as string,
  };
  return builder;
}
