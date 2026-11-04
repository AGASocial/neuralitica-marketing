import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { shouldAutoApproveCandidate } from "@/lib/automation/auto-approve-rules";
import {
  defaultAutomationSettings,
  type AutomationSettings,
} from "@/lib/contracts/automation-settings";

describe("shouldAutoApproveCandidate", () => {
  const base = defaultAutomationSettings(
    "11111111-1111-4111-8111-111111111111",
  );

  it("never auto-approves review_all", () => {
    assert.equal(
      shouldAutoApproveCandidate({
        settings: base,
        itemCostCents: 10,
        weeklySpendCents: 0,
      }),
      false,
    );
  });

  it("auto_pilot within caps is eligible", () => {
    const settings: AutomationSettings = {
      ...base,
      preset: "auto_pilot",
      maxAutoApproveCostCents: 100,
      weeklySpendCapCents: 500,
    };
    assert.equal(
      shouldAutoApproveCandidate({
        settings,
        itemCostCents: 50,
        weeklySpendCents: 100,
      }),
      true,
    );
  });

  it("rejects when item over max", () => {
    const settings: AutomationSettings = {
      ...base,
      preset: "auto_pilot",
      maxAutoApproveCostCents: 40,
    };
    assert.equal(
      shouldAutoApproveCandidate({
        settings,
        itemCostCents: 50,
        weeklySpendCents: 0,
      }),
      false,
    );
  });

  it("custom preset without an auto rule is not auto", () => {
    const settings: AutomationSettings = {
      ...base,
      preset: "custom",
      maxAutoApproveCostCents: 1000,
    };
    assert.equal(
      shouldAutoApproveCandidate({
        settings,
        itemCostCents: 10,
        weeklySpendCents: 0,
      }),
      false,
    );
  });
});

describe("F0 automation guards", () => {
  it("evaluate-pending and reminders never import Instagram publish", () => {
    const evaluate = readFileSync(
      join(process.cwd(), "lib/automation/evaluate-pending.ts"),
      "utf8",
    );
    const reminders = readFileSync(
      join(process.cwd(), "lib/automation/run-reminders.ts"),
      "utf8",
    );
    assert.doesNotMatch(evaluate, /instagram|graph\.facebook|publishReel/i);
    assert.doesNotMatch(reminders, /instagram|graph\.facebook|publishReel/i);
    assert.doesNotMatch(evaluate, /WEEKLY_CYCLE_LIVE/);
    assert.doesNotMatch(reminders, /WEEKLY_CYCLE_LIVE/);
    const engine = readFileSync(
      join(process.cwd(), "lib/automation/auto-approve-engine.ts"),
      "utf8",
    );
    const deps = readFileSync(
      join(process.cwd(), "lib/automation/auto-approve-deps.ts"),
      "utf8",
    );
    for (const src of [engine, deps]) {
      assert.doesNotMatch(src, /graph\.facebook|publishReel|WEEKLY_CYCLE_LIVE/i);
      assert.doesNotMatch(src, /createVideoJob|startRender|heygen|kling/i);
    }
  });

  it("cron route uses CRON_SECRET verifier", () => {
    const handler = readFileSync(
      join(process.cwd(), "lib/automation/handle-automation-reminders-cron.ts"),
      "utf8",
    );
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    assert.match(handler, /verifyCronSecret/);
    assert.match(vercel, /automation-reminders/);
    assert.match(vercel, /0 \* \* \* \*/);
  });
});
