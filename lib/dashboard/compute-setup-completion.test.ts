import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  computeSetupCompletion,
  isInstagramConnectedInProduct,
  shouldEnterOptionAOnboarding,
  shouldShowSetupCompletionOnHome,
} from "@/lib/dashboard/compute-setup-completion";

describe("computeSetupCompletion (KAN-99)", () => {
  it("excludes optional presenter from percent", () => {
    const result = computeSetupCompletion({
      businessProfileDone: true,
      interviewDone: true,
      visualPreferencesDone: true,
      instagramConnected: true,
      planApproved: true,
      presenterDone: false,
    });
    assert.equal(result.percentComplete, 100);
    assert.equal(result.requiredDone, 5);
    assert.equal(result.requiredTotal, 5);
    const presenter = result.steps.find((s) => s.id === "presenter_avatar");
    assert.equal(presenter?.required, false);
    assert.equal(presenter?.done, false);
    assert.equal(shouldShowSetupCompletionOnHome(result), false);
  });

  it("keeps Instagram incomplete when not connected", () => {
    const result = computeSetupCompletion({
      businessProfileDone: true,
      interviewDone: true,
      visualPreferencesDone: true,
      instagramConnected: false,
      planApproved: true,
      presenterDone: true,
    });
    assert.equal(result.percentComplete, 80);
    assert.equal(
      result.steps.find((s) => s.id === "instagram_connected")?.done,
      false,
    );
    assert.equal(shouldShowSetupCompletionOnHome(result), true);
  });

  it("reports Instagram connect unavailable in product", () => {
    assert.equal(isInstagramConnectedInProduct(), false);
  });

  it("starts at 0 when nothing done", () => {
    const result = computeSetupCompletion({
      businessProfileDone: false,
      interviewDone: false,
      visualPreferencesDone: false,
      instagramConnected: false,
      planApproved: false,
      presenterDone: false,
    });
    assert.equal(result.percentComplete, 0);
    assert.equal(result.requiredDone, 0);
  });
});

describe("shouldEnterOptionAOnboarding (KAN-106)", () => {
  it("enters when incomplete setup and no approved content", () => {
    assert.equal(
      shouldEnterOptionAOnboarding({
        role: "client",
        percentComplete: 40,
        hasApprovedPlan: false,
        hasApprovedReel: false,
      }),
      true,
    );
  });

  it("stays on Hoy when 80% setup but approved plan", () => {
    assert.equal(
      shouldEnterOptionAOnboarding({
        role: "client",
        percentComplete: 80,
        hasApprovedPlan: true,
        hasApprovedReel: false,
      }),
      false,
    );
  });

  it("stays on Hoy when approved reel exists", () => {
    assert.equal(
      shouldEnterOptionAOnboarding({
        role: "client",
        percentComplete: 40,
        hasApprovedPlan: false,
        hasApprovedReel: true,
      }),
      false,
    );
  });

  it("never redirects operators", () => {
    assert.equal(
      shouldEnterOptionAOnboarding({
        role: "operator",
        percentComplete: 0,
        hasApprovedPlan: false,
        hasApprovedReel: false,
      }),
      false,
    );
  });
});
