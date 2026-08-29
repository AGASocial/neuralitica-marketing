import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  interviewAnswersCompleteSchema,
  INTERVIEW_ANSWERS_MAX_UTF8_BYTES,
} from "../contracts/interview";
import {
  updateBusinessProfileErrorEnvelopeSchema,
  updateBusinessProfileInputSchema,
  updateBusinessProfileResultSchema,
  updateBusinessProfileSuccessSchema,
} from "../contracts/profile";
import { zodInterviewErrorToFieldErrors } from "../interview/zod-field-errors";
import { isPublicPath } from "../auth/public-routes";
import {
  profileForbiddenError,
  profileForbiddenFieldsError,
  profileNotFoundError,
  profileUnauthenticatedError,
  profileValidationError,
} from "./errors.ts";
import {
  buildBusinessProfileUpdatePayload,
  findForbiddenUpdateBusinessProfileKeys,
  isProfileFieldsPayloadTooLarge,
  mapUpdateBusinessProfileResult,
  profileFieldsUtf8ByteLength,
} from "./update-helpers.ts";

const COMPLETE_FIELDS = {
  services: { items: ["Web design", "Brand kits"] },
  zone: { description: "Greater Miami and remote US" },
  tone: { description: "Clear, confident, no hype" },
  offers: { items: ["Landing page package", "Monthly retainer"] },
  objections: { items: ["Too expensive", "Need it yesterday"] },
  style: { description: "Clean sans, high contrast, product-first" },
  restrictions: { items: ["No political content"] },
} as const;

const EDITOR_ID = "3b2c1a09-7e4f-4d11-9c0a-aaaaaaaaaaa1";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function clearUpdateModuleCache() {
  for (const key of Object.keys(require.cache)) {
    const normalized = key.replace(/\\/g, "/");
    if (normalized.includes("/lib/profile/update-business-profile")) {
      delete require.cache[key];
    }
  }
}

describe("updateBusinessProfileInputSchema allowlist (.strict())", () => {
  it("accepts full seven-key body", () => {
    const parsed = updateBusinessProfileInputSchema.safeParse(COMPLETE_FIELDS);
    assert.equal(parsed.success, true);
    assert.deepEqual(
      parsed.success ? parsed.data : null,
      interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS),
    );
  });

  it("rejects sparse / incomplete body", () => {
    const parsed = updateBusinessProfileInputSchema.safeParse({
      services: { items: ["Only one section"] },
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const fields = zodInterviewErrorToFieldErrors(parsed.error);
      assert.ok(Object.keys(fields).length > 0);
    }
  });

  it("rejects smuggled consent / visual_mode / unknown keys as VALIDATION_ERROR shape", () => {
    const parsed = updateBusinessProfileInputSchema.safeParse({
      ...COMPLETE_FIELDS,
      visual_mode: "own_avatar",
      consentAvatar: true,
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const fields = zodInterviewErrorToFieldErrors(parsed.error);
      assert.ok(
        fields.visual_mode?.includes("unrecognized_key") ||
          "visual_mode" in fields,
      );
      assert.ok(
        fields.consentAvatar?.includes("unrecognized_key") ||
          "consentAvatar" in fields,
      );
      assert.equal(
        profileValidationError(fields).error.code,
        "VALIDATION_ERROR",
      );
    }
  });
});

describe("findForbiddenUpdateBusinessProfileKeys", () => {
  it("rejects identity / privilege / audit keys as FORBIDDEN_FIELDS", () => {
    const withClientId = {
      ...COMPLETE_FIELDS,
      client_id: "00000000-0000-4000-8000-000000000099",
    };
    assert.ok(findForbiddenUpdateBusinessProfileKeys(withClientId).length > 0);
    assert.equal(
      profileForbiddenFieldsError().error.code,
      "FORBIDDEN_FIELDS",
    );

    assert.ok(
      findForbiddenUpdateBusinessProfileKeys({
        ...COMPLETE_FIELDS,
        role: "operator",
      }).includes("role"),
    );
    assert.ok(
      findForbiddenUpdateBusinessProfileKeys({
        ...COMPLETE_FIELDS,
        version: 999,
      }).includes("version"),
    );
    assert.ok(
      findForbiddenUpdateBusinessProfileKeys({
        ...COMPLETE_FIELDS,
        updated_by: EDITOR_ID,
      }).includes("updated_by"),
    );
    assert.ok(
      findForbiddenUpdateBusinessProfileKeys({
        ...COMPLETE_FIELDS,
        updatedAt: "2026-08-29T16:00:00.000Z",
      }).includes("updatedAt"),
    );
    assert.ok(
      findForbiddenUpdateBusinessProfileKeys({
        ...COMPLETE_FIELDS,
        auth_user_id: "x",
      }).length > 0,
    );
    assert.ok(
      findForbiddenUpdateBusinessProfileKeys({
        ...COMPLETE_FIELDS,
        as_client_id: "y",
      }).length > 0,
    );
  });

  it("does not treat allowlisted seven keys as forbidden", () => {
    assert.deepEqual(
      findForbiddenUpdateBusinessProfileKeys(COMPLETE_FIELDS),
      [],
    );
  });

  it("leaves visual_mode to Zod .strict() (not FORBIDDEN_FIELDS list)", () => {
    assert.deepEqual(
      findForbiddenUpdateBusinessProfileKeys({
        ...COMPLETE_FIELDS,
        visual_mode: "own_avatar",
      }),
      [],
    );
  });
});

describe("buildBusinessProfileUpdatePayload (version bump + updated_by)", () => {
  it("bumps version and sets updated_by from server user only", () => {
    const payload = buildBusinessProfileUpdatePayload({
      fields: interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS),
      currentVersion: 1,
      editorClientId: EDITOR_ID,
      nowIso: "2026-08-29T16:42:10.123Z",
    });

    assert.equal(payload.version, 2);
    assert.equal(payload.updated_by, EDITOR_ID);
    assert.equal(payload.updated_at, "2026-08-29T16:42:10.123Z");
    assert.deepEqual(payload.fields, COMPLETE_FIELDS);
    assert.equal("client_id" in payload, false);
    assert.equal("source_interview_id" in payload, false);
  });

  it("never trusts a client-supplied version in the builder API", () => {
    const payload = buildBusinessProfileUpdatePayload({
      fields: interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS),
      currentVersion: 3,
      editorClientId: EDITOR_ID,
    });
    assert.equal(payload.version, 4);
  });
});

