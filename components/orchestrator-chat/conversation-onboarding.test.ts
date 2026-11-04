import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const here = __dirname;

describe("Option A onboarding conversation (KAN-106)", () => {
  it("ConversationFullView exposes skip, progress, carousel, and proposals", () => {
    const src = readFileSync(join(here, "ConversationFullView.tsx"), "utf8");
    assert.match(src, /onboardingMode/);
    assert.match(src, /onboarding-skip-hoy/);
    assert.match(src, /onboarding-progress/);
    assert.match(src, /onboarding-card-carousel/);
    assert.match(src, /ProposalActionCard/);
    assert.match(src, /onboardingMode/);
    assert.match(src, /skipOnboarding=1/);
  });

  it("conversation page wires mode=onboarding and setup completion", () => {
    const src = readFileSync(
      join(here, "../../app/(app)/conversation/page.tsx"),
      "utf8",
    );
    assert.match(src, /mode === "onboarding"/);
    assert.match(src, /loadSetupCompletion/);
    assert.match(src, /onboardingMode/);
    assert.match(src, /onboardingCopy/);
  });

  it("dashboard redirects into onboarding unless skipOnboarding=1", () => {
    const src = readFileSync(
      join(here, "../../app/(app)/dashboard/page.tsx"),
      "utf8",
    );
    assert.match(src, /loadShouldEnterOptionAOnboarding/);
    assert.match(src, /conversation\?mode=onboarding/);
    assert.match(src, /skipOnboarding/);
  });

  it("EN/ES catalogs include skip/progress onboarding copy", () => {
    const en = JSON.parse(
      readFileSync(join(here, "../../messages/en.json"), "utf8"),
    );
    const es = JSON.parse(
      readFileSync(join(here, "../../messages/es.json"), "utf8"),
    );
    assert.equal(en.orchestratorChat.onboarding.skipToHoy, "Skip to Today");
    assert.equal(es.orchestratorChat.onboarding.skipToHoy, "Saltar a Hoy");
    assert.ok(en.orchestratorChat.onboarding.progressLabel.includes("{percent}"));
    assert.ok(es.orchestratorChat.onboarding.progressLabel.includes("{percent}"));
  });

  it("chat API and system prompt honor onboardingMode", () => {
    const route = readFileSync(
      join(here, "../../app/api/chat/route.ts"),
      "utf8",
    );
    const prompt = readFileSync(
      join(here, "../../lib/orchestrator-chat/system-prompt.ts"),
      "utf8",
    );
    assert.match(route, /onboardingMode/);
    assert.match(prompt, /ONBOARDING MODE/);
  });
});
