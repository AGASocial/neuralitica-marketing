import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isPublicPath } from "./public-routes";

describe("public routes — cron exemption", () => {
  it("exempts only the automation reminders cron", () => {
    assert.equal(isPublicPath("/api/cron/automation-reminders"), true);
    assert.equal(isPublicPath("/api/cron/automation-reminders/"), true);
    assert.equal(isPublicPath("/api/cron/video-jobs"), false);
    assert.equal(isPublicPath("/api/cron/weekly-cycle"), false);
    assert.equal(isPublicPath("/api/cron"), false);
  });
});
