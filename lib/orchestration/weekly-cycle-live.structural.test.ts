import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const ORCHESTRATION_DIR = path.join(process.cwd(), "lib/orchestration");
const CONTENT_STRATEGY_DIR = path.join(process.cwd(), "lib/content-strategy");

/** CONTRACT.md § "Approval and publish boundary": System/Operator weekly
 * cycle never sets Cliente approval and imports no Instagram container,
 * publish-now, schedule-publish or generic publish helper. */
const FORBIDDEN_PUBLISH_TOKENS = [
  "instagram",
  "graph-api",
  "graph.facebook",
  "publish-now",
  "schedule-publish",
  "createContainer",
  "publishReel",
  "publishMediaContainer",
  "lib/instagram",
];

function listPhaseBOrchestrationFiles(): string[] {
  return readdirSync(ORCHESTRATION_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => path.join(ORCHESTRATION_DIR, entry.name));
}

function listActionFiles(): string[] {
  const dir = path.join(ORCHESTRATION_DIR, "actions");
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts"))
    .map((entry) => path.join(dir, entry.name));
}

const PHASE_B_FILES = [
  "auto-approve-weekly-cycle-strategy.ts",
  "advance-weekly-cycle-slot.ts",
  "dispatch-weekly-cycle-outbox.ts",
  "ensure-approval-package-for-system-cycle.ts",
  "load-operator-weekly-cycle-runs.ts",
  "reconcile-weekly-cycle-run.ts",
  "resume-weekly-cycle-from-job.ts",
  "resume-weekly-cycle-run.ts",
  "run-weekly-cycle-live.ts",
  "start-weekly-cycle-live-cas.ts",
  "weekly-cycle-idempotency-key.ts",
  "weekly-cycle-live-env.ts",
  "weekly-cycle-live-types.ts",
  "weekly-cycle-outbox.ts",
  "weekly-cycle-step-runs.ts",
  "weekly-cycle-trusted-steps.ts",
  "run-weekly-cycle-batch.ts",
];

describe("US-15.1 Phase B — structural no-publish scan (CONTRACT § Approval and publish boundary)", () => {
  it("no Phase B orchestration module imports or names an Instagram publish surface", () => {
    for (const file of listPhaseBOrchestrationFiles()) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_PUBLISH_TOKENS) {
        assert.equal(
          source.toLowerCase().includes(forbidden.toLowerCase()),
          false,
          `${path.basename(file)} must not reference publish surface "${forbidden}"`,
        );
      }
    }
  });

  it("no Phase B Server Action imports or names an Instagram publish surface", () => {
    for (const file of listActionFiles()) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of FORBIDDEN_PUBLISH_TOKENS) {
        assert.equal(
          source.toLowerCase().includes(forbidden.toLowerCase()),
          false,
          `${path.basename(file)} must not reference publish surface "${forbidden}"`,
        );
      }
    }
  });

  it("the terminal system step only ever ensures a pending_client approval row, never a Cliente-approval write", () => {
    const source = readFileSync(path.join(ORCHESTRATION_DIR, "ensure-approval-package-for-system-cycle.ts"), "utf8");
    assert.equal(source.includes("status: \"approved\""), false);
    assert.equal(source.includes("'approved'"), false);
    assert.match(source, /insertPendingApproval/);
  });

  it("all listed Phase B orchestration modules exist and remain server-only", () => {
    for (const file of PHASE_B_FILES) {
      const source = readFileSync(path.join(ORCHESTRATION_DIR, file), "utf8");
      assert.match(source, /^import "server-only";/, `${file} must start with server-only`);
    }
  });

  it("all Phase B Server Actions declare \"use server\" and never import an Instagram publish helper", () => {
    for (const file of listActionFiles()) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /^"use server";/, `${path.basename(file)} must declare "use server"`);
    }
  });

  it("the System auto-approval CAS is a distinct file from the Operator approval path and neither imports the other", () => {
    const casSource = readFileSync(path.join(CONTENT_STRATEGY_DIR, "approve-strategy-for-system-cycle-cas.ts"), "utf8");
    const operatorSource = readFileSync(path.join(CONTENT_STRATEGY_DIR, "approve-strategy-row.ts"), "utf8");
    assert.equal(/from ["']\.\/approve-strategy-row["']/.test(casSource), false, "CAS file must not import the Operator approval file");
    assert.equal(/from ["']\.\/approve-strategy-for-system-cycle-cas["']/.test(operatorSource), false, "Operator approval file must not import the CAS file");
    assert.match(casSource, /approved_by_actor:\s*"system"/);
    assert.match(operatorSource, /approved_by_actor:\s*"operator"/);
  });
});
