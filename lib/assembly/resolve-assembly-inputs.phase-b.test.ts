/**
 * US-9.1 Phase B — resolveAssemblyInputs faceless / degrade / modality gates.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const PRIMARY_ASSET_ID = "55555555-5555-4555-8555-555555555555";
const VOICEOVER_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const BROLL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BROLL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BROLL_FOREIGN = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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

describe("resolveAssemblyInputs Phase B", () => {
  it("faceless orders broll by created_at ASC and requires voiceover", async () => {
    await withServerOnlyStub(async () => {
      const videoJobs = [
        {
          output_media_asset_id: BROLL_B,
          asset_role: "broll",
          status: "completed",
          created_at: "2026-08-31T12:00:02.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
        {
          output_media_asset_id: BROLL_A,
          asset_role: "broll",
          status: "completed",
          created_at: "2026-08-31T12:00:01.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
      ];
      const mediaAssets = [
        { id: BROLL_A, client_id: CLIENT_ID, asset_type: "generated_video", storage_key: `${BROLL_A}.mp4` },
        { id: BROLL_B, client_id: CLIENT_ID, asset_type: "generated_video", storage_key: `${BROLL_B}.mp4` },
        {
          id: VOICEOVER_ASSET_ID,
          client_id: CLIENT_ID,
          asset_type: "voiceover",
          storage_key: `neuramark/${CLIENT_ID}/${REEL_SCRIPT_ID}/${VOICEOVER_ASSET_ID}.mp3`,
        },
      ];

      installMocks({ videoJobs, mediaAssets, voiceoverId: VOICEOVER_ASSET_ID });
      clearCache();
      const { resolveAssemblyInputs } = require("./resolve-assembly-inputs.ts");

      const result = await resolveAssemblyInputs({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "faceless",
        targetDurationSec: 30,
        coldOpenNotes: "2",
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.pathTag, "broll_stitch");
        assert.deepEqual(result.brollAssetIds, [BROLL_A, BROLL_B]);
        assert.equal(result.voiceoverAssetId, VOICEOVER_ASSET_ID);
        assert.equal(result.remuxVoiceover, true);
        assert.equal(result.coldOpenTrimSec, 2);
      }
    });
  });

  it("talking-head ignores broll and uses primary path", async () => {
    await withServerOnlyStub(async () => {
      const videoJobs = [
        {
          output_media_asset_id: PRIMARY_ASSET_ID,
          asset_role: "primary",
          status: "completed",
          created_at: "2026-08-31T12:00:00.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
        {
          output_media_asset_id: BROLL_A,
          asset_role: "broll",
          status: "completed",
          created_at: "2026-08-31T12:00:01.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
      ];
      const mediaAssets = [
        { id: PRIMARY_ASSET_ID, client_id: CLIENT_ID, asset_type: "generated_video", storage_key: `${PRIMARY_ASSET_ID}.mp4` },
        { id: BROLL_A, client_id: CLIENT_ID, asset_type: "generated_video", storage_key: `${BROLL_A}.mp4` },
      ];

      installMocks({ videoJobs, mediaAssets, voiceoverId: null });
      clearCache();
      const { resolveAssemblyInputs } = require("./resolve-assembly-inputs.ts");

      const result = await resolveAssemblyInputs({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "own_avatar",
        targetDurationSec: 30,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.pathTag, "primary");
        assert.equal(result.primaryVideoAssetId, PRIMARY_ASSET_ID);
        assert.deepEqual(result.brollAssetIds, []);
      }
    });
  });

  it("faceless zero broll + primary → degrade to primary", async () => {
    await withServerOnlyStub(async () => {
      const videoJobs = [
        {
          output_media_asset_id: PRIMARY_ASSET_ID,
          asset_role: "primary",
          status: "completed",
          created_at: "2026-08-31T12:00:00.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
      ];
      const mediaAssets = [
        { id: PRIMARY_ASSET_ID, client_id: CLIENT_ID, asset_type: "generated_video", storage_key: `${PRIMARY_ASSET_ID}.mp4` },
      ];

      installMocks({ videoJobs, mediaAssets, voiceoverId: null });
      clearCache();
      const { resolveAssemblyInputs } = require("./resolve-assembly-inputs.ts");

      const result = await resolveAssemblyInputs({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "faceless",
        targetDurationSec: 30,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.pathTag, "primary");
        assert.equal(result.primaryVideoAssetId, PRIMARY_ASSET_ID);
        assert.deepEqual(result.brollAssetIds, []);
      }
    });
  });

  it("faceless zero broll + no primary → facelessWaitingForClips", async () => {
    await withServerOnlyStub(async () => {
      installMocks({ videoJobs: [], mediaAssets: [], voiceoverId: null });
      clearCache();
      const { resolveAssemblyInputs } = require("./resolve-assembly-inputs.ts");

      const result = await resolveAssemblyInputs({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "faceless",
        targetDurationSec: 30,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.messageKey, "scripts.assembly.errors.facelessWaitingForClips");
      }
    });
  });

  it("faceless stitch without voiceover → facelessMissingVoiceover", async () => {
    await withServerOnlyStub(async () => {
      const videoJobs = [
        {
          output_media_asset_id: BROLL_A,
          asset_role: "broll",
          status: "completed",
          created_at: "2026-08-31T12:00:01.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
      ];
      const mediaAssets = [
        { id: BROLL_A, client_id: CLIENT_ID, asset_type: "generated_video", storage_key: `${BROLL_A}.mp4` },
      ];

      installMocks({ videoJobs, mediaAssets, voiceoverId: null });
      clearCache();
      const { resolveAssemblyInputs } = require("./resolve-assembly-inputs.ts");

      const result = await resolveAssemblyInputs({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "faceless",
        targetDurationSec: 30,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(
          result.messageKey,
          "scripts.assembly.errors.facelessMissingVoiceover",
        );
      }
    });
  });

  it("skips foreign-owned broll assets (fail-closed)", async () => {
    await withServerOnlyStub(async () => {
      const videoJobs = [
        {
          output_media_asset_id: BROLL_FOREIGN,
          asset_role: "broll",
          status: "completed",
          created_at: "2026-08-31T12:00:01.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
        {
          output_media_asset_id: BROLL_A,
          asset_role: "broll",
          status: "completed",
          created_at: "2026-08-31T12:00:02.000Z",
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
        },
      ];
      const mediaAssets = [
        {
          id: BROLL_FOREIGN,
          client_id: OTHER_CLIENT_ID,
          asset_type: "generated_video",
          storage_key: `${BROLL_FOREIGN}.mp4`,
        },
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
      ];

      installMocks({ videoJobs, mediaAssets, voiceoverId: VOICEOVER_ASSET_ID });
      clearCache();
      const { resolveAssemblyInputs } = require("./resolve-assembly-inputs.ts");

      const result = await resolveAssemblyInputs({
        clientId: CLIENT_ID,
        reelScriptId: REEL_SCRIPT_ID,
        modalidad: "faceless",
        targetDurationSec: 30,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.deepEqual(result.brollAssetIds, [BROLL_A]);
        assert.ok(!result.brollAssetIds.includes(BROLL_FOREIGN));
      }
    });
  });
});

function installMocks(options: {
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

  // Make thenable for await on limit() chains that don't call maybeSingle
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
