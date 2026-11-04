import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("ClientLocalDateTime hydration safety", () => {
  it("formats only after mount and suppresses hydration warnings", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "ClientLocalDateTime.tsx"), "utf8");
    assert.match(src, /useEffect/);
    assert.match(src, /useState\(placeholder\)/);
    assert.match(src, /suppressHydrationWarning/);
    assert.match(src, /Intl\.DateTimeFormat/);
    assert.doesNotMatch(
      src,
      /useState\(\(\)\s*=>\s*format|useState\(formatLocalDateTime/,
    );
  });

  it("dashboard and mis-videos use the after-mount helper", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const dashboard = readFileSync(
      join(here, "../dashboard/DashboardView.tsx"),
      "utf8",
    );
    const hub = readFileSync(
      join(here, "../ready-to-publish/MyVideosHubView.tsx"),
      "utf8",
    );
    assert.match(dashboard, /ClientLocalDateTime|useEffect/);
    assert.match(hub, /ClientLocalDateTime/);
    assert.doesNotMatch(hub, /function formatWhen/);
  });
});
