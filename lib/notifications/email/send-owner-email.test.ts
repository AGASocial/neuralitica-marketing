import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  isOwnerEmailNotificationsEnabled,
  isRecipientAllowed,
  parseNotificationsAllowlist,
  resolveNotificationsFromEmail,
} from "@/lib/notifications/email/email-flags";

const original = {
  enabled: process.env.OWNER_EMAIL_NOTIFICATIONS_ENABLED,
  allowlist: process.env.NOTIFICATIONS_TEST_ALLOWLIST,
  from: process.env.NOTIFICATIONS_FROM_EMAIL,
};

afterEach(() => {
  if (original.enabled === undefined) {
    delete process.env.OWNER_EMAIL_NOTIFICATIONS_ENABLED;
  } else {
    process.env.OWNER_EMAIL_NOTIFICATIONS_ENABLED = original.enabled;
  }
  if (original.allowlist === undefined) {
    delete process.env.NOTIFICATIONS_TEST_ALLOWLIST;
  } else {
    process.env.NOTIFICATIONS_TEST_ALLOWLIST = original.allowlist;
  }
  if (original.from === undefined) {
    delete process.env.NOTIFICATIONS_FROM_EMAIL;
  } else {
    process.env.NOTIFICATIONS_FROM_EMAIL = original.from;
  }
});

describe("owner email notification flags", () => {
  it("defaults to disabled", () => {
    delete process.env.OWNER_EMAIL_NOTIFICATIONS_ENABLED;
    assert.equal(isOwnerEmailNotificationsEnabled(), false);
  });

  it("allowlist filters recipients when set", () => {
    process.env.NOTIFICATIONS_TEST_ALLOWLIST = "gaveho@gmail.com";
    assert.deepEqual(parseNotificationsAllowlist(), ["gaveho@gmail.com"]);
    assert.equal(isRecipientAllowed("gaveho@gmail.com"), true);
    assert.equal(isRecipientAllowed("other@example.com"), false);
  });

  it("resolves from address", () => {
    delete process.env.NOTIFICATIONS_FROM_EMAIL;
    assert.match(resolveNotificationsFromEmail(), /notification\.aga\.social/);
    process.env.NOTIFICATIONS_FROM_EMAIL = "Neuralitica <avisos@neuraliti.ca>";
    assert.equal(
      resolveNotificationsFromEmail(),
      "Neuralitica <avisos@neuraliti.ca>",
    );
  });
});
