/**
 * US-9.1 Phase B — runAssemblyJob broll_stitch + degrade branch.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import Module from "node:module";
import { afterEach, describe, it } from "node:test";

import { NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT } from "@/lib/contracts/assembly-job";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const VOICEOVER_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const OUTPUT_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const BROLL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BROLL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PRIMARY_ASSET_ID = "55555555-5555-4555-8555-555555555555";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function fingerprint(parts: {
  primary: string;
  voiceover: string;
  broll: string[];
  pathTag: string;
}): string {
  const payload = [
    parts.primary,
    parts.voiceover,
    "reel_v1_basic",
    parts.broll.join(","),
    parts.pathTag,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
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

describe("runAssemblyJob Phase B", () => {
  afterEach(() => {
    delete process.env.NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC;
  });

  it("broll_stitch uses persisted ids, concat args, shell:false spawn", async () => {
    process.env.NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC = String(
      NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT,
    );

    const storage = new Map<string, Buffer>();
    storage.set(`${BROLL_A}.mp4`, Buffer.from("clip-a"));
    storage.set(`${BROLL_B}.mp4`, Buffer.from("clip-b"));
    storage.set(
      `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/${VOICEOVER_ASSET_ID}.mp3`,
      Buffer.from("vo"),
    );

    const fp = fingerprint({
      primary: "",
      voiceover: VOICEOVER_ASSET_ID,
      broll: [BROLL_A, BROLL_B],
      pathTag: "broll_stitch",
    });

    await withAssemblyMocks(
      {
        assemblyJobs: [
          baseJobRow({
            primary_video_asset_id: null,
            voiceover_asset_id: VOICEOVER_ASSET_ID,
            broll_asset_ids: [BROLL_A, BROLL_B],
            assembly_path_tag: "broll_stitch",
            input_fingerprint: fp,
          }),
        ],
        mediaAssets: [
          {
            id: BROLL_A,
            client_id: CLIENT_ID,
            asset_type: "generated_video",
            storage_key: `${BROLL_A}.mp4`,
          },
          {
            id: BROLL_B,
            client_id: CLIENT_ID,
            asset_type: "generated_video",
            storage_key: `${BROLL_B}.mp4`,
          },
          {
            id: VOICEOVER_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "voiceover",
            storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/${VOICEOVER_ASSET_ID}.mp3`,
          },
        ],
        insertedMediaAssetId: OUTPUT_ASSET_ID,
        storage,
        coldOpenNotes: "2",
      },
      async ({ updates }) => {
        let spawnArgs: string[] | null = null;
        const { runAssemblyJob } = loadAssemblyModule<{
          runAssemblyJob: Function;
        }>("./run-assembly-job.ts");

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
            return { durationSec: 20, hasAudioStream: false };
          },
        });

        assert.ok(Array.isArray(spawnArgs));
        assert.equal(spawnArgs?.[0], "-y");
        assert.ok(spawnArgs?.includes("concat"));
        assert.ok(spawnArgs?.includes("-ss"));
        assert.ok(spawnArgs?.includes("2"));
        assert.ok(spawnArgs?.includes("1:a:0"));
        assert.ok(!spawnArgs?.some((a) => a.includes("http")));

        const completed = updates.find((u) => u.status === "completed");
        assert.ok(completed);
        assert.equal(completed?.output_media_asset_id, OUTPUT_ASSET_ID);
      },
    );
  });

  it("cross-tenant broll clip → failed without spawn", async () => {
    const fp = fingerprint({
      primary: "",
      voiceover: VOICEOVER_ASSET_ID,
      broll: [BROLL_A],
      pathTag: "broll_stitch",
    });

    await withAssemblyMocks(
      {
        assemblyJobs: [
          baseJobRow({
            primary_video_asset_id: null,
            voiceover_asset_id: VOICEOVER_ASSET_ID,
            broll_asset_ids: [BROLL_A],
            assembly_path_tag: "broll_stitch",
            input_fingerprint: fp,
          }),
        ],
        mediaAssets: [
          {
            id: BROLL_A,
            client_id: OTHER_CLIENT_ID,
            asset_type: "generated_video",
            storage_key: `${BROLL_A}.mp4`,
          },
          {
            id: VOICEOVER_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "voiceover",
            storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/${VOICEOVER_ASSET_ID}.mp3`,
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

  it("degrade primary path uses Phase A builder (no concat)", async () => {
    process.env.NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC = String(
      NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT,
    );

    const storage = new Map<string, Buffer>();
    storage.set(`${PRIMARY_ASSET_ID}.mp4`, Buffer.from("primary"));

    const fp = fingerprint({
      primary: PRIMARY_ASSET_ID,
      voiceover: "",
      broll: [],
      pathTag: "primary",
    });

    await withAssemblyMocks(
      {
        assemblyJobs: [
          baseJobRow({
            primary_video_asset_id: PRIMARY_ASSET_ID,
            assembly_path_tag: "primary",
            broll_asset_ids: null,
            input_fingerprint: fp,
          }),
        ],
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
      async () => {
        let spawnArgs: string[] | null = null;
        const { runAssemblyJob } = loadAssemblyModule<{
          runAssemblyJob: Function;
        }>("./run-assembly-job.ts");

        await runAssemblyJob(JOB_ID, {
          runFfmpeg: async (args: string[]) => {
            spawnArgs = args;
            const outputPath = args.at(-1);
            if (typeof outputPath === "string") {
              await writeFile(outputPath, Buffer.from("out"));
            }
            return { exitCode: 0, stderr: "" };
          },
          probeLocalMediaFile: async () => ({
            durationSec: 29.9,
            hasAudioStream: true,
          }),
        });

        assert.ok(spawnArgs);
        assert.ok(!spawnArgs?.includes("concat"));
        assert.ok(spawnArgs?.includes("0:a:0?"));
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
    broll_asset_ids: null,
    assembly_path_tag: "primary",
    output_media_asset_id: null,
    script_updated_at: "2026-08-30T12:00:00.000Z",
    input_fingerprint: fingerprint({
      primary: PRIMARY_ASSET_ID,
      voiceover: "",
      broll: [],
      pathTag: "primary",
    }),
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
    coldOpenNotes?: string | null;
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
    if (String(request).includes("supabase/server")) {
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
            if (table === "neuramark_reel_scripts") {
              return {
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          cold_open_notes: options.coldOpenNotes ?? null,
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }
            throw new Error(`Unexpected table ${table}`);
          },
        }),
      };
    }
    if (String(request).includes("get-media-storage")) {
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
  options: { loseProcessingClaim?: boolean } = {},
) {
  const builder = {
    select: () => builder,
    eq: (_col: string, value: string) => {
      builder._eqCol = _col;
      builder._eqVal = value;
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
      createAssemblyUpdateQueryBuilder(rows, updates, patch, options),
    in: () => builder,
    lt: () => builder,
    order: () => builder,
    limit: () => builder,
    _eqCol: "" as string,
    _eqVal: "" as string,
  };
  return builder;
}

function createAssemblyUpdateQueryBuilder(
  rows: Array<Record<string, unknown>>,
  updates: Array<Record<string, unknown>>,
  patch: Record<string, unknown>,
  options: { loseProcessingClaim?: boolean } = {},
) {
  const filters: Array<{ col: string; val: unknown }> = [];

  const builder = {
    eq(col: string, val: unknown) {
      filters.push({ col, val });
      return builder;
    },
    in: async (_statusCol: string, statuses: string[]) => {
      const target = findAssemblyUpdateTarget(rows, filters);
      if (
        target &&
        assemblyRowMatchesFilters(target, filters) &&
        statuses.includes(String(target.status))
      ) {
        updates.push(patch);
        Object.assign(target, patch);
      }
      return { error: null };
    },
    select: async (_cols?: string) => {
      if (options.loseProcessingClaim && patch.status === "processing") {
        return { data: [], error: null };
      }

      const target = findAssemblyUpdateTarget(rows, filters);
      if (!target || !assemblyRowMatchesFilters(target, filters)) {
        return { data: [], error: null };
      }

      updates.push(patch);
      Object.assign(target, patch);
      return { data: [{ id: target.id }], error: null };
    },
  };

  return builder;
}

function findAssemblyUpdateTarget(
  rows: Array<Record<string, unknown>>,
  filters: Array<{ col: string; val: unknown }>,
) {
  const idFilter = filters.find((f) => f.col === "id");
  if (typeof idFilter?.val !== "string") {
    return undefined;
  }
  return rows.find((row) => row.id === idFilter.val);
}

function assemblyRowMatchesFilters(
  row: Record<string, unknown>,
  filters: Array<{ col: string; val: unknown }>,
) {
  return filters.every((filter) => row[filter.col] === filter.val);
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
