import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOwnerHomeNextAction,
  computeOwnerHomeCampaignProgress,
  computeOwnerHomeTrafficLight,
  computeOwnerHomeWeekCounts,
  ownerHomeInsightsAvailable,
  resolveOwnerHomeNextStepKey,
} from "@/lib/dashboard/compute-owner-home-snapshot";
import { ownerHomeDashboardDtoSchema } from "@/lib/contracts/owner-home-dashboard";

describe("compute-owner-home-snapshot (KAN-98)", () => {
  it("prioritizes interview before plan", () => {
    assert.equal(
      resolveOwnerHomeNextStepKey({
        interviewDone: false,
        planDone: false,
        scriptsDone: false,
        videosDone: false,
        approveDone: false,
        readyDone: false,
      }),
      "interview",
    );
  });

  it("routes approve step to /approvals href", () => {
    const action = buildOwnerHomeNextAction("approve");
    assert.equal(action.ctaKind, "href");
    assert.equal(action.href, "/approvals");
  });

  it("opens chat for plan/scripts/videos", () => {
    assert.equal(buildOwnerHomeNextAction("plan").ctaKind, "open_chat");
    assert.equal(buildOwnerHomeNextAction("scripts").ctaKind, "open_chat");
    assert.equal(buildOwnerHomeNextAction("videos").ctaKind, "open_chat");
  });

  it("maps week counts and traffic light for waiting OK", () => {
    const counts = computeOwnerHomeWeekCounts({
      scheduled: 2,
      published: 1,
      waitingForOk: 3,
      inProduction: 0,
    });
    assert.deepEqual(counts, {
      scheduled: 2,
      published: 1,
      waitingForOk: 3,
      inProduction: 0,
    });
    assert.equal(computeOwnerHomeTrafficLight(counts), "yellow");
  });

  it("caps campaign progress at total slots", () => {
    const progress = computeOwnerHomeCampaignProgress({
      slotTotal: 3,
      completed: 9,
      hasPlan: true,
    });
    assert.deepEqual(progress, { completed: 3, total: 3, hasPlan: true });
  });

  it("reports Instagram insights unavailable", () => {
    assert.equal(ownerHomeInsightsAvailable(), false);
  });

  it("parses a full owner home DTO with empty results", () => {
    const parsed = ownerHomeDashboardDtoSchema.parse({
      weekStart: "2026-11-02",
      lastUpdatedAt: "2026-11-04T12:00:00.000Z",
      nextAction: buildOwnerHomeNextAction("interview"),
      weekCounts: computeOwnerHomeWeekCounts({
        scheduled: 0,
        published: 0,
        waitingForOk: 0,
        inProduction: 0,
      }),
      trafficLight: "neutral",
      campaignProgress: { completed: 0, total: 0, hasPlan: false },
      results: { insightsAvailable: false },
      recentVideos: [],
      atajos: [
        { id: "interview", href: "/interview" },
        { id: "profile", href: "/profile" },
        { id: "preferences", href: "/settings/preferences" },
        { id: "approvals", href: "/approvals" },
        { id: "readyToPublish", href: "/ready-to-publish" },
      ],
    });
    assert.equal(parsed.results.insightsAvailable, false);
  });
});
