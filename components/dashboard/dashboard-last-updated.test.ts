import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("HoyFeedView hydration-safe times (KAN-104)", () => {
  it("formats timeline timestamps after mount via ClientLocalDateTime", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(join(here, "HoyFeedView.tsx"), "utf8");
    const page = readFileSync(
      join(here, "../../app/(app)/dashboard/page.tsx"),
      "utf8",
    );
    assert.match(view, /ClientLocalDateTime/);
    assert.match(view, /HoyFeedView/);
    assert.match(page, /HoyFeedView/);
    assert.doesNotMatch(view, /toLocaleTimeString/);
    assert.doesNotMatch(page, /formatLastUpdated\(/);
  });
});
