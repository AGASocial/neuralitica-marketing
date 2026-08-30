/**
 * US-8.3 manual upload orchestrator, action, and validator tests.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Module from "node:module";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  MANUAL_UPLOAD_SYNC_ONLY,
  uploadManualVideoJobSuccessSchema,
} from "@/lib/contracts/manual-video-upload";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OPERATOR_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const PARENT_JOB_ID = "55555555-5555-4555-8555-555555555555";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const MEDIA_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const SPEND_EVENT_ID = "77777777-7777-4777-8777-777777777777";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function mp4MagicBuffer(size = 512): Buffer {
  const buf = Buffer.alloc(size, 0);
  buf.write("ftypisom", 4, "ascii");
  return buf;
}

function clearManualUploadModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/video-jobs/") ||
      normalized.includes("/lib/media/upload-validation") ||
      normalized.includes("/lib/media/probe-video-duration") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/cost-policy/finalize-generation-cost")
    ) {
      delete require.cache[key];
    }
  }
}

function loadModule<T = Record<string, unknown>>(relativePath: string): T {
  clearManualUploadModuleCache();
  return require(relativePath) as T;
}

function chainableQuery(terminal: {
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  single?: () => Promise<{ data: unknown; error: unknown }>;
  insert?: (payload: unknown) => unknown;
  update?: (payload: unknown) => unknown;
  delete?: () => unknown;
  eq?: (...args: unknown[]) => unknown;
  order?: (...args: unknown[]) => unknown;
  limit?: (...args: unknown[]) => unknown;
}) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = terminal.eq ?? self;
  builder.is = self;
  builder.order = terminal.order ?? self;
  builder.limit = terminal.limit ?? self;
  builder.insert = terminal.insert ?? self;
  builder.update = terminal.update ?? self;
  builder.delete = terminal.delete ?? self;
  builder.maybeSingle =
    terminal.maybeSingle ?? (async () => ({ data: null, error: null }));
  builder.single =
    terminal.single ?? (async () => ({ data: null, error: null }));
  return builder;
}

type InstallOptions = {
  requireOperator?: () => Promise<unknown>;
  loadReelScript?: () => Promise<unknown>;
  latestJob?: Record<string, unknown> | null;
  parentJob?: Record<string, unknown> | null;
  hasConsent?: boolean;
  probeDurationSec?: number | null;
  finalizeSpend?: () => Promise<unknown>;
  mediaRoot?: string;
  revalidatePath?: (p: string) => void;
};

function installMocks(options: InstallOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);

  if (options.mediaRoot) {
    process.env.NEURAMARK_MEDIA_ROOT = options.mediaRoot;
  }

  let insertedMedia: Record<string, unknown> | null = null;
  let insertedJob: Record<string, unknown> | null = null;

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    if (request === "next/cache") {
      return { revalidatePath: options.revalidatePath ?? (() => {}) };
    }
    if (String(request).includes("lib/auth/require-user")) {
      return {
        isAuthGuardError: (error: unknown) =>
          Boolean(
            error &&
              typeof error === "object" &&
              "status" in error &&
              ((error as { status: number }).status === 401 ||
                (error as { status: number }).status === 403),
          ),
        requireOperator:
          options.requireOperator ??
          (async () => ({
            id: OPERATOR_ID,
            email: "gaveho@gmail.com",
            displayName: "Gabriel Vega",
            preferredLocale: "en",
            role: "operator",
            active: true,
          })),
      };
    }
    if (String(request).includes("load-reel-script-for-video-job")) {
      return {
        loadReelScriptForVideoJob:
          options.loadReelScript ??
          (async () => ({
            reelScriptId: REEL_SCRIPT_ID,
            clientId: CLIENT_ID,
            strategyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            slotIndex: 0,
            package: {
              hook: "h",
              body: "b",
              cta: "c",
              onScreenText: "t",
              voiceoverText: "v",
              targetDurationSec: 30,
            },
            visualMode: "faceless",
            modalidad: "faceless",
            hasReferenceLoop: false,
          })),
      };
    }
    if (String(request).includes("assert-active-avatar-consent-for-jobs")) {
      return {
        assertActiveAvatarConsentForJobs: async () =>
          options.hasConsent === false
            ? {
                ok: false,
                error: {
                  code: "OWN_AVATAR_CONSENT_REQUIRED",
                  messageKey: "preferences.errors.ownAvatarConsentRequired",
                },
              }
            : { ok: true },
      };
    }
    if (String(request).includes("probe-video-duration")) {
      return {
        probeVideoDurationSec: async () =>
          options.probeDurationSec === undefined ? 5 : options.probeDurationSec,
        roundDurationSecDown: (n: number) => Math.floor(n * 100) / 100,
      };
    }
    if (String(request).includes("finalize-generation-cost")) {
      return {
        finalizeGenerationCost:
          options.finalizeSpend ??
          (async () => ({ ok: true, spendEventId: SPEND_EVENT_ID })),
      };
    }
    if (String(request).includes("lib/supabase/server")) {
      let videoJobsMaybeSingleCall = 0;
      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table === "neuramark_video_jobs") {
              return chainableQuery({
                maybeSingle: async () => {
                  videoJobsMaybeSingleCall += 1;
                  if (videoJobsMaybeSingleCall === 1) {
                    return { data: options.latestJob ?? null, error: null };
                  }
                  return { data: options.parentJob ?? null, error: null };
                },
                insert: (payload: Record<string, unknown>) => {
                  insertedJob = payload;
                  return chainableQuery({
                    single: async () => ({
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
                        actual_cost_cents: payload.actual_cost_cents,
                        failure_reason: null,
                        portrait_asset_id: null,
                        voiceover_asset_id: null,
                        output_media_asset_id: payload.output_media_asset_id,
                        parent_job_id: payload.parent_job_id,
                        spend_event_id: null,
                        operator_client_id: payload.operator_client_id,
                        attempt: payload.attempt,
                        created_at: "2026-08-30T15:00:00.000Z",
                        updated_at: "2026-08-30T15:00:00.000Z",
                      },
                      error: null,
                    }),
                  });
                },
                update: () => ({
                  eq: async () => ({ data: null, error: null }),
                }),
              });
            }
            if (table === "neuramark_media_assets") {
              return chainableQuery({
                insert: (payload: Record<string, unknown>) => {
                  insertedMedia = payload;
                  return chainableQuery({
                    single: async () => ({
                      data: { id: MEDIA_ASSET_ID },
                      error: null,
                    }),
                  });
                },
                delete: () => ({
                  eq: () => ({
                    eq: async () => ({ data: null, error: null }),
                  }),
                }),
              });
            }
            if (table === "neuramark_reel_spend_events") {
              return chainableQuery({
                maybeSingle: async () => ({ data: null, error: null }),
              });
            }
            throw new Error(`unexpected table ${table}`);
          },
        }),
      };
    }
    return originalLoad(request, parent, isMain);
  };

  return {
    restore: () => {
      nodeModule._load = originalLoad;
      delete process.env.NEURAMARK_MEDIA_ROOT;
      clearManualUploadModuleCache();
    },
    getInsertedJob: () => insertedJob,
    getInsertedMedia: () => insertedMedia,
  };
}

describe("validateAndPrepareMediaUpload generated_video", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-gen-vid-"));

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("accepts mp4 with duration; rejects jpeg and over-duration", async () => {
    const restoreOk = installMocks({ mediaRoot: tmp, probeDurationSec: 10 });
    try {
      const { validateAndPrepareMediaUpload } = loadModule(
        "../media/upload-validation.ts",
      );
      const ok = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "generated_video",
        file: mp4MagicBuffer(600),
        originalFilename: "clip.mp4",
        existingAssetCount: 0,
      });
      assert.equal(ok.ok, true);
      if (ok.ok) {
        assert.equal(ok.prepared.detectedMime, "video/mp4");
        assert.equal(ok.prepared.metadata.durationSec, 10);
      }
    } finally {
      restoreOk.restore();
    }

    const restoreLong = installMocks({ mediaRoot: tmp, probeDurationSec: 45 });
    try {
      const { validateAndPrepareMediaUpload } = loadModule(
        "../media/upload-validation.ts",
      );
      const long = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "generated_video",
        file: mp4MagicBuffer(600),
        originalFilename: "long.mp4",
        existingAssetCount: 0,
      });
      assert.equal(long.ok, false);
      if (!long.ok) assert.equal(long.error.code, "VIDEO_TOO_LONG");
    } finally {
      restoreLong.restore();
    }

    const restoreJpeg = installMocks({ mediaRoot: tmp });
    try {
      const { validateAndPrepareMediaUpload } = loadModule(
        "../media/upload-validation.ts",
      );
      const jpeg = Buffer.alloc(256, 0);
      jpeg[0] = 0xff;
      jpeg[1] = 0xd8;
      jpeg[2] = 0xff;
      const bad = await validateAndPrepareMediaUpload({
        userId: CLIENT_ID,
        assetType: "generated_video",
        file: jpeg,
        originalFilename: "x.jpg",
        existingAssetCount: 0,
      });
      assert.equal(bad.ok, false);
      if (!bad.ok) assert.equal(bad.error.code, "INVALID_FILE_TYPE");
    } finally {
      restoreJpeg.restore();
    }
  });
});

describe("uploadManualVideoJob orchestrator", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "neuramark-manual-orch-"));

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("completes sync job with zero cost and operator attribution", async () => {
    const mocks = installMocks({
      mediaRoot: tmp,
      latestJob: {
        id: PARENT_JOB_ID,
        client_id: CLIENT_ID,
        reel_script_id: REEL_SCRIPT_ID,
        provider_key: "sadtalker_low",
        provider_tier: "low",
        asset_role: "primary",
        external_job_id: "pred-1",
        status: "failed",
        estimated_cost_cents: 100,
        actual_cost_cents: null,
        failure_reason: "timeout",
        portrait_asset_id: null,
        voiceover_asset_id: null,
        output_media_asset_id: null,
        parent_job_id: null,
        spend_event_id: null,
        operator_client_id: null,
        attempt: 1,
        created_at: "2026-08-30T14:00:00.000Z",
        updated_at: "2026-08-30T14:00:00.000Z",
      },
      parentJob: {
        id: PARENT_JOB_ID,
        client_id: CLIENT_ID,
        reel_script_id: REEL_SCRIPT_ID,
        provider_key: "sadtalker_low",
        provider_tier: "low",
        asset_role: "primary",
        external_job_id: "pred-1",
        status: "failed",
        estimated_cost_cents: 100,
        actual_cost_cents: null,
        failure_reason: "timeout",
        portrait_asset_id: null,
        voiceover_asset_id: null,
        output_media_asset_id: null,
        parent_job_id: null,
        spend_event_id: null,
        operator_client_id: null,
        attempt: 1,
        created_at: "2026-08-30T14:00:00.000Z",
        updated_at: "2026-08-30T14:00:00.000Z",
      },
    });

    try {
      const { resetMediaStorageCacheForTests } = loadModule(
        "../media/storage/get-media-storage.ts",
      );
      resetMediaStorageCacheForTests();

      const { uploadManualVideoJob } = loadModule("./upload-manual-video-job.ts");
      const result = await uploadManualVideoJob({
        reelScriptId: REEL_SCRIPT_ID,
        clientId: CLIENT_ID,
        operatorClientId: OPERATOR_ID,
        file: mp4MagicBuffer(800),
        originalFilename: "manual.mp4",
        parentJobId: PARENT_JOB_ID,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(uploadManualVideoJobSuccessSchema.safeParse(result).success, true);
        assert.equal(result.status, "completed");
        assert.equal(result.job.cost.estimatedCostCents, 0);
        assert.equal(result.job.cost.actualCostCents, 0);
        assert.equal(result.job.canRetry, false);
      }

      const job = mocks.getInsertedJob();
      assert.ok(job);
      assert.equal(job!.provider_key, "manual");
      assert.equal(job!.status, "completed");
      assert.equal(job!.estimated_cost_cents, 0);
      assert.equal(job!.actual_cost_cents, 0);
      assert.equal(job!.operator_client_id, OPERATOR_ID);
      assert.equal(job!.attempt, 2);
      assert.match(String(job!.external_job_id), /^manual-/);

      const media = mocks.getInsertedMedia();
      assert.ok(media);
      assert.equal(media!.asset_type, "generated_video");
      assert.equal((media!.metadata as { source: string }).source, "manual_upload");
      assert.ok(
        existsSync(path.join(tmp, String(media!.storage_key))),
      );
    } finally {
      mocks.restore();
    }
  });

  it("returns NOT_FOUND for foreign reel/client", async () => {
    const mocks = installMocks({
      loadReelScript: async () => null,
    });
    try {
      const { uploadManualVideoJob } = loadModule("./upload-manual-video-job.ts");
      const result = await uploadManualVideoJob({
        reelScriptId: REEL_SCRIPT_ID,
        clientId: FOREIGN_CLIENT_ID,
        operatorClientId: OPERATOR_ID,
        file: mp4MagicBuffer(400),
        originalFilename: "manual.mp4",
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "NOT_FOUND");
    } finally {
      mocks.restore();
    }
  });

  it("blocks SLOT_COMPLETED_JOB_EXISTS and SLOT_JOB_IN_FLIGHT", async () => {
    for (const status of ["completed", "processing"] as const) {
      const mocks = installMocks({
        latestJob: {
          id: JOB_ID,
          client_id: CLIENT_ID,
          reel_script_id: REEL_SCRIPT_ID,
          provider_key: "sadtalker_low",
          provider_tier: "low",
          asset_role: "primary",
          external_job_id: "pred-2",
          status,
          estimated_cost_cents: 10,
          actual_cost_cents: null,
          failure_reason: null,
          portrait_asset_id: null,
          voiceover_asset_id: null,
          output_media_asset_id: null,
          parent_job_id: null,
          spend_event_id: null,
          operator_client_id: null,
          attempt: 1,
          created_at: "2026-08-30T14:00:00.000Z",
          updated_at: "2026-08-30T14:00:00.000Z",
        },
      });
      try {
        const { uploadManualVideoJob } = loadModule("./upload-manual-video-job.ts");
        const result = await uploadManualVideoJob({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          operatorClientId: OPERATOR_ID,
          file: mp4MagicBuffer(400),
          originalFilename: "manual.mp4",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(
            result.error.code,
            status === "completed"
              ? "SLOT_COMPLETED_JOB_EXISTS"
              : "SLOT_JOB_IN_FLIGHT",
          );
        }
      } finally {
        mocks.restore();
      }
    }
  });

  it("succeeds at budget cap via zero-cost skip (finalizeGenerationCost only)", async () => {
    let finalizeCalled = false;
    const mocks = installMocks({
      mediaRoot: tmp,
      latestJob: null,
      finalizeSpend: async () => {
        finalizeCalled = true;
        return { ok: true, spendEventId: SPEND_EVENT_ID };
      },
    });
    try {
      const { resetMediaStorageCacheForTests } = loadModule(
        "../media/storage/get-media-storage.ts",
      );
      resetMediaStorageCacheForTests();
      const { uploadManualVideoJob } = loadModule("./upload-manual-video-job.ts");
      const result = await uploadManualVideoJob({
        reelScriptId: REEL_SCRIPT_ID,
        clientId: CLIENT_ID,
        operatorClientId: OPERATOR_ID,
        file: mp4MagicBuffer(500),
        originalFilename: "manual.mp4",
      });
      assert.equal(result.ok, true);
      assert.equal(finalizeCalled, true);
    } finally {
      mocks.restore();
    }
  });
});

describe("uploadManualVideoJob Server Action", () => {
  it("returns FORBIDDEN for non-operator and rejects forbidden fields", async () => {
    const mocksForbidden = installMocks({
      requireOperator: async () => {
        const err = new Error("forbidden") as Error & { status: number };
        err.status = 403;
        throw err;
      },
    });
    try {
      const { uploadManualVideoJob } = loadModule(
        "./actions/upload-manual-video-job.ts",
      );
      const fd = new FormData();
      fd.append("reelScriptId", REEL_SCRIPT_ID);
      fd.append("clientId", CLIENT_ID);
      fd.append("file", new Blob([mp4MagicBuffer(200)]), "x.mp4");
      const result = await uploadManualVideoJob(fd);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
    } finally {
      mocksForbidden.restore();
    }

    const mocksFields = installMocks({});
    try {
      const { uploadManualVideoJob } = loadModule(
        "./actions/upload-manual-video-job.ts",
      );
      const fd = new FormData();
      fd.append("reelScriptId", REEL_SCRIPT_ID);
      fd.append("clientId", CLIENT_ID);
      fd.append("status", "completed");
      fd.append("file", new Blob([mp4MagicBuffer(200)]), "x.mp4");
      const result = await uploadManualVideoJob(fd);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, "FORBIDDEN_FIELDS");
    } finally {
      mocksFields.restore();
    }
  });
});

describe("migration + adapter safety", () => {
  it("migration defines operator_client_id CHECK for manual rows", () => {
    const mig = path.join(
      repoRoot,
      "supabase/migrations/20260830700000_neuramark_video_jobs_operator_client_id.sql",
    );
    assert.equal(existsSync(mig), true);
    const sql = readFileSync(mig, "utf8");
    assert.match(sql, /operator_client_id/);
    assert.match(sql, /neuramark_video_jobs_manual_operator_attribution_chk/);
    assert.match(sql, /provider_key <> 'manual'/);
  });

  it("manual adapter source throws MANUAL_UPLOAD_SYNC_ONLY constant", () => {
    const src = readFileSync(
      path.join(__dirname, "upload-manual-video-job.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /enqueueVideoJobPoll/);
    const adapterSrc = readFileSync(
      path.join(__dirname, "../providers/video/manual-upload-adapter.ts"),
      "utf8",
    );
    assert.match(adapterSrc, new RegExp(MANUAL_UPLOAD_SYNC_ONLY));
  });
});
