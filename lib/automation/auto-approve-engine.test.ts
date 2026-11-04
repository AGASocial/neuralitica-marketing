import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runAutoApproveEngine,
  type AutoApproveEngineDeps,
  type AutoApproveItemFacts,
} from "@/lib/automation/auto-approve-engine";
import { resolveAutoApproveRule } from "@/lib/automation/auto-approve-rules";
import {
  defaultAutomationSettings,
  type AutomationSettings,
} from "@/lib/contracts/automation-settings";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const APPROVAL = "22222222-2222-4222-8222-222222222222";
const base = defaultAutomationSettings(CLIENT);

function facts(over: Partial<AutoApproveItemFacts> = {}): AutoApproveItemFacts {
  return {
    approvalId: APPROVAL,
    clientId: CLIENT,
    status: "pending_client",
    assembledReelId: "r1",
    contentType: "faceless",
    title: "Video A",
    renderComplete: true,
    qaGateReady: true,
    itemCostCents: 50,
    weeklySpendCents: 0,
    ...over,
  };
}

function harness(settings: AutomationSettings, f: AutoApproveItemFacts | null) {
  const calls = { approve: 0, notify: 0, events: [] as string[] };
  const deps: AutoApproveEngineDeps = {
    loadSettings: async () => settings,
    loadFacts: async () => f,
    approve: async () => {
      calls.approve += 1;
      return { ok: true };
    },
    recordEvent: async (e) => {
      calls.events.push(`${e.kind}:${String(e.payload.reason ?? "")}`);
    },
    notifyApproved: async () => {
      calls.notify += 1;
    },
  };
  return { deps, calls };
}

const pilot: AutomationSettings = {
  ...base,
  preset: "auto_pilot",
  maxAutoApproveCostCents: 100,
  weeklySpendCapCents: 500,
};

describe("resolveAutoApproveRule", () => {
  it("custom honors per-type rules", () => {
    const settings: AutomationSettings = {
      ...base,
      preset: "custom",
      contentTypeRules: { faceless: "auto", own_avatar: "review" },
    };
    assert.equal(
      resolveAutoApproveRule({ settings, contentType: "faceless", itemCostCents: 1, weeklySpendCents: 0 }).reason,
      "eligible",
    );
    assert.equal(
      resolveAutoApproveRule({ settings, contentType: "own_avatar", itemCostCents: 1, weeklySpendCents: 0 }).reason,
      "custom_rule_review",
    );
    assert.equal(
      resolveAutoApproveRule({ settings, contentType: null, itemCostCents: 1, weeklySpendCents: 0 }).reason,
      "content_type_unknown",
    );
  });

  it("caps", () => {
    assert.equal(
      resolveAutoApproveRule({ settings: pilot, itemCostCents: null, weeklySpendCents: 0 }).reason,
      "item_cost_unknown",
    );
    assert.equal(
      resolveAutoApproveRule({ settings: pilot, itemCostCents: 101, weeklySpendCents: 0 }).reason,
      "item_cost_over_cap",
    );
    assert.equal(
      resolveAutoApproveRule({ settings: pilot, itemCostCents: 50, weeklySpendCents: 460 }).reason,
      "weekly_cap_exceeded",
    );
  });
});

describe("runAutoApproveEngine", () => {
  it("review_all never approves", async () => {
    const { deps, calls } = harness(base, facts());
    const out = await runAutoApproveEngine({ approvalId: APPROVAL, clientId: CLIENT, dryRun: false, deps, killSwitch: false });
    assert.equal(out.decision, "notify");
    assert.equal(calls.approve, 0);
  });

  it("skips when approving would start a paid render", async () => {
    const { deps, calls } = harness(pilot, facts({ renderComplete: false }));
    const out = await runAutoApproveEngine({ approvalId: APPROVAL, clientId: CLIENT, dryRun: false, deps, killSwitch: false });
    assert.deepEqual(out, { decision: "notify", reason: "would_start_paid_render", dryRun: false });
    assert.equal(calls.approve, 0);
    assert.ok(calls.events.some((e) => e.startsWith("auto_approve_skipped:would_start_paid_render")));
  });

  it("skips when QA gate not ready", async () => {
    const { deps, calls } = harness(pilot, facts({ qaGateReady: false }));
    const out = await runAutoApproveEngine({ approvalId: APPROVAL, clientId: CLIENT, dryRun: false, deps, killSwitch: false });
    assert.equal(out.decision, "notify");
    assert.equal(calls.approve, 0);
  });

  it("kill switch blocks approval", async () => {
    const { deps, calls } = harness(pilot, facts());
    const out = await runAutoApproveEngine({ approvalId: APPROVAL, clientId: CLIENT, dryRun: false, deps, killSwitch: true });
    assert.equal(out.decision, "notify");
    assert.equal(calls.approve, 0);
  });

  it("dry run records but does not approve", async () => {
    const { deps, calls } = harness(pilot, facts());
    const out = await runAutoApproveEngine({ approvalId: APPROVAL, clientId: CLIENT, dryRun: true, deps, killSwitch: false });
    assert.equal(out.decision, "would_auto_approve");
    assert.equal(calls.approve, 0);
    assert.equal(calls.notify, 0);
    assert.ok(calls.events.some((e) => e.startsWith("would_auto_approve")));
  });

  it("live approves, logs and notifies", async () => {
    const { deps, calls } = harness(pilot, facts());
    const out = await runAutoApproveEngine({ approvalId: APPROVAL, clientId: CLIENT, dryRun: false, deps, killSwitch: false });
    assert.equal(out.decision, "auto_approved");
    assert.equal(calls.approve, 1);
    assert.equal(calls.notify, 1);
    assert.ok(calls.events.some((e) => e.startsWith("auto_approved")));
  });

  it("not pending → no approval", async () => {
    const { deps, calls } = harness(pilot, facts({ status: "approved" }));
    const out = await runAutoApproveEngine({ approvalId: APPROVAL, clientId: CLIENT, dryRun: false, deps, killSwitch: false });
    assert.equal(out.decision, "notify");
    assert.equal(calls.approve, 0);
  });
});
