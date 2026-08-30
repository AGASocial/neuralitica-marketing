/**
 * US-8.3 manual upload adapter tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import { MANUAL_UPLOAD_SYNC_ONLY } from "@/lib/contracts/manual-video-upload";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => T): T {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load.bind(nodeModule);
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") return {};
    return originalLoad(request, parent, isMain);
  };
  try {
    return run();
  } finally {
    nodeModule._load = originalLoad;
  }
}

describe("createManualUploadAdapter", () => {
  it("estimateCost returns zero; vendor I/O throws MANUAL_UPLOAD_SYNC_ONLY", async () => {
    const { createManualUploadAdapter } = withServerOnlyStub(() =>
      require("./manual-upload-adapter.ts"),
    );
    const adapter = createManualUploadAdapter();

    assert.equal(adapter.providerKey, "manual");
    assert.equal(adapter.videoAssetRole, "primary");

    const estimate = await adapter.estimateCost({
      reelScriptId: "00000000-0000-4000-8000-000000000001",
      clientId: "00000000-0000-4000-8000-000000000002",
      providerKey: "manual",
      providerTier: "low",
      assetRole: "primary",
      targetDurationSec: 30,
      voiceoverAssetId: "00000000-0000-4000-8000-000000000010",
      portraitAssetId: "00000000-0000-4000-8000-000000000011",
    });

    assert.deepEqual(estimate, {
      estimatedCostCents: 0,
      currency: "USD",
      providerKey: "manual",
    });

    for (const method of ["createJob", "getJobStatus", "fetchAsset"] as const) {
      await assert.rejects(
        () =>
          adapter[method](
            "ext-id",
            method === "fetchAsset" ? "https://example.com/out.mp4" : undefined,
            { clientId: "00000000-0000-4000-8000-000000000002", reelScriptId: "00000000-0000-4000-8000-000000000001" },
          ),
        (error: Error) => error.message === MANUAL_UPLOAD_SYNC_ONLY,
      );
    }
  });
});

describe("createProviderRegistry manual adapter", () => {
  it("registers manual adapter when catalog includes manual row", () => {
    const {
      createProviderRegistry,
      resetProviderRegistryForTests,
    } = withServerOnlyStub(() => require("../create-provider-registry.ts"));
    resetProviderRegistryForTests();
    const registry = createProviderRegistry();
    const adapter = registry.getVideoAdapter("manual");
    assert.equal(adapter.providerKey, "manual");
  });
});
