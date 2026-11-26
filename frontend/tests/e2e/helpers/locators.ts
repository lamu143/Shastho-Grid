import { expect, type Locator, type Page } from "@playwright/test";

export function getDisclaimerBanner(page: Page): Locator {
  return page
    .getByText(/clinical decision support|clinician judgment|not replace|ক্লিনিক্যাল সিদ্ধান্ত/i)
    .first();
}

export function getLanguageToggleButton(page: Page): Locator {
  return page
    .getByRole("button", { name: /বাংলা|EN\s*\/\s*বাংলা|English|language/i })
    .first();
}

export function getTriageSyndromeSelect(page: Page): Locator {
  return page
    .getByLabel(/syndrome|infection|রোগ|সংক্রমণ/i)
    .or(page.getByRole("combobox", { name: /syndrome|infection/i }))
    .first();
}

export function getTriageSeveritySelect(page: Page): Locator {
  return page
    .getByLabel(/severity|তীব্রতা/i)
    .or(page.getByRole("combobox", { name: /severity/i }))
    .first();
}

export function getOptimizeSubmitButton(page: Page): Locator {
  return page
    .getByRole("button", {
      name: /optimize|run cp-sat|evaluate|recommend|পরামর্শ|অপ্টিমাইজ/i,
    })
    .first();
}

export function getSyncNowButton(page: Page): Locator {
  return page
    .getByRole("button", { name: /sync now|sync pending|সিঙ্ক/i })
    .first();
}

export async function toggleLanguageAndVerifyBangla(page: Page): Promise<void> {
  const toggle = getLanguageToggleButton(page);
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText();
      return /[\u0980-\u09FF]+/.test(bodyText);
    })
    .toBe(true);
}

export async function toggleLanguageBackToEnglish(page: Page): Promise<void> {
  const toggle = getLanguageToggleButton(page);
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect
    .poll(async () => {
      const bodyText = await page.locator("body").innerText();
      return /(Dashboard|Triage|Inventory|Sync|AWaRe|Stewardship)/i.test(
        bodyText
      );
    })
    .toBe(true);
}

export async function fillOrAddSulfonamideAllergyOnTriage(
  page: Page
): Promise<void> {
  const checkbox = page
    .getByRole("checkbox", { name: /sulfonamide|সালফোনামাইড/i })
    .first();
  if (await checkbox.isVisible().catch(() => false)) {
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }
    return;
  }

  const buttonChip = page
    .getByRole("button", { name: /sulfonamide/i })
    .first();
  if (await buttonChip.isVisible().catch(() => false)) {
    await buttonChip.click();
    return;
  }

  const allergyInput = page
    .getByLabel(/allerg|অ্যালার্জি/i)
    .or(page.getByPlaceholder(/allerg|sulfonamide/i))
    .first();
  await expect(allergyInput).toBeVisible();
  const existing = await allergyInput.inputValue().catch(() => "");
  const nextVal = existing.trim()
    ? `${existing.trim()}, SULFONAMIDE`
    : "SULFONAMIDE";
  await allergyInput.fill(nextVal);
}

export async function clickScopedConflictResolveButton(
  page: Page,
  identifiers: string[]
): Promise<void> {
  const buttonNameRegex =
    /merge|safe alternative|keep allergy|resolve.*merged|accept.*merged/i;
  const validIds = identifiers.filter((id) => id.trim().length > 0);

  const fallbackBtn = page.getByRole("button", { name: buttonNameRegex }).first();
  await expect(fallbackBtn).toBeVisible({ timeout: 15_000 });

  const findMatchingScopedButton = async (): Promise<Locator | null> => {
    for (const id of validIds) {
      const scopedCard = page
        .locator("article, section, li, tr, div")
        .filter({ hasText: id })
        .filter({
          has: page.getByRole("button", { name: buttonNameRegex }),
        })
        .last();

      if ((await scopedCard.count().catch(() => 0)) > 0) {
        return scopedCard
          .getByRole("button", { name: buttonNameRegex })
          .first();
      }
    }
    return null;
  };

  if (validIds.length > 0) {
    try {
      await expect
        .poll(async () => (await findMatchingScopedButton()) !== null, {
          timeout: 5_000,
        })
        .toBe(true);
    } catch {
      // Fall back to first visible resolve button if none of the identifiers render in card text
    }

    const scopedBtn = await findMatchingScopedButton();
    if (scopedBtn) {
      await expect(scopedBtn).toBeVisible();
      await scopedBtn.click();
      return;
    }
  }

  await expect(fallbackBtn).toBeVisible();
  await fallbackBtn.click();
}
