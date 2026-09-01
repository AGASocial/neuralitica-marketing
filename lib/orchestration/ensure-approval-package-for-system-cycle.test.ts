import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

type MockOptions = {
  rateLimitOk?: boolean;
  assembly?: { status: string; brandingStatus: string; outputMediaAssetId: string | null; reelScriptId: string } | null;
  qaReport?: { status: string } | null;
  caption?: { selectedCtaIndex: number | null; record: unknown } | null;
  resolvedCtaText?: string | null;
  existingApproval?: { id: string } | null;
  insertResult?: { id: string } | null;
};

function installMocks(options: MockOptions) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  const calls = { inserted: 0 };
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);
    const isModule = (name: string) => req.endsWith(`/${name}`) || req.endsWith(`/${name}.ts`);
    if (isModule("check-approval-rate-limit")) {
      return { checkApprovalRateLimit: async () => (options.rateLimitOk === false ? { ok: false } : { ok: true }) };
    }
    if (isModule("load-assembly-job")) {
      return { loadAssemblyJobScoped: async () => options.assembly ?? null };
    }
    if (isModule("persist-approval")) {
      return {
        insertPendingApproval: async () => { calls.inserted += 1; return options.insertResult === undefined ? { id: "approval-new" } : options.insertResult; },
        loadApprovalByAssembledReelScoped: async () => options.existingApproval ?? null,
      };
    }
    if (isModule("persist-qa-report")) {
      return { loadQaReportForAssembledReel: async () => options.qaReport ?? null };
    }
    if (isModule("persist-reel-caption")) {
      return { getReelCaptionByScriptId: async () => options.caption ?? null };
    }
    if (req.includes("lib/contracts/reel-caption")) {
      return { resolveSelectedCtaVariant: () => options.resolvedCtaText ?? "Shop now" };
    }
    if (req.includes("lib/contracts/approval")) {
      return { APPROVAL_ENSURE_AGENT_KEY: "weekly_cycle_system" };
    }
    return originalLoad(request, parent, isMain);
  };
  return { restore: () => { nodeModule._load = originalLoad; }, calls };
}

function clearModuleCache() {
  for (const key of Object.keys(require.cache)) {
    if (key.replace(/\\/g, "/").includes("/lib/orchestration/ensure-approval-package-for-system-cycle")) {
      delete require.cache[key];
    }
  }
}

const clientId = "11111111-1111-4111-8111-111111111111";
const assembledReelId = "22222222-2222-4222-8222-222222222222";

const completeAssembly = { status: "completed", brandingStatus: "completed", outputMediaAssetId: "asset-1", reelScriptId: "script-1" };
const passedQa = { status: "passed" };
const validCaption = { selectedCtaIndex: 0, record: {} };

describe("ensureApprovalPackageForSystemCycle — approval/publish boundary and QA strictness", () => {
  it("ensures a new pending approval only after assembly + branding completed and QA passed", async () => {
    const { restore, calls } = installMocks({ assembly: completeAssembly, qaReport: passedQa, caption: validCaption, existingApproval: null });
    try {
      clearModuleCache();
      const { ensureApprovalPackageForSystemCycle } = require("./ensure-approval-package-for-system-cycle.ts");
      const result = await ensureApprovalPackageForSystemCycle({ clientId, assembledReelId });
      assert.deepEqual(result, { ok: true, approvalId: "approval-new", idempotent: false });
      assert.equal(calls.inserted, 1);
    } finally { restore(); clearModuleCache(); }
  });

  it("is idempotent: an existing approval for the reel is returned without a second insert", async () => {
    const { restore, calls } = installMocks({ assembly: completeAssembly, qaReport: passedQa, caption: validCaption, existingApproval: { id: "approval-existing" } });
    try {
      clearModuleCache();
      const { ensureApprovalPackageForSystemCycle } = require("./ensure-approval-package-for-system-cycle.ts");
      const result = await ensureApprovalPackageForSystemCycle({ clientId, assembledReelId });
      assert.deepEqual(result, { ok: true, approvalId: "approval-existing", idempotent: true });
      assert.equal(calls.inserted, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("never ensures approval on anything less than a clean QA pass — no Operator-style override exists on this path", async () => {
    for (const qaReport of [{ status: "failed" }, { status: "blocked" }, null]) {
      const { restore, calls } = installMocks({ assembly: completeAssembly, qaReport, caption: validCaption });
      try {
        clearModuleCache();
        const { ensureApprovalPackageForSystemCycle } = require("./ensure-approval-package-for-system-cycle.ts");
        const result = await ensureApprovalPackageForSystemCycle({ clientId, assembledReelId });
        assert.deepEqual(result, { ok: false, errorCode: "QA_FAILED" });
        assert.equal(calls.inserted, 0);
      } finally { restore(); clearModuleCache(); }
    }
  });

  it("blocks on incomplete assembly or branding as DEPENDENCY_FAILED", async () => {
    for (const assembly of [
      { ...completeAssembly, status: "queued" },
      { ...completeAssembly, brandingStatus: "queued" },
      { ...completeAssembly, outputMediaAssetId: null },
      null,
    ]) {
      const { restore, calls } = installMocks({ assembly, qaReport: passedQa, caption: validCaption });
      try {
        clearModuleCache();
        const { ensureApprovalPackageForSystemCycle } = require("./ensure-approval-package-for-system-cycle.ts");
        const result = await ensureApprovalPackageForSystemCycle({ clientId, assembledReelId });
        assert.deepEqual(result, { ok: false, errorCode: "DEPENDENCY_FAILED" });
        assert.equal(calls.inserted, 0);
      } finally { restore(); clearModuleCache(); }
    }
  });

  it("blocks on a missing or unselected caption CTA as DEPENDENCY_FAILED", async () => {
    for (const caption of [null, { selectedCtaIndex: null, record: {} }]) {
      const { restore, calls } = installMocks({ assembly: completeAssembly, qaReport: passedQa, caption });
      try {
        clearModuleCache();
        const { ensureApprovalPackageForSystemCycle } = require("./ensure-approval-package-for-system-cycle.ts");
        const result = await ensureApprovalPackageForSystemCycle({ clientId, assembledReelId });
        assert.deepEqual(result, { ok: false, errorCode: "DEPENDENCY_FAILED" });
        assert.equal(calls.inserted, 0);
      } finally { restore(); clearModuleCache(); }
    }
  });

  it("respects the approval rate limit before touching any downstream table", async () => {
    const { restore, calls } = installMocks({ rateLimitOk: false, assembly: completeAssembly, qaReport: passedQa, caption: validCaption });
    try {
      clearModuleCache();
      const { ensureApprovalPackageForSystemCycle } = require("./ensure-approval-package-for-system-cycle.ts");
      const result = await ensureApprovalPackageForSystemCycle({ clientId, assembledReelId });
      assert.deepEqual(result, { ok: false, errorCode: "PROVIDER_TRANSIENT" });
      assert.equal(calls.inserted, 0);
    } finally { restore(); clearModuleCache(); }
  });

  it("never sets Cliente approval status directly — only ever inserts a pending row (source-level check)", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const source = readFileSync(path.join(process.cwd(), "lib/orchestration/ensure-approval-package-for-system-cycle.ts"), "utf8");
    assert.equal(/status:\s*["']approved["']/.test(source), false);
    assert.equal(source.includes("instagram"), false);
    assert.equal(source.includes("publish"), false);
  });
});
