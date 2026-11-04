import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

describe("dashboard owner locale copy (KAN-84.16 / KAN-98)", () => {
  it("ES catalog translates owner home section titles", () => {
    assert.equal(es.dashboard.title, "Inicio");
    assert.equal(es.dashboard.nextAction.sectionTitle, "Qué hacer ahora");
    assert.equal(es.dashboard.thisWeek.title, "Esta semana");
    assert.equal(es.dashboard.campaignProgress.title, "Avance de campaña");
    assert.equal(
      es.dashboard.results.empty,
      "Conecta Instagram para ver resultados",
    );
    assert.equal(es.dashboard.atajos.title, "Atajos");
    assert.equal(es.dashboard.interviewCard.title, "Entrevista inicial");
    assert.equal(es.dashboard.profileCard.title, "Ficha viva");

    assert.notEqual(es.dashboard.title, en.dashboard.title);
    assert.notEqual(
      es.dashboard.nextAction.sectionTitle,
      en.dashboard.nextAction.sectionTitle,
    );
    assert.notEqual(es.dashboard.results.empty, en.dashboard.results.empty);
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
