/**
 * US-11.1 Cliente Aprobación — backend/DB security + orchestrator tests.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  decideApprovalInputSchema,
  ensureApprovalPackageInputSchema,
} from "@/lib/contracts/approval";
import { findForbiddenApprovalKeys } from "@/lib/approvals/find-forbidden-approval-keys";
import { truncateCaptionPreview } from "@/lib/approvals/caption-preview";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const APPROVAL_ID = "11111111-2222-4333-8444-555555555555";
const ASSEMBLED_REEL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const FOREIGN_ID = "99999999-9999-4999-8999-999999999999";
const OUTPUT_ASSET_ID = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
const COVER_ASSET_ID = "88888888-aaaa-4bbb-8ccc-dddddddddddd";
const SCRIPT_ID = "cccccccc-dddd-4eee-8fff-000000000001";

const CLIENT = {
  id: CLIENT_ID,
  email: "gaveho@gmail.com",
  displayName: "Gabriel Vega",
  preferredLocale: "en" as const,
  role: "client" as const,
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

function clearApprovalCaches() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/approvals/") ||
      normalized.includes("/lib/auth/require-user") ||
      normalized.includes("/lib/qa/get-qa-gate-status") ||
      normalized.includes("/lib/assembly/load-assembly") ||
      normalized.includes("/lib/reel-captions/persist-reel-caption")
    ) {
      delete require.cache[key];
    }
  }
}

const readyAssembly = {
  id: ASSEMBLED_REEL_ID,
  clientId: CLIENT_ID,
  reelScriptId: SCRIPT_ID,
  status: "completed" as const,
  brandingStatus: "completed" as const,
  outputMediaAssetId: OUTPUT_ASSET_ID,
  coverMediaAssetId: COVER_ASSET_ID,
  templateId: "reel_v1_basic",
  primaryVideoAssetId: OUTPUT_ASSET_ID,
  voiceoverAssetId: null,
  scriptUpdatedAt: "2026-08-30T17:00:00.000Z",
  inputFingerprint: "fp",
  targetDurationSec: 30,
  actualDurationSec: 30,
  failureReason: null,
  brandingConfig: null,
  brandingFingerprint: null,
  preBrandingOutputMediaAssetId: null,
  createdAt: "2026-08-30T17:00:00.000Z",
  updatedAt: "2026-08-30T18:00:00.000Z",
};

const readyCaption = {
  id: "cap-1",
  reelScriptId: SCRIPT_ID,
  clientId: CLIENT_ID,
  record: {
    caption: "This week we open early for locals who need a quick win.",
    hashtags: ["#localbiz", "#consult"],
    keywords: ["local"],
    ctaVariants: [
      "Book your free consult today.",
      "Call us this week.",
      "Stop by Saturday.",
    ],
  },
  selectedCtaIndex: 0,
  updatedAt: "2026-08-30T18:00:00.000Z",
};

const pendingApproval = {
  id: APPROVAL_ID,
  clientId: CLIENT_ID,
  assembledReelId: ASSEMBLED_REEL_ID,
  status: "pending_client" as const,
  clientFeedback: null,
  decidedAt: null,
  decidedBy: null,
  createdAt: "2026-08-30T19:00:00.000Z",
  updatedAt: "2026-08-30T19:00:00.000Z",
};

describe("findForbiddenApprovalKeys", () => {
  it("rejects qaPassed / ready / status / clientId / decidedBy on ensure", () => {
    const keys = findForbiddenApprovalKeys(
      {
        assembledReelId: ASSEMBLED_REEL_ID,
        qaPassed: true,
        ready: true,
        status: "approved",
        clientId: CLIENT_ID,
        decidedBy: CLIENT_ID,
        approvalId: APPROVAL_ID,
      },
      "ensure",
    );
    assert.ok(keys.includes("qaPassed"));
    assert.ok(keys.includes("ready"));
    assert.ok(keys.includes("status"));
    assert.ok(keys.includes("clientId"));
    assert.ok(keys.includes("decidedBy"));
    assert.ok(keys.includes("approvalId"));
  });

  it("rejects assembledReelId on decide", () => {
    const keys = findForbiddenApprovalKeys(
      {
        approvalId: APPROVAL_ID,
        decision: "approved",
        assembledReelId: ASSEMBLED_REEL_ID,
        ready: true,
      },
      "decide",
    );
    assert.ok(keys.includes("assembledReelId"));
    assert.ok(keys.includes("ready"));
  });

  it("allows pointer-only ensure / decide payloads", () => {
    assert.deepEqual(
      findForbiddenApprovalKeys(
        { assembledReelId: ASSEMBLED_REEL_ID },
        "ensure",
      ),
      [],
    );
    assert.deepEqual(
      findForbiddenApprovalKeys(
        {
          approvalId: APPROVAL_ID,
          decision: "rejected",
          clientFeedback: "too aggressive",
        },
        "decide",
      ),
      [],
    );
  });
});

describe("approval input schemas", () => {
  it("rejects decision changes_requested", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "changes_requested",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects feedback > 500", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "rejected",
      clientFeedback: "x".repeat(501),
    });
    assert.equal(parsed.success, false);
  });

  it("trims empty feedback to undefined", () => {
    const parsed = decideApprovalInputSchema.safeParse({
      approvalId: APPROVAL_ID,
      decision: "rejected",
      clientFeedback: "   ",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.clientFeedback, undefined);
    }
  });

  it("ensure accepts uuid only", () => {
    const ok = ensureApprovalPackageInputSchema.safeParse({
      assembledReelId: ASSEMBLED_REEL_ID,
    });
    assert.equal(ok.success, true);
    const bad = ensureApprovalPackageInputSchema.safeParse({
      assembledReelId: ASSEMBLED_REEL_ID,
      qaPassed: true,
    });
    assert.equal(bad.success, false);
  });
});

describe("truncateCaptionPreview", () => {
  it("always returns a string and truncates long bodies", () => {
    assert.equal(truncateCaptionPreview("short"), "short");
    const long = "a".repeat(200);
    const preview = truncateCaptionPreview(long);
    assert.ok(preview.length <= 120);
    assert.ok(preview.endsWith("…"));
  });
});

describe("migration neuramark_approvals", () => {
  it("defines UNIQUE assembled_reel, CHECK status, RLS zero policies", () => {
    const mig = path.join(
      repoRoot,
      "supabase/migrations/20260831030000_neuramark_approvals.sql",
    );
    assert.equal(existsSync(mig), true);
    const sql = readFileSync(mig, "utf8");
    assert.match(sql, /neuramark_approvals/);
    assert.match(sql, /neuramark_approvals_assembled_reel_id_uq/);
    assert.match(sql, /pending_client/);
    assert.match(sql, /changes_requested/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.doesNotMatch(sql, /CREATE POLICY/);
    assert.doesNotMatch(sql, /revision_count/);
  });
});

describe("media serve matrix source", () => {
  it("widens assembled_reel to requireActive + ownership; not generated_video", () => {
    const src = readFileSync(
      path.join(repoRoot, "app/api/media/assets/[assetId]/route.ts"),
      "utf8",
    );
    assert.match(src, /MEDIA_ASSET_TYPE_ASSEMBLED_REEL/);
    assert.match(src, /requireActive\("handler"\)/);
    assert.match(src, /US-11\.1/);
    // generated_video still operator-only block before assembled_reel widen
    const genIdx = src.indexOf("MEDIA_ASSET_TYPE_GENERATED_VIDEO");
    const voiceIdx = src.indexOf("MEDIA_ASSET_TYPE_VOICEOVER");
    const assembledIdx = src.indexOf(
      "MEDIA_ASSET_TYPE_ASSEMBLED_REEL) {\n    // US-11.1",
    );
    assert.ok(genIdx > 0 && voiceIdx > genIdx);
    assert.ok(assembledIdx > voiceIdx);
    assert.doesNotMatch(src, /public\/assembled/);
    assert.doesNotMatch(src, /getPublicUrl/);
  });
});

describe("ensureApprovalPackageForAssembledReel action", () => {
  it("requireActive failure → UNAUTHENTICATED, no insert", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => {
              const err = new Error("unauth") as Error & {
                status: number;
                envelope: unknown;
              };
              err.status = 401;
              err.envelope = { ok: false, error: { code: "UNAUTHENTICATED" } };
              throw err;
            },
            isAuthGuardError: (error: unknown) =>
              Boolean(
                error &&
                  typeof error === "object" &&
                  "status" in error &&
                  ((error as { status: number }).status === 401 ||
                    (error as { status: number }).status === 403),
              ),
          };
        }
        if (req.includes("persist-approval")) {
          return {
            insertPendingApproval: async () => {
              insertCalled = true;
              return null;
            },
            loadApprovalByAssembledReelScoped: async () => null,
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { ensureApprovalPackageForAssembledReel } = require(
          "./actions/ensure-approval-package.ts",
        );
        const result = await ensureApprovalPackageForAssembledReel({
          assembledReelId: ASSEMBLED_REEL_ID,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "UNAUTHENTICATED");
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("smuggled qaPassed → FORBIDDEN_FIELDS", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("persist-approval")) {
          return {
            insertPendingApproval: async () => {
              insertCalled = true;
              return null;
            },
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { ensureApprovalPackageForAssembledReel } = require(
          "./actions/ensure-approval-package.ts",
        );
        const result = await ensureApprovalPackageForAssembledReel({
          assembledReelId: ASSEMBLED_REEL_ID,
          qaPassed: true,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "FORBIDDEN_FIELDS");
          assert.ok(result.error.fields?.qaPassed);
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("ungated ensure → QA_GATE_NOT_READY, no insert", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("load-assembly-job")) {
          return {
            loadAssemblyJobScoped: async () => readyAssembly,
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: false,
              status: "failed",
              hasBlockingFailures: true,
              hasOverridableFailures: false,
              qaReportId: null,
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("persist-approval")) {
          return {
            insertPendingApproval: async () => {
              insertCalled = true;
              return null;
            },
            loadApprovalByAssembledReelScoped: async () => null,
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { ensureApprovalPackageForAssembledReel } = require(
          "./actions/ensure-approval-package.ts",
        );
        const result = await ensureApprovalPackageForAssembledReel({
          assembledReelId: ASSEMBLED_REEL_ID,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "QA_GATE_NOT_READY");
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("CTA null → CAPTION_CTA_NOT_SELECTED, no insert", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("load-assembly-job")) {
          return {
            loadAssemblyJobScoped: async () => readyAssembly,
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: true,
              status: "passed",
              hasBlockingFailures: false,
              hasOverridableFailures: false,
              qaReportId: "rep-1",
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("persist-reel-caption")) {
          return {
            getReelCaptionByScriptId: async () => ({
              ...readyCaption,
              selectedCtaIndex: null,
            }),
          };
        }
        if (req.includes("persist-approval")) {
          return {
            insertPendingApproval: async () => {
              insertCalled = true;
              return null;
            },
            loadApprovalByAssembledReelScoped: async () => null,
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { ensureApprovalPackageForAssembledReel } = require(
          "./actions/ensure-approval-package.ts",
        );
        const result = await ensureApprovalPackageForAssembledReel({
          assembledReelId: ASSEMBLED_REEL_ID,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "CAPTION_CTA_NOT_SELECTED");
        }
        assert.equal(insertCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("foreign assembledReelId → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("load-assembly-job")) {
          return {
            loadAssemblyJobScoped: async () => null,
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { ensureApprovalPackageForAssembledReel } = require(
          "./actions/ensure-approval-package.ts",
        );
        const result = await ensureApprovalPackageForAssembledReel({
          assembledReelId: FOREIGN_ID,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("happy path creates pending package", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let insertCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("load-assembly-job")) {
          return {
            loadAssemblyJobScoped: async () => readyAssembly,
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: true,
              status: "passed",
              hasBlockingFailures: false,
              hasOverridableFailures: false,
              qaReportId: "rep-1",
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("persist-reel-caption")) {
          return {
            getReelCaptionByScriptId: async () => readyCaption,
          };
        }
        if (req.includes("load-reel-script-for-qa")) {
          return {
            loadReelScriptForQa: async () => ({
              id: SCRIPT_ID,
              clientId: CLIENT_ID,
              mustDiscloseNotOwner: true,
            }),
          };
        }
        if (req.includes("persist-qa-override")) {
          return {
            loadQaOverridesForReport: async () => [],
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByAssembledReelScoped: async () => null,
            insertPendingApproval: async () => {
              insertCalled = true;
              return pendingApproval;
            },
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { ensureApprovalPackageForAssembledReel } = require(
          "./actions/ensure-approval-package.ts",
        );
        const result = await ensureApprovalPackageForAssembledReel({
          assembledReelId: ASSEMBLED_REEL_ID,
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.created, true);
          assert.equal(result.package.status, "pending_client");
          assert.equal(
            result.package.video.previewUrl,
            `/api/media/assets/${OUTPUT_ASSET_ID}`,
          );
          assert.equal(result.package.disclosure.required, true);
          assert.doesNotMatch(
            JSON.stringify(result.package),
            /storage_key|costCents/,
          );
        }
        assert.equal(insertCalled, true);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });
});

describe("decideApproval action", () => {
  it("ungated decide → QA_GATE_NOT_READY, no update", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let updateCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => pendingApproval,
            updateApprovalDecision: async () => {
              updateCalled = true;
              return null;
            },
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: false,
              status: "blocked",
              hasBlockingFailures: true,
              hasOverridableFailures: false,
              qaReportId: null,
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { decideApproval } = require("./actions/decide-approval.ts");
        const result = await decideApproval({
          approvalId: APPROVAL_ID,
          decision: "approved",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "QA_GATE_NOT_READY");
        }
        assert.equal(updateCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("foreign approvalId → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => null,
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { decideApproval } = require("./actions/decide-approval.ts");
        const result = await decideApproval({
          approvalId: FOREIGN_ID,
          decision: "approved",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("double-decide → INVALID_TRANSITION", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let updateCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => ({
              ...pendingApproval,
              status: "approved",
              decidedAt: "2026-08-30T19:05:00.000Z",
              decidedBy: CLIENT_ID,
            }),
            updateApprovalDecision: async () => {
              updateCalled = true;
              return null;
            },
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { decideApproval } = require("./actions/decide-approval.ts");
        const result = await decideApproval({
          approvalId: APPROVAL_ID,
          decision: "approved",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "INVALID_TRANSITION");
        }
        assert.equal(updateCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("approve success with gate ready", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      const decided = {
        ...pendingApproval,
        status: "approved" as const,
        decidedAt: "2026-08-30T19:05:00.000Z",
        decidedBy: CLIENT_ID,
        updatedAt: "2026-08-30T19:05:00.000Z",
      };
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({ ok: true }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => pendingApproval,
            updateApprovalDecision: async () => decided,
          };
        }
        if (req.includes("get-qa-gate-status-for-assembled-reel")) {
          return {
            getQaGateStatusForAssembledReel: async () => ({
              ready: true,
              status: "passed",
              hasBlockingFailures: false,
              hasOverridableFailures: false,
              qaReportId: "rep-1",
              overriddenCheckKeys: [],
              uncoveredFailedCheckKeys: [],
            }),
          };
        }
        if (req.includes("load-assembly-job")) {
          return {
            loadAssemblyJobScoped: async () => readyAssembly,
          };
        }
        if (req.includes("persist-reel-caption")) {
          return {
            getReelCaptionByScriptId: async () => readyCaption,
          };
        }
        if (req.includes("load-reel-script-for-qa")) {
          return {
            loadReelScriptForQa: async () => ({
              id: SCRIPT_ID,
              mustDiscloseNotOwner: false,
            }),
          };
        }
        if (req.includes("persist-qa-override")) {
          return {
            loadQaOverridesForReport: async () => [],
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { decideApproval } = require("./actions/decide-approval.ts");
        const result = await decideApproval({
          approvalId: APPROVAL_ID,
          decision: "approved",
        });
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.equal(result.status, "approved");
          assert.equal(result.summary.status, "approved");
          assert.ok(typeof result.summary.captionPreview === "string");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("rate limited decide → RATE_LIMITED", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      let updateCalled = false;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("check-approval-rate-limit")) {
          return {
            checkApprovalRateLimit: async () => ({
              ok: false,
              code: "RATE_LIMITED",
            }),
            recordApprovalAttempt: async () => {},
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => pendingApproval,
            updateApprovalDecision: async () => {
              updateCalled = true;
              return null;
            },
          };
        }
        if (req.includes("next/cache")) {
          return { revalidatePath: () => {} };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { decideApproval } = require("./actions/decide-approval.ts");
        const result = await decideApproval({
          approvalId: APPROVAL_ID,
          decision: "approved",
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "RATE_LIMITED");
        }
        assert.equal(updateCalled, false);
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });
});

describe("getApprovalPackage / listPendingApprovals", () => {
  it("get foreign → NOT_FOUND", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("persist-approval")) {
          return {
            loadApprovalByIdScoped: async () => null,
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { getApprovalPackage } = require(
          "./actions/get-approval-package.ts",
        );
        const result = await getApprovalPackage({
          approvalId: FOREIGN_ID,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "NOT_FOUND");
        }
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });

  it("list returns empty array when no pending", async () => {
    await withServerOnlyStub(async () => {
      clearApprovalCaches();
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load;
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("require-user")) {
          return {
            requireActive: async () => CLIENT,
            isAuthGuardError: () => false,
          };
        }
        if (req.includes("persist-approval")) {
          return {
            listBrandCompletedAssemblyIdsForClient: async () => [],
            listPendingApprovalsForClient: async () => [],
          };
        }
        return originalLoad(request, parent, isMain);
      };
      try {
        clearApprovalCaches();
        const { listPendingApprovals } = require(
          "./actions/list-pending-approvals.ts",
        );
        const result = await listPendingApprovals();
        assert.equal(result.ok, true);
        if (result.ok) {
          assert.deepEqual(result.items, []);
        }
      } finally {
        nodeModule._load = originalLoad;
        clearApprovalCaches();
      }
    });
  });
});

describe("gate helper purity (source)", () => {
  it("ensure + decide call getQaGateStatusForAssembledReel; never request flags", () => {
    const ensureSrc = readFileSync(
      path.join(__dirname, "ensure-approval-package.ts"),
      "utf8",
    );
    const decideSrc = readFileSync(
      path.join(__dirname, "decide-approval.ts"),
      "utf8",
    );
    assert.match(ensureSrc, /getQaGateStatusForAssembledReel/);
    assert.match(decideSrc, /getQaGateStatusForAssembledReel/);
    assert.doesNotMatch(ensureSrc, /rawInput\.ready|params\.ready|qaPassed/);
    assert.doesNotMatch(decideSrc, /rawInput\.ready|params\.ready|qaPassed/);
  });

  it("Cliente actions call requireActive first", () => {
    for (const file of [
      "actions/ensure-approval-package.ts",
      "actions/list-pending-approvals.ts",
      "actions/get-approval-package.ts",
      "actions/decide-approval.ts",
    ]) {
      const src = readFileSync(path.join(__dirname, file), "utf8");
      const fnStart = src.indexOf("export async function");
      assert.ok(fnStart > 0, file);
      const body = src.slice(fnStart);
      const requireIdx = body.indexOf('await requireActive("handler")');
      assert.ok(requireIdx > 0, `${file} has requireActive`);
      const beforeRequire = body.slice(0, requireIdx);
      assert.doesNotMatch(
        beforeRequire,
        /\bawait\b/,
        `${file}: no await before requireActive`,
      );
    }
  });
});
