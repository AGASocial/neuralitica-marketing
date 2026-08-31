/**
 * US-9.2 branding orchestrator and security tests (backend slice).
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import { computeBrandingFingerprint } from "@/lib/branding/compute-branding-fingerprint";
import { findForbiddenBrandingKeys } from "@/lib/assembly/find-forbidden-branding-keys";
import { mapBusinessProfileBranding } from "@/lib/profile/map-business-profile-branding";

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "44444444-4444-4444-8444-444444444444";

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

function clearBrandingModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/assembly/create-branding-job") ||
      normalized.includes("/lib/auth/require-user")
    ) {
      delete require.cache[key];
    }
  }
}

function loadBrandingModule<T = Record<string, unknown>>(relativePath: string): T {
  clearBrandingModuleCache();
  return require(relativePath) as T;
}

describe("computeBrandingFingerprint", () => {
  it("returns stable 64-char hex", () => {
    const config = {
      subtitlesEnabled: true,
      logoEnabled: true,
      coverFrameSec: 1.0,
      subtitleBeatCount: 2,
      subtitleSourceHash: "a".repeat(64),
      voiceoverTimingHash: "b".repeat(64),
    };
    const fp = computeBrandingFingerprint({
      preBrandingOutputMediaAssetId: "88888888-8888-4888-8888-888888888888",
      brandingConfig: config,
      subtitleSourceHash: config.subtitleSourceHash,
      voiceoverTimingHash: config.voiceoverTimingHash,
    });
    assert.match(fp, /^[0-9a-f]{64}$/);
  });

  it("changes when VO timing hash changes with same on-screen", () => {
    const base = {
      subtitlesEnabled: true,
      logoEnabled: true,
      coverFrameSec: 1.0,
      subtitleBeatCount: 2,
      subtitleSourceHash: "a".repeat(64),
      voiceoverTimingHash: "b".repeat(64),
    };
    const pre = "88888888-8888-4888-8888-888888888888";
    const fp1 = computeBrandingFingerprint({
      preBrandingOutputMediaAssetId: pre,
      brandingConfig: base,
      subtitleSourceHash: base.subtitleSourceHash,
      voiceoverTimingHash: base.voiceoverTimingHash,
    });
    const fp2 = computeBrandingFingerprint({
      preBrandingOutputMediaAssetId: pre,
      brandingConfig: { ...base, voiceoverTimingHash: "c".repeat(64) },
      subtitleSourceHash: base.subtitleSourceHash,
      voiceoverTimingHash: "c".repeat(64),
    });
    assert.notEqual(fp1, fp2);
  });

  it("is sticky when VO timing hash is unchanged", () => {
    const config = {
      subtitlesEnabled: true,
      logoEnabled: true,
      coverFrameSec: 1.0,
      subtitleBeatCount: 2,
      subtitleSourceHash: "a".repeat(64),
      voiceoverTimingHash: "b".repeat(64),
    };
    const pre = "88888888-8888-4888-8888-888888888888";
    const fp1 = computeBrandingFingerprint({
      preBrandingOutputMediaAssetId: pre,
      brandingConfig: config,
      subtitleSourceHash: config.subtitleSourceHash,
      voiceoverTimingHash: config.voiceoverTimingHash,
    });
    const fp2 = computeBrandingFingerprint({
      preBrandingOutputMediaAssetId: pre,
      brandingConfig: { ...config },
      subtitleSourceHash: config.subtitleSourceHash,
      voiceoverTimingHash: config.voiceoverTimingHash,
    });
    assert.equal(fp1, fp2);
  });
});

describe("findForbiddenBrandingKeys", () => {
  it("rejects logoAssetId and onScreenText", () => {
    const keys = findForbiddenBrandingKeys({
      assemblyJobId: JOB_ID,
      logoAssetId: "aaaa",
      onScreenText: "evil",
    });
    assert.ok(keys.includes("logoAssetId"));
    assert.ok(keys.includes("onScreenText"));
  });

  it("allows coverFrameSec but forbids VO/timing/hash/path keys", () => {
    const allowed = findForbiddenBrandingKeys({
      assemblyJobId: JOB_ID,
      coverFrameSec: 2.5,
    });
    assert.equal(allowed.length, 0);

    const keys = findForbiddenBrandingKeys({
      assemblyJobId: JOB_ID,
      voiceoverText: "inject",
      beatTimings: [],
      voiceoverTimingHash: "a".repeat(64),
      tempPath: "/tmp/x",
      assPath: "/tmp/y.ass",
    });
    assert.ok(keys.includes("voiceoverText"));
    assert.ok(keys.includes("beatTimings"));
    assert.ok(keys.includes("voiceoverTimingHash"));
    assert.ok(keys.includes("tempPath"));
    assert.ok(keys.includes("assPath"));
  });
});

describe("applyBrandingForAssembly security", () => {
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
        const { applyBrandingForAssemblyInner } = loadBrandingModule(
          "@/lib/assembly/create-branding-job-for-assembly",
        );
        const result = await applyBrandingForAssemblyInner({
          assemblyJobId: JOB_ID,
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

  it("returns FORBIDDEN_FIELDS for voiceoverText", async () => {
    await withServerOnlyStub(async () => {
      const { applyBrandingForAssemblyInner } = loadBrandingModule(
        "@/lib/assembly/create-branding-job-for-assembly",
      );
      const result = await applyBrandingForAssemblyInner({
        assemblyJobId: JOB_ID,
        voiceoverText: "inject",
      });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "FORBIDDEN_FIELDS");
      }
    });
  });

  it("returns VALIDATION_ERROR for coverFrameSec out of range", async () => {
    await withServerOnlyStub(async () => {
      const { applyBrandingForAssemblyInner } = loadBrandingModule(
        "@/lib/assembly/create-branding-job-for-assembly",
      );
      for (const coverFrameSec of [-1, 46, "1;rm"] as const) {
        const result = await applyBrandingForAssemblyInner({
          assemblyJobId: JOB_ID,
          coverFrameSec,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.error.code, "VALIDATION_ERROR");
          assert.ok(result.error.fields?.coverFrameSec);
        }
      }
    });
  });
});

describe("mapBusinessProfileBranding", () => {
  it("builds preview URL when logo set", () => {
    const logoId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const branding = mapBusinessProfileBranding({
      logoAssetId: logoId,
      assemblyConfig: null,
    });
    assert.equal(branding.logoAssetId, logoId);
    assert.equal(branding.logoPreviewUrl, `/api/media/assets/${logoId}`);
    assert.equal(branding.assemblyConfig.coverFrameSec, 1.0);
  });
});

describe("mapOperatorAssemblyJobDto branding flags", () => {
  it("derives canApplyBranding when assembly completed and branding null", async () => {
    await withServerOnlyStub(async () => {
      const nodeModule = Module as unknown as NodeModuleLoad;
      const originalLoad = nodeModule._load.bind(nodeModule);
      nodeModule._load = function (request, parent, isMain) {
        if (request === "server-only") return {};
        const req = String(request);
        if (req.includes("resolve-assembly-inputs")) {
          return {
            areAssemblyInputsComplete: async () => true,
          };
        }
        return originalLoad(request, parent, isMain);
      };

      try {
        const { mapOperatorAssemblyJobDto } = loadBrandingModule(
          "@/lib/assembly/map-operator-assembly-job-dto",
        );
        const dto = await mapOperatorAssemblyJobDto(
          {
            id: JOB_ID,
            clientId: CLIENT_ID,
            reelScriptId: "33333333-3333-4333-8333-333333333333",
            templateId: "reel_v1_basic",
            status: "completed",
            primaryVideoAssetId: "66666666-6666-4666-8666-666666666666",
            voiceoverAssetId: null,
            outputMediaAssetId: "88888888-8888-4888-8888-888888888888",
            scriptUpdatedAt: new Date().toISOString(),
            inputFingerprint: "a".repeat(64),
            targetDurationSec: 30,
            actualDurationSec: 29,
            failureReason: null,
            brandingStatus: null,
            brandingConfig: null,
            brandingFingerprint: null,
            preBrandingOutputMediaAssetId: null,
            coverMediaAssetId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            clientId: CLIENT_ID,
            modalidad: "faceless",
            scriptUpdatedAt: new Date().toISOString(),
          },
        );
        assert.equal(dto.canApplyBranding, true);
        assert.equal(dto.canRebrand, false);
        assert.equal(dto.brandingStatus, null);
      } finally {
        nodeModule._load = originalLoad;
      }
    });
  });
});
