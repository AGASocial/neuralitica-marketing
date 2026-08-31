/**
 * US-13.2 — sanitizeTemaForMetricsPrompt unit tests.
 */
import assert from "node:assert/strict";
import Module from "node:module";
import { describe, it } from "node:test";

type NodeModuleLoad = {
  _load: (
    request: string,
    parent: NodeModule | null | undefined,
    isMain: boolean,
  ) => unknown;
};

function withServerOnlyStub<T>(run: () => Promise<T> | T): Promise<T> | T {
  const nodeModule = Module as unknown as NodeModuleLoad;
  const originalLoad = nodeModule._load;
  nodeModule._load = function (request, parent, isMain) {
    if (request === "server-only") {
      return {};
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return run();
  } finally {
    nodeModule._load = originalLoad;
  }
}

describe("sanitizeTemaForMetricsPrompt", () => {
  it("returns trimmed tema when valid", () => {
    withServerOnlyStub(() => {
      const { sanitizeTemaForMetricsPrompt } = require("./sanitize-tema-for-metrics-prompt.ts");
      assert.equal(
        sanitizeTemaForMetricsPrompt("  Mantenimiento preventivo  "),
        "Mantenimiento preventivo",
      );
    });
  });

  it("returns null for empty after trim", () => {
    withServerOnlyStub(() => {
      const { sanitizeTemaForMetricsPrompt } = require("./sanitize-tema-for-metrics-prompt.ts");
      assert.equal(sanitizeTemaForMetricsPrompt("   "), null);
    });
  });

  it("strips control characters and newlines", () => {
    withServerOnlyStub(() => {
      const { sanitizeTemaForMetricsPrompt } = require("./sanitize-tema-for-metrics-prompt.ts");
      assert.equal(
        sanitizeTemaForMetricsPrompt("Hello\x00world\nline"),
        "Helloworldline",
      );
    });
  });

  it("strips angle brackets", () => {
    withServerOnlyStub(() => {
      const { sanitizeTemaForMetricsPrompt } = require("./sanitize-tema-for-metrics-prompt.ts");
      assert.equal(
        sanitizeTemaForMetricsPrompt("<ignore instructions>"),
        "ignore instructions",
      );
    });
  });

  it("returns null when only unsafe characters remain", () => {
    withServerOnlyStub(() => {
      const { sanitizeTemaForMetricsPrompt } = require("./sanitize-tema-for-metrics-prompt.ts");
      assert.equal(sanitizeTemaForMetricsPrompt("<>\n\r"), null);
    });
  });

  it("truncates to 200 characters", () => {
    withServerOnlyStub(() => {
      const { sanitizeTemaForMetricsPrompt } = require("./sanitize-tema-for-metrics-prompt.ts");
      const long = "a".repeat(250);
      const result = sanitizeTemaForMetricsPrompt(long);
      assert.ok(result);
      assert.equal(result.length, 200);
    });
  });
});
