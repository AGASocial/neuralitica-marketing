import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("maybeAdvanceFacelessAssemblyAfterBroll", () => {
  it("gates on completed b-roll + voiceover then creates assembly", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      join(here, "maybe-advance-faceless-assembly-after-broll.ts"),
      "utf8",
    );
    assert.match(src, /findLatestVoiceoverAssetId/);
    assert.match(src, /createAssemblyJobForClientTrusted/);
    assert.match(src, /broll_in_flight/);
    assert.match(src, /missing_voiceover/);
    assert.match(src, /invokedBy:\s*"system"/);
  });
});
