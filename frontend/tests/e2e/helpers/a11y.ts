import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { getDisclaimerBanner } from "./locators";

export async function runCriticalAxeAudit(
  page: Page,
  routeLabel: string
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const critical = results.violations.filter((v) => v.impact === "critical");
  expect(
    critical,
    `Critical Axe violations on ${routeLabel}: ${JSON.stringify(
      critical.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.length }))
    )}`
  ).toHaveLength(0);
}

export async function runColorContrastAxeAudit(
  page: Page,
  routeLabel: string
): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .analyze();

  const badContrast = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );
  expect(
    badContrast,
    `WCAG AA color-contrast violations on ${routeLabel}: ${JSON.stringify(
      badContrast.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.html),
      }))
    )}`
  ).toHaveLength(0);
}

export async function assertNoHorizontalOverflow(
  page: Page,
  width: number,
  height: number,
  routeLabel: string
): Promise<void> {
  await page.setViewportSize({ width, height });
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    metrics.scrollWidth,
    `Horizontal overflow on ${routeLabel} at ${width}x${height}: scrollWidth=${metrics.scrollWidth}, innerWidth=${metrics.innerWidth}`
  ).toBeLessThanOrEqual(metrics.innerWidth);
}

export async function assertBanglaRendered(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).toMatch(/[\u0980-\u09FF]+/);
}

export async function assertDisclaimerVisible(page: Page): Promise<void> {
  await expect(getDisclaimerBanner(page)).toBeVisible();
}

export async function assertSemanticLandmarks(page: Page): Promise<void> {
  await expect(page.locator("main").first()).toBeVisible();
  const navCount = await page.locator("nav, header").count();
  expect(navCount).toBeGreaterThan(0);
}
