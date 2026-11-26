import { expect, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS, type DemoAccount } from "./api";

export async function loginViaCredentials(
  page: Page,
  account: DemoAccount = DEMO_ACCOUNTS.dispenser
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const emailInput = page
    .getByLabel(/email/i)
    .or(page.getByPlaceholder(/email/i))
    .first();
  const passwordInput = page
    .getByLabel(/password/i)
    .or(page.getByPlaceholder(/password/i))
    .first();

  await emailInput.fill(account.email);
  await passwordInput.fill(account.password);

  const submitButton = page
    .getByRole("button", { name: /sign in|log in|login|authenticate/i })
    .first();
  await submitButton.click();

  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 15_000,
  });
}

export async function loginViaQuickFillRole(
  page: Page,
  roleLabelRegex: RegExp
): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  const quickFillButton = page
    .getByRole("button", { name: roleLabelRegex })
    .first();
  await expect(quickFillButton).toBeVisible();
  await quickFillButton.click();

  const stillOnLogin = page.url().includes("/login");
  if (stillOnLogin) {
    const submitButton = page
      .getByRole("button", { name: /sign in|log in|login|enter|submit/i })
      .first();
    if (await submitButton.isVisible().catch(() => false)) {
      await submitButton.click();
    }
  }

  await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
    timeout: 15_000,
  });
}

export async function unlockOfflinePin(
  page: Page,
  pin: string,
  email?: string
): Promise<void> {
  if (!page.url().includes("/login")) {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  }

  const pinToggle = page
    .getByRole("button", { name: /offline pin|pin unlock/i })
    .or(page.getByRole("tab", { name: /offline pin|pin/i }))
    .first();
  if (await pinToggle.isVisible().catch(() => false)) {
    await pinToggle.click();
  }

  if (email) {
    const pinEmail = page
      .getByLabel(/offline.*email|email/i)
      .or(page.getByPlaceholder(/email/i))
      .first();
    if (await pinEmail.isVisible().catch(() => false)) {
      const currentVal = await pinEmail.inputValue().catch(() => "");
      if (!currentVal) {
        await pinEmail.fill(email);
      }
    }
  }

  const pinInput = page
    .getByLabel(/offline pin|pin/i)
    .or(page.getByPlaceholder(/pin|2026/i))
    .first();
  await expect(pinInput).toBeVisible();
  await pinInput.fill(pin);

  const unlockButton = page
    .getByRole("button", { name: /unlock|verify pin|offline.*unlock/i })
    .first();
  await unlockButton.click();
}
