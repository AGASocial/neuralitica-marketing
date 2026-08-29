import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import {
  genericAvatarNotOwnerCheckInputSchema,
  genericAvatarNotOwnerCheckResultSchema,
} from "../contracts/qa.ts";
import { QA_CHECK_SEVERITY } from "./check-classes.ts";

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

describe("QA_CHECK_SEVERITY", () => {
  it("exports blocking and overridable for US-10.2", () => {
    assert.equal(QA_CHECK_SEVERITY.blocking, "blocking");
    assert.equal(QA_CHECK_SEVERITY.overridable, "overridable");
  });
});

describe("evaluateGenericAvatarNotOwnerCheck (CONTRACT fixtures)", () => {
  it("passes when mustDiscloseNotOwner is false (check N/A)", async () => {
    await withServerOnlyStub(async () => {
      const {
        evaluateGenericAvatarNotOwnerCheck,
        GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
      } = await import("./checks/generic-avatar-not-owner.ts");
      assert.equal(GENERIC_AVATAR_NOT_OWNER_CHECK_KEY, "generic_avatar_not_owner");

      const input = {
        mustDiscloseNotOwner: false,
        scriptText: "I am the owner of this cafe.",
      };
      const result = evaluateGenericAvatarNotOwnerCheck(input);
      assert.equal(
        genericAvatarNotOwnerCheckResultSchema.safeParse(result).success,
        true,
      );
      assert.deepEqual(result, {
        checkKey: "generic_avatar_not_owner",
        status: "pass",
        severity: QA_CHECK_SEVERITY.blocking,
      });
    });
  });

  it("fails when flag true and owner claim without disclosure", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateGenericAvatarNotOwnerCheck } = await import(
        "./checks/generic-avatar-not-owner.ts"
      );
      const result = evaluateGenericAvatarNotOwnerCheck({
        mustDiscloseNotOwner: true,
        scriptText:
          "Hi, I'm Maria and I am the owner of Lopez Plumbing.",
        ownerDisplayName: "Maria Lopez",
      });
      assert.equal(result.status, "fail");
      assert.equal(result.severity, QA_CHECK_SEVERITY.blocking);
      assert.equal(
        result.evidence?.messageKey,
        "qa.checks.genericAvatarNotOwner.failOwnerClaim",
      );
    });
  });

  it("passes when flag true, owner claim, and EN disclosure present", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateGenericAvatarNotOwnerCheck } = await import(
        "./checks/generic-avatar-not-owner.ts"
      );
      const result = evaluateGenericAvatarNotOwnerCheck({
        mustDiscloseNotOwner: true,
        scriptText:
          "I'm Maria Lopez welcoming you to our shop. This video uses an AI presenter who is not the business owner.",
      });
      assert.equal(result.status, "pass");
      assert.equal(result.severity, QA_CHECK_SEVERITY.blocking);
    });
  });

  it("passes when flag true and ES disclosure present", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateGenericAvatarNotOwnerCheck } = await import(
        "./checks/generic-avatar-not-owner.ts"
      );
      const result = evaluateGenericAvatarNotOwnerCheck({
        mustDiscloseNotOwner: true,
        scriptText:
          "Soy el dueño del negocio... presentador de IA que no es el dueño del negocio.",
      });
      assert.equal(result.status, "pass");
    });
  });

  it("passes when flag true and no owner-claim detected", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateGenericAvatarNotOwnerCheck } = await import(
        "./checks/generic-avatar-not-owner.ts"
      );
      const result = evaluateGenericAvatarNotOwnerCheck({
        mustDiscloseNotOwner: true,
        scriptText: "Welcome to Lopez Plumbing — quality service since 1998.",
      });
      assert.equal(result.status, "pass");
    });
  });

  it("does not match third-person owner references", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateGenericAvatarNotOwnerCheck } = await import(
        "./checks/generic-avatar-not-owner.ts"
      );
      const result = evaluateGenericAvatarNotOwnerCheck({
        mustDiscloseNotOwner: true,
        scriptText: "The owner says this shop is the best in town.",
      });
      assert.equal(result.status, "pass");
    });
  });

  it("fails on I'm the owner without disclosure", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateGenericAvatarNotOwnerCheck } = await import(
        "./checks/generic-avatar-not-owner.ts"
      );
      const result = evaluateGenericAvatarNotOwnerCheck({
        mustDiscloseNotOwner: true,
        scriptText: "I'm the owner here — let me show you around.",
      });
      assert.equal(result.status, "fail");
    });
  });

  it("fails on soy el dueño without disclosure", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateGenericAvatarNotOwnerCheck } = await import(
        "./checks/generic-avatar-not-owner.ts"
      );
      const result = evaluateGenericAvatarNotOwnerCheck({
        mustDiscloseNotOwner: true,
        scriptText:
          "Soy el dueño del negocio y estoy orgulloso de nuestro trabajo.",
      });
      assert.equal(result.status, "fail");
    });
  });

  it("input schema is strict", () => {
    const parsed = genericAvatarNotOwnerCheckInputSchema.safeParse({
      mustDiscloseNotOwner: true,
      scriptText: "Hello",
      extra: true,
    });
    assert.equal(parsed.success, false);
  });
});

describe("buildGenericDisclosurePromptHint", () => {
  it("returns null when disclosure not required", async () => {
    await withServerOnlyStub(async () => {
      const { buildGenericDisclosurePromptHint } = await import(
        "./build-generic-disclosure-prompt-hint.ts"
      );
      assert.equal(buildGenericDisclosurePromptHint(false, "en"), null);
      assert.equal(buildGenericDisclosurePromptHint(false, "es"), null);
    });
  });

  it("returns EN/ES hints when disclosure required", async () => {
    await withServerOnlyStub(async () => {
      const { buildGenericDisclosurePromptHint } = await import(
        "./build-generic-disclosure-prompt-hint.ts"
      );
      const en = buildGenericDisclosurePromptHint(true, "en");
      const es = buildGenericDisclosurePromptHint(true, "es");
      assert.ok(en && en.length > 20);
      assert.ok(es && es.length > 20);
      assert.match(en, /AI presenter/i);
      assert.match(es, /presentador de IA/i);
    });
  });
});