describe("mapUpdateBusinessProfileResult DTO", () => {
  it("returns fields + version + updatedAt and omits ids / updated_by", () => {
    const result = mapUpdateBusinessProfileResult({
      fields: COMPLETE_FIELDS,
      version: 2,
      updated_at: "2026-08-29T16:42:10.123Z",
    });

    assert.equal(
      updateBusinessProfileSuccessSchema.safeParse(result).success,
      true,
    );
    assert.deepEqual(result, {
      ok: true,
      fields: interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS),
      version: 2,
      updatedAt: "2026-08-29T16:42:10.123Z",
    });

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("client_id"), false);
    assert.equal(serialized.includes("source_interview_id"), false);
    assert.equal(serialized.includes("updated_by"), false);
    assert.equal(serialized.includes('"id"'), false);
  });

  it("returns null for missing row (PROFILE_NOT_FOUND path — no INSERT)", () => {
    assert.equal(mapUpdateBusinessProfileResult(null), null);
    assert.equal(profileNotFoundError().error.code, "PROFILE_NOT_FOUND");
    assert.equal(
      profileNotFoundError().error.messageKey,
      "profile.errors.notFound",
    );
  });
});

describe("payload size gate", () => {
  it("rejects oversized fields before write", () => {
    const item = "文".repeat(500);
    const list = { items: Array.from({ length: 20 }, () => item) };
    const text = { description: "文".repeat(2000) };
    const huge = interviewAnswersCompleteSchema.parse({
      services: list,
      zone: text,
      tone: text,
      offers: list,
      objections: list,
      style: text,
      restrictions: list,
    });
    assert.ok(
      profileFieldsUtf8ByteLength(huge) > INTERVIEW_ANSWERS_MAX_UTF8_BYTES,
    );
    assert.equal(isProfileFieldsPayloadTooLarge(huge), true);
  });

  it("allows fixture-sized body", () => {
    const parsed = interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS);
    assert.equal(isProfileFieldsPayloadTooLarge(parsed), false);
  });
});

describe("auth / missing envelopes", () => {
  it("maps unauthenticated / forbidden / not-found codes", () => {
    assert.equal(
      profileUnauthenticatedError().error.code,
      "UNAUTHENTICATED",
    );
    assert.equal(profileForbiddenError().error.code, "FORBIDDEN");
    assert.equal(profileNotFoundError().error.code, "PROFILE_NOT_FOUND");
    assert.equal(
      updateBusinessProfileErrorEnvelopeSchema.safeParse(
        profileNotFoundError(),
      ).success,
      true,
    );
  });

  it("happy-path result schema matches CONTRACT fixture", () => {
    const success = {
      ok: true as const,
      fields: interviewAnswersCompleteSchema.parse(COMPLETE_FIELDS),
      version: 2,
      updatedAt: "2026-08-29T16:42:10.123Z",
    };
    assert.equal(
      updateBusinessProfileResultSchema.safeParse(success).success,
      true,
    );
  });
});

describe("updateBusinessProfile signature (IDOR / auth arity)", () => {
  it("accepts a single fields body argument (no tenant/profile id params)", async () => {
    const nodeModule = Module as unknown as NodeModuleLoad;
    const originalLoad = nodeModule._load;
    nodeModule._load = function (request, parent, isMain) {
      if (request === "server-only") {
        return {};
      }
      return originalLoad(request, parent, isMain);
    };
    try {
      clearUpdateModuleCache();
      const { updateBusinessProfile } = await import(
        "./update-business-profile.ts"
      );
      assert.equal(updateBusinessProfile.length, 1);
    } finally {
      nodeModule._load = originalLoad;
      clearUpdateModuleCache();
    }
  });
});

describe("no public profile mutate Route Handler", () => {
  it("does not ship app/api/profile mutate routes", () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    assert.equal(existsSync(path.join(root, "app/api/profile")), false);
    assert.equal(
      existsSync(path.join(root, "app/api/profile/route.ts")),
      false,
    );
  });

  it("keeps /profile off isPublicPath", () => {
    assert.equal(isPublicPath("/profile"), false);
  });
});
