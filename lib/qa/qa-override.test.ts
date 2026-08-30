/**
 * US-10.2 QA override / gate / Server Action security tests (backend slice).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  computeQaGateReady,
  computeUncoveredFailedOverridableKeys,
  isQaReportReadyWithOverrides,
  overrideQaCheckInputSchema,
} from "@/lib/contracts/qa-override";
import { isBlockingCheckKey, isOverridableCheckKey } from "@/lib/qa/check-catalog";
import { findForbiddenQaOverrideKeys } from "@/lib/qa/find-forbidden-qa-override-keys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const QA_REPORT_ID = "ffffffff-0000-4000-8000-333333333333";
const ASSEMBLED_REEL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OPERATOR = {
  id: CLIENT_ID,
  email: "op@example.com",
  displayName: "Gabriel Vega",
  preferredLocale: "en" as const,
  role: "operator" as const,
  active: true,
};

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
    return originalLoad(request, parent, isMain);
  };
  return (async () => {
    try {
      return await run();
    } finally {
      nodeModule._load = originalLoad;
    }
  })();
}

function clearOverrideCaches() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/qa/actions/override-qa-check") ||
      normalized.includes("/lib/qa/override-qa-check") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/qa/persist-qa") ||
      normalized.includes("/lib/qa/check-qa-override-rate-limit") ||
      normalized.includes("/lib/qa/find-forbidden-qa-override") ||
      normalized.includes("/lib/qa/override-errors")
    ) {
      delete require.cache[key];
    }
  }
}

describe("findForbiddenQaOverrideKeys", () => {
  it("rejects overrideAll / passed / status / severity / clientId", () => {
    const keys = findForbiddenQaOverrideKeys({
      qaReportId: QA_REPORT_ID,
      checkKey: "tone",
      reason: "ok",
      overrideAll: true,
      passed: true,
      status: "passed",
      severity: "overridable",
      clientId: CLIENT_ID,
    });
    assert.ok(keys.includes("overrideAll"));
    assert.ok(keys.includes("passed"));
    assert.ok(keys.includes("status"));
    assert.ok(keys.includes("severity"));
    assert.ok(keys.includes("clientId"));
  });

  it("allows pointer-only payload", () => {
    assert.deepEqual(
      findForbiddenQaOverrideKeys({
        qaReportId: QA_REPORT_ID,
        checkKey: "tone",
        reason: "Client-approved soft claim.",
      }),
      [],
    );
  });
});

describe("override reason + input schema", () => {
  it("rejects empty / whitespace reason", () => {
    const empty = overrideQaCheckInputSchema.safeParse({
      qaReportId: QA_REPORT_ID,
      checkKey: "tone",
      reason: "   ",
    });
    assert.equal(empty.success, false);

    const blank = overrideQaCheckInputSchema.safeParse({
      qaReportId: QA_REPORT_ID,
      checkKey: "tone",
      reason: "",
    });
    assert.equal(blank.success, false);
  });

  it("trims and accepts 1–500 reason", () => {
    const parsed = overrideQaCheckInputSchema.safeParse({
      qaReportId: QA_REPORT_ID,
      checkKey: "tone",
      reason: "  ok  ",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.reason, "ok");
    }
  });
});

describe("catalog blocking / overridable authority", () => {
  it("own_avatar_consent and generic_avatar_not_owner are blocking", () => {
    assert.equal(isBlockingCheckKey("own_avatar_consent"), true);
    assert.equal(isBlockingCheckKey("generic_avatar_not_owner"), true);
    assert.equal(isOverridableCheckKey("own_avatar_consent"), false);
  });

  it("tone is overridable", () => {
    assert.equal(isOverridableCheckKey("tone"), true);
    assert.equal(isBlockingCheckKey("tone"), false);
  });
});

describe("computeQaGateReady / override coverage", () => {
  const toneFail = {
    checkKey: "tone" as const,
    status: "fail" as const,
    severity: "overridable" as const,
  };
  const claimsFail = {
    checkKey: "dangerous_claims" as const,
    status: "fail" as const,
    severity: "overridable" as const,
  };
  const consentFail = {
    checkKey: "own_avatar_consent" as const,
    status: "fail" as const,
    severity: "blocking" as const,
  };

  it("ready after full overridable coverage on failed", () => {
    assert.equal(
      computeQaGateReady({
        status: "failed",
        checks: [toneFail],
        overriddenCheckKeys: ["tone"],
        hasBlockingFailures: false,
      }),
      true,
    );
    assert.equal(
      isQaReportReadyWithOverrides({
        status: "failed",
        checks: [toneFail],
        overriddenCheckKeys: ["tone"],
        hasBlockingFailures: false,
      }),
      true,
    );
    assert.deepEqual(
      computeUncoveredFailedOverridableKeys({
        checks: [toneFail],
        overriddenCheckKeys: ["tone"],
      }),
      [],
    );
  });

  it("not ready if one overridable uncovered", () => {
    assert.equal(
      computeQaGateReady({
        status: "failed",
        checks: [toneFail, claimsFail],
        overriddenCheckKeys: ["tone"],
        hasBlockingFailures: false,
      }),
      false,
    );
    assert.deepEqual(
      computeUncoveredFailedOverridableKeys({
        checks: [toneFail, claimsFail],
        overriddenCheckKeys: ["tone"],
      }),
      ["dangerous_claims"],
    );
  });

  it("blocked never ready via overrides", () => {
    assert.equal(
      computeQaGateReady({
        status: "blocked",
        checks: [consentFail, toneFail],
        overriddenCheckKeys: ["tone"],
        hasBlockingFailures: true,
      }),
      false,
    );
  });

  it("passed is ready without overrides", () => {
    assert.equal(
      computeQaGateReady({
        status: "passed",
        checks: [],
        overriddenCheckKeys: [],
        hasBlockingFailures: false,
      }),
      true,
    );
  });
});

describe("overrideQaCheck Server Action security", () => {
  it("Cliente session → FORBIDDEN without INSERT", async () => {
    await withServerOnlyStub(async () => {
      clearOverrideCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let orchestratorCalled = false;
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
        if (req.includes("override-qa-check") && !req.includes("actions")) {
          return {
            overrideQaCheckForClient: async () => {
              orchestratorCalled = true;
              return { ok: true };
            },
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearOverrideCaches();
        const { overrideQaCheck } = require("./actions/override-qa-check.ts");
        const result = await overrideQaCheck({
          qaReportId: QA_REPORT_ID,
          checkKey: "tone",
          reason: "should not insert",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN");
        }
        assert.equal(orchestratorCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearOverrideCaches();
      }
    });
  });

  it("smuggled overrideAll → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      clearOverrideCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => OPERATOR,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-qa-override-rate-limit")) {
          return {
            checkQaOverrideRateLimit: async () => ({ ok: true }),
            recordQaOverrideAttempt: async () => {},
          };
        }
        if (req.includes("persist-qa-report")) {
          return {
            loadQaReportById: async () => ({
              id: QA_REPORT_ID,
              clientId: CLIENT_ID,
              assembledReelId: ASSEMBLED_REEL_ID,
              checks: [
                {
                  checkKey: "tone",
                  status: "fail",
                  severity: "overridable",
                },
              ],
              status: "failed",
              createdAt: "2026-08-30T17:00:00.000Z",
              updatedAt: "2026-08-30T17:05:00.000Z",
            }),
            toOperatorQaReportDetailDto: () => ({}),
          };
        }
        if (req.includes("persist-qa-override")) {
          return {
            insertQaOverride: async () => {
              insertCalled = true;
              return null;
            },
            loadQaOverridesForReport: async () => [],
            toOperatorQaOverrideDtos: async () => [],
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearOverrideCaches();
        const { overrideQaCheck } = require("./actions/override-qa-check.ts");
        const result = await overrideQaCheck({
          qaReportId: QA_REPORT_ID,
          checkKey: "tone",
          reason: "x",
          overrideAll: true,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
          assert.ok(result.error.fields?.overrideAll);
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearOverrideCaches();
      }
    });
  });

  it("blocking checkKey → CHECK_BLOCKING, no INSERT", async () => {
    await withServerOnlyStub(async () => {
      clearOverrideCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => OPERATOR,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-qa-override-rate-limit")) {
          return {
            checkQaOverrideRateLimit: async () => ({ ok: true }),
            recordQaOverrideAttempt: async () => {},
          };
        }
        if (req.includes("persist-qa-report")) {
          return {
            loadQaReportById: async () => ({
              id: QA_REPORT_ID,
              clientId: CLIENT_ID,
              assembledReelId: ASSEMBLED_REEL_ID,
              checks: [
                {
                  checkKey: "own_avatar_consent",
                  status: "fail",
                  severity: "blocking",
                },
              ],
              status: "blocked",
              createdAt: "2026-08-30T17:00:00.000Z",
              updatedAt: "2026-08-30T17:05:00.000Z",
            }),
            toOperatorQaReportDetailDto: (row: { status: string }) => ({
              status: row.status,
            }),
          };
        }
        if (req.includes("persist-qa-override")) {
          return {
            insertQaOverride: async () => {
              insertCalled = true;
              return null;
            },
            loadQaOverridesForReport: async () => [],
            toOperatorQaOverrideDtos: async () => [],
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearOverrideCaches();
        const { overrideQaCheck } = require("./actions/override-qa-check.ts");
        const result = await overrideQaCheck({
          qaReportId: QA_REPORT_ID,
          checkKey: "own_avatar_consent",
          reason: "urgent likeness exception",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "CHECK_BLOCKING");
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearOverrideCaches();
      }
    });
  });

  it("foreign qaReportId → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      clearOverrideCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => OPERATOR,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-qa-override-rate-limit")) {
          return {
            checkQaOverrideRateLimit: async () => ({ ok: true }),
            recordQaOverrideAttempt: async () => {},
          };
        }
        if (req.includes("persist-qa-report")) {
          return {
            loadQaReportById: async () => null,
            toOperatorQaReportDetailDto: () => ({}),
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearOverrideCaches();
        const { overrideQaCheck } = require("./actions/override-qa-check.ts");
        const result = await overrideQaCheck({
          qaReportId: QA_REPORT_ID,
          checkKey: "tone",
          reason: "foreign",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearOverrideCaches();
      }
    });
  });

  it("pass / skipped target → CHECK_NOT_FAILED", async () => {
    await withServerOnlyStub(async () => {
      clearOverrideCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => OPERATOR,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-qa-override-rate-limit")) {
          return {
            checkQaOverrideRateLimit: async () => ({ ok: true }),
            recordQaOverrideAttempt: async () => {},
          };
        }
        if (req.includes("persist-qa-report")) {
          return {
            loadQaReportById: async () => ({
              id: QA_REPORT_ID,
              clientId: CLIENT_ID,
              assembledReelId: ASSEMBLED_REEL_ID,
              checks: [
                {
                  checkKey: "tone",
                  status: "pass",
                  severity: "overridable",
                },
              ],
              status: "passed",
              createdAt: "2026-08-30T17:00:00.000Z",
              updatedAt: "2026-08-30T17:05:00.000Z",
            }),
            toOperatorQaReportDetailDto: () => ({}),
          };
        }
        if (req.includes("persist-qa-override")) {
          return {
            insertQaOverride: async () => {
              insertCalled = true;
              return null;
            },
            loadQaOverridesForReport: async () => [],
            toOperatorQaOverrideDtos: async () => [],
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearOverrideCaches();
        const { overrideQaCheck } = require("./actions/override-qa-check.ts");
        const result = await overrideQaCheck({
          qaReportId: QA_REPORT_ID,
          checkKey: "tone",
          reason: "already pass",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "CHECK_NOT_FAILED");
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearOverrideCaches();
      }
    });
  });

  it("successful override keeps report status failed", async () => {
    await withServerOnlyStub(async () => {
      clearOverrideCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      const reportRow = {
        id: QA_REPORT_ID,
        clientId: CLIENT_ID,
        assembledReelId: ASSEMBLED_REEL_ID,
        checks: [
          {
            checkKey: "tone" as const,
            status: "fail" as const,
            severity: "overridable" as const,
          },
        ],
        status: "failed" as const,
        createdAt: "2026-08-30T17:00:00.000Z",
        updatedAt: "2026-08-30T17:05:00.000Z",
      };
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => OPERATOR,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-qa-override-rate-limit")) {
          return {
            checkQaOverrideRateLimit: async () => ({ ok: true }),
            recordQaOverrideAttempt: async () => {},
          };
        }
        if (req.includes("persist-qa-report")) {
          return {
            loadQaReportById: async () => reportRow,
            toOperatorQaReportDetailDto: (
              row: typeof reportRow,
              overrides: unknown[],
            ) => ({
              qaReportId: row.id,
              assembledReelId: row.assembledReelId,
              status: row.status,
              checks: row.checks,
              overrides,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }),
          };
        }
        if (req.includes("persist-qa-override")) {
          return {
            insertQaOverride: async () => ({
              id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
              clientId: CLIENT_ID,
              qaReportId: QA_REPORT_ID,
              assembledReelId: ASSEMBLED_REEL_ID,
              checkKey: "tone",
              reason: "Client-approved soft claim; tone acceptable.",
              operatorClientId: CLIENT_ID,
              createdAt: "2026-08-30T18:00:00.000Z",
            }),
            loadQaOverridesForReport: async () => [
              {
                id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
                clientId: CLIENT_ID,
                qaReportId: QA_REPORT_ID,
                assembledReelId: ASSEMBLED_REEL_ID,
                checkKey: "tone",
                reason: "Client-approved soft claim; tone acceptable.",
                operatorClientId: CLIENT_ID,
                createdAt: "2026-08-30T18:00:00.000Z",
              },
            ],
            toOperatorQaOverrideDtos: async (rows: { id: string }[]) =>
              rows.map((r) => ({
                overrideId: r.id,
                checkKey: "tone",
                reason: "Client-approved soft claim; tone acceptable.",
                createdAt: "2026-08-30T18:00:00.000Z",
                operatorDisplayName: "Gabriel Vega",
              })),
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearOverrideCaches();
        const { overrideQaCheck } = require("./actions/override-qa-check.ts");
        const result = await overrideQaCheck({
          qaReportId: QA_REPORT_ID,
          checkKey: "tone",
          reason: "Client-approved soft claim; tone acceptable.",
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.status, "failed");
          assert.equal(result.report.status, "failed");
          assert.equal(result.overrides.length, 1);
          assert.equal(result.checkKey, "tone");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearOverrideCaches();
      }
    });
  });

  it("rate limit over-limit → RATE_LIMITED, no INSERT", async () => {
    await withServerOnlyStub(async () => {
      clearOverrideCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => OPERATOR,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-qa-override-rate-limit")) {
          return {
            checkQaOverrideRateLimit: async () => ({
              ok: false,
              code: "RATE_LIMITED",
            }),
            recordQaOverrideAttempt: async () => {},
          };
        }
        if (req.includes("persist-qa-override")) {
          return {
            insertQaOverride: async () => {
              insertCalled = true;
              return null;
            },
            loadQaOverridesForReport: async () => [],
            toOperatorQaOverrideDtos: async () => [],
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearOverrideCaches();
        const { overrideQaCheck } = require("./actions/override-qa-check.ts");
        const result = await overrideQaCheck({
          qaReportId: QA_REPORT_ID,
          checkKey: "tone",
          reason: "spam",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "RATE_LIMITED");
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearOverrideCaches();
      }
    });
  });

  it("requireOperator is first await in action source", () => {
    const source = readFileSync(
      path.join(__dirname, "actions/override-qa-check.ts"),
      "utf8",
    );
    const bodyStart = source.indexOf("export async function overrideQaCheck");
    assert.ok(bodyStart >= 0);
    const after = source.slice(bodyStart);
    const firstAwait = after.indexOf("await ");
    assert.ok(firstAwait >= 0);
    const snippet = after.slice(firstAwait, firstAwait + 80);
    assert.match(snippet, /await requireOperator\("handler"\)/);
  });
});

describe("closed write surface + migration", () => {
  it("migration enables RLS with zero policies", () => {
    const sql = readFileSync(
      path.join(
        __dirname,
        "../../supabase/migrations/20260831020000_neuramark_qa_overrides.sql",
      ),
      "utf8",
    );
    assert.match(sql, /CREATE TABLE public\.neuramark_qa_overrides/);
    assert.match(sql, /operator_client_id/);
    assert.match(sql, /ON DELETE CASCADE/);
    assert.match(sql, /char_length\(reason\) >= 1/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
  });

  it("no UPDATE/DELETE Server Action or Route Handler for overrides", () => {
    const orchestrator = readFileSync(
      path.join(__dirname, "override-qa-check.ts"),
      "utf8",
    );
    assert.match(orchestrator, /insertQaOverride/);
    assert.doesNotMatch(orchestrator, /\.update\(/);
    assert.doesNotMatch(orchestrator, /\.delete\(/);
    assert.doesNotMatch(orchestrator, /status:\s*["']passed["']/);

    const action = readFileSync(
      path.join(__dirname, "actions/override-qa-check.ts"),
      "utf8",
    );
    assert.doesNotMatch(action, /\.update\(/);
    assert.doesNotMatch(action, /\.delete\(/);

    const appDir = path.join(__dirname, "../../app");
    const walk = (dir: string): string[] => {
      const entries = readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...walk(full));
        } else if (entry.name === "route.ts") {
          files.push(full);
        }
      }
      return files;
    };
    for (const routeFile of walk(appDir)) {
      const src = readFileSync(routeFile, "utf8");
      assert.doesNotMatch(src, /neuramark_qa_overrides/);
      assert.doesNotMatch(src, /overrideQaCheck/);
    }
  });

  it("gate helper no longer uses Phase A-only readiness", () => {
    const source = readFileSync(
      path.join(__dirname, "get-qa-gate-status-for-assembled-reel.ts"),
      "utf8",
    );
    assert.match(source, /computeQaGateReady/);
    assert.match(source, /loadQaOverridesForReport/);
    assert.doesNotMatch(source, /isQaReportReadyPhaseA/);
  });

  it("orchestrator imports catalog — does not fork severity map", () => {
    const source = readFileSync(
      path.join(__dirname, "override-qa-check.ts"),
      "utf8",
    );
    assert.match(source, /from "@\/lib\/qa\/check-catalog"/);
    assert.match(source, /isBlockingCheckKey/);
    assert.match(source, /isOverridableCheckKey/);
    assert.doesNotMatch(source, /QA_CHECK_SEVERITY_BY_KEY\s*=/);
  });
});
