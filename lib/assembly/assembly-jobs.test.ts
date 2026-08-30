/**
 * US-9.1 assembly orchestrator, security, and FFmpeg args tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT,
  NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT,
  NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN_DEFAULT,
} from "@/lib/contracts/assembly-job";
import { buildReelV1BasicArgs } from "@/lib/assembly/ffmpeg/build-reel-v1-basic-args";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const REEL_SCRIPT_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const PRIMARY_ASSET_ID = "66666666-6666-4666-8666-666666666666";
const VOICEOVER_ASSET_ID = "77777777-7777-4777-8777-777777777777";
const OUTPUT_ASSET_ID = "88888888-8888-4888-8888-888888888888";

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
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/app/api/assembly-jobs/")
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

function chainableQuery(terminal: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = terminal.select ?? self;
  builder.eq = terminal.eq ?? self;
  builder.in = terminal.in ?? self;
  builder.lt = terminal.lt ?? self;
  builder.is = self;
  builder.not = self;
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

describe("buildReelV1BasicArgs", () => {
  it("builds trim args when primary exceeds target + tolerance", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: "/tmp/neuramark-assembly/job/primary.mp4",
      localOutputPath: "/tmp/neuramark-assembly/job/output.mp4",
      remuxVoiceover: false,
      primaryDurationSec: 35,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    assert.ok(args.includes("-t"));
    assert.ok(args.includes("30"));
    assert.equal(args.includes("-af"), false);
    assert.ok(!args.some((arg) => /[;&|`$]/.test(arg)));
  });

  it("builds pad args when primary is shorter than target - tolerance", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: "/tmp/neuramark-assembly/job/primary.mp4",
      localOutputPath: "/tmp/neuramark-assembly/job/output.mp4",
      remuxVoiceover: false,
      primaryDurationSec: 25,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    assert.ok(args.some((arg) => arg.includes("tpad=stop_mode=add")));
    assert.ok(args.some((arg) => arg.includes("apad=pad_dur=5")));
  });

  it("builds remux voiceover args with two inputs", () => {
    const args = buildReelV1BasicArgs({
      localPrimaryPath: "/tmp/neuramark-assembly/job/primary.mp4",
      localOutputPath: "/tmp/neuramark-assembly/job/output.mp4",
      localVoiceoverPath: "/tmp/neuramark-assembly/job/voiceover.mp3",
      remuxVoiceover: true,
      primaryDurationSec: 30,
      targetDurationSec: 30,
      toleranceSec: 2,
    });

    assert.ok(args.includes("-map"));
    assert.ok(args.includes("1:a:0"));
    assert.equal(
      args.filter((arg) => arg === "-i").length,
      2,
    );
  });
});

describe("assembly-job-config-readers", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reads defaults for stale timeout and duration tolerance", async () => {
    const {
      readAssemblyStaleTimeoutMin,
      readAssemblyDurationToleranceSec,
      readAssemblyJobPollIntervalMs,
    } = loadAssemblyModule("@/lib/assembly/assembly-job-config-readers");

    delete process.env.NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN;
    delete process.env.NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC;
    delete process.env.ASSEMBLY_JOB_POLL_INTERVAL_MS;

    assert.equal(
      readAssemblyStaleTimeoutMin(),
      NEURAMARK_ASSEMBLY_STALE_TIMEOUT_MIN_DEFAULT,
    );
    assert.equal(
      readAssemblyDurationToleranceSec(),
      NEURAMARK_ASSEMBLY_DURATION_TOLERANCE_SEC_DEFAULT,
    );
    assert.equal(
      readAssemblyJobPollIntervalMs(),
      ASSEMBLY_JOB_POLL_INTERVAL_MS_DEFAULT,
    );
  });
});

describe("findForbiddenAssemblyKeys", () => {
  it("rejects primaryVideoAssetId on assemble input", async () => {
    const { findForbiddenAssemblyKeys } = loadAssemblyModule(
      "@/lib/assembly/find-forbidden-assembly-keys",
    );
    const keys = findForbiddenAssemblyKeys({
      reelScriptId: REEL_SCRIPT_ID,
      primaryVideoAssetId: PRIMARY_ASSET_ID,
    });
    assert.ok(keys.includes("primaryVideoAssetId"));
  });
});

describe("computeAssemblyInputFingerprint", () => {
  it("returns 64-char hex sha256", () => {
    const { computeAssemblyInputFingerprint } = require("@/lib/assembly/compute-input-fingerprint");
    const fp = computeAssemblyInputFingerprint({
      primaryVideoAssetId: PRIMARY_ASSET_ID,
      voiceoverAssetId: VOICEOVER_ASSET_ID,
    });
    assert.match(fp, /^[0-9a-f]{64}$/);
  });
});

describe("createAssemblyJobForReelScript security", () => {
  it("returns FORBIDDEN_FIELDS for forbidden authority keys", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => ({ id: CLIENT_ID, role: "operator" }),
            isAuthGuardError: () => false,
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        const { createAssemblyJobForReelScript } = loadAssemblyModule(
          "@/lib/assembly/create-assembly-job-for-reel-script",
        );

        const result = await createAssemblyJobForReelScript({
          reelScriptId: REEL_SCRIPT_ID,
          templateId: "evil",
        });

        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        }
      } finally {
        nodeModule._load = originalLoad;
      }
    });
  });

  it("returns FORBIDDEN for cliente session", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => {
              const err = new Error("forbidden") as Error & { status: 403 };
              err.status = 403;
              throw err;
            },
            isAuthGuardError: (e: unknown) =>
              typeof e === "object" && e !== null && "status" in e,
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        const { createAssemblyJobForReelScript } = loadAssemblyModule(
          "@/lib/assembly/create-assembly-job-for-reel-script",
        );

        const result = await createAssemblyJobForReelScript({
          reelScriptId: REEL_SCRIPT_ID,
        });

        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN");
        }
      } finally {
        nodeModule._load = originalLoad;
      }
    });
  });
});

describe("applyAssemblyJobUpdate transitions", () => {
  it("is idempotent for terminal completed status", async () => {
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
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
            }),
          };
        }
        if (req.includes("load-assembly-job")) {
          return {
            loadAssemblyJobByIdUnscoped: async () => ({
              id: JOB_ID,
              clientId: CLIENT_ID,
              reelScriptId: REEL_SCRIPT_ID,
              templateId: "reel_v1_basic",
              status: "completed",
              primaryVideoAssetId: PRIMARY_ASSET_ID,
              voiceoverAssetId: null,
              outputMediaAssetId: OUTPUT_ASSET_ID,
              scriptUpdatedAt: new Date().toISOString(),
              inputFingerprint: "a".repeat(64),
              targetDurationSec: 30,
              actualDurationSec: 29.5,
              failureReason: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }),
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        const { applyAssemblyJobUpdate } = loadAssemblyModule(
          "@/lib/assembly/apply-assembly-job-update",
        );

        const result = await applyAssemblyJobUpdate({
          assemblyJobId: JOB_ID,
          patch: { status: "failed", failureReason: "test" },
          source: "worker",
        });

        assert.equal(result.idempotent, true);
        assert.equal(result.status, "completed");
      } finally {
        nodeModule._load = originalLoad;
      }
    });
  });
});

describe("runFfmpeg spawn contract", () => {
  it("passes args array with shell false", async () => {
    await withServerOnlyStub(async () => {
      const { runFfmpeg } = loadAssemblyModule("@/lib/assembly/run-ffmpeg");
      let receivedArgs: string[] | null = null;
      let receivedShell: boolean | undefined;

      await runFfmpeg(["-y", "-i", "primary.mp4", "out.mp4"], {
        spawnImpl: ((cmd, args, opts) => {
          assert.equal(cmd, "ffmpeg");
          receivedArgs = args;
          receivedShell = opts?.shell;
          return {
            stderr: { on: () => undefined },
            on: (event: string, cb: (code: number) => void) => {
              if (event === "close") {
                cb(0);
              }
            },
          };
        }) as typeof import("node:child_process").spawn,
      });

      assert.deepEqual(receivedArgs, ["-y", "-i", "primary.mp4", "out.mp4"]);
      assert.equal(receivedShell, false);
    });
  });
});

describe("assembly security grep guards", () => {
  it("has no UPDATE neuramark_assembled_reels outside lib/assembly", () => {
    const offenders: string[] = [];
    const libDir = path.join(repoRoot, "lib");
    const appDir = path.join(repoRoot, "app");

    function scanDir(dir: string) {
      const { readdirSync, statSync } = require("node:fs");
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry === "node_modules" || entry === ".next") {
            continue;
          }
          scanDir(full);
          continue;
        }
        if (!full.endsWith(".ts") && !full.endsWith(".tsx")) {
          continue;
        }
        const normalized = full.replace(/\\/g, "/");
        if (normalized.includes("/lib/assembly/")) {
          continue;
        }
        const content = readFileSync(full, "utf8");
        if (content.includes("neuramark_assembled_reels")) {
          offenders.push(path.relative(repoRoot, full));
        }
      }
    }

    scanDir(libDir);
    scanDir(appDir);
    assert.deepEqual(offenders, []);
  });

  it("has no fetch( for asset download in lib/assembly", () => {
    const assemblyDir = path.join(repoRoot, "lib/assembly");
    const { readdirSync, statSync } = require("node:fs");

    function scanDir(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          scanDir(full);
          continue;
        }
        if (!full.endsWith(".ts")) {
          continue;
        }
        if (full.endsWith(".test.ts")) {
          continue;
        }
        const content = readFileSync(full, "utf8");
        assert.ok(
          !content.includes("fetch("),
          `${path.relative(repoRoot, full)} must not call fetch(`,
        );
      }
    }

    scanDir(assemblyDir);
  });
});
