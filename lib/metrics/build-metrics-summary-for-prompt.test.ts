/**
 * US-13.2 — buildMetricsSummaryForPrompt unit tests.
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

function withServerOnlyStub<T>(run: () => T): T {
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

const INSIGHTS = {
  available: true as const,
  windowStart: "2026-08-10",
  windowEnd: "2026-09-07",
  topThemes: [
    {
      rank: 1 as const,
      tema: "Mantenimiento preventivo",
      reelCount: 2,
      views: 1500,
      likes: 120,
      comments: 15,
      saves: 40,
      dms: 3,
      engagementScore: 1678,
    },
    {
      rank: 2 as const,
      tema: "<>\n\r",
      reelCount: 1,
      views: 100,
      likes: 5,
      comments: 0,
      saves: 2,
      dms: 0,
      engagementScore: 107,
    },
  ],
};

describe("buildMetricsSummaryForPrompt", () => {
  it("returns null when insights is null", () => {
    withServerOnlyStub(() => {
      const { buildMetricsSummaryForPrompt } = require("./build-metrics-summary-for-prompt.ts");
      assert.equal(buildMetricsSummaryForPrompt(null), null);
    });
  });

  it("maps integer fields and includes sanitized tema", () => {
    withServerOnlyStub(() => {
      const { buildMetricsSummaryForPrompt } = require("./build-metrics-summary-for-prompt.ts");
      const summary = buildMetricsSummaryForPrompt(INSIGHTS);
      assert.ok(summary);
      assert.equal(summary.length, 2);
      assert.equal(summary[0]!.tema, "Mantenimiento preventivo");
      assert.equal(summary[0]!.engagementScore, 1678);
      assert.equal(typeof summary[0]!.views, "number");
    });
  });

  it("omits tema key when sanitize fails (rank-only fallback)", () => {
    withServerOnlyStub(() => {
      const { buildMetricsSummaryForPrompt } = require("./build-metrics-summary-for-prompt.ts");
      const summary = buildMetricsSummaryForPrompt(INSIGHTS);
      assert.ok(summary);
      assert.equal("tema" in summary[1]!, false);
      assert.equal(summary[1]!.rank, 2);
      assert.equal(summary[1]!.engagementScore, 107);
    });
  });
});
