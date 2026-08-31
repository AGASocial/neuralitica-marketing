/**
 * US-13.1 reel metrics upsert — action, core, contracts, security.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  findForbiddenReelMetricsKeys,
  REEL_METRICS_MAX_VALUE,
  REEL_METRICS_MESSAGE_KEYS,
  upsertReelMetricsInputSchema,
} from "@/lib/contracts/reel-metrics";
import {
  computeReelMetricsEditable,
  isWithinReelMetricsEditWindow,
} from "@/lib/metrics/reel-metrics-edit-window";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const ASSEMBLED_REEL_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OPERATOR_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_B = "33333333-3333-4333-8333-333333333333";
const REEL_SCRIPT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const operatorUser = {
  id: OPERATOR_ID,
  email: "operator@example.com",
  displayName: "Operator",
  preferredLocale: "en" as const,
  role: "operator" as const,
  active: true,
};

const baseInput = {
  assembledReelId: ASSEMBLED_REEL_ID,
  views: 1250,
  likes: 89,
  comments: 12,
  saves: 34,
  dms: 5,
};

const recentPublishedAt = new Date().toISOString();

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => Promise<T>): Promise<T> {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return run().finally(() => {
    nodeModule._load = originalLoad;
  });
}

function readSrc(relativeFromLib: string): string {
  return readFileSync(path.join(__dirname, relativeFromLib), "utf8");
}

function clearMetricsCaches() {
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes("/lib/metrics/") ||
      key.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

type MetricsMockOptions = {
  requireOperator?: () => Promise<typeof operatorUser>;
  assembledReel?: {
    id: string;
    clientId: string;
    reelScriptId: string;
  } | null;
  publishedSlots?: Array<{ published_at: string }>;
  rateLimited?: boolean;
  existingMetrics?: Record<string, unknown> | null;
  upsertCalls?: Array<Record<string, unknown>>;
  onUpsert?: (patch: Record<string, unknown>) => void;
};

function installMetricsMocks(options: MetricsMockOptions = {}): () => void {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  const upsertCalls = options.upsertCalls ?? [];
  let storedMetrics = options.existingMetrics ?? null;

  nodeModule._load = function (request, parent, isMain) {
    if (request === "@/lib/auth/require-user.ts" || request.endsWith("/auth/require-user")) {
      return {
        requireOperator:
          options.requireOperator ??
          (async () => operatorUser),
        requireActive: async () => operatorUser,
        isAuthGuardError: (error: unknown) =>
          error instanceof Error && error.name === "AuthGuardError",
        AuthGuardError: class AuthGuardError extends Error {
          status: 401 | 403;
          envelope: unknown;
          constructor(status: 401 | 403, envelope: unknown) {
            super("auth");
            this.name = "AuthGuardError";
            this.status = status;
            this.envelope = envelope;
          }
        },
      };
    }

    if (request.includes("check-reel-metrics-upsert-rate-limit")) {
      return {
        checkReelMetricsUpsertRateLimit: async () =>
          options.rateLimited ? { ok: false, code: "RATE_LIMITED" } : { ok: true },
        recordReelMetricsUpsertAttempt: async () => {},
      };
    }

    if (request === "@/lib/supabase/server.ts" || request.endsWith("/supabase/server")) {
      const assembledReel =
        options.assembledReel === undefined
          ? {
              id: ASSEMBLED_REEL_ID,
              clientId: CLIENT_A,
              reelScriptId: REEL_SCRIPT_ID,
            }
          : options.assembledReel;

      const publishedSlots =
        options.publishedSlots === undefined
          ? [{ published_at: recentPublishedAt }]
          : options.publishedSlots;

      return {
        isSupabaseConfigured: () => true,
        createServerSupabaseClient: () => ({
          from: (table: string) => {
            if (table === "neuramark_assembled_reels") {
              return {
                select: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: assembledReel
                        ? {
                            id: assembledReel.id,
                            client_id: assembledReel.clientId,
                            reel_script_id: assembledReel.reelScriptId,
                          }
                        : null,
                      error: null,
                    }),
                  }),
                }),
              };
            }

            if (table === "neuramark_content_calendar_slots") {
              return {
                select: () => ({
                  eq: () => ({
                    eq: () => ({
                      not: () =>
                        Promise.resolve({
                          data: publishedSlots,
                          error: null,
                        }),
                    }),
                  }),
                }),
              };
            }

            if (table === "neuramark_reel_metrics") {
              return {
                upsert: (patch: Record<string, unknown>) => ({
                  select: () => ({
                    maybeSingle: async () => {
                      upsertCalls.push(patch);
                      options.onUpsert?.(patch);
                      storedMetrics = {
                        assembled_reel_id: patch.assembled_reel_id,
                        views: patch.views,
                        likes: patch.likes,
                        comments: patch.comments,
                        saves: patch.saves,
                        dms: patch.dms,
                        recorded_at: patch.recorded_at,
                      };
                      return { data: storedMetrics, error: null };
                    },
                  }),
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

    return originalLoad.call(this, request, parent, isMain);
  };

  clearMetricsCaches();

  return () => {
    nodeModule._load = originalLoad;
    clearMetricsCaches();
  };
}

describe("reel metrics contracts", () => {
  it("rejects forbidden authority keys", () => {
    assert.deepEqual(
      findForbiddenReelMetricsKeys({
        ...baseInput,
        client_id: CLIENT_A,
      }),
      ["client_id"],
    );
    assert.deepEqual(
      findForbiddenReelMetricsKeys({
        ...baseInput,
        publish_status: "published",
      }),
      ["publish_status"],
    );
    assert.deepEqual(
      findForbiddenReelMetricsKeys({
        ...baseInput,
        slotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
      ["slotId"],
    );
  });

  it("coalesces blank counter inputs to zero", () => {
    const parsed = upsertReelMetricsInputSchema.safeParse({
      ...baseInput,
      views: "",
      comments: null,
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.views, 0);
      assert.equal(parsed.data.comments, 0);
    }
  });

  it("rejects negative, float, and over-max counters", () => {
    assert.equal(
      upsertReelMetricsInputSchema.safeParse({ ...baseInput, views: -1 }).success,
      false,
    );
    assert.equal(
      upsertReelMetricsInputSchema.safeParse({ ...baseInput, likes: 1.5 }).success,
      false,
    );
    assert.equal(
      upsertReelMetricsInputSchema.safeParse({
        ...baseInput,
        saves: REEL_METRICS_MAX_VALUE + 1,
      }).success,
      false,
    );
  });
});

describe("edit window helpers", () => {
  it("computes editable within 7-day window from published_at", () => {
    const publishedAt = new Date("2026-08-30T12:00:00.000Z");
    const within = new Date("2026-08-31T12:00:00.000Z");
    const expired = new Date("2026-09-08T12:00:01.000Z");

    assert.equal(
      isWithinReelMetricsEditWindow({
        latestPublishedAt: publishedAt,
        now: within,
      }),
      true,
    );
    assert.equal(
      isWithinReelMetricsEditWindow({
        latestPublishedAt: publishedAt,
        now: expired,
      }),
      false,
    );
    assert.equal(
      computeReelMetricsEditable({
        latestPublishedAt: publishedAt,
        now: within,
      }),
      true,
    );
    assert.equal(
      computeReelMetricsEditable({
        latestPublishedAt: null,
        now: within,
      }),
      false,
    );
  });
});

describe("upsertReelMetrics action", () => {
  it("Cliente session → FORBIDDEN with no UPSERT", async () => {
    const upsertCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks({
        requireOperator: async () => {
          const { AuthGuardError } = require("@/lib/auth/require-user.ts");
          throw new AuthGuardError(403, {
            ok: false,
            error: { code: "FORBIDDEN" },
          });
        },
        upsertCalls,
      });

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics(baseInput);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN");
        }
        assert.equal(upsertCalls.length, 0);
      } finally {
        restore();
      }
    });
  });

  it("Operator happy path persists counters", async () => {
    const upsertCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks({ upsertCalls });

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics(baseInput);
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.metrics.views, 1250);
          assert.equal(result.metrics.likes, 89);
          assert.equal(result.metrics.editable, true);
          assert.equal(typeof result.metrics.recordedAt, "string");
        }
        assert.equal(upsertCalls.length, 1);
        assert.equal(upsertCalls[0]?.client_id, CLIENT_A);
      } finally {
        restore();
      }
    });
  });

  it("Operator cross-tenant write succeeds when published slot exists", async () => {
    const upsertCalls: Array<Record<string, unknown>> = [];

    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks({
        assembledReel: {
          id: ASSEMBLED_REEL_ID,
          clientId: CLIENT_B,
          reelScriptId: REEL_SCRIPT_ID,
        },
        upsertCalls,
      });

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics(baseInput);
        assert.equal(result.ok, true);
        assert.equal(upsertCalls[0]?.client_id, CLIENT_B);
      } finally {
        restore();
      }
    });
  });

  it("missing assembled reel → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks({ assembledReel: null });

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics(baseInput);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
          assert.equal(result.error.messageKey, REEL_METRICS_MESSAGE_KEYS.notFound);
        }
      } finally {
        restore();
      }
    });
  });

  it("non-published reel → NOT_PUBLISHED", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks({ publishedSlots: [] });

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics(baseInput);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_PUBLISHED");
        }
      } finally {
        restore();
      }
    });
  });

  it("expired edit window → EDIT_WINDOW_EXPIRED without UPSERT", async () => {
    const upsertCalls: Array<Record<string, unknown>> = [];
    const oldPublishedAt = new Date("2020-01-01T12:00:00.000Z").toISOString();

    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks({
        publishedSlots: [{ published_at: oldPublishedAt }],
        upsertCalls,
      });

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics(baseInput);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "EDIT_WINDOW_EXPIRED");
        }
        assert.equal(upsertCalls.length, 0);
      } finally {
        restore();
      }
    });
  });

  it("forbidden client_id → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks();

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics({
          ...baseInput,
          client_id: CLIENT_A,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        }
      } finally {
        restore();
      }
    });
  });

  it("rate limit exceeded → RATE_LIMITED", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks({ rateLimited: true });

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics(baseInput);
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "RATE_LIMITED");
        }
      } finally {
        restore();
      }
    });
  });

  it("validation error on non-numeric string counter", async () => {
    await withServerOnlyStub(async () => {
      const restore = installMetricsMocks();

      try {
        const { upsertReelMetrics } = require("./actions/upsert-reel-metrics.ts");
        const result = await upsertReelMetrics({
          ...baseInput,
          views: "abc",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "VALIDATION_ERROR");
          assert.ok(result.error.fields?.views);
        }
      } finally {
        restore();
      }
    });
  });
});

describe("US-13.1 security grep guards", () => {
  it("calendar read action has no metrics UPSERT", () => {
    const src = readSrc("../calendar/get-operator-calendar-for-week.ts");
    assert.equal(src.includes("loadReelMetricsByAssembledReelIds"), true);
    assert.equal(src.includes(".upsert("), false);
  });

  it("metrics modules do not import Graph/integrations", () => {
    const files = [
      "upsert-reel-metrics.ts",
      "actions/upsert-reel-metrics.ts",
      "load-reel-metrics.ts",
      "load-published-slot-for-reel.ts",
    ];
    for (const file of files) {
      const src = readSrc(file);
      assert.equal(src.includes("instagram"), false, file);
      assert.equal(src.includes("/integrations/"), false, file);
    }
  });

  it("upsert action calls requireOperator before side effects", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/metrics/actions/upsert-reel-metrics.ts"),
      "utf8",
    );
    const fnStart = src.indexOf("export async function upsertReelMetrics");
    assert.ok(fnStart >= 0);
    const requireIdx = src.indexOf("requireOperator", fnStart);
    const forbiddenIdx = src.indexOf("findForbiddenReelMetricsKeys", fnStart);
    const coreIdx = src.indexOf("upsertReelMetricsCore", fnStart);
    assert.ok(requireIdx >= 0 && forbiddenIdx > requireIdx && coreIdx > forbiddenIdx);
  });
});
