import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("estimateFacelessPipelineCost", () => {
  it("sums b-roll estimate with TTS when voiceover is missing", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "estimate-faceless-pipeline-cost.ts"),
      "utf8",
    );
    assert.match(src, /previewBrollVideoJobsEstimate/);
    assert.match(src, /estimateTtsCostCentsFromTextLength/);
    assert.match(src, /findLatestVoiceoverAssetId/);
    assert.match(src, /brollCostCents \+ ttsCostCents/);
  });
});
