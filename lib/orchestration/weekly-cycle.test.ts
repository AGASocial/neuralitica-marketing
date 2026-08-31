import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("US-15.1 Phase A orchestration", () => {
  it("uses the shared authoritative ISO Monday normalizer and schema", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/orchestration/resolve-week-start-for-cycle.ts"), "utf8");
    assert.match(source, /normalizeToIsoMonday\(referenceDate\)/);
    assert.match(source, /trendWeekStartSchema\.parse/);
  });

  it("keeps the per-client runner structurally free of spend imports", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/orchestration/run-weekly-cycle-for-client.ts"), "utf8");
    for (const forbidden of ["lib/content-strategy", "lib/reel-scripts", "lib/reel-captions", "lib/assembly", "lib/qa", "lib/providers", "lib/agents", "lib/cost-policy"]) {
      assert.equal(source.includes(forbidden), false, `forbidden spend import: ${forbidden}`);
    }
    assert.match(source, /params\.dryRun !== true/);
  });

  it("keeps all server orchestration modules server-only", () => {
    for (const file of [
      "verify-cron-secret.ts", "find-forbidden-weekly-cycle-cron-keys.ts",
      "list-eligible-clients-for-weekly-cycle.ts", "acquire-weekly-cycle-run.ts",
      "plan-weekly-cycle-steps.ts", "persist-weekly-cycle-run-plan.ts",
      "run-weekly-cycle-for-client.ts", "run-weekly-cycle-batch.ts",
    ]) {
      const source = readFileSync(path.join(process.cwd(), "lib/orchestration", file), "utf8");
      assert.match(source, /^import "server-only";/);
    }
  });
});
