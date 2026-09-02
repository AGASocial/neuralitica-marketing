import { expect, type Page } from "@playwright/test";

import { INTERVIEW_FIXTURE } from "./interview-db";

export async function openInterview(page: Page): Promise<void> {
  await page.goto("/interview");
  await expect(page.getByRole("heading", { name: "Initial interview" })).toBeVisible();
}

export async function expectStep(page: Page, current: number, total = 7): Promise<void> {
  await expect(page.getByText(`${current} / ${total}`, { exact: true })).toBeVisible();
}

export async function addListItem(page: Page, step: string, value: string): Promise<void> {
  await page.locator(`#interview-${step}-item`).fill(value);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(value, { exact: true })).toBeVisible();
}

export async function fillTextStep(page: Page, step: string, value: string): Promise<void> {
  await page.locator(`#interview-${step}`).fill(value);
}

export async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

export async function clickSubmit(page: Page): Promise<void> {
  const submit = page.getByRole("button", { name: "Submit interview" });
  await expect(submit).toBeEnabled();
  await submit.click();
}

export async function completeSteps1To6(page: Page): Promise<void> {
  await expectStep(page, 1);
  await addListItem(page, "services", INTERVIEW_FIXTURE.services.items[0]);
  await clickNext(page);

  await expectStep(page, 2);
  await fillTextStep(page, "zone", INTERVIEW_FIXTURE.zone.description);
  await clickNext(page);

  await expectStep(page, 3);
  await fillTextStep(page, "tone", INTERVIEW_FIXTURE.tone.description);
  await clickNext(page);

  await expectStep(page, 4);
  await addListItem(page, "offers", INTERVIEW_FIXTURE.offers.items[0]);
  await clickNext(page);

  await expectStep(page, 5);
  await addListItem(page, "objections", INTERVIEW_FIXTURE.objections.items[0]);
  await clickNext(page);

  await expectStep(page, 6);
  await fillTextStep(page, "style", INTERVIEW_FIXTURE.style.description);
  await clickNext(page);

  await expectStep(page, 7);
  await expect(
    page.getByText("What must we never say or promise?"),
  ).toBeVisible();
}

export async function expectLivingProfile(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByRole("heading", { name: "Living profile" })).toBeVisible();
  await expect(
    page.getByText("We could not load your living profile"),
  ).toHaveCount(0);
}
