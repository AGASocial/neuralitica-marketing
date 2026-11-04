import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("loadShouldEnterOptionAOnboarding (KAN-106)", () => {
  it("combines setup completion with approved plan and reel checks", () => {
    const src = readFileSync(
      join(__dirname, "load-option-a-onboarding-gate.ts"),
      "utf8",
    );
    assert.match(src, /shouldEnterOptionAOnboarding/);
    assert.match(src, /loadSetupCompletion/);
    assert.match(src, /loadLatestStrategyRowWithApproval/);
    assert.match(src, /listApprovedApprovalsForClient/);
    assert.match(src, /role !== "client"/);
  });
});
