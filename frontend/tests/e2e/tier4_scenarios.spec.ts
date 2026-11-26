import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiUrl,
  assertErrorEnvelope,
  authHeaders,
  createAndApproveDispense,
  createIsolatedPatient,
  DEMO_ACCOUNTS,
  extractArray,
  getBatchCode,
  getBatchTier,
  getInventoryBatches,
  getStewardshipAnalytics,
  resolveConflictSafe,
  runOptimize,
  voidDispenseSafe,
  voidDispensesCleanup,
  type ConflictPayload,
  type PatientRecord,
  type VoiceIntakeResponse,
} from "./helpers/api";
import { assertDisclaimerVisible } from "./helpers/a11y";
import {
  loginViaCredentials,
  loginViaQuickFillRole,
  unlockOfflinePin,
} from "./helpers/auth";
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

test.describe("Tier 4: Real-World Clinical Application Scenarios (6 Scenarios)", () => {
  test("T4-01: Ashulia Dispensary Stewardship Turnaround (52% -> >=60% WHO Target)", async ({
    page,
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const base = await getStewardshipAnalytics(request, dispAuth.access_token);
    expect(base.access_ratio_pct).toBeLessThan(60);

    await loginViaQuickFillRole(page, /dispenser/i);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await assertDisclaimerVisible(page);
    await expect(page.locator("body")).toContainText(/Ashulia|52(\.\d+)?%/i);

    const syndromes = [
      "UNCOMPLICATED_UTI",
      "CAP_MILD",
      "STREP_PHARYNGITIS",
      "ACUTE_OTITIS_MEDIA",
      "CELLULITIS",
    ] as const;

    const needed = Math.max(
      5,
      Math.ceil((0.6 * base.antibiotic_dispensed - base.access_count) / 0.4)
    );
    const createdIds: string[] = [];

    try {
      for (let i = 0; i < needed; i++) {
        const syndrome = syndromes[i % syndromes.length] ?? "UNCOMPLICATED_UTI";
        const opt = await runOptimize(request, dispAuth.access_token, {
          patient_profile: {
            age_years: 30,
            weight_kg: 60,
            sex: "F",
            is_pregnant: false,
            egfr: 95,
            allergies: [],
          },
          syndrome_code: syndrome,
          severity: "MODERATE",
          max_aware_tier: "ACCESS",
        });
        expect(opt.solver_status).toBe("OPTIMAL");
        expect(opt.aware_category).toBe("ACCESS");
        expect(opt.recommended_batch).not.toBeNull();

        const patient = await createIsolatedPatient(
          request,
          dispAuth.access_token
        );
        const approved = await createAndApproveDispense(
          request,
          dispAuth.access_token,
          pharmAuth.access_token,
          {
            patient_id: patient.id,
            batch_id: opt.recommended_batch?.id,
            antibiotic_id: opt.recommended_batch?.antibiotic_id,
            syndrome_code: syndrome,
            aware_category: "ACCESS",
            qty_dispensed: 1,
          }
        );
        createdIds.push(approved.id);
      }

      const finalKpi = await getStewardshipAnalytics(
        request,
        pharmAuth.access_token
      );
      expect(finalKpi.access_ratio_pct).toBeGreaterThanOrEqual(60);
      expect(finalKpi.meets_who_target).toBe(true);

      await page.goto("/dashboard/analytics", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("body")).toContainText(/6\d(\.\d+)?%|target/i);
    } finally {
      await voidDispensesCleanup(request, createdIds);
    }
  });

  test("T4-02: Rural clinic connectivity drop, Bangla toggle, /~offline fallback & 409 Conflict Workbench", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const patient = await createIsolatedPatient(request, dispAuth.access_token, {
      full_name: "T4-02 Rural Patient",
    });
    const createdIds: string[] = [];
    let conflictId: string | undefined;

    try {
      await withPersistentContext(async (context, page) => {
        await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
        await waitForSerwistController(page);
        await warmCachedRoutes(page, [
          "/dashboard",
          "/dashboard/triage",
          "/dashboard/sync",
          "/~offline",
        ]);

        await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });
        await expect
          .poll(async () => {
            const snap = await inspectDexieStores(page);
            return snap.patients.some((p) => p.id === patient.id);
          })
          .toBe(true);

        await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
        await toggleLanguageAndVerifyBangla(page);

        await context.setOffline(true);

        const offlineTab = await context.newPage();
        await offlineTab.goto(`/rural-drop-probe-${Date.now()}`, {
          waitUntil: "domcontentloaded",
        });
        await expect(offlineTab.locator("body")).toContainText(
          /offline|triage|dashboard|ট্রায়াজ|অফলাইন/i
        );
        await offlineTab.close();

        await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });
        const patientSelect = page
          .getByLabel(/patient|রোগী/i)
          .or(page.getByRole("combobox", { name: /patient/i }))
          .first();
        if (await patientSelect.isVisible().catch(() => false)) {
          await patientSelect.selectOption(patient.id).catch(() => undefined);
        }
        await fillOrAddSulfonamideAllergyOnTriage(page);
        await page
          .getByRole("button", {
            name: /save patient|update patient|save allergy|সংরক্ষণ|save/i,
          })
          .first()
          .click();

        await expect
          .poll(async () => {
            const snap = await inspectDexieStores(page);
            return snap.syncMutations.some(
              (m) =>
                m.entity_id === patient.id &&
                (m.status === "pending" || m.status === "queued")
            );
          })
          .toBe(true);

        const batches = await getInventoryBatches(
          request,
          dispAuth.access_token
        );
        const cotrim = batches.find(
          (b) =>
            getBatchCode(b).includes("COTRIMOXAZOLE") && b.qty_remaining >= 1
        );
        expect(cotrim).toBeDefined();
        const disp = await createAndApproveDispense(
          request,
          dispAuth.access_token,
          pharmAuth.access_token,
          {
            patient_id: patient.id,
            batch_id: cotrim?.id,
            antibiotic_id: cotrim?.antibiotic_id,
            syndrome_code: "UNCOMPLICATED_UTI",
            aware_category: "ACCESS",
            qty_dispensed: 1,
          }
        );
        createdIds.push(disp.id);

        const serverPat = (await (
          await request.get(apiUrl(`/api/v1/patients/${patient.id}`), {
            headers: authHeaders(dispAuth.access_token),
          })
        ).json()) as PatientRecord;
        if (serverPat.version <= 1) {
          await request.patch(apiUrl(`/api/v1/patients/${patient.id}`), {
            headers: authHeaders(pharmAuth.access_token),
            data: { base_version: serverPat.version, weight_kg: 61 },
          });
        }

        const conflictRes = await reconnectAndSyncMutations(context, page, {
          beforeSyncClick: async () => {
            await toggleLanguageBackToEnglish(page);
          },
        });
        expect(conflictRes.status()).toBe(409);

        const conflictBody = (await conflictRes.json()) as ConflictPayload;
        conflictId = conflictBody.conflict_id;
        expect(conflictBody.cpsat_verdict).toBeDefined();

        await clickScopedConflictResolveButton(page, [
          conflictBody.conflict_id,
          patient.full_name,
          patient.id,
        ]);

        await expect
          .poll(async () => {
            const res = await request.get(apiUrl("/api/v1/sync/conflicts"), {
              headers: authHeaders(dispAuth.access_token),
            });
            const rows = extractArray<{ id: string; status: string }>(
              await res.json(),
              ["conflicts", "items"]
            );
            const target = rows.find((c) => c.id === conflictBody.conflict_id);
            return target !== undefined && target.status !== "OPEN";
          })
          .toBe(true);
      });
    } finally {
      if (conflictId) {
        await resolveConflictSafe(request, conflictId);
      }
      await voidDispensesCleanup(request, createdIds);
    }
  });

  test("T4-03: Stockout referral (REFER_UPAZILA_STOCK_TRANSFER) & Watch escalation approval", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);

    const stockoutOpt = await runOptimize(request, dispAuth.access_token, {
      patient_profile: {
        age_years: 42,
        weight_kg: 68,
        sex: "M",
        is_pregnant: false,
        egfr: 95,
        allergies: [
          "PENICILLIN",
          "BETA_LACTAM",
          "CEPHALOSPORIN",
          "SULFONAMIDE",
          "TETRACYCLINE",
          "MACROLIDE",
          "FLUOROQUINOLONE",
          "AMINOGLYCOSIDE",
          "NITROIMIDAZOLE",
          "GLYCOPEPTIDE",
          "CARBAPENEM",
          "OXAZOLIDINONE",
        ],
      },
      syndrome_code: "INTRA_ABDOMINAL_SEPSIS",
      severity: "SEVERE",
    });
    expect(stockoutOpt.solver_status).toBe("INFEASIBLE");
    expect(
      stockoutOpt.safe_relaxations.some(
        (r) => r.action === "REFER_UPAZILA_STOCK_TRANSFER"
      )
    ).toBe(true);

    const accessBlocked = await runOptimize(request, dispAuth.access_token, {
      patient_profile: {
        age_years: 36,
        weight_kg: 64,
        sex: "M",
        is_pregnant: false,
        egfr: 95,
        allergies: [
          "PENICILLIN",
          "BETA_LACTAM",
          "CEPHALOSPORIN",
          "SULFONAMIDE",
          "TETRACYCLINE",
          "NITROFURANTOIN",
        ],
      },
      syndrome_code: "CAP_MODERATE",
      severity: "MODERATE",
      max_aware_tier: "ACCESS",
    });
    expect(accessBlocked.solver_status).toBe("INFEASIBLE");
    expect(
      accessBlocked.safe_relaxations.some(
        (r) => r.action === "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL"
      )
    ).toBe(true);

    const watchOpt = await runOptimize(request, dispAuth.access_token, {
      patient_profile: {
        age_years: 36,
        weight_kg: 64,
        sex: "M",
        is_pregnant: false,
        egfr: 95,
        allergies: [
          "PENICILLIN",
          "BETA_LACTAM",
          "CEPHALOSPORIN",
          "SULFONAMIDE",
          "TETRACYCLINE",
          "NITROFURANTOIN",
        ],
      },
      syndrome_code: "CAP_MODERATE",
      severity: "MODERATE",
      max_aware_tier: "WATCH",
    });
    expect(watchOpt.solver_status).toBe("OPTIMAL");
    expect(watchOpt.aware_category).toBe("WATCH");
    expect(watchOpt.recommended_batch).not.toBeNull();

    const patient = await createIsolatedPatient(request, dispAuth.access_token);
    let dispenseId: string | undefined;
    try {
      const approved = await createAndApproveDispense(
        request,
        dispAuth.access_token,
        pharmAuth.access_token,
        {
          patient_id: patient.id,
          batch_id: watchOpt.recommended_batch?.id,
          antibiotic_id: watchOpt.recommended_batch?.antibiotic_id,
          syndrome_code: "CAP_MODERATE",
          aware_category: "WATCH",
          qty_dispensed: 1,
          notes: "Pharmacist approved Watch escalation",
        }
      );
      dispenseId = approved.id;
      expect(approved.status).toBe("DISPENSED");
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });

  test("T4-04: Auditor read-only oversight & Admin audit trail verification", async ({
    page,
    request,
  }) => {
    const audAuth = await apiLogin(request, DEMO_ACCOUNTS.auditor);
    const adminAuth = await apiLogin(request, DEMO_ACCOUNTS.admin);

    await loginViaCredentials(page, DEMO_ACCOUNTS.auditor);
    await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Access|Watch|Reserve/i);
    await page.goto("/dashboard/inventory", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/expir|stock/i);

    await assertErrorEnvelope(
      await request.post(apiUrl("/api/v1/dispenses"), {
        headers: authHeaders(audAuth.access_token),
        data: {
          patient_id: crypto.randomUUID(),
          syndrome_code: "CAP_MILD",
          qty_dispensed: 1,
        },
      }),
      [403]
    );

    const logsRes = await request.get(apiUrl("/api/v1/admin/audit-logs"), {
      headers: authHeaders(adminAuth.access_token),
    });
    expect(logsRes.status()).toBe(200);
    const logs = extractArray<Record<string, unknown>>(await logsRes.json(), [
      "audit_logs",
      "logs",
      "items",
    ]);
    expect(Array.isArray(logs)).toBe(true);
  });

  test("T4-05: Dhamrai tenant isolation & Offline PIN re-entry + clean sync", async ({
    request,
  }) => {
    const ashuliaAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const dhamraiAuth = await apiLogin(request, DEMO_ACCOUNTS.dhamraiDispenser);
    const ashuliaPatient = await createIsolatedPatient(
      request,
      ashuliaAuth.access_token,
      { full_name: "Ashulia Only T4-05" }
    );

    await withPersistentContext(async (context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dhamraiDispenser);
      await waitForSerwistController(page);
      await warmCachedRoutes(page, [
        "/login",
        "/dashboard",
        "/dashboard/triage",
        "/dashboard/sync",
      ]);

      const dhamraiList = extractArray<PatientRecord>(
        await (
          await request.get(apiUrl("/api/v1/patients"), {
            headers: authHeaders(dhamraiAuth.access_token),
          })
        ).json(),
        ["patients", "items"]
      );
      expect(dhamraiList.some((p) => p.id === ashuliaPatient.id)).toBe(false);

      await context.setOffline(true);
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await unlockOfflinePin(
        page,
        DEMO_ACCOUNTS.dhamraiDispenser.pin,
        DEMO_ACCOUNTS.dhamraiDispenser.email
      );
      await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
        timeout: 15_000,
      });

      await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });
      const dhamraiOfflineName = `Dhamrai Offline ${Date.now()}`;
      const nameInput = page
        .getByLabel(/patient name|full name|name/i)
        .or(page.getByPlaceholder(/name/i))
        .first();
      await nameInput.fill(dhamraiOfflineName);
      await page
        .getByRole("button", { name: /save patient|create patient|save/i })
        .first()
        .click();

      await expect
        .poll(async () => {
          const snap = await inspectDexieStores(page);
          return snap.patients.some((p) => p.full_name === dhamraiOfflineName);
        })
        .toBe(true);

      const syncRes = await reconnectAndSyncMutations(context, page);
      expect([200, 201]).toContain(syncRes.status());

      await expect
        .poll(async () => {
          const res = await request.get(
            apiUrl(
              `/api/v1/patients?q=${encodeURIComponent(dhamraiOfflineName)}`
            ),
            { headers: authHeaders(dhamraiAuth.access_token) }
          );
          const rows = extractArray<PatientRecord>(await res.json(), [
            "patients",
            "items",
          ]);
          return rows.some((p) => p.full_name === dhamraiOfflineName);
        })
        .toBe(true);

      const ashuliaSearch = extractArray<PatientRecord>(
        await (
          await request.get(
            apiUrl(
              `/api/v1/patients?q=${encodeURIComponent(dhamraiOfflineName)}`
            ),
            { headers: authHeaders(ashuliaAuth.access_token) }
          )
        ).json(),
        ["patients", "items"]
      );
      expect(ashuliaSearch.some((p) => p.full_name === dhamraiOfflineName)).toBe(
        false
      );
    });
  });

  test("T4-06: Viral no-antibiotic stewardship (ACUTE_BRONCHITIS MILD) & post-dispense void recovery", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);

    const voiceRes = await request.post(apiUrl("/api/v1/voice/intake"), {
      headers: authHeaders(dispAuth.access_token),
      data: {
        transcript:
          "25 year old adult with mild acute bronchitis cough for 2 days, no fever",
        language: "en",
      },
    });
    expect(voiceRes.status()).toBe(200);
    const voice = (await voiceRes.json()) as VoiceIntakeResponse;
    expect(voice.prompt_guard_safe).toBe(true);

    const viralOpt = await runOptimize(request, dispAuth.access_token, {
      patient_profile: {
        age_years: voice.age_years ?? 25,
        weight_kg: 62,
        sex: "M",
        is_pregnant: false,
        egfr: 100,
        allergies: voice.allergies ?? [],
      },
      syndrome_code: "ACUTE_BRONCHITIS",
      severity: "MILD",
      language: "en",
    });
    expect(viralOpt.solver_status).toBe("NO_ANTIBIOTIC");
    expect(viralOpt.aware_category).toBe("NO_ANTIBIOTIC");
    expect(viralOpt.counseling.deidentified).toBe(true);
    expect(viralOpt.counseling.hallucination_guard_passed).toBe(true);

    const beforeKpi = await getStewardshipAnalytics(
      request,
      dispAuth.access_token
    );
    const batches = await getInventoryBatches(request, dispAuth.access_token);
    const accessBatch = batches.find(
      (b) => getBatchTier(b) === "ACCESS" && b.qty_remaining >= 3
    );
    expect(accessBatch).toBeDefined();
    const initialQty = accessBatch?.qty_remaining ?? 0;

    const patient = await createIsolatedPatient(request, dispAuth.access_token);
    let dispenseId: string | undefined;
    try {
      const approved = await createAndApproveDispense(
        request,
        dispAuth.access_token,
        pharmAuth.access_token,
        {
          patient_id: patient.id,
          batch_id: accessBatch?.id,
          antibiotic_id: accessBatch?.antibiotic_id,
          syndrome_code: "CAP_MILD",
          aware_category: "ACCESS",
          qty_dispensed: 2,
        }
      );
      dispenseId = approved.id;

      const voidRes = await request.post(
        apiUrl(`/api/v1/dispenses/${approved.id}/void`),
        { headers: authHeaders(pharmAuth.access_token) }
      );
      expect(voidRes.status()).toBe(200);

      const afterBatches = await getInventoryBatches(
        request,
        dispAuth.access_token
      );
      expect(
        afterBatches.find((b) => b.id === accessBatch?.id)?.qty_remaining
      ).toBe(initialQty);

      const afterKpi = await getStewardshipAnalytics(
        request,
        dispAuth.access_token
      );
      expect(afterKpi.access_count).toBe(beforeKpi.access_count);
      expect(afterKpi.access_ratio_pct).toBeCloseTo(
        beforeKpi.access_ratio_pct,
        1
      );
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });
});
