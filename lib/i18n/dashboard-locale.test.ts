import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

describe("dashboard owner locale copy (KAN-84.16)", () => {
  it("ES catalog translates the main dashboard card titles", () => {
    assert.equal(es.dashboard.title, "Panel");
    assert.equal(es.dashboard.interviewCard.title, "Entrevista inicial");
    assert.equal(es.dashboard.profileCard.title, "Ficha viva");
    assert.equal(
      es.dashboard.preferencesCard.title,
      "Preferencias de producción visual",
    );
    assert.equal(es.dashboard.readyToPublishCard.title, "Listo para publicar");
    assert.equal(es.dashboard.productionCard.title, "Estado de producción");

    assert.notEqual(es.dashboard.title, en.dashboard.title);
    assert.notEqual(
      es.dashboard.interviewCard.title,
      en.dashboard.interviewCard.title,
    );
    assert.notEqual(
      es.dashboard.profileCard.title,
      en.dashboard.profileCard.title,
    );
  });

  it("owner pages honor resolveRequestLocale (query + preferredLocale)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const owners = [
      "../../app/(app)/dashboard/page.tsx",
      "../../app/(app)/approvals/page.tsx",
      "../../app/(app)/ready-to-publish/page.tsx",
      "../../app/(app)/profile/page.tsx",
      "../../app/(app)/settings/preferences/page.tsx",
      "../../app/(app)/interview/page.tsx",
    ];
    for (const rel of owners) {
      const source = readFileSync(join(here, rel), "utf8");
      assert.match(
        source,
        /resolveRequestLocale/,
        `${rel} should use resolveRequestLocale`,
      );
      assert.doesNotMatch(
        source,
        /resolveLocale\(user/,
        `${rel} should not use resolveLocale(user…) alone`,
      );
    }
  });
});
