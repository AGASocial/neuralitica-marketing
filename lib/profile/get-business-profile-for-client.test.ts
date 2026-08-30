import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import {
  businessProfileLoadFailedSchema,
  businessProfileMissingSchema,
  businessProfileViewSchema,
} from "../contracts/profile";
import { interviewAnswersCompleteSchema } from "../contracts/interview";
import { mapBusinessProfileRow } from "./map-business-profile-row.ts";

const COMPLETE_FIELDS = {
  services: { items: ["Residential cleaning", "Office cleaning"] },
  zone: { description: "Greater Metro area, north and west suburbs" },
  tone: { description: "Warm, professional, concise" },
  offers: { items: ["First clean 15% off"] },
  objections: { items: ["Price vs DIY", "Trust with keys"] },
  style: { description: "Short sentences; avoid slang; Spanish OK" },
  restrictions: { items: [] },
} as const;

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearProfileModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (
      normalized.includes("/lib/profile/get-business-profile-for-client") ||
      normalized.includes("/lib/profile/get-profile-stub-summary")
    ) {
      delete require.cache[key];
    }
  }
}

describe("getBusinessProfileForClient signature (IDOR / auth arity)", () => {
  it("accepts no client_id / profile id parameters (arity 0)", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load;
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      clearProfileModuleCache();
      const { getBusinessProfileForClient } = await import(
        "./get-business-profile-for-client.ts"
      );
      assert.equal(getBusinessProfileForClient.length, 0);
    } finally {
      nodeModule._load = originalLoad;
      clearProfileModuleCache();
    }
  });
});

describe("mapBusinessProfileRow outcomes", () => {
  it("returns missing when no own row", () => {
    const result = mapBusinessProfileRow({ data: null, error: null });
    assert.deepEqual(result, { exists: false });
    assert.equal(businessProfileMissingSchema.safeParse(result).success, true);
  });

  it("returns view DTO when fields are Zod-valid (no UUIDs)", () => {
    const result = mapBusinessProfileRow({
      data: {
        fields: COMPLETE_FIELDS,
        version: 1,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
    });

    assert.equal(result.exists, true);
    if (result.exists) {
      assert.deepEqual(
        result.fields,
        interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS),
      );
      assert.equal(result.version, 1);
      assert.equal(result.updatedAt, "2026-08-29T16:00:00.000Z");
    }
    const withBranding = {
      ...(result as { exists: true }),
      branding: {
        logoAssetId: null,
        logoPreviewUrl: null,
        assemblyConfig: {
          subtitlesEnabled: true,
          logoEnabled: true,
          coverFrameSec: 1.0,
        },
      },
    };
    assert.equal(businessProfileViewSchema.safeParse(withBranding).success, true);

    const serialized = JSON.stringify(withBranding);
    assert.equal(serialized.includes("client_id"), false);
    assert.equal(serialized.includes("source_interview_id"), false);
    assert.equal(serialized.includes('"id"'), false);
  });

  it("soft-fails with loadFailed when fields are invalid", () => {
    const result = mapBusinessProfileRow({
      data: {
        fields: { garbage: true },
        version: 1,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
    });
    assert.deepEqual(result, { exists: false, loadFailed: true });
    assert.equal(
      businessProfileLoadFailedSchema.safeParse(result).success,
      true,
    );
    assert.equal(JSON.stringify(result).includes("garbage"), false);
  });

  it("soft-fails with loadFailed on select error", () => {
    const result = mapBusinessProfileRow({
      data: null,
      error: { code: "PGRST116" },
    });
    assert.deepEqual(result, { exists: false, loadFailed: true });
  });

  it("omits invalid version but still returns valid fields", () => {
    const result = mapBusinessProfileRow({
      data: {
        fields: COMPLETE_FIELDS,
        version: 0,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
    });
    assert.equal(result.exists, true);
    if (result.exists) {
      assert.equal(result.version, undefined);
      assert.equal(result.updatedAt, "2026-08-29T16:00:00.000Z");
    }
  });
});

describe("getProfileStubSummary thin adapter mapping", () => {
  it("maps view / missing / loadFailed shapes", () => {
    const view = mapBusinessProfileRow({
      data: {
        fields: COMPLETE_FIELDS,
        version: 2,
        updated_at: "2026-08-29T16:00:00.000Z",
      },
      error: null,
    });
    assert.equal(view.exists, true);
    if (view.exists) {
      assert.deepEqual(
        { exists: true, version: view.version ?? null },
        { exists: true, version: 2 },
      );
    }

    const missing = mapBusinessProfileRow({ data: null, error: null });
    assert.deepEqual(
      missing.exists === false && !("loadFailed" in missing)
        ? { exists: false, version: null }
        : null,
      { exists: false, version: null },
    );

    const failed = mapBusinessProfileRow({
      data: { fields: { garbage: true }, version: 1, updated_at: null },
      error: null,
    });
    assert.equal(
      failed.exists === false && "loadFailed" in failed && failed.loadFailed
        ? null
        : "not-null",
      null,
    );
  });

  it("remains arity 0", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load;
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      clearProfileModuleCache();
      const { getProfileStubSummary } = await import(
        "./get-profile-stub-summary.ts"
      );
      assert.equal(getProfileStubSummary.length, 0);
    } finally {
      nodeModule._load = originalLoad;
      clearProfileModuleCache();
    }
  });
});
