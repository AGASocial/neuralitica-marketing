/**
 * US-7.3 Phase B — BE security matrix (Cliente serializers, ledger SUM, budget estimates).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { approvalPackageDtoSchema } from "@/lib/contracts/approval";
import { operatorVideoJobStatusDtoSchema } from "@/lib/contracts/video-job";
import { reelScriptListItemSchema } from "@/lib/contracts/reel-script";
import { voiceoverSummaryDtoSchema } from "@/lib/contracts/tts-voiceover";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const CLIENTE_COST_KEYS = [
  "estimatedCostCents",
  "actualCostCents",
  "costStatus",
  "unavailableReasonKey",
  "cost",
  "weeklyCostSum",
  "estimated_cost_cents",
  "actual_cost_cents",
] as const;

describe("US-7.3 Phase B Cliente serializers (PB-S4)", () => {
  it("omits cost keys from Cliente approval / list / voiceover / status-only schemas", () => {
    const schemas = [
      approvalPackageDtoSchema,
      reelScriptListItemSchema,
      voiceoverSummaryDtoSchema,
      operatorVideoJobStatusDtoSchema,
    ];
    for (const schema of schemas) {
      const shape = schema.shape as Record<string, unknown>;
      for (const key of CLIENTE_COST_KEYS) {
        assert.equal(
          key in shape,
          false,
          `unexpected cost key ${key} on Cliente-reachable schema`,
        );
      }
    }
  });
});

describe("US-7.3 Phase B reporting queries (PB-S8)", () => {
  it("weekly and rollup helpers do not SUM neuramark_video_jobs.actual_cost_cents", () => {
    const files = [
      "lib/cost-policy/get-reel-cost-summary-for-week.ts",
      "lib/cost-policy/get-reel-cost-rollup-for-script.ts",
    ];
    for (const relative of files) {
      const src = readFileSync(path.join(repoRoot, relative), "utf8");
      assert.match(src, /neuramark_reel_spend_events/);
      assert.doesNotMatch(src, /neuramark_video_jobs/);
      assert.doesNotMatch(
        src,
        /SUM\s*\(\s*neuramark_video_jobs\.actual_cost_cents\s*\)/i,
      );
    }
  });
});

describe("US-7.3 Phase B budget helper (PB-S9)", () => {
  it("sumReelCumulativeCostCents still selects estimates only", () => {
    const src = readFileSync(
      path.join(repoRoot, "lib/cost-policy/sum-reel-cumulative-cost-cents.ts"),
      "utf8",
    );
    assert.match(src, /\.select\(\s*"estimated_cost_cents"\s*\)/);
    assert.doesNotMatch(src, /actual_cost_cents/);
  });
});
