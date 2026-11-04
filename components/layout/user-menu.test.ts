import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("UserMenu mobile trigger", () => {
  it("exposes Menú de usuario / User menu and a reachable avatar trigger", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const menu = readFileSync(join(here, "UserMenu.tsx"), "utf8");
    const es = JSON.parse(
      readFileSync(join(here, "../../messages/es.json"), "utf8"),
    );
    const en = JSON.parse(
      readFileSync(join(here, "../../messages/en.json"), "utf8"),
    );

    assert.equal(es.header.userMenu.menuAriaLabel, "Menú de usuario");
    assert.equal(en.header.userMenu.menuAriaLabel, "User menu");
    assert.match(menu, /aria-label=\{copy\.menuAriaLabel\}/);
    assert.match(menu, /shrink-0/);
    assert.match(menu, /min-h-10/);
    assert.match(menu, /min-w-10/);
    assert.match(menu, /hidden min-w-0 truncate sm:inline/);
  });
});
