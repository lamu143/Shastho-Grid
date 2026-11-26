import { test } from "@playwright/test";
import {
  assertDisclaimerVisible,
  assertNoHorizontalOverflow,
  assertSemanticLandmarks,
  runCriticalAxeAudit,
} from "./helpers/a11y";

const PUBLIC_ROUTES = ["/", "/login", "/radar"];
const ADMIN_ROUTES = [
  "/dispatch",
  "/race-lab",
  "/facility",
  "/insights",
  "/dashboard/analytics",
  "/admin",
];

test.describe("WCAG 2.2 AA & responsive layout audit across primary routes", () => {
  test("public routes pass Axe WCAG 2.2 AA and have zero overflow at 390px and 1440px", async ({
    page,
  }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      await assertSemanticLandmarks(page);
      await assertDisclaimerVisible(page);
      await runCriticalAxeAudit(page, route);
      await assertNoHorizontalOverflow(page, 390, 844, route);
      await assertNoHorizontalOverflow(page, 1440, 900, route);
    }
  });

  test("authenticated clinical & admin routes pass Axe WCAG 2.2 AA and have zero overflow", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Admin \(Ashulia\)/i }).click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
      timeout: 15_000,
    });
    for (const route of ADMIN_ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      await assertSemanticLandmarks(page);
      await assertDisclaimerVisible(page);
      await runCriticalAxeAudit(page, route);
      await assertNoHorizontalOverflow(page, 390, 844, route);
      await assertNoHorizontalOverflow(page, 1440, 900, route);
    }
  });
});
