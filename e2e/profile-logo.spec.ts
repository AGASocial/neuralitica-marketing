import { expect, test } from "@playwright/test";
import path from "node:path";

import { injectDevFallbackGateCookie } from "./helpers/auth";
import { seedCompletedProfile } from "./helpers/interview-db";

const LOGO_PNG = path.join(process.cwd(), "e2e/fixtures/logo.png");

test("client logo upload succeeds and shows a preview", async ({ page }) => {
  await seedCompletedProfile();
  await injectDevFallbackGateCookie(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Living profile" })).toBeVisible();
  await expect(page.getByText("No logo uploaded yet.")).toBeVisible();

  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload logo" }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles(LOGO_PNG);

  await expect(page.getByRole("img", { name: "Business logo preview" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText("Something went wrong. Please try again later."),
  ).toHaveCount(0);
});
