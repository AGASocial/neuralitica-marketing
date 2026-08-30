import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

import {
  QA_BLOCKING_CHECK_KEYS,
  QA_CHECK_KEYS,
  QA_LLM_CHECK_KEYS,
  QA_OVERRIDABLE_CHECK_KEYS,
  catalogSeverityForCheckKey,
  deriveQaReportStatus,
} from "../contracts/qa-report.ts";
import { QA_CHECK_SEVERITY } from "./check-classes.ts";
import { GENERIC_AVATAR_NOT_OWNER_CHECK_KEY } from "../contracts/qa.ts";

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

describe("check-catalog (US-10.1)", () => {
  it("freezes V1 keys and blocking/overridable partition", async () => {
    await withServerOnlyStub(async () => {
      const catalog = await import("./check-catalog.ts");
      assert.deepEqual([...catalog.QA_CHECK_KEYS], [...QA_CHECK_KEYS]);
      assert.deepEqual(
        [...catalog.QA_BLOCKING_CHECK_KEYS],
        ["own_avatar_consent", "generic_avatar_not_owner"],
      );
      assert.deepEqual(
        [...catalog.QA_OVERRIDABLE_CHECK_KEYS],
        [...QA_OVERRIDABLE_CHECK_KEYS],
      );
      assert.equal(
        catalog.GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
        GENERIC_AVATAR_NOT_OWNER_CHECK_KEY,
      );
      assert.equal(
        catalog.isBlockingCheckKey("own_avatar_consent"),
        true,
      );
      assert.equal(
        catalog.isBlockingCheckKey("cta_presence"),
        false,
      );
      assert.equal(catalog.isLlmCheckKey("tone"), true);
      assert.equal(catalog.isLlmCheckKey("cta_presence"), false);
    });
  });

  it("maps severity from catalog only", async () => {
    await withServerOnlyStub(async () => {
      const { severityForCheckKey, QA_CHECK_SEVERITY_BY_KEY } = await import(
        "./check-catalog.ts"
      );
      for (const key of QA_CHECK_KEYS) {
        assert.equal(
          severityForCheckKey(key),
          catalogSeverityForCheckKey(key),
        );
        assert.equal(
          QA_CHECK_SEVERITY_BY_KEY[key],
          catalogSeverityForCheckKey(key),
        );
      }
      assert.equal(severityForCheckKey("invented"), null);
      assert.equal(
        severityForCheckKey("generic_avatar_not_owner"),
        QA_CHECK_SEVERITY.blocking,
      );
      assert.equal(
        severityForCheckKey("dangerous_claims"),
        QA_CHECK_SEVERITY.overridable,
      );
    });
  });
});

describe("deterministic QA runners (US-10.1)", () => {
  it("own_avatar_consent skips when not own_avatar", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateOwnAvatarConsentCheck } = await import(
        "./checks/own-avatar-consent.ts"
      );
      const result = evaluateOwnAvatarConsentCheck({
        modalidad: "faceless",
        consentActive: false,
      });
      assert.deepEqual(result, {
        checkKey: "own_avatar_consent",
        status: "skipped",
        severity: "blocking",
      });
    });
  });

  it("own_avatar_consent fails when consent missing", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateOwnAvatarConsentCheck } = await import(
        "./checks/own-avatar-consent.ts"
      );
      const result = evaluateOwnAvatarConsentCheck({
        modalidad: "own_avatar",
        consentActive: false,
      });
      assert.equal(result.status, "fail");
      assert.equal(result.severity, "blocking");
      assert.equal(
        result.evidence?.messageKey,
        "qa.checks.ownAvatarConsent.failMissing",
      );
    });
  });

  it("own_avatar_consent passes when consent active", async () => {
    await withServerOnlyStub(async () => {
      const { evaluateOwnAvatarConsentCheck } = await import(
        "./checks/own-avatar-consent.ts"
      );
      const result = evaluateOwnAvatarConsentCheck({
        modalidad: "own_avatar",
        consentActive: true,
      });
      assert.deepEqual(result, {
        checkKey: "own_avatar_consent",
        status: "pass",
        severity: "blocking",
      });
    });
  });

  it("cta_presence resolves selected → first variant → script cta", async () => {
    await withServerOnlyStub(async () => {
      const { resolveCtaUnderTest, evaluateCtaPresenceCheck } = await import(
        "./checks/cta-presence.ts"
      );

      assert.equal(
        resolveCtaUnderTest({
          selectedCtaIndex: 1,
          ctaVariants: ["A", "B selected", "C"],
          scriptCta: "script",
        }),
        "B selected",
      );

      assert.equal(
        resolveCtaUnderTest({
          selectedCtaIndex: null,
          ctaVariants: ["", " first non-empty "],
          scriptCta: "script",
        }),
        "first non-empty",
      );

      assert.equal(
        resolveCtaUnderTest({
          selectedCtaIndex: null,
          ctaVariants: [],
          scriptCta: "  script cta  ",
        }),
        "script cta",
      );

      assert.equal(
        evaluateCtaPresenceCheck({
          selectedCtaIndex: null,
          ctaVariants: [],
          scriptCta: "",
        }).status,
        "fail",
      );
      assert.equal(
        evaluateCtaPresenceCheck({
          selectedCtaIndex: null,
          ctaVariants: [],
          scriptCta: "",
        }).severity,
        "overridable",
      );
      assert.equal(
        evaluateCtaPresenceCheck({
          selectedCtaIndex: 0,
          ctaVariants: ["Agenda hoy"],
          scriptCta: null,
        }).status,
        "pass",
      );
    });
  });

  it("runDeterministicQaChecks returns blocking generic_avatar fail", async () => {
    await withServerOnlyStub(async () => {
      const { runDeterministicQaChecks } = await import(
        "./run-deterministic-qa-checks.ts"
      );
      const checks = runDeterministicQaChecks({
        modalidad: "generic_avatar",
        consentActive: false,
        mustDiscloseNotOwner: true,
        ownerDisplayName: "Maria Lopez",
        scriptPackage: {
          hook: "Hi",
          body: "I am the owner of Lopez Plumbing.",
          cta: "Call now",
        },
        selectedCtaIndex: 0,
        ctaVariants: ["Call now"],
      });

      assert.equal(checks.length, 3);
      assert.equal(checks[0]?.checkKey, "own_avatar_consent");
      assert.equal(checks[0]?.status, "skipped");
      assert.equal(checks[1]?.checkKey, "generic_avatar_not_owner");
      assert.equal(checks[1]?.status, "fail");
      assert.equal(checks[1]?.severity, "blocking");
      assert.equal(checks[2]?.status, "pass");
      assert.equal(deriveQaReportStatus(checks), "blocked");
    });
  });
});

