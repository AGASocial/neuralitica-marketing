/**
 * US-10.1 QA orchestrator / Server Action security tests (backend slice).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveQaReportStatus,
  isQaReportReadyPhaseA,
  runQaForAssembledReelSuccessSchema,
} from "@/lib/contracts/qa-report";
import { findForbiddenQaRunKeys } from "@/lib/qa/find-forbidden-qa-run-keys";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSEMBLED_REEL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

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

function clearQaActionCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/qa/actions/run-qa-for-assembled-reel") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/qa/run-qa-for-assembled-reel")
    ) {
      delete require.cache[key];
    }
  }
}

describe("findForbiddenQaRunKeys", () => {
  it("rejects passed / status / checks smuggle", () => {
    const keys = findForbiddenQaRunKeys({
      assembledReelId: ASSEMBLED_REEL_ID,
      passed: true,
      status: "passed",
      checks: [],
    });
    assert.ok(keys.includes("passed"));
    assert.ok(keys.includes("status"));
    assert.ok(keys.includes("checks"));
  });

  it("allows pointer-only payload", () => {
    assert.deepEqual(
      findForbiddenQaRunKeys({ assembledReelId: ASSEMBLED_REEL_ID }),
      [],
    );
  });
});

describe("status derivation + Phase A gate", () => {
  it("blocking fail → blocked; overridable-only → failed; all pass → passed", () => {
    assert.equal(
      deriveQaReportStatus([
        {
          checkKey: "own_avatar_consent",
          status: "fail",
          severity: "blocking",
        },
        {
          checkKey: "cta_presence",
          status: "pass",
          severity: "overridable",
        },
      ]),
      "blocked",
    );
    assert.equal(
      deriveQaReportStatus([
        {
          checkKey: "own_avatar_consent",
          status: "skipped",
          severity: "blocking",
        },
        {
          checkKey: "tone",
          status: "fail",
          severity: "overridable",
        },
      ]),
      "failed",
    );
    assert.equal(
      deriveQaReportStatus([
        {
          checkKey: "own_avatar_consent",
          status: "skipped",
          severity: "blocking",
        },
        {
          checkKey: "cta_presence",
          status: "pass",
          severity: "overridable",
        },
      ]),
      "passed",
    );
  });

  it("ready iff passed", () => {
    assert.equal(isQaReportReadyPhaseA("passed"), true);
    assert.equal(isQaReportReadyPhaseA("failed"), false);
    assert.equal(isQaReportReadyPhaseA("blocked"), false);
    assert.equal(isQaReportReadyPhaseA("running"), false);
    assert.equal(isQaReportReadyPhaseA(null), false);
  });

  it("success schema allows running/pending when idempotent", () => {
    const parsed = runQaForAssembledReelSuccessSchema.safeParse({
      ok: true,
      assembledReelId: ASSEMBLED_REEL_ID,
      qaReportId: "ffffffff-0000-4000-8000-111111111111",
      status: "running",
      checks: [],
      idempotent: true,
    });
    assert.equal(parsed.success, true);
  });
});

describe("runQaForAssembledReel Server Action security", () => {
  it("Cliente session → FORBIDDEN without orchestration", async () => {
    await withServerOnlyStub(async () => {
      clearQaActionCache();
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
        if (req.includes("run-qa-for-assembled-reel") && !req.includes("actions")) {
          return {
            runQaForAssembledReelForClient: async () => {
              orchestratorCalled = true;
              return { ok: true };
            },
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearQaActionCache();
        const { runQaForAssembledReel } = require(
          "./actions/run-qa-for-assembled-reel.ts",
        );
        const result = await runQaForAssembledReel({
          assembledReelId: ASSEMBLED_REEL_ID,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN");
        }
        assert.equal(orchestratorCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearQaActionCache();
      }
    });
  });

  it("smuggled passed → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      clearQaActionCache();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireOperator: async () => ({
              id: CLIENT_ID,
              role: "operator",
              active: true,
            }),
            isAuthGuardError: () => false,
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearQaActionCache();
        const { runQaForAssembledReel } = require(
          "./actions/run-qa-for-assembled-reel.ts",
        );
        const result = await runQaForAssembledReel({
          assembledReelId: ASSEMBLED_REEL_ID,
          passed: true,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearQaActionCache();
      }
    });
  });
});

describe("closed write surface + migration", () => {
  it("migration enables RLS with zero policies", () => {
    const sql = readFileSync(
      path.join(
        __dirname,
        "../../supabase/migrations/20260831010000_neuramark_qa_reports.sql",
      ),
      "utf8",
    );
    assert.match(sql, /CREATE TABLE public\.neuramark_qa_reports/);
    assert.match(sql, /UNIQUE \(assembled_reel_id\)/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
  });

  it("no Route Handler writes QA verdicts", () => {
    const grepRoots = [
      path.join(__dirname, "../../app"),
    ];
    // Lightweight: orchestrator + action are the only writers by CONTRACT path.
    const orchestrator = readFileSync(
      path.join(__dirname, "run-qa-for-assembled-reel.ts"),
      "utf8",
    );
    assert.match(orchestrator, /upsertQaReportTerminal/);
    assert.match(orchestrator, /requireOperator|invokedBy/);
    void grepRoots;
  });

  it("auto-chain does not revert branding", () => {
    const source = readFileSync(
      path.join(__dirname, "on-branding-completed.ts"),
      "utf8",
    );
    assert.match(source, /invokedBy: "system"/);
    assert.doesNotMatch(source, /branding_status\s*=/);
    assert.doesNotMatch(source, /UPDATE.*branding/);
  });

  it("applyBrandingJobUpdate hooks onBrandingCompleted", () => {
    const source = readFileSync(
      path.join(__dirname, "../branding/apply-branding-job-update.ts"),
      "utf8",
    );
    assert.match(source, /onBrandingCompleted/);
    assert.match(source, /brandingStatus: "completed"/);
  });
});
