import { expect, test, type Page } from "@playwright/test";

import { injectDevFallbackGateCookie } from "./helpers/auth";
import {
  getInterviewStatus,
  getProfileExists,
  resetInterviewForE2EUser,
  seedInterviewAtRestrictions,
} from "./helpers/interview-db";
import {
  addListItem,
  clickNext,
  clickSubmit,
  completeSteps1To6,
  expectLivingProfile,
  expectStep,
  fillTextStep,
  openInterview,
} from "./helpers/interview-wizard";

test.describe.configure({ mode: "serial" });

async function openAuthedInterview(page: Page): Promise<void> {
  await injectDevFallbackGateCookie(page);
  await openInterview(page);
}

test("schema required for step 7 submit is present", async () => {
  const { createE2ESupabase } = await import("./helpers/interview-db");
  const supabase = createE2ESupabase();
  const { error } = await supabase
    .from("neuramark_business_profiles")
    .select("id")
    .limit(1);
  expect(error, error?.message).toBeNull();
});

test("empty required list on step 1 does not advance", async ({ page }) => {
  await resetInterviewForE2EUser();
  await openAuthedInterview(page);
  await expectStep(page, 1);
  await clickNext(page);
  await expect(page.getByText("Add at least one item.")).toBeVisible();
  await expectStep(page, 1);
});

test("empty required text on step 2 does not advance", async ({ page }) => {
  await resetInterviewForE2EUser();
  await openAuthedInterview(page);
  await addListItem(page, "services", "E2E emergency plumbing");
  await clickNext(page);
  await expectStep(page, 2);
  await clickNext(page);
  await expect(page.getByText("Enter a description.")).toBeVisible();
  await expectStep(page, 2);
});

test("save and continue later resumes at the high-water step", async ({
  page,
}) => {
  await resetInterviewForE2EUser();
  await openAuthedInterview(page);
  await addListItem(page, "services", "E2E emergency plumbing");
  await clickNext(page);
  await expectStep(page, 2);
  await fillTextStep(page, "zone", "E2E service area covering Austin");
  await page.getByRole("button", { name: "Save & continue later" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const status = await getInterviewStatus();
  expect(status.status).toBe("draft");
  expect(status.currentStep).toBe("tone");

  await openInterview(page);
  await expectStep(page, 3);
  await expect(
    page.getByText("How should your business sound to customers?"),
  ).toBeVisible();
});

test("full walkthrough submits empty restrictions and opens the living profile", async ({
  page,
}) => {
  await resetInterviewForE2EUser();
  await openAuthedInterview(page);
  await completeSteps1To6(page);
  await expect(
    page.getByText("Optional. Leave empty if none. Maximum 20."),
  ).toBeVisible();
  await clickSubmit(page);
  await expectLivingProfile(page);

  const status = await getInterviewStatus();
  expect(status.status).toBe("completed");
  expect(await getProfileExists()).toBe(true);
});

test("step 7 with restriction items creates the living profile", async ({
  page,
}) => {
  await seedInterviewAtRestrictions();
  await openAuthedInterview(page);
  await expectStep(page, 7);
  await addListItem(page, "restrictions", "Never promise same-day arrival");
  await clickSubmit(page);
  await expectLivingProfile(page);
  await expect(page.getByText("Never promise same-day arrival")).toBeVisible();

  const status = await getInterviewStatus();
  expect(status.status).toBe("completed");
  expect(await getProfileExists()).toBe(true);
});

test("step 7 empty restrictions on a seeded draft still submits", async ({
  page,
}) => {
  await seedInterviewAtRestrictions();
  await openAuthedInterview(page);
  await expectStep(page, 7);
  await clickSubmit(page);
  await expectLivingProfile(page);
  expect(await getInterviewStatus()).toMatchObject({ status: "completed" });
  expect(await getProfileExists()).toBe(true);
});

test("back from step 7 keeps earlier answers", async ({ page }) => {
  await seedInterviewAtRestrictions();
  await openAuthedInterview(page);
  await expectStep(page, 7);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectStep(page, 6);
  await expect(page.locator("#interview-style")).toHaveValue(
    "Short sentences, local landmarks",
  );
  await clickNext(page);
  await expectStep(page, 7);
});

test("completed interview is read-only", async ({ page }) => {
  await seedInterviewAtRestrictions({ includeRestrictions: true });
  await openAuthedInterview(page);
  await clickSubmit(page);
  await expectLivingProfile(page);

  await openInterview(page);
  await expect(page.getByText("This interview is complete")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Submit interview" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View living profile" })).toBeVisible();
});