describe("mergeQaChecks (US-10.1)", () => {
  it("overwrites LLM severity from catalog and drops unknown keys", async () => {
    await withServerOnlyStub(async () => {
      const { mergeQaChecks, applyCatalogSeverityToLlmCheck } = await import(
        "./merge-qa-checks.ts"
      );

      const withBogus = applyCatalogSeverityToLlmCheck({
        checkKey: "dangerous_claims",
        status: "pass",
        // @ts-expect-error — model may smuggle severity
        severity: "blocking",
      });
      assert.equal(withBogus?.severity, "overridable");

      const merged = mergeQaChecks({
        deterministic: [
          {
            checkKey: "own_avatar_consent",
            status: "skipped",
            severity: "blocking",
          },
          {
            checkKey: "generic_avatar_not_owner",
            status: "pass",
            severity: "blocking",
          },
          {
            checkKey: "cta_presence",
            status: "pass",
            severity: "overridable",
          },
        ],
        llmChecks: [
          { checkKey: "dangerous_claims", status: "pass" },
          { checkKey: "tone", status: "fail" },
          { checkKey: "clarity", status: "pass" },
          { checkKey: "ai_disclosure", status: "pass" },
        ],
      });

      const tone = merged.find((c) => c.checkKey === "tone");
      assert.equal(tone?.status, "fail");
      assert.equal(tone?.severity, "overridable");
      assert.equal(deriveQaReportStatus(merged), "failed");
      assert.equal(
        merged.some((c) => c.checkKey === "invented_legal_bypass"),
        false,
      );
    });
  });

  it("omits LLM keys when llmChecks is null (never invent pass)", async () => {
    await withServerOnlyStub(async () => {
      const { mergeQaChecks } = await import("./merge-qa-checks.ts");
      const merged = mergeQaChecks({
        deterministic: [
          {
            checkKey: "own_avatar_consent",
            status: "skipped",
            severity: "blocking",
          },
          {
            checkKey: "generic_avatar_not_owner",
            status: "pass",
            severity: "blocking",
          },
          {
            checkKey: "cta_presence",
            status: "pass",
            severity: "overridable",
          },
        ],
        llmChecks: null,
      });
      assert.equal(merged.length, 3);
      for (const key of QA_LLM_CHECK_KEYS) {
        assert.equal(
          merged.some((c) => c.checkKey === key),
          false,
        );
      }
      // Deterministic all pass → derive would be passed, but orchestrator
      // must force failed when LLM omitted — merge itself does not invent LLM pass.
      assert.equal(deriveQaReportStatus(merged), "passed");
    });
  });

  it("server-skips ai_disclosure when not required", async () => {
    await withServerOnlyStub(async () => {
      const { mergeQaChecks } = await import("./merge-qa-checks.ts");
      const merged = mergeQaChecks({
        deterministic: [
          {
            checkKey: "own_avatar_consent",
            status: "skipped",
            severity: "blocking",
          },
          {
            checkKey: "generic_avatar_not_owner",
            status: "pass",
            severity: "blocking",
          },
          {
            checkKey: "cta_presence",
            status: "pass",
            severity: "overridable",
          },
        ],
        llmChecks: [
          { checkKey: "dangerous_claims", status: "pass" },
          { checkKey: "tone", status: "pass" },
          { checkKey: "clarity", status: "pass" },
        ],
        aiDisclosureSkipped: true,
      });
      const disclosure = merged.find((c) => c.checkKey === "ai_disclosure");
      assert.equal(disclosure?.status, "skipped");
      assert.equal(disclosure?.severity, "overridable");
      assert.equal(deriveQaReportStatus(merged), "passed");
    });
  });
});
