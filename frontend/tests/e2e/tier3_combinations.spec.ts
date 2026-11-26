import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiUrl,
  assertErrorEnvelope,
  authHeaders,
  createAndApproveDispense,
  createDispenseDraft,
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
  type DispenseRecord,
  type PatientRecord,
  type VoiceIntakeResponse,
} from "./helpers/api";
import {
  assertBanglaRendered,
  assertDisclaimerVisible,
  assertNoHorizontalOverflow,
  runCriticalAxeAudit,
} from "./helpers/a11y";
import {
  loginViaCredentials,
  loginViaQuickFillRole,
  unlockOfflinePin,
} from "./helpers/auth";
import {
  clickScopedConflictResolveButton,
  fillOrAddSulfonamideAllergyOnTriage,
  getOptimizeSubmitButton,
  getTriageSeveritySelect,
  getTriageSyndromeSelect,
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

test.describe("Tier 3: Pairwise Cross-Feature Combinations (8 Cases)", () => {
  test("T3-01 (A4+A5+A2): Offline allergy edit vs concurrent Cotrimoxazole dispense -> 409 CP-SAT Workbench", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const patient = await createIsolatedPatient(request, dispAuth.access_token, {
      full_name: "T3-01 Conflict Patient",
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
        ]);
        await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });

        await expect
          .poll(async () => {
            const snap = await inspectDexieStores(page);
            return snap.patients.some((p) => p.id === patient.id);
          })
          .toBe(true);

        await context.setOffline(true);
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
            name: /save patient|update patient|save allergy|save/i,
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

        const onlineDisp = await createAndApproveDispense(
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
        createdIds.push(onlineDisp.id);

        const serverPatient = (await (
          await request.get(apiUrl(`/api/v1/patients/${patient.id}`), {
            headers: authHeaders(dispAuth.access_token),
          })
        ).json()) as PatientRecord;
        if (serverPatient.version <= 1) {
          await request.patch(apiUrl(`/api/v1/patients/${patient.id}`), {
            headers: authHeaders(pharmAuth.access_token),
            data: { base_version: serverPatient.version, weight_kg: 65 },
          });
        }

        const conflictRes = await reconnectAndSyncMutations(context, page);
        expect(conflictRes.status()).toBe(409);

        const payload = (await conflictRes.json()) as ConflictPayload;
        conflictId = payload.conflict_id;
        expect(payload.error_code).toBe("SYNC_VERSION_CONFLICT");
        expect(payload.cpsat_verdict).toBeDefined();

        await clickScopedConflictResolveButton(page, [
          payload.conflict_id,
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
            const target = rows.find((c) => c.id === payload.conflict_id);
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

  test("T3-02 (A2+A3+A6): Compliant Access dispenses raise Ashulia ~52% -> >=60% KPI across UI & API", async ({
    page,
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const base = await getStewardshipAnalytics(request, dispAuth.access_token);
    expect(base.access_ratio_pct).toBeLessThan(60);

    const opt = await runOptimize(request, dispAuth.access_token, {
      patient_profile: {
        age_years: 30,
        weight_kg: 60,
        sex: "F",
        is_pregnant: false,
        egfr: 95,
        allergies: [],
      },
      syndrome_code: "UNCOMPLICATED_UTI",
      severity: "MODERATE",
    });
    expect(opt.solver_status).toBe("OPTIMAL");
    expect(opt.aware_category).toBe("ACCESS");
    expect(opt.recommended_batch).not.toBeNull();

    const needed = Math.max(
      1,
      Math.ceil((0.6 * base.antibiotic_dispensed - base.access_count) / 0.4)
    );
    const createdIds: string[] = [];

    try {
      for (let i = 0; i < needed; i++) {
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
            syndrome_code: "UNCOMPLICATED_UTI",
            aware_category: "ACCESS",
            qty_dispensed: 1,
          }
        );
        createdIds.push(approved.id);
      }

      const after = await getStewardshipAnalytics(
        request,
        dispAuth.access_token
      );
      expect(after.access_ratio_pct).toBeGreaterThanOrEqual(60);
      expect(after.meets_who_target).toBe(true);

      await loginViaCredentials(page, DEMO_ACCOUNTS.pharmacist);
      await page.goto("/dashboard/analytics", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("body")).toContainText(/6\d(\.\d+)?%|target/i);
    } finally {
      await voidDispensesCleanup(request, createdIds);
    }
  });

  test("T3-03 (A2+A3): FEFO earliest-expiry lot selection + atomic pharmacist decrement", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const batches = await getInventoryBatches(request, dispAuth.access_token);

    const opt = await runOptimize(request, dispAuth.access_token, {
      patient_profile: {
        age_years: 29,
        weight_kg: 62,
        sex: "M",
        is_pregnant: false,
        egfr: 98,
        allergies: [],
      },
      syndrome_code: "CAP_MILD",
      severity: "MILD",
    });
    expect(opt.solver_status).toBe("OPTIMAL");
    const recBatch = opt.recommended_batch;
    expect(recBatch).not.toBeNull();

    const sameDrugActiveLots = batches
      .filter(
        (b) =>
          b.antibiotic_id === recBatch?.antibiotic_id &&
          b.qty_remaining >= 1 &&
          (b.days_to_expiry ?? 1) > 0
      )
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
    expect(sameDrugActiveLots.length).toBeGreaterThan(0);
    expect(recBatch?.id).toBe(sameDrugActiveLots[0]?.id);

    const initialEarliestQty = sameDrugActiveLots[0]?.qty_remaining ?? 0;
    const patient = await createIsolatedPatient(request, dispAuth.access_token);

    let dispenseId: string | undefined;
    try {
      const approved = await createAndApproveDispense(
        request,
        dispAuth.access_token,
        pharmAuth.access_token,
        {
          patient_id: patient.id,
          batch_id: recBatch?.id,
          antibiotic_id: recBatch?.antibiotic_id,
          syndrome_code: "CAP_MILD",
          aware_category: opt.aware_category,
          qty_dispensed: 1,
        }
      );
      dispenseId = approved.id;

      const afterBatches = await getInventoryBatches(
        request,
        dispAuth.access_token
      );
      const updatedEarliest = afterBatches.find((b) => b.id === recBatch?.id);
      expect(updatedEarliest?.qty_remaining).toBe(initialEarliestQty - 1);
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });

  test("T3-04 (A7+A4+A1): Quick-Fill login -> bilingual EN/বাংলা + responsive 375-1440px + Axe + /~offline", async () => {
    await withPersistentContext(async (context, page) => {
      await loginViaQuickFillRole(page, /dispenser/i);
      await waitForSerwistController(page);
      await warmCachedRoutes(page, [
        "/dashboard",
        "/dashboard/triage",
        "/dashboard/inventory",
        "/dashboard/sync",
        "/dashboard/settings",
        "/~offline",
      ]);

      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await toggleLanguageAndVerifyBangla(page);

      for (const route of [
        "/dashboard",
        "/dashboard/triage",
        "/dashboard/inventory",
        "/dashboard/sync",
        "/dashboard/settings",
      ]) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await assertDisclaimerVisible(page);
        await assertBanglaRendered(page);
        await assertNoHorizontalOverflow(page, 375, 812, route);
        await assertNoHorizontalOverflow(page, 1440, 900, route);
        await runCriticalAxeAudit(page, `${route} (bn)`);
      }

      await toggleLanguageBackToEnglish(page);
      await context.setOffline(true);
      await page.goto(`/uncached-t304-${Date.now()}`, {
        waitUntil: "domcontentloaded",
      });
      await runCriticalAxeAudit(page, "/~offline");
    });
  });

  test("T3-05 (A7+A2+A3): Voice intake -> CP-SAT optimize -> dispense approve -> void stock restore", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);

    const voiceRes = await request.post(apiUrl("/api/v1/voice/intake"), {
      headers: authHeaders(dispAuth.access_token),
      data: {
        transcript:
          "29 year old female with burning urination and moderate urinary tract infection, no drug allergies",
        language: "en",
      },
    });
    expect(voiceRes.status()).toBe(200);
    const voice = (await voiceRes.json()) as VoiceIntakeResponse;
    expect(voice.prompt_guard_safe).toBe(true);

    const opt = await runOptimize(request, dispAuth.access_token, {
      patient_profile: {
        age_years: voice.age_years ?? 29,
        weight_kg: 58,
        sex: "F",
        is_pregnant: voice.is_pregnant ?? false,
        egfr: 95,
        allergies: voice.allergies ?? [],
      },
      syndrome_code: voice.syndrome_code ?? "UNCOMPLICATED_UTI",
      severity:
        (voice.severity as "MILD" | "MODERATE" | "SEVERE" | null) ?? "MODERATE",
    });
    expect(opt.solver_status).toBe("OPTIMAL");
    expect(opt.recommended_batch).not.toBeNull();

    const targetBatchId = opt.recommended_batch?.id;
    const beforeBatches = await getInventoryBatches(
      request,
      dispAuth.access_token
    );
    const initialQty =
      beforeBatches.find((b) => b.id === targetBatchId)?.qty_remaining ?? 0;
    const patient = await createIsolatedPatient(request, dispAuth.access_token);

    let dispenseId: string | undefined;
    try {
      const approved = await createAndApproveDispense(
        request,
        dispAuth.access_token,
        pharmAuth.access_token,
        {
          patient_id: patient.id,
          batch_id: targetBatchId,
          antibiotic_id: opt.recommended_batch?.antibiotic_id,
          syndrome_code: voice.syndrome_code ?? "UNCOMPLICATED_UTI",
          aware_category: opt.aware_category,
          qty_dispensed: 1,
        }
      );
      dispenseId = approved.id;

      const midBatches = await getInventoryBatches(
        request,
        dispAuth.access_token
      );
      expect(
        midBatches.find((b) => b.id === targetBatchId)?.qty_remaining
      ).toBe(initialQty - 1);

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
        afterBatches.find((b) => b.id === targetBatchId)?.qty_remaining
      ).toBe(initialQty);
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });

  test("T3-06 (A1+A5+A3): Cross-clinic tenant isolation on conflicts & pending dispenses", async ({
    request,
  }) => {
    const ashuliaAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const dhamraiAuth = await apiLogin(request, DEMO_ACCOUNTS.dhamraiDispenser);

    const ashuliaPatient = await createIsolatedPatient(
      request,
      ashuliaAuth.access_token
    );
    await request.patch(apiUrl(`/api/v1/patients/${ashuliaPatient.id}`), {
      headers: authHeaders(ashuliaAuth.access_token),
      data: { base_version: 1, weight_kg: 66 },
    });

    let conflictId: string | undefined;
    try {
      const conflictRes = await request.post(apiUrl("/api/v1/sync/mutations"), {
        headers: authHeaders(ashuliaAuth.access_token, {
          "Idempotency-Key": `iso-c-${crypto.randomUUID()}`,
        }),
        data: {
          client_mutation_id: crypto.randomUUID(),
          entity_type: "PATIENT",
          entity_id: ashuliaPatient.id,
          base_version: 1,
          payload: { allergies: ["SULFONAMIDE"] },
        },
      });
      expect(conflictRes.status()).toBe(409);
      const conflict = (await conflictRes.json()) as ConflictPayload;
      conflictId = conflict.conflict_id;

      const batches = await getInventoryBatches(
        request,
        ashuliaAuth.access_token
      );
      const ashuliaBatch = batches.find((b) => b.qty_remaining >= 1);
      const draft = await createDispenseDraft(
        request,
        ashuliaAuth.access_token,
        {
          patient_id: ashuliaPatient.id,
          batch_id: ashuliaBatch?.id,
          antibiotic_id: ashuliaBatch?.antibiotic_id,
          syndrome_code: "CAP_MILD",
          aware_category: "ACCESS",
          qty_dispensed: 1,
        }
      );

      const dhamraiConflicts = extractArray<{ id: string }>(
        await (
          await request.get(apiUrl("/api/v1/sync/conflicts"), {
            headers: authHeaders(dhamraiAuth.access_token),
          })
        ).json(),
        ["conflicts", "items"]
      );
      expect(dhamraiConflicts.some((c) => c.id === conflict.conflict_id)).toBe(
        false
      );

      await assertErrorEnvelope(
        await request.post(
          apiUrl(`/api/v1/sync/conflicts/${conflict.conflict_id}/resolve`),
          {
            headers: authHeaders(dhamraiAuth.access_token),
            data: { resolution: "RESOLVED_SERVER", notes: "Cross-clinic block" },
          }
        ),
        [403, 404]
      );

      await assertErrorEnvelope(
        await request.post(apiUrl(`/api/v1/dispenses/${draft.id}/submit`), {
          headers: authHeaders(dhamraiAuth.access_token),
        }),
        [403, 404]
      );
    } finally {
      if (conflictId) {
        await resolveConflictSafe(request, conflictId);
      }
    }
  });

  test("T3-07 (A4+A1+A2): Offline PIN unlock -> local VIRAL_URI MILD NO_ANTIBIOTIC -> clean sync", async () => {
    await withPersistentContext(async (context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await waitForSerwistController(page);
      await warmCachedRoutes(page, [
        "/login",
        "/dashboard",
        "/dashboard/triage",
        "/dashboard/sync",
      ]);

      await context.setOffline(true);
      await page.goto("/login", { waitUntil: "domcontentloaded" });
      await unlockOfflinePin(
        page,
        DEMO_ACCOUNTS.dispenser.pin,
        DEMO_ACCOUNTS.dispenser.email
      );
      await page.waitForURL((url) => url.pathname.includes("/dashboard"), {
        timeout: 15_000,
      });

      await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });
      const uniqueName = `Offline Viral ${Date.now()}`;
      const nameInput = page
        .getByLabel(/patient name|full name|name/i)
        .or(page.getByPlaceholder(/name/i))
        .first();
      await nameInput.fill(uniqueName);
      await page
        .getByRole("button", { name: /save patient|create patient|save/i })
        .first()
        .click();

      await expect
        .poll(async () => {
          const snap = await inspectDexieStores(page);
          return snap.patients.some((p) => p.full_name === uniqueName);
        })
        .toBe(true);

      const syndromeSelect = getTriageSyndromeSelect(page);
      await syndromeSelect.selectOption("VIRAL_URI").catch(async () => {
        await syndromeSelect.fill("VIRAL_URI");
      });
      const severitySelect = getTriageSeveritySelect(page);
      if (await severitySelect.isVisible().catch(() => false)) {
        await severitySelect.selectOption("MILD").catch(() => undefined);
      }
      await getOptimizeSubmitButton(page).click();
      await expect(page.locator("body")).toContainText(
        /NO_ANTIBIOTIC|no antibiotic|symptomatic/i
      );

      const syncRes = await reconnectAndSyncMutations(context, page);
      expect([200, 201]).toContain(syncRes.status());
    });
  });

  test("T3-08 (A3+A6+A1): Idempotency-Key retry + Pharmacist rejection preserves stock & KPI", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const beforeKpi = await getStewardshipAnalytics(
      request,
      dispAuth.access_token
    );
    const batches = await getInventoryBatches(request, dispAuth.access_token);
    const watchBatch = batches.find(
      (b) => getBatchTier(b) === "WATCH" && b.qty_remaining >= 2
    );
    expect(watchBatch).toBeDefined();
    const initialQty = watchBatch?.qty_remaining ?? 0;

    const patient = await createIsolatedPatient(request, dispAuth.access_token);
    const idemKey = `t308-${crypto.randomUUID()}`;
    const body = {
      patient_id: patient.id,
      batch_id: watchBatch?.id,
      antibiotic_id: watchBatch?.antibiotic_id,
      syndrome_code: "CAP_MODERATE",
      aware_category: "WATCH",
      qty_dispensed: 1,
    };

    const r1 = await request.post(apiUrl("/api/v1/dispenses"), {
      headers: authHeaders(dispAuth.access_token, {
        "Idempotency-Key": idemKey,
      }),
      data: body,
    });
    const r2 = await request.post(apiUrl("/api/v1/dispenses"), {
      headers: authHeaders(dispAuth.access_token, {
        "Idempotency-Key": idemKey,
      }),
      data: body,
    });
    const d1 = (await r1.json()) as DispenseRecord;
    const d2 = (await r2.json()) as DispenseRecord;
    expect(d2.id).toBe(d1.id);

    await request.post(apiUrl(`/api/v1/dispenses/${d1.id}/submit`), {
      headers: authHeaders(dispAuth.access_token),
    });
    const rejectRes = await request.post(
      apiUrl(`/api/v1/dispenses/${d1.id}/reject`),
      {
        headers: authHeaders(pharmAuth.access_token),
        data: { reason: "Watch antibiotic unnecessary" },
      }
    );
    expect(rejectRes.status()).toBe(200);

    const afterBatches = await getInventoryBatches(
      request,
      dispAuth.access_token
    );
    expect(
      afterBatches.find((b) => b.id === watchBatch?.id)?.qty_remaining
    ).toBe(initialQty);

    const afterKpi = await getStewardshipAnalytics(
      request,
      dispAuth.access_token
    );
    expect(afterKpi.watch_count).toBe(beforeKpi.watch_count);
    expect(afterKpi.access_ratio_pct).toBe(beforeKpi.access_ratio_pct);
  });
});
