import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (request: string, parent: NodeModule | null | undefined, isMain: boolean) => unknown;
};

function installMocks(resumeResult: { ok: boolean; code?: string }) {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(Module);
  const resumeCalls: unknown[] = [];
  const logs: unknown[] = [];
  const originalError = console.error;

  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    const req = String(request);
    if (req.includes("resume-weekly-cycle-from-job") && !req.includes("maybe-resume-weekly-cycle-from-job")) {
      return {
        resumeWeeklyCycleFromJob: async (params: unknown) => {
          resumeCalls.push(params);
          return resumeResult;
        },
      };
    }
    return originalLoad(request, parent, isMain);
  };

  console.error = (...args: unknown[]) => {
    logs.push(args);
  };

  return {
    resumeCalls,
    logs,
    restore: () => {
      nodeModule._load = originalLoad;
      console.error = originalError;
    },
  };
}

function clearCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("maybe-resume-weekly-cycle-from-job") ||
      normalized.includes("resume-weekly-cycle-from-job")
    ) {
      delete require.cache[key];
    }
  }
}

describe("maybeResumeWeeklyCycleFromJob", () => {
  it("swallows JOB_LINK_NOT_FOUND for non-cycle jobs", async () => {
    const { restore, resumeCalls, logs } = installMocks({
      ok: false,
      code: "JOB_LINK_NOT_FOUND",
    });
    try {
      clearCache();
      const { maybeResumeWeeklyCycleFromJob } = require("./maybe-resume-weekly-cycle-from-job.ts");
      await maybeResumeWeeklyCycleFromJob({ jobKind: "video", jobId: "job-1" });
      assert.equal(resumeCalls.length, 1);
      assert.equal(logs.length, 0);
    } finally {
      restore();
      clearCache();
    }
  });

  it("logs other resume failures without throwing", async () => {
    const { restore, logs } = installMocks({ ok: false, code: "JOB_SCOPE_MISMATCH" });
    try {
      clearCache();
      const { maybeResumeWeeklyCycleFromJob } = require("./maybe-resume-weekly-cycle-from-job.ts");
      await maybeResumeWeeklyCycleFromJob({ jobKind: "assembly", jobId: "asm-1" });
      assert.equal(logs.length, 1);
      const joined = JSON.stringify(logs);
      assert.match(joined, /JOB_SCOPE_MISMATCH/);
      assert.match(joined, /assembly/);
    } finally {
      restore();
      clearCache();
    }
  });

  it("does not log on successful resume", async () => {
    const { restore, logs } = installMocks({ ok: true });
    try {
      clearCache();
      const { maybeResumeWeeklyCycleFromJob } = require("./maybe-resume-weekly-cycle-from-job.ts");
      await maybeResumeWeeklyCycleFromJob({ jobKind: "branding", jobId: "br-1" });
      assert.equal(logs.length, 0);
    } finally {
      restore();
      clearCache();
    }
  });
});
