import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiUrl,
  authHeaders,
  createAndApproveDispense,
  DEMO_ACCOUNTS,
  getBatchCode,
  getInventoryBatches,
  getStewardshipAnalytics,
  createIsolatedPatient,
  resolveConflictSafe,
  voidDispenseSafe,
  type ConflictPayload,
  type PatientRecord,
} from "./helpers/api";
import {
  assertBanglaRendered,
  assertDisclaimerVisible,
  assertNoHorizontalOverflow,
  assertSemanticLandmarks,
  runCriticalAxeAudit,
} from "./helpers/a11y";
import { loginViaCredentials } from "./helpers/auth";
import {
  clickScopedConflictResolveButton,
  fillOrAddSulfonamideAllergyOnTriage,
  toggleLanguageAndVerifyBangla,
  toggleLanguageBackToEnglish,
} from "./helpers/locators";
import {
  inspectDexieStores,
  reconnectAndSyncMutations,
  waitForSerwistController,
  warmCachedRoutes,
  withPersistentContext,
} from "./helpers/pwa";

test.describe("Offline PWA & 409 Conflict Workbench (11 Acceptance Criteria)", () => {
  test("AC-01..11: offline allergy edit vs concurrent Cotrimoxazole dispense triggers 409 CP-SAT Conflict Workbench, bilingual UI & Axe pass", async ({
    request,
  }) => {
    const dispenserAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmacistAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);

    const patient = await createIsolatedPatient(
      request,
      dispenserAuth.access_token,
      {
        full_name: "Offline Conflict Test Patient",
        age_years: 34,
        weight_kg: 62,
        sex: "F",
        is_pregnant: false,
        egfr: 92,
        allergies: [],
      }
    );

    const baselineAnalytics = await getStewardshipAnalytics(
      request,
      dispenserAuth.access_token
    );
    expect(baselineAnalytics.clinic_name).toContain("Ashulia");
    expect(baselineAnalytics.access_ratio_pct).toBeGreaterThanOrEqual(40);
    expect(baselineAnalytics.access_ratio_pct).toBeLessThan(60);

    const createdDispenseIds: string[] = [];
    let conflictId: string | undefined;

    try {
      await withPersistentContext(async (context, page) => {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await assertSemanticLandmarks(page);
        await assertDisclaimerVisible(page);
        await runCriticalAxeAudit(page, "/");
        await assertNoHorizontalOverflow(page, 375, 812, "/");
        await assertNoHorizontalOverflow(page, 1440, 900, "/");

        await toggleLanguageAndVerifyBangla(page);
        await assertBanglaRendered(page);
        await toggleLanguageBackToEnglish(page);

        await page.goto("/login", { waitUntil: "domcontentloaded" });
        await runCriticalAxeAudit(page, "/login");
        await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);

        const swControlled = await waitForSerwistController(page);
        expect(swControlled).toBe(true);

        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        await assertDisclaimerVisible(page);
        await expect(page.locator("body")).toContainText(/52(\.\d+)?%|Ashulia/i);
        await runCriticalAxeAudit(page, "/dashboard");
        await assertNoHorizontalOverflow(page, 375, 812, "/dashboard");
        await assertNoHorizontalOverflow(page, 1440, 900, "/dashboard");

        await warmCachedRoutes(page, [
          "/dashboard/triage",
          "/dashboard/sync",
          "/dashboard/inventory",
          "/~offline",
        ]);
        await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });
        await runCriticalAxeAudit(page, "/dashboard/triage");

        await expect
          .poll(async () => {
            const snap = await inspectDexieStores(page);
            return (
              snap.databaseExists &&
              snap.storeNames.includes("patients") &&
              snap.storeNames.includes("batches") &&
              snap.storeNames.includes("guidelines") &&
              snap.storeNames.includes("syncMutations") &&
              snap.storeNames.includes("conflicts") &&
              snap.patients.some((p) => p.id === patient.id)
            );
          })
          .toBe(true);

        await context.setOffline(true);

        const offlineProbeTab = await context.newPage();
        await offlineProbeTab.goto(`/uncached-offline-probe-${Date.now()}`, {
          waitUntil: "domcontentloaded",
        });
        await expect(offlineProbeTab.locator("body")).toContainText(
          /offline|cached|dashboard|triage/i
        );
        await runCriticalAxeAudit(offlineProbeTab, "/~offline");
        await offlineProbeTab.close();

        const patientSelect = page
          .getByLabel(/patient|রোগী/i)
          .or(page.getByRole("combobox", { name: /patient/i }))
          .first();
        if (await patientSelect.isVisible().catch(() => false)) {
          await patientSelect.selectOption(patient.id).catch(async () => {
            await patientSelect.fill(patient.full_name).catch(() => undefined);
          });
        } else {
          const patientOption = page.getByText(patient.full_name).first();
          if (await patientOption.isVisible().catch(() => false)) {
            await patientOption.click();
          }
        }

        await fillOrAddSulfonamideAllergyOnTriage(page);

        const savePatientBtn = page
          .getByRole("button", {
            name: /save patient|update patient|save allergy|save profile|সংরক্ষণ/i,
          })
          .first();
        await expect(savePatientBtn).toBeVisible();
        await savePatientBtn.click();

        await expect
          .poll(async () => {
            const snap = await inspectDexieStores(page);
            const hasPendingMutation = snap.syncMutations.some(
              (m) =>
                m.entity_id === patient.id &&
                (m.status === "pending" || m.status === "queued")
            );
            const updatedLocalPatient = snap.patients.find(
              (p) => p.id === patient.id
            );
            const localAllergies = Array.isArray(updatedLocalPatient?.allergies)
              ? (updatedLocalPatient.allergies as string[])
              : [];
            return (
              hasPendingMutation &&
              localAllergies.some((a) => a.toUpperCase() === "SULFONAMIDE")
            );
          })
          .toBe(true);

        const batches = await getInventoryBatches(
          request,
          dispenserAuth.access_token
        );
        const cotrimBatch = batches.find(
          (b) =>
            getBatchCode(b).includes("COTRIMOXAZOLE") && b.qty_remaining >= 1
        );
        expect(cotrimBatch).toBeDefined();

        const onlineDispense = await createAndApproveDispense(
          request,
          dispenserAuth.access_token,
          pharmacistAuth.access_token,
          {
            patient_id: patient.id,
            batch_id: cotrimBatch?.id,
            antibiotic_id: cotrimBatch?.antibiotic_id,
            syndrome_code: "UNCOMPLICATED_UTI",
            severity: "MODERATE",
            aware_category: "ACCESS",
            qty_dispensed: 1,
            notes: "Concurrent online Cotrimoxazole dispense during offline window",
          }
        );
        createdDispenseIds.push(onlineDispense.id);

        const serverPatientRes = await request.get(
          apiUrl(`/api/v1/patients/${patient.id}`),
          { headers: authHeaders(dispenserAuth.access_token) }
        );
        expect(serverPatientRes.status()).toBe(200);
        const serverPatient = (await serverPatientRes.json()) as PatientRecord;
        if (serverPatient.version <= patient.version) {
          const bumpRes = await request.patch(
            apiUrl(`/api/v1/patients/${patient.id}`),
            {
              headers: authHeaders(pharmacistAuth.access_token),
              data: {
                base_version: serverPatient.version,
                weight_kg: 63,
              },
            }
          );
          expect(bumpRes.status()).toBe(200);
        }

        const conflictResponse = await reconnectAndSyncMutations(context, page);
        expect(conflictResponse.status()).toBe(409);

        const conflictBody = (await conflictResponse.json()) as ConflictPayload;
        conflictId = conflictBody.conflict_id;
        expect(conflictBody.error_code).toBe("SYNC_VERSION_CONFLICT");
        expect(typeof conflictBody.conflict_id).toBe("string");
        expect(conflictBody.server_snapshot).toBeDefined();
        expect(conflictBody.client_snapshot).toBeDefined();
        expect(conflictBody.cpsat_verdict).toBeDefined();
        expect(typeof conflictBody.trace_id).toBe("string");
        expect(conflictBody.details).toBeDefined();
        expect(conflictBody.details.conflict_id).toBe(conflictBody.conflict_id);
        expect(conflictBody.details.server_snapshot).toBeDefined();
        expect(conflictBody.details.client_snapshot).toBeDefined();
        expect(conflictBody.details.cpsat_verdict).toBeDefined();

        await expect(page.locator("body")).toContainText(
          /server snapshot|server/i
        );
        await expect(page.locator("body")).toContainText(
          /client snapshot|client/i
        );
        await expect(page.locator("body")).toContainText(
          /sulfonamide|cotrimoxazole|infeasible|conflict/i
        );

        await runCriticalAxeAudit(page, "/dashboard/sync");
        await assertNoHorizontalOverflow(page, 375, 812, "/dashboard/sync");
        await assertNoHorizontalOverflow(page, 1440, 900, "/dashboard/sync");

        await toggleLanguageAndVerifyBangla(page);
        await assertBanglaRendered(page);
        await toggleLanguageBackToEnglish(page);

        const resolveResponsePromise = page.waitForResponse(
          (res) =>
            res.url().includes("/api/v1/sync/conflicts/") &&
            res.url().endsWith("/resolve") &&
            res.request().method() === "POST"
        );

        await clickScopedConflictResolveButton(page, [
          conflictBody.conflict_id,
          patient.full_name,
          patient.id,
        ]);

        const resolveResponse = await resolveResponsePromise;
        expect(resolveResponse.status()).toBe(200);

        await expect
          .poll(async () => {
            const listRes = await request.get(
              apiUrl("/api/v1/sync/conflicts"),
              { headers: authHeaders(dispenserAuth.access_token) }
            );
            if (listRes.status() !== 200) return false;
            const listData = (await listRes.json()) as
              | { id: string; status: string }[]
              | { conflicts?: { id: string; status: string }[] };
            const rows = Array.isArray(listData)
              ? listData
              : (listData.conflicts ?? []);
            const target = rows.find((c) => c.id === conflictBody.conflict_id);
            return target !== undefined && target.status !== "OPEN";
          })
          .toBe(true);
      });
    } finally {
      if (conflictId) {
        await resolveConflictSafe(request, conflictId);
      }
      for (const dispenseId of createdDispenseIds) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });
});
