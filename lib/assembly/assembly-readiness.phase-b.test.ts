/**
 * US-9.1 Phase B — first-time faceless canAssemble readiness (B12).
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const VOICEOVER_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const BROLL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

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

function clearCache() {
  for (const key of Object.keys(require.cache)) {
    const n = key.replace(/\\/g, "/");
    if (
      n.includes("/lib/assembly/") ||
      n.includes("/lib/supabase/") ||
      n.includes("/lib/tts/") ||
      n.includes("/lib/video-jobs/")
    ) {
      delete require.cache[key];
    }
  }
}

describe("first-time faceless assembly readiness (B12)", () => {
  it("mapNullJobAssemblyReadinessDto: faceless + broll + VO → canAssemble true", async () => {
    await withServerOnlyStub(async () => {
      installResolveMocks({
        videoJobs: [
          {
            output_media_asset_id: BROLL_A,
            asset_role: "broll",
            status: "completed",
            created_at: "2026-08-31T12:00:01.000Z",
            client_id: CLIENT_ID,
            reel_script_id: REEL_SCRIPT_ID,
          },
        ],
        mediaAssets: [
          {
            id: BROLL_A,
            client_id: CLIENT_ID,
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
        voiceoverId: VOICEOVER_ASSET_ID,
      });
      clearCache();
      const { mapNullJobAssemblyReadinessDto } = require(
        "./map-operator-assembly-job-dto.ts",
      );

      const dto = await mapNullJobAssemblyReadinessDto({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "faceless",
        targetDurationSec: 30,
      });

      assert.equal(dto.jobId, null);
      assert.equal(dto.status, null);
      assert.equal(dto.reelScriptId, REEL_SCRIPT_ID);
      assert.equal(dto.canAssemble, true);
      assert.equal(dto.canReassemble, false);
      assert.equal(dto.createdAt, null);
      assert.equal(dto.updatedAt, null);
    });
  });

  it("mapNullJobAssemblyReadinessDto: faceless without broll → canAssemble false", async () => {
    await withServerOnlyStub(async () => {
      installResolveMocks({
        videoJobs: [],
        mediaAssets: [
          {
            id: VOICEOVER_ASSET_ID,
            client_id: CLIENT_ID,
            asset_type: "voiceover",
            storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/${VOICEOVER_ASSET_ID}.mp3`,
          },
        ],
        voiceoverId: VOICEOVER_ASSET_ID,
      });
      clearCache();
      const { mapNullJobAssemblyReadinessDto } = require(
        "./map-operator-assembly-job-dto.ts",
      );

      const dto = await mapNullJobAssemblyReadinessDto({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "faceless",
        targetDurationSec: 30,
      });

      assert.equal(dto.jobId, null);
      assert.equal(dto.canAssemble, false);
    });
  });

  it("getAssemblyJobsForReelScripts: no assembly row → null-job companion with canAssemble", async () => {
    await withServerOnlyStub(async () => {
      installBatchMocks({
        scripts: [
          {
            id: REEL_SCRIPT_ID,
            updated_at: "2026-08-31T10:00:00.000Z",
            modalidad: "faceless",
            target_duration_sec: 30,
            cold_open_notes: null,
          },
        ],
        assemblyJobs: [],
        videoJobs: [
          {
            output_media_asset_id: BROLL_A,
            asset_role: "broll",
            status: "completed",
            created_at: "2026-08-31T12:00:01.000Z",
            client_id: CLIENT_ID,
            reel_script_id: REEL_SCRIPT_ID,
          },
        ],
        mediaAssets: [
          {
            id: BROLL_A,
            client_id: CLIENT_ID,
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
        voiceoverId: VOICEOVER_ASSET_ID,
      });
      clearCache();
      const { getAssemblyJobsForReelScripts } = require(
        "./get-assembly-jobs-for-reel-scripts.ts",
      );

      const map = await getAssemblyJobsForReelScripts({
        clientId: CLIENT_ID,
        reelScriptIds: [REEL_SCRIPT_ID],
        modalidadByReelScriptId: new Map([[REEL_SCRIPT_ID, "faceless"]]),
      });

      const dto = map[REEL_SCRIPT_ID];
      assert.ok(dto);
      assert.equal(dto.jobId, null);
      assert.equal(dto.status, null);
      assert.equal(dto.canAssemble, true);
      assert.equal(dto.targetDurationSec, 30);
    });
  });
});

function installResolveMocks(options: {
  videoJobs: Array<Record<string, unknown>>;
  mediaAssets: Array<Record<string, unknown>>;
  voiceoverId: string | null;
}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    const req = String(request);
    if (req.includes("supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from(table: string) {
            if (table === "neuramark_video_jobs") {
              return createVideoJobsQuery(options.videoJobs);
            }
            if (table === "neuramark_media_assets") {
              return createMediaQuery(options.mediaAssets);
            }
            throw new Error(`Unexpected table ${table}`);
          },
        }),
      };
    }
    if (req.includes("get-voiceover-summaries-for-reel-scripts")) {
      return {
        findLatestVoiceoverAssetId: async () => options.voiceoverId,
      };
    }
    return originalLoad(request, parent, isMain);
  };
}

function installBatchMocks(options: {
  scripts: Array<Record<string, unknown>>;
  assemblyJobs: Array<Record<string, unknown>>;
  videoJobs: Array<Record<string, unknown>>;
  mediaAssets: Array<Record<string, unknown>>;
  voiceoverId: string | null;
}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    const req = String(request);
    if (req.includes("supabase/server")) {
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from(table: string) {
            if (table === "neuramark_reel_scripts") {
              return createScriptsQuery(options.scripts);
            }
            if (table === "neuramark_assembled_reels") {
              return createAssemblyJobsQuery(options.assemblyJobs);
            }
            if (table === "neuramark_video_jobs") {
              return createVideoJobsQuery(options.videoJobs);
            }
            if (table === "neuramark_media_assets") {
              return createMediaQuery(options.mediaAssets);
            }
            throw new Error(`Unexpected table ${table}`);
          },
        }),
      };
    }
    if (req.includes("get-voiceover-summaries-for-reel-scripts")) {
      return {
        findLatestVoiceoverAssetId: async () => options.voiceoverId,
      };
    }
    return originalLoad(request, parent, isMain);
  };
}

function createScriptsQuery(rows: Array<Record<string, unknown>>) {
  const filters: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, value: unknown) => {
      filters[col] = value;
      return builder;
    },
    in: () => builder,
    then: (
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void,
    ) => {
      try {
        const filtered = rows.filter((row) => {
          if (
            filters.client_id != null &&
            row.client_id != null &&
            row.client_id !== filters.client_id
          ) {
            return false;
          }
          return true;
        });
        resolve({ data: filtered, error: null });
      } catch (e) {
        reject?.(e);
      }
    },
  };
  return builder;
}

function createAssemblyJobsQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    then: (
      resolve: (v: unknown) => void,
      reject?: (e: unknown) => void,
    ) => {
      try {
        resolve({ data: rows, error: null });
      } catch (e) {
        reject?.(e);
      }
    },
  };
  return builder;
}

function createVideoJobsQuery(rows: Array<Record<string, unknown>>) {
  const filters: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, value: unknown) => {
      filters[col] = value;
      return builder;
    },
    not: () => builder,
    order: (col: string, opts: { ascending: boolean }) => {
      builder._order = { col, ascending: opts.ascending };
      return builder;
    },
    limit: (n: number) => {
      builder._limit = n;
      return builder;
    },
    maybeSingle: async () => {
      const filtered = rows.filter((row) => {
        for (const [k, v] of Object.entries(filters)) {
          if (row[k] !== v) return false;
        }
        return true;
      });
      const ordered = [...filtered].sort((a, b) => {
        const order = builder._order as
          | { col: string; ascending: boolean }
          | undefined;
        if (!order) return 0;
        const av = String(a[order.col] ?? "");
        const bv = String(b[order.col] ?? "");
        return order.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return { data: ordered[0] ?? null, error: null };
    },
    then: undefined as unknown,
  };

  (builder as { then?: Function }).then = (
    resolve: (v: unknown) => void,
    reject?: (e: unknown) => void,
  ) => {
    try {
      const filtered = rows.filter((row) => {
        for (const [k, v] of Object.entries(filters)) {
          if (row[k] !== v) return false;
        }
        return row.output_media_asset_id != null;
      });
      const ordered = [...filtered].sort((a, b) => {
        const order = builder._order as
          | { col: string; ascending: boolean }
          | undefined;
        if (!order) return 0;
        const av = String(a[order.col] ?? "");
        const bv = String(b[order.col] ?? "");
        return order.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      const limit = (builder._limit as number | undefined) ?? ordered.length;
      resolve({ data: ordered.slice(0, limit), error: null });
    } catch (e) {
      reject?.(e);
    }
  };

  return builder;
}

function createMediaQuery(rows: Array<Record<string, unknown>>) {
  const builder: Record<string, unknown> & { _id?: string } = {
    select: () => builder,
    eq: (_col: string, value: string) => {
      builder._id = value;
      return builder;
    },
    maybeSingle: async () => ({
      data: rows.find((row) => row.id === builder._id) ?? null,
      error: null,
    }),
  };
  return builder;
}
