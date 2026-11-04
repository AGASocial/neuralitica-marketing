import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOCALE_COOKIE_NAME,
  parseLocaleCookieValue,
} from "./locale-cookie";

describe("locale cookie + resolveLocale default", () => {
  it("uses neuramark_locale cookie name and parses en|es only", () => {
    assert.equal(LOCALE_COOKIE_NAME, "neuramark_locale");
    assert.equal(parseLocaleCookieValue("es"), "es");
    assert.equal(parseLocaleCookieValue("en"), "en");
    assert.equal(parseLocaleCookieValue("fr"), null);
    assert.equal(parseLocaleCookieValue(null), null);
  });

  it("resolveLocale defaults to Spanish", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "get-translations.ts"), "utf8");
    assert.match(src, /fallback: Locale = "es"/);
  });

  it("resolveRequestLocale reads cookie after query header", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "resolve-request-locale.ts"), "utf8");
    assert.match(src, /LOCALE_COOKIE_NAME/);
    assert.match(src, /parseLocaleCookieValue/);
    assert.match(src, /LOCALE_HEADER/);
  });

  it("LoginForm does not append locale query on redirect", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const login = readFileSync(
      join(here, "../../components/auth/LoginForm.tsx"),
      "utf8",
    );
    assert.doesNotMatch(login, /withLocale/);
    assert.match(login, /setLocalePreference/);
    assert.match(login, /router\.push\(result\.redirectTo\)/);
  });

  it("UserMenu and settings route exist", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const header = readFileSync(
      join(here, "../../components/layout/AppHeader.tsx"),
      "utf8",
    );
    const menu = readFileSync(
      join(here, "../../components/layout/UserMenu.tsx"),
      "utf8",
    );
    const settings = readFileSync(
      join(here, "../../app/(app)/settings/page.tsx"),
      "utf8",
    );
    assert.match(header, /UserMenu/);
    assert.doesNotMatch(header, /signedInAs/);
    assert.match(menu, /DropdownMenuRadioItem/);
    assert.match(menu, /setLocalePreference/);
    assert.match(menu, /\/settings/);
    assert.match(settings, /settings\/preferences/);
  });
});
