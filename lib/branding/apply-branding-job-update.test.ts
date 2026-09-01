/**
 * US-15.1 — weekly-cycle resume wiring from branding terminal status.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("applyBrandingJobUpdate — weekly-cycle resume wiring", () => {
  it("calls maybeResumeWeeklyCycleFromJob on terminal completed and failed", () => {
    const src = readFileSync(path.join(__dirname, "apply-branding-job-update.ts"), "utf8");
    assert.match(src, /maybeResumeWeeklyCycleFromJob\(\{ jobKind: "branding", jobId: job\.id \}\)/);
    assert.match(src, /nextStatus === "completed" \|\| nextStatus === "failed"/);
    assert.match(src, /onBrandingCompleted\(\{/);
  });
});
