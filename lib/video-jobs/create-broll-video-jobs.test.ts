/**
 * US-8.5 Phase B — createBrollVideoJobs orchestrator + graceful degrade.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const REEL_SCRIPT_ID = "11111111-1111-4111-8111-111111111111";
const STILL_ASSET_ID = "33333333-3333-4333-8333-333333333333";
const JOB_ID = "44444444-4444-4444-8444-444444444444";
const EXTERNAL_JOB_ID = "wan_mock_request_001";
const PRIMARY_JOB_ID = "55555555-5555-4555-8555-555555555555";
const API_KEY = "sk-test-siliconflow-broll-orchestrator-key";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/video-jobs/") ||
      normalized.includes("/lib/media/get-broll-reference-still") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/supabase/server") ||
      normalized.includes("/lib/providers/") ||
      normalized.includes("/lib/cost-policy/")
    ) {
      delete require.cache[key];
    }
  }
}

function withServerOnlyStub<T>(run: () => T | Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad(request, parent, isMain);
  };
  return Promise.resolve(run()).finally(() => {
    nodeModule._load = originalLoad;
  });
}

type MockOptions = {
  role?: "operator" | "client";
  needsBrollScript?: boolean;
  brollBeats?: string[];
  stillAssetId?: string | null;
  providerKey?: string;
  providerTier?: "low" | "high";
  budgetOk?: boolean | ((beatIndex: number) => boolean);
  createJobThrows?: boolean | string;
  onCreateJob?: (input: Record<string, unknown>) => void;
  onBudget?: (args: Record<string, unknown>) => void;
  primaryJobsTouched?: { count: number };
};

function installMocks(options: MockOptions = {}) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  const insertedRows: Record<string, unknown>[] = [];
  let createCallCount = 0;
  let budgetCallCount = 0;
  const role = options.role ?? "operator";
  const stillAssetId =
    options.stillAssetId === undefined ? STILL_ASSET_ID : options.stillAssetId;
  const needsBroll = options.needsBrollScript !== false;
  const beats =
    options.brollBeats ??
    (needsBroll ? ["Storefront morning", "Product close-up"] : []);
  const providerKey = options.providerKey ?? "siliconflow_wan21_turbo";
  const providerTier = options.providerTier ?? "low";

  const mockAdapter = {
    estimateCost: async () => ({
      estimatedCostCents: 21,
      currency: "USD",
      providerKey,
    }),
    createJob: async (input: Record<string, unknown>) => {
      createCallCount += 1;
      options.onCreateJob?.(input);
      if (options.createJobThrows) {
        const msg =
          typeof options.createJobThrows === "string"
            ? options.createJobThrows
            : `Bearer ${API_KEY} failed`;
        throw new Error(msg);
      }
      return {
        externalJobId: `${EXTERNAL_JOB_ID}_${createCallCount}`,
        status: "queued" as const,
        estimatedCostCents: 21,
      };
    },
  };

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);

    if (req.includes("require-user")) {
      return {
        isAuthGuardError: (e: unknown) =>
          Boolean(e && typeof e === "object" && "status" in e),
        requireOperator: async () => {
          if (role !== "operator") {
            const err = new Error("Forbidden") as Error & { status: number };
            err.status = 403;
            throw err;
          }
          return { id: CLIENT_ID, role: "operator" };
        },
      };
    }

    if (req.includes("load-reel-script-for-video-job")) {
      return {
        loadReelScriptForVideoJob: async () => ({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          strategyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          slotIndex: 0,
          visualMode: needsBroll ? "faceless" : "own_avatar",
          modalidad: needsBroll ? "faceless" : "own_avatar",
          hasReferenceLoop: false,
          package: {
            hook: "Hook line",
            body: "Body line for the reel",
            cta: "Call now",
            onScreenText: "On screen",
            voiceoverText: "Voiceover text",
            targetDurationSec: 30,
            brollBeats: beats.length > 0 ? beats : undefined,
          },
        }),
      };
    }

    if (req.includes("resolve-provider-for-job")) {
      return {
        resolveProviderForJob: async () =>
          providerKey
            ? {
                ok: true,
                decision: { providerKey, providerTier },
              }
            : { ok: false, code: "PROVIDER_UNAVAILABLE" },
      };
    }

    if (req.includes("get-broll-reference-still-asset-for-client")) {
      return {
        getBrollReferenceStillAssetForClient: async () =>
          stillAssetId ? { assetId: stillAssetId } : null,
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
        assertReelBudgetAllowsEstimatedSpend: async (
          args: Record<string, unknown>,
        ) => {
          budgetCallCount += 1;
          options.onBudget?.(args);
          const beatIndex = budgetCallCount - 1;
          const ok =
            typeof options.budgetOk === "function"
              ? options.budgetOk(beatIndex)
              : (options.budgetOk ?? true);
          if (!ok) {
            return { ok: false, code: "BUDGET_EXCEEDED" };
          }
          return {
            ok: true,
            estimatedCostCents: args.estimatedCostCents,
            cumulativeCostCents: 0,
            maxCostCents: 150,
            providerTier,
          };
        },
      };
    }

    if (req.includes("record-reel-spend-event")) {
      return {
        recordReelSpendEvent: async () => ({
          spendEventId: "66666666-6666-4666-8666-666666666666",
        }),
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
            if (table === "neuramark_video_jobs") {
              return {
                insert: (payload: Record<string, unknown>) => {
                  if (
                    options.primaryJobsTouched &&
                    payload.asset_role === "primary"
                  ) {
                    options.primaryJobsTouched.count += 1;
                  }
                  const row = {
                    id: `${JOB_ID.slice(0, -1)}${insertedRows.length}`,
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
                    parent_job_id: payload.parent_job_id ?? null,
                    spend_event_id: null,
                    operator_client_id: payload.operator_client_id ?? null,
                    attempt: payload.attempt ?? 1,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  };
                  insertedRows.push(row);
                  return {
                    select: () => ({
                      single: async () => ({ data: row, error: null }),
                    }),
                  };
                },
                update: () => ({
                  eq: async () => ({ data: null, error: null }),
                }),
              };
            }
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          },
        }),
      };
    }

    return originalLoad(request, parent, isMain);
  };

  clearModuleCache();

  return {
    restore: () => {
      nodeModule._load = originalLoad;
      clearModuleCache();
    },
    getInsertedRows: () => insertedRows,
    getCreateCallCount: () => createCallCount,
    getBudgetCallCount: () => budgetCallCount,
  };
}

afterEach(() => {
  clearModuleCache();
});

describe("US-8.5 Phase B createBrollVideoJobs", () => {
  it("1 — low tier + needsBroll → creates Wan jobs asset_role=broll", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks();
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.createdCount, 2);
        assert.equal(result.skippedNoNeedsBroll, false);
        assert.equal(mock.getInsertedRows().length, 2);
        for (const row of mock.getInsertedRows()) {
          assert.equal(row.asset_role, "broll");
          assert.equal(row.provider_key, "siliconflow_wan21_turbo");
          assert.equal(row.client_id, CLIENT_ID);
        }
      } finally {
        mock.restore();
      }
    });
  });

  it("2 — no needsBroll → skippedNoNeedsBroll true, zero jobs", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({
        needsBrollScript: false,
        brollBeats: [],
      });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.skippedNoNeedsBroll, true);
        assert.equal(result.createdCount, 0);
        assert.equal(mock.getCreateCallCount(), 0);
      } finally {
        mock.restore();
      }
    });
  });

  it("3 — N beats → N jobs (capped at 8)", async () => {
    await withServerOnlyStub(async () => {
      const beats = Array.from({ length: 10 }, (_, i) => `Beat ${i}`);
      const mock = installMocks({ brollBeats: beats });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.createdCount, 8);
        assert.equal(mock.getCreateCallCount(), 8);
      } finally {
        mock.restore();
      }
    });
  });

  it("4 — client provider_key / prompt / image_url → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks();
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
          provider_key: "siliconflow_wan21_turbo",
          prompt: "attacker freeform",
          image_url: "https://169.254.169.254/latest/meta-data/",
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        assert.equal(mock.getCreateCallCount(), 0);
      } finally {
        mock.restore();
      }
    });
  });

  it("5 — budget spy called before each clip createJob", async () => {
    await withServerOnlyStub(async () => {
      const order: string[] = [];
      const mock = installMocks({
        brollBeats: ["A", "B", "C"],
        onBudget: () => order.push("budget"),
        onCreateJob: () => order.push("create"),
      });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.deepEqual(order, [
          "budget",
          "create",
          "budget",
          "create",
          "budget",
          "create",
        ]);
        assert.equal(mock.getBudgetCallCount(), 3);
      } finally {
        mock.restore();
      }
    });
  });

  it("6 — over-budget B-roll does not mark primary failed", async () => {
    await withServerOnlyStub(async () => {
      const primaryJobsTouched = { count: 0 };
      const mock = installMocks({
        budgetOk: false,
        primaryJobsTouched,
      });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.createdCount, 0);
        assert.ok(result.skipped.every((s: { reasonCode: string }) => s.reasonCode === "BUDGET_EXCEEDED"));
        assert.equal(primaryJobsTouched.count, 0);
        assert.equal(PRIMARY_JOB_ID.length > 0, true);
      } finally {
        mock.restore();
      }
    });
  });

  it("7 — B-roll adapter throw leaves primary successful (degrade)", async () => {
    await withServerOnlyStub(async () => {
      const primaryJobsTouched = { count: 0 };
      const mock = installMocks({
        createJobThrows: `Bearer ${API_KEY} vendor boom`,
        primaryJobsTouched,
      });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        assert.equal(result.createdCount, 0);
        assert.ok(result.skippedCount >= 1);
        assert.equal(primaryJobsTouched.count, 0);
      } finally {
        mock.restore();
      }
    });
  });

  it("8 — INSERT persists asset_role=broll + client_id", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({ brollBeats: ["One"] });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        const row = mock.getInsertedRows()[0];
        assert.equal(row?.asset_role, "broll");
        assert.equal(row?.client_id, CLIENT_ID);
        assert.equal(row?.voiceover_asset_id, null);
        assert.equal(row?.portrait_asset_id, STILL_ASSET_ID);
      } finally {
        mock.restore();
      }
    });
  });

  it("9 — non-operator → 403 FORBIDDEN", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({ role: "client" });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN");
      } finally {
        mock.restore();
      }
    });
  });

  it("10 — missing reference still → BROLL_REFERENCE_STILL_MISSING; primary untouched", async () => {
    await withServerOnlyStub(async () => {
      const primaryJobsTouched = { count: 0 };
      const mock = installMocks({
        stillAssetId: null,
        primaryJobsTouched,
      });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "BROLL_REFERENCE_STILL_MISSING");
        assert.equal(mock.getCreateCallCount(), 0);
        assert.equal(primaryJobsTouched.count, 0);
      } finally {
        mock.restore();
      }
    });
  });

  it("11 — singleClipRetry stays broll + Wan (no primary hardcode)", async () => {
    await withServerOnlyStub(async () => {
      let createInput: Record<string, unknown> | null = null;
      const mock = installMocks({
        brollBeats: ["A", "B", "C"],
        onCreateJob: (input) => {
          createInput = input;
        },
      });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs(
          {
            reelScriptId: REEL_SCRIPT_ID,
            clientId: CLIENT_ID,
          },
          {
            parentJobId: "77777777-7777-4777-8777-777777777777",
            attempt: 2,
            operatorClientId: CLIENT_ID,
            jobKind: "broll_retry",
            singleClipRetry: { referenceStillAssetId: STILL_ASSET_ID },
          },
        );
        assert.equal(result.ok, true);
        assert.equal(result.createdCount, 1);
        assert.equal(createInput?.assetRole, "broll");
        assert.equal(createInput?.providerKey, "siliconflow_wan21_turbo");
        assert.equal(mock.getInsertedRows()[0]?.asset_role, "broll");
        assert.equal(mock.getInsertedRows()[0]?.attempt, 2);
        assert.equal(mock.getInsertedRows()[0]?.provider_key, "siliconflow_wan21_turbo");
      } finally {
        mock.restore();
      }
    });
  });

  it("12 — degrade path sanitized errors contain no key / Bearer substring", async () => {
    await withServerOnlyStub(async () => {
      const mock = installMocks({
        createJobThrows: `Unauthorized Bearer ${API_KEY} refused`,
      });
      try {
        const { createBrollVideoJobs } = require("./create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, true);
        const serialized = JSON.stringify(result);
        assert.doesNotMatch(serialized, new RegExp(API_KEY));
        assert.doesNotMatch(serialized, /Bearer\s+sk-/i);
      } finally {
        mock.restore();
      }
    });
  });

  it("orchestrator module imports server-only", () => {
    const src = readFileSync(
      path.join(__dirname, "create-broll-video-jobs.ts"),
      "utf8",
    );
    assert.match(src, /import ["']server-only["']/);
  });

  it("H1 — Server Action always requireOperator; never re-exports options", () => {
    const actionSrc = readFileSync(
      path.join(__dirname, "actions/create-broll-video-jobs.ts"),
      "utf8",
    );
    assert.match(actionSrc, /^"use server";/m);
    assert.doesNotMatch(
      actionSrc,
      /export\s*\{\s*createBrollVideoJobs\s*\}\s*from/,
    );
    assert.match(actionSrc, /await requireOperator\("handler"\)/);
    const fnStart = actionSrc.indexOf("export async function createBrollVideoJobs");
    assert.ok(fnStart >= 0);
    const requireIdx = actionSrc.indexOf('requireOperator("handler")', fnStart);
    const coreIdx = actionSrc.indexOf("createBrollVideoJobsCore", fnStart);
    assert.ok(requireIdx >= 0 && coreIdx > requireIdx);
    assert.match(
      actionSrc,
      /createBrollVideoJobsCore\(\s*rawInput\s*,\s*\{\s*operatorClientId:\s*operator\.id/,
    );
    assert.match(
      actionSrc,
      /export async function createBrollVideoJobs\(\s*rawInput:\s*unknown,?\s*\)/,
    );
    // Single-arg action only — no options parameter reachable from the client.
    assert.doesNotMatch(
      actionSrc,
      /export async function createBrollVideoJobs\([^)]*options/,
    );
  });

  it("H1 — Server Action rejects non-operator before core", async () => {
    await withServerOnlyStub(async () => {
      let coreCalled = false;
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            isAuthGuardError: (e: unknown) =>
              Boolean(e && typeof e === "object" && "status" in e),
            requireOperator: async () => {
              const err = new Error("Forbidden") as Error & { status: number };
              err.status = 403;
              throw err;
            },
          };
        }
        if (
          req.includes("create-broll-video-jobs") &&
          !req.includes("actions/")
        ) {
          return {
            createBrollVideoJobs: async () => {
              coreCalled = true;
              return { ok: true, jobs: [], skipped: [], createdCount: 0, skippedCount: 0, skippedNoNeedsBroll: false };
            },
          };
        }
        return originalLoad(request, parent, isMain);
      };
      clearModuleCache();
      try {
        const { createBrollVideoJobs } = require("./actions/create-broll-video-jobs.ts");
        const result = await createBrollVideoJobs({
          reelScriptId: REEL_SCRIPT_ID,
          clientId: CLIENT_ID,
        });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "FORBIDDEN");
        assert.equal(coreCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearModuleCache();
      }
    });
  });
});
