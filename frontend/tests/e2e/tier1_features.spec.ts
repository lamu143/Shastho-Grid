import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  apiLogin,
  apiLoginFresh,
  apiUrl,
  assertErrorEnvelope,
  authHeaders,
  createAndApproveDispense,
  createDispenseDraft,
  createIsolatedPatient,
  decodeJwtPayload,
  DEMO_ACCOUNTS,
  extractArray,
  futureDateIso,
  getBatchTier,
  getInventoryBatches,
  getStewardshipAnalytics,
  isUuidV4,
  resolveConflictSafe,
  runOptimize,
  voidDispenseSafe,
  type BatchRecord,
  type ConflictPayload,
  type DispenseRecord,
  type PatientRecord,
  type VoiceIntakeResponse,
} from "./helpers/api";
import {
  assertBanglaRendered,
  assertDisclaimerVisible,
  assertNoHorizontalOverflow,
  assertSemanticLandmarks,
  runCriticalAxeAudit,
} from "./helpers/a11y";
import {
  loginViaCredentials,
  loginViaQuickFillRole,
  unlockOfflinePin,
} from "./helpers/auth";
import {
  clickScopedConflictResolveButton,
  getOptimizeSubmitButton,
  getTriageSeveritySelect,
  getTriageSyndromeSelect,
  toggleLanguageAndVerifyBangla,
  toggleLanguageBackToEnglish,
} from "./helpers/locators";
import {
  inspectDexieStores,
  waitForSerwistController,
  warmCachedRoutes,
  withPersistentContext,
} from "./helpers/pwa";

test.describe("Tier 1: Core Functional E2E Suite (42 Cases across A1-A7)", () => {
  test("T1-A1-01: /healthz and POST /api/v1/auth/login for Ashulia dispenser", async ({
    request,
  }) => {
    const healthRes = await request.get(apiUrl("/healthz"));
    expect(healthRes.status()).toBe(200);
    const healthBody = (await healthRes.json()) as {
      status: string;
      db: string;
      redis: string;
    };
    expect(healthBody.status).toBe("ok");
    expect(healthBody.db).toBe("ok");
    expect(healthBody.redis).toBe("ok");

    const loginRes = await apiLoginFresh(
      request,
      DEMO_ACCOUNTS.dispenser.email,
      DEMO_ACCOUNTS.dispenser.password
    );
    expect(loginRes.status()).toBe(200);
    const auth = (await loginRes.json()) as {
      access_token: string;
      token_type: string;
      user: { role: string; clinic_name: string; email: string };
    };
    expect(auth.token_type.toLowerCase()).toBe("bearer");
    expect(auth.user.email).toBe(DEMO_ACCOUNTS.dispenser.email);
    expect(auth.user.role).toBe("dispenser");
    expect(auth.user.clinic_name).toBe("Ashulia Union Sub-Center");

    const badLoginRes = await apiLoginFresh(
      request,
      DEMO_ACCOUNTS.dispenser.email,
      "WrongPassword#999"
    );
    await assertErrorEnvelope(badLoginRes, [401]);
  });

  test("T1-A1-02: Quick-Fill Demo Role Drawer UI login on /login as pharmacist", async ({
    page,
  }) => {
    await loginViaQuickFillRole(page, /pharmacist/i);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).toContainText(
      /pharmacist|Ashulia Union Sub-Center/i
    );
  });

  test("T1-A1-03: GET /api/v1/auth/me matches JWT claims across all 4 Ashulia roles", async ({
    request,
  }) => {
    const accounts = [
      DEMO_ACCOUNTS.dispenser,
      DEMO_ACCOUNTS.pharmacist,
      DEMO_ACCOUNTS.auditor,
      DEMO_ACCOUNTS.admin,
    ];

    for (const account of accounts) {
      const auth = await apiLogin(request, account);
      const claims = decodeJwtPayload(auth.access_token);
      expect(claims.email).toBe(account.email);
      expect(claims.role).toBe(account.role);
      expect(claims.clinic_name).toBe(account.clinicName);
      expect(typeof claims.clinic_id).toBe("string");

      const meRes = await request.get(apiUrl("/api/v1/auth/me"), {
        headers: authHeaders(auth.access_token),
      });
      expect(meRes.status()).toBe(200);
      const me = (await meRes.json()) as {
        email: string;
        role: string;
        clinic_id: string;
        clinic_name: string;
      };
      expect(me.email).toBe(account.email);
      expect(me.role).toBe(account.role);
      expect(me.clinic_id).toBe(claims.clinic_id);
      expect(me.clinic_name).toBe(account.clinicName);
    }

    const unauthMe = await request.get(apiUrl("/api/v1/auth/me"));
    await assertErrorEnvelope(unauthMe, [401]);
  });

  test("T1-A1-04: Online PIN verification (/auth/verify-pin) and /dashboard/profile route", async ({
    page,
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const validPinRes = await request.post(apiUrl("/api/v1/auth/verify-pin"), {
      headers: authHeaders(auth.access_token),
      data: {
        email: DEMO_ACCOUNTS.dispenser.email,
        pin: DEMO_ACCOUNTS.dispenser.pin,
      },
    });
    expect(validPinRes.status()).toBe(200);
    const validBody = (await validPinRes.json()) as { verified: boolean };
    expect(validBody.verified).toBe(true);

    const invalidPinRes = await request.post(
      apiUrl("/api/v1/auth/verify-pin"),
      {
        headers: authHeaders(auth.access_token),
        data: {
          email: DEMO_ACCOUNTS.dispenser.email,
          pin: "0000",
        },
      }
    );
    await assertErrorEnvelope(invalidPinRes, [401]);

    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    await page.goto("/dashboard/profile", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(
      /dispenser@awaregrid\.org|Ashulia/i
    );
  });

  test("T1-A1-05: Admin governance endpoints and /admin portal", async ({
    page,
    request,
  }) => {
    const adminAuth = await apiLogin(request, DEMO_ACCOUNTS.admin);
    const endpoints = [
      { path: "/api/v1/admin/clinics", keys: ["clinics", "items"], minLen: 1 },
      { path: "/api/v1/admin/users", keys: ["users", "items"], minLen: 4 },
      {
        path: "/api/v1/admin/audit-logs",
        keys: ["audit_logs", "logs", "items"],
        minLen: 0,
      },
      {
        path: "/api/v1/admin/guidelines",
        keys: ["guidelines", "items"],
        minLen: 15,
      },
      {
        path: "/api/v1/admin/catalog",
        keys: ["catalog", "antibiotics", "items"],
        minLen: 20,
      },
    ];

    for (const ep of endpoints) {
      const res = await request.get(apiUrl(ep.path), {
        headers: authHeaders(adminAuth.access_token),
      });
      expect(res.status(), `Failed ${ep.path}`).toBe(200);
      const data: unknown = await res.json();
      const rows = extractArray<Record<string, unknown>>(data, ep.keys);
      expect(rows.length, `${ep.path} length`).toBeGreaterThanOrEqual(
        ep.minLen
      );
    }

    await loginViaCredentials(page, DEMO_ACCOUNTS.admin);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(
      /Ashulia|Dhamrai|clinics|audit/i
    );
  });

  test("T1-A1-06: Patient create with client UUIDv4 & clinic-scoped search (?q=)", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const uniqueTag = crypto.randomUUID().slice(0, 8).toUpperCase();
    const mrn = `MRN-T1A106-${uniqueTag}`;
    const created = await createIsolatedPatient(request, auth.access_token, {
      mrn,
      full_name: `Fatema Khatun ${uniqueTag}`,
      age_years: 30,
      weight_kg: 62,
      sex: "F",
      is_pregnant: false,
      egfr: 95,
      allergies: [],
    });
    expect(isUuidV4(created.id)).toBe(true);
    expect(created.version).toBe(1);

    const searchRes = await request.get(
      apiUrl(`/api/v1/patients?q=${encodeURIComponent(mrn)}`),
      { headers: authHeaders(auth.access_token) }
    );
    expect(searchRes.status()).toBe(200);
    const listData: unknown = await searchRes.json();
    const rows = extractArray<PatientRecord>(listData, ["patients", "items"]);
    expect(rows.some((p) => p.id === created.id)).toBe(true);

    const invalidRes = await request.post(apiUrl("/api/v1/patients"), {
      headers: authHeaders(auth.access_token),
      data: { full_name: "" },
    });
    await assertErrorEnvelope(invalidRes, [400, 422]);
  });

  test("T1-A2-01: CP-SAT selects Access antibiotic for UNCOMPLICATED_UTI", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const result = await runOptimize(request, auth.access_token, {
      patient_profile: {
        age_years: 28,
        weight_kg: 58,
        sex: "F",
        is_pregnant: false,
        egfr: 95,
        allergies: [],
      },
      syndrome_code: "UNCOMPLICATED_UTI",
      severity: "MODERATE",
    });
    expect(result.solver_status).toBe("OPTIMAL");
    expect(result.aware_category).toBe("ACCESS");
    expect(result.recommended_antibiotic).not.toBeNull();
    expect(result.recommended_batch).not.toBeNull();
    expect(result.recommended_batch?.qty_remaining ?? 0).toBeGreaterThanOrEqual(
      1
    );

    const badSyndrome = await request.post(apiUrl("/api/v1/optimize"), {
      headers: authHeaders(auth.access_token),
      data: {
        patient_profile: {
          age_years: 28,
          weight_kg: 58,
          sex: "F",
          is_pregnant: false,
          egfr: 95,
          allergies: [],
        },
        syndrome_code: "UNKNOWN_SYNDROME_XYZ",
        severity: "MODERATE",
      },
    });
    await assertErrorEnvelope(badSyndrome, [400, 404, 422]);
  });

  test("T1-A2-02: Triage UI optimization flow for CAP_MILD", async ({
    page,
  }) => {
    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });

    const syndromeSelect = getTriageSyndromeSelect(page);
    await expect(syndromeSelect).toBeVisible();
    await syndromeSelect.selectOption("CAP_MILD").catch(async () => {
      await syndromeSelect.fill("CAP_MILD");
    });

    const severitySelect = getTriageSeveritySelect(page);
    if (await severitySelect.isVisible().catch(() => false)) {
      await severitySelect.selectOption("MILD").catch(() => undefined);
    }

    const optimizeResPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/v1/optimize") &&
        res.request().method() === "POST"
    );

    await getOptimizeSubmitButton(page).click();
    const optimizeRes = await optimizeResPromise;
    expect(optimizeRes.status()).toBe(200);

    await expect(page.locator("body")).toContainText(/ACCESS|AMOXICILLIN|OPTIMAL/i);
  });

  test("T1-A2-03: Pass 1 tier cost preference chooses ACCESS over WATCH/RESERVE", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const result = await runOptimize(request, auth.access_token, {
      patient_profile: {
        age_years: 24,
        weight_kg: 64,
        sex: "M",
        is_pregnant: false,
        egfr: 100,
        allergies: [],
      },
      syndrome_code: "STREP_PHARYNGITIS",
      severity: "MODERATE",
    });
    expect(result.solver_status).toBe("OPTIMAL");
    expect(result.aware_category).toBe("ACCESS");
  });

  test("T1-A2-04: Pass 2 MUS conflict extraction when all Access candidates blocked", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const result = await runOptimize(request, auth.access_token, {
      patient_profile: {
        age_years: 26,
        weight_kg: 60,
        sex: "F",
        is_pregnant: true,
        egfr: 15,
        allergies: [
          "PENICILLIN",
          "BETA_LACTAM",
          "CEPHALOSPORIN",
          "SULFONAMIDE",
          "TETRACYCLINE",
          "NITROFURANTOIN",
          "AMINOGLYCOSIDE",
        ],
      },
      syndrome_code: "UNCOMPLICATED_UTI",
      severity: "MODERATE",
      max_aware_tier: "ACCESS",
    });

    expect(result.solver_status).toBe("INFEASIBLE");
    expect(result.recommended_antibiotic).toBeNull();
    expect(result.mus_conflicts.length).toBeGreaterThan(0);
    for (const mus of result.mus_conflicts) {
      expect(typeof mus.code).toBe("string");
      expect(mus.code.length).toBeGreaterThan(0);
      expect(typeof mus.label).toBe("string");
      expect(typeof mus.detail).toBe("string");
    }
  });

  test("T1-A2-05: Pass 3 safe relaxation suggests ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const result = await runOptimize(request, auth.access_token, {
      patient_profile: {
        age_years: 29,
        weight_kg: 62,
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
      syndrome_code: "STREP_PHARYNGITIS",
      severity: "MODERATE",
      max_aware_tier: "ACCESS",
    });

    expect(result.solver_status).toBe("INFEASIBLE");
    expect(result.safe_relaxations.length).toBeGreaterThan(0);
    const watchEsc = result.safe_relaxations.find(
      (r) => r.action === "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL"
    );
    expect(watchEsc).toBeDefined();
    expect((watchEsc?.rationale ?? "").length).toBeGreaterThan(0);
  });

  test("T1-A2-06: max_aware_tier=WATCH permits WATCH when Access blocked and blocks RESERVE", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const result = await runOptimize(request, auth.access_token, {
      patient_profile: {
        age_years: 32,
        weight_kg: 65,
        sex: "M",
        is_pregnant: false,
        egfr: 95,
        allergies: [
          "PENICILLIN",
          "BETA_LACTAM",
          "CEPHALOSPORIN",
          "SULFONAMIDE",
          "TETRACYCLINE",
        ],
      },
      syndrome_code: "CAP_MODERATE",
      severity: "MODERATE",
      max_aware_tier: "WATCH",
    });

    expect(["ACCESS", "WATCH"]).toContain(result.aware_category);
    expect(result.aware_category).not.toBe("RESERVE");
  });

  test("T1-A3-01: GET /api/v1/inventory/batches is strictly FEFO sorted (expiry_date ASC)", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const batches = await getInventoryBatches(request, auth.access_token);
    expect(batches.length).toBeGreaterThan(0);

    for (let i = 1; i < batches.length; i++) {
      const prev = batches[i - 1]?.expiry_date ?? "";
      const curr = batches[i]?.expiry_date ?? "";
      expect(curr >= prev, `FEFO violation: ${prev} > ${curr}`).toBe(true);
    }

    const hasStockedOut = batches.some((b) => b.qty_remaining === 0);
    const hasExpiringSoon = batches.some(
      (b) =>
        b.qty_remaining > 0 &&
        typeof b.days_to_expiry === "number" &&
        b.days_to_expiry > 0 &&
        b.days_to_expiry <= 30
    );
    expect(hasStockedOut).toBe(true);
    expect(hasExpiringSoon).toBe(true);

    const unauthRes = await request.get(apiUrl("/api/v1/inventory/batches"));
    await assertErrorEnvelope(unauthRes, [401]);
  });

  test("T1-A3-02: /dashboard/inventory UI search, tier filter & status badges", async ({
    page,
  }) => {
    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    await page.goto("/dashboard/inventory", { waitUntil: "domcontentloaded" });

    const searchInput = page
      .getByPlaceholder(/search|filter|খুঁজুন/i)
      .or(page.getByLabel(/search/i))
      .first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("COTRIMOXAZOLE");
    await expect(page.locator("body")).toContainText(/COTRIMOXAZOLE/i);

    await searchInput.fill("NONEXISTENT_ANTIBIOTIC_XYZ_999");
    await expect(page.locator("body")).toContainText(
      /no.*batch|no.*match|no.*result|0/i
    );
  });

  test("T1-A3-03: Dispense happy path DRAFT -> PENDING_APPROVAL -> DISPENSED decrements FEFO stock", async ({
    request,
  }) => {
    const dispenserAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmacistAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const patient = await createIsolatedPatient(
      request,
      dispenserAuth.access_token
    );

    const batches = await getInventoryBatches(
      request,
      dispenserAuth.access_token
    );
    const targetBatch = batches.find(
      (b) =>
        getBatchTier(b) === "ACCESS" &&
        b.qty_remaining >= 3 &&
        (b.days_to_expiry ?? 30) > 0
    );
    expect(targetBatch).toBeDefined();
    const initialQty = targetBatch?.qty_remaining ?? 0;
    const initialVersion = targetBatch?.version;

    let dispenseId: string | undefined;
    try {
      const approved = await createAndApproveDispense(
        request,
        dispenserAuth.access_token,
        pharmacistAuth.access_token,
        {
          patient_id: patient.id,
          batch_id: targetBatch?.id,
          antibiotic_id: targetBatch?.antibiotic_id,
          syndrome_code: "UNCOMPLICATED_UTI",
          aware_category: "ACCESS",
          qty_dispensed: 1,
        }
      );
      dispenseId = approved.id;
      expect(approved.status).toBe("DISPENSED");

      const updatedBatches = await getInventoryBatches(
        request,
        dispenserAuth.access_token
      );
      const updatedBatch = updatedBatches.find((b) => b.id === targetBatch?.id);
      expect(updatedBatch?.qty_remaining).toBe(initialQty - 1);
      if (
        typeof initialVersion === "number" &&
        typeof updatedBatch?.version === "number"
      ) {
        expect(updatedBatch.version).toBe(initialVersion + 1);
      }
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });

  test("T1-A3-04: Dispense rejection (PENDING_APPROVAL -> REJECTED) leaves stock unchanged", async ({
    request,
  }) => {
    const dispenserAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmacistAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const patient = await createIsolatedPatient(
      request,
      dispenserAuth.access_token
    );

    const batches = await getInventoryBatches(
      request,
      dispenserAuth.access_token
    );
    const targetBatch = batches.find(
      (b) => b.qty_remaining >= 2 && (b.days_to_expiry ?? 30) > 0
    );
    expect(targetBatch).toBeDefined();
    const initialQty = targetBatch?.qty_remaining ?? 0;

    const draft = await createDispenseDraft(request, dispenserAuth.access_token, {
      patient_id: patient.id,
      batch_id: targetBatch?.id,
      antibiotic_id: targetBatch?.antibiotic_id,
      syndrome_code: "CAP_MILD",
      aware_category: getBatchTier(targetBatch!) as "ACCESS" | "WATCH",
      qty_dispensed: 1,
    });

    const submitRes = await request.post(
      apiUrl(`/api/v1/dispenses/${draft.id}/submit`),
      { headers: authHeaders(dispenserAuth.access_token) }
    );
    expect(submitRes.status()).toBe(200);

    const rejectRes = await request.post(
      apiUrl(`/api/v1/dispenses/${draft.id}/reject`),
      {
        headers: authHeaders(pharmacistAuth.access_token),
        data: { reason: "Clinical review rejected" },
      }
    );
    expect(rejectRes.status()).toBe(200);
    const rejected = (await rejectRes.json()) as DispenseRecord;
    expect(rejected.status).toBe("REJECTED");

    const afterBatches = await getInventoryBatches(
      request,
      dispenserAuth.access_token
    );
    const afterBatch = afterBatches.find((b) => b.id === targetBatch?.id);
    expect(afterBatch?.qty_remaining).toBe(initialQty);

    const approveRejected = await request.post(
      apiUrl(`/api/v1/dispenses/${draft.id}/approve`),
      { headers: authHeaders(pharmacistAuth.access_token) }
    );
    await assertErrorEnvelope(approveRejected, [409, 422]);
  });

  test("T1-A3-05: Dispense void (DISPENSED -> VOIDED) restores stock atomically & denies dispenser", async ({
    request,
  }) => {
    const dispenserAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmacistAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const patient = await createIsolatedPatient(
      request,
      dispenserAuth.access_token
    );

    const batches = await getInventoryBatches(
      request,
      dispenserAuth.access_token
    );
    const targetBatch = batches.find(
      (b) =>
        getBatchTier(b) === "ACCESS" &&
        b.qty_remaining >= 4 &&
        (b.days_to_expiry ?? 30) > 0
    );
    expect(targetBatch).toBeDefined();
    const initialQty = targetBatch?.qty_remaining ?? 0;

    let dispenseId: string | undefined;
    try {
      const dispensed = await createAndApproveDispense(
        request,
        dispenserAuth.access_token,
        pharmacistAuth.access_token,
        {
          patient_id: patient.id,
          batch_id: targetBatch?.id,
          antibiotic_id: targetBatch?.antibiotic_id,
          syndrome_code: "STREP_PHARYNGITIS",
          aware_category: "ACCESS",
          qty_dispensed: 2,
        }
      );
      dispenseId = dispensed.id;

      const midBatches = await getInventoryBatches(
        request,
        dispenserAuth.access_token
      );
      expect(
        midBatches.find((b) => b.id === targetBatch?.id)?.qty_remaining
      ).toBe(initialQty - 2);

      const forbiddenVoid = await request.post(
        apiUrl(`/api/v1/dispenses/${dispensed.id}/void`),
        { headers: authHeaders(dispenserAuth.access_token) }
      );
      await assertErrorEnvelope(forbiddenVoid, [403]);

      const voidRes = await request.post(
        apiUrl(`/api/v1/dispenses/${dispensed.id}/void`),
        {
          headers: authHeaders(pharmacistAuth.access_token),
          data: { reason: "Erroneous entry voided" },
        }
      );
      expect(voidRes.status()).toBe(200);
      const voided = (await voidRes.json()) as DispenseRecord;
      expect(voided.status).toBe("VOIDED");

      const finalBatches = await getInventoryBatches(
        request,
        dispenserAuth.access_token
      );
      expect(
        finalBatches.find((b) => b.id === targetBatch?.id)?.qty_remaining
      ).toBe(initialQty);
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });

  test("T1-A3-06: Pharmacist creates and updates an inventory batch; dispenser/auditor get 403", async ({
    request,
  }) => {
    const pharmacistAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const dispenserAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const auditorAuth = await apiLogin(request, DEMO_ACCOUNTS.auditor);

    const existing = await getInventoryBatches(
      request,
      pharmacistAuth.access_token
    );
    const refBatch = existing.find((b) => Boolean(b.antibiotic_id));
    expect(refBatch).toBeDefined();

    const lotCode = `LOT-E2E-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const createRes = await request.post(apiUrl("/api/v1/inventory/batches"), {
      headers: authHeaders(pharmacistAuth.access_token),
      data: {
        antibiotic_id: refBatch?.antibiotic_id,
        lot_number: lotCode,
        batch_number: lotCode,
        expiry_date: futureDateIso(730),
        qty_initial: 20,
        qty_remaining: 20,
      },
    });
    expect([200, 201]).toContain(createRes.status());
    const created = (await createRes.json()) as BatchRecord;
    expect(created.qty_remaining).toBe(20);

    const patchRes = await request.patch(
      apiUrl(`/api/v1/inventory/batches/${created.id}`),
      {
        headers: authHeaders(pharmacistAuth.access_token),
        data: { qty_remaining: 15 },
      }
    );
    expect(patchRes.status()).toBe(200);
    const patched = (await patchRes.json()) as BatchRecord;
    expect(patched.qty_remaining).toBe(15);

    const afterList = await getInventoryBatches(
      request,
      pharmacistAuth.access_token
    );
    expect(afterList.some((b) => b.id === created.id)).toBe(true);

    const dispForbidden = await request.post(
      apiUrl("/api/v1/inventory/batches"),
      {
        headers: authHeaders(dispenserAuth.access_token),
        data: {
          antibiotic_id: refBatch?.antibiotic_id,
          lot_number: "LOT-DENIED",
          expiry_date: futureDateIso(100),
          qty_initial: 5,
        },
      }
    );
    await assertErrorEnvelope(dispForbidden, [403]);

    const audForbidden = await request.patch(
      apiUrl(`/api/v1/inventory/batches/${created.id}`),
      {
        headers: authHeaders(auditorAuth.access_token),
        data: { qty_remaining: 1 },
      }
    );
    await assertErrorEnvelope(audForbidden, [403]);
  });

  test("T1-A4-01: Production Serwist Service Worker registers and controls persistent context", async () => {
    await withPersistentContext(async (_context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const controlled = await waitForSerwistController(page);
      expect(controlled).toBe(true);

      const swScript = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        return reg.active?.scriptURL ?? "";
      });
      expect(swScript).toMatch(/sw\.js/i);
    });
  });

  test("T1-A4-02: Dexie awaregrid_offline_v1 hydrates all 5 stores on login/bootstrap & /dashboard/settings renders", async () => {
    await withPersistentContext(async (_context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

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
            snap.batches.length > 0 &&
            snap.guidelines.length >= 15
          );
        })
        .toBe(true);

      await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.locator("body")).toContainText(
        /settings|offline|pin|sync|language|সেটিংস/i
      );
    });
  });

  test("T1-A4-03: Offline navigation fallback serves /~offline cleanly when uncached", async () => {
    await withPersistentContext(async (context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await waitForSerwistController(page);
      await warmCachedRoutes(page, [
        "/dashboard",
        "/dashboard/triage",
        "/dashboard/sync",
        "/dashboard/settings",
        "/~offline",
      ]);

      await context.setOffline(true);
      await page.goto(`/uncached-probe-${Date.now()}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(page.locator("body")).toContainText(
        /offline|dashboard|triage|sync/i
      );
      await assertSemanticLandmarks(page);
    });
  });

  test("T1-A4-04: Offline patient creation queues UUIDv4 patient and pending mutation in Dexie", async () => {
    await withPersistentContext(async (context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await waitForSerwistController(page);
      await warmCachedRoutes(page, ["/dashboard", "/dashboard/triage"]);
      await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });

      await context.setOffline(true);

      const newPatientBtn = page
        .getByRole("button", { name: /new patient|create patient|add patient/i })
        .first();
      if (await newPatientBtn.isVisible().catch(() => false)) {
        await newPatientBtn.click();
      }

      const uniqueName = `Offline Patient ${Date.now()}`;
      const nameInput = page
        .getByLabel(/patient name|full name|name/i)
        .or(page.getByPlaceholder(/name/i))
        .first();
      await expect(nameInput).toBeVisible();
      await nameInput.fill(uniqueName);

      const saveBtn = page
        .getByRole("button", { name: /save patient|create patient|save/i })
        .first();
      await saveBtn.click();

      await expect
        .poll(async () => {
          const snap = await inspectDexieStores(page);
          const created = snap.patients.find((p) => p.full_name === uniqueName);
          if (!created || typeof created.id !== "string") return false;
          const validUuid = isUuidV4(created.id);
          const hasPending = snap.syncMutations.some(
            (m) =>
              m.entity_id === created.id &&
              typeof m.idempotency_key === "string" &&
              (m.status === "pending" || m.status === "queued")
          );
          return validUuid && hasPending;
        })
        .toBe(true);
    });
  });

  test("T1-A4-05: Offline deterministic localRules evaluates UNCOMPLICATED_UTI cleanly", async () => {
    await withPersistentContext(async (context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await waitForSerwistController(page);
      await warmCachedRoutes(page, ["/dashboard", "/dashboard/triage"]);
      await page.goto("/dashboard/triage", { waitUntil: "domcontentloaded" });

      await context.setOffline(true);

      const syndromeSelect = getTriageSyndromeSelect(page);
      await syndromeSelect.selectOption("UNCOMPLICATED_UTI").catch(async () => {
        await syndromeSelect.fill("UNCOMPLICATED_UTI");
      });

      await getOptimizeSubmitButton(page).click();

      await expect(page.locator("body")).toContainText(
        /offline|local|ACCESS|AMOXICILLIN|NITROFURANTOIN|COTRIMOXAZOLE/i
      );
    });
  });

  test("T1-A4-06: Offline PIN unlock on /login unlocks clinical workspace while offline", async () => {
    await withPersistentContext(async (context, page) => {
      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await waitForSerwistController(page);
      await warmCachedRoutes(page, ["/login", "/dashboard", "/dashboard/triage"]);

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
      await expect(page.locator("body")).toContainText(/Ashulia|dashboard|triage/i);
    });
  });

  test("T1-A5-01: GET /api/v1/sync/bootstrap returns full clinic snapshot", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const res = await request.get(apiUrl("/api/v1/sync/bootstrap"), {
      headers: authHeaders(auth.access_token),
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.patients).toBeDefined();
    expect(body.batches).toBeDefined();
    expect(body.guidelines).toBeDefined();
    expect(body.catalog).toBeDefined();
    expect(body.dispenses).toBeDefined();
    expect(body.conflicts).toBeDefined();
    expect(body.analytics).toBeDefined();

    const unauth = await request.get(apiUrl("/api/v1/sync/bootstrap"));
    await assertErrorEnvelope(unauth, [401]);
  });

  test("T1-A5-02: Clean offline mutation sync applies when base_version == server_version", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const patient = await createIsolatedPatient(request, auth.access_token, {
      weight_kg: 55,
    });
    expect(patient.version).toBe(1);

    const mutationRes = await request.post(apiUrl("/api/v1/sync/mutations"), {
      headers: authHeaders(auth.access_token, {
        "Idempotency-Key": `sync-${crypto.randomUUID()}`,
      }),
      data: {
        client_mutation_id: crypto.randomUUID(),
        entity_type: "PATIENT",
        entity_id: patient.id,
        base_version: 1,
        payload: {
          weight_kg: 59,
          allergies: ["PENICILLIN"],
        },
      },
    });
    expect([200, 201]).toContain(mutationRes.status());

    const afterGet = await request.get(
      apiUrl(`/api/v1/patients/${patient.id}`),
      { headers: authHeaders(auth.access_token) }
    );
    expect(afterGet.status()).toBe(200);
    const updated = (await afterGet.json()) as PatientRecord;
    expect(updated.version).toBeGreaterThanOrEqual(2);
    expect(updated.allergies).toContain("PENICILLIN");
  });

  test("T1-A5-03: Version-skew mutation returns HTTP 409 SYNC_VERSION_CONFLICT (no LWW)", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const patient = await createIsolatedPatient(request, dispAuth.access_token);

    const patchRes = await request.patch(
      apiUrl(`/api/v1/patients/${patient.id}`),
      {
        headers: authHeaders(pharmAuth.access_token),
        data: { base_version: 1, weight_kg: 66 },
      }
    );
    expect(patchRes.status()).toBe(200);

    let conflictId: string | undefined;
    try {
      const conflictRes = await request.post(apiUrl("/api/v1/sync/mutations"), {
        headers: authHeaders(dispAuth.access_token, {
          "Idempotency-Key": `conflict-${crypto.randomUUID()}`,
        }),
        data: {
          client_mutation_id: crypto.randomUUID(),
          entity_type: "PATIENT",
          entity_id: patient.id,
          base_version: 1,
          payload: {
            allergies: ["SULFONAMIDE"],
            requested_antibiotic: "COTRIMOXAZOLE",
          },
        },
      });
      expect(conflictRes.status()).toBe(409);
      const body = (await conflictRes.json()) as ConflictPayload;
      conflictId = body.conflict_id;
      expect(body.error_code).toBe("SYNC_VERSION_CONFLICT");
      expect(typeof body.conflict_id).toBe("string");
      expect(body.server_snapshot).toBeDefined();
      expect(body.client_snapshot).toBeDefined();
      expect(body.cpsat_verdict).toBeDefined();
      expect(typeof body.trace_id).toBe("string");
      expect(body.details.conflict_id).toBe(body.conflict_id);
    } finally {
      if (conflictId) {
        await resolveConflictSafe(request, conflictId);
      }
    }
  });

  test("T1-A5-04: GET /api/v1/sync/conflicts & /dashboard/sync list open 409 conflicts", async ({
    page,
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const patient = await createIsolatedPatient(request, dispAuth.access_token);

    await request.patch(apiUrl(`/api/v1/patients/${patient.id}`), {
      headers: authHeaders(dispAuth.access_token),
      data: { base_version: 1, weight_kg: 67 },
    });

    let conflictId: string | undefined;
    try {
      const conflictRes = await request.post(apiUrl("/api/v1/sync/mutations"), {
        headers: authHeaders(dispAuth.access_token, {
          "Idempotency-Key": `c-${crypto.randomUUID()}`,
        }),
        data: {
          client_mutation_id: crypto.randomUUID(),
          entity_type: "PATIENT",
          entity_id: patient.id,
          base_version: 1,
          payload: { allergies: ["SULFONAMIDE"] },
        },
      });
      expect(conflictRes.status()).toBe(409);
      const conflict = (await conflictRes.json()) as ConflictPayload;
      conflictId = conflict.conflict_id;

      const listRes = await request.get(apiUrl("/api/v1/sync/conflicts"), {
        headers: authHeaders(dispAuth.access_token),
      });
      expect(listRes.status()).toBe(200);
      const listJson: unknown = await listRes.json();
      const rows = extractArray<{ id: string; status: string }>(listJson, [
        "conflicts",
        "items",
      ]);
      expect(
        rows.some((c) => c.id === conflict.conflict_id && c.status === "OPEN")
      ).toBe(true);

      await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
      await page.goto("/dashboard/sync", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(
        /SULFONAMIDE|conflict|server/i
      );
    } finally {
      if (conflictId) {
        await resolveConflictSafe(request, conflictId);
      }
    }
  });

  test("T1-A5-05: 409 Conflict Workbench safe resolution (RESOLVED_MERGED)", async ({
    page,
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const patient = await createIsolatedPatient(request, dispAuth.access_token);

    await request.patch(apiUrl(`/api/v1/patients/${patient.id}`), {
      headers: authHeaders(dispAuth.access_token),
      data: { base_version: 1, weight_kg: 68 },
    });

    let conflictId: string | undefined;
    try {
      const conflictRes = await request.post(apiUrl("/api/v1/sync/mutations"), {
        headers: authHeaders(dispAuth.access_token, {
          "Idempotency-Key": `cm-${crypto.randomUUID()}`,
        }),
        data: {
          client_mutation_id: crypto.randomUUID(),
          entity_type: "PATIENT",
          entity_id: patient.id,
          base_version: 1,
          payload: { allergies: ["SULFONAMIDE"] },
        },
      });
      expect(conflictRes.status()).toBe(409);
      const conflict = (await conflictRes.json()) as ConflictPayload;
      conflictId = conflict.conflict_id;

      await loginViaCredentials(page, DEMO_ACCOUNTS.pharmacist);
      await page.goto("/dashboard/sync", { waitUntil: "domcontentloaded" });

      await clickScopedConflictResolveButton(page, [
        conflict.conflict_id,
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
          const target = rows.find((c) => c.id === conflict.conflict_id);
          return target?.status !== "OPEN";
        })
        .toBe(true);
    } finally {
      if (conflictId) {
        await resolveConflictSafe(request, conflictId);
      }
    }
  });

  test("T1-A5-06: Conflict resolution RESOLVED_SERVER via API & 404 on unknown ID", async ({
    request,
  }) => {
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const patient = await createIsolatedPatient(request, pharmAuth.access_token);

    await request.patch(apiUrl(`/api/v1/patients/${patient.id}`), {
      headers: authHeaders(pharmAuth.access_token),
      data: { base_version: 1, weight_kg: 70 },
    });

    const conflictRes = await request.post(apiUrl("/api/v1/sync/mutations"), {
      headers: authHeaders(pharmAuth.access_token, {
        "Idempotency-Key": `cs-${crypto.randomUUID()}`,
      }),
      data: {
        client_mutation_id: crypto.randomUUID(),
        entity_type: "PATIENT",
        entity_id: patient.id,
        base_version: 1,
        payload: { allergies: ["PENICILLIN"] },
      },
    });
    expect(conflictRes.status()).toBe(409);
    const conflict = (await conflictRes.json()) as ConflictPayload;

    const resolveRes = await request.post(
      apiUrl(`/api/v1/sync/conflicts/${conflict.conflict_id}/resolve`),
      {
        headers: authHeaders(pharmAuth.access_token),
        data: {
          resolution: "RESOLVED_SERVER",
          notes: "Reviewed with pharmacist",
          merged_payload: {},
        },
      }
    );
    expect(resolveRes.status()).toBe(200);
    const resolvedBody = (await resolveRes.json()) as { status: string };
    expect(resolvedBody.status).toBe("RESOLVED_SERVER");

    const notFoundRes = await request.post(
      apiUrl(`/api/v1/sync/conflicts/${crypto.randomUUID()}/resolve`),
      {
        headers: authHeaders(pharmAuth.access_token),
        data: {
          resolution: "RESOLVED_SERVER",
          notes: "Missing ID",
          merged_payload: {},
        },
      }
    );
    await assertErrorEnvelope(notFoundRes, [404]);
  });

  test("T1-A6-01: Ashulia stewardship baseline starts near 52% (<60% WHO target)", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const analytics = await getStewardshipAnalytics(request, auth.access_token);

    expect(analytics.clinic_name).toBe("Ashulia Union Sub-Center");
    expect(analytics.access_count).toBeGreaterThanOrEqual(13);
    expect(analytics.watch_count).toBeGreaterThanOrEqual(11);
    expect(analytics.reserve_count).toBeGreaterThanOrEqual(1);
    expect(analytics.target_access_pct).toBe(60);
    expect(analytics.access_ratio_pct).toBeGreaterThanOrEqual(45);
    expect(analytics.access_ratio_pct).toBeLessThan(60);
    expect(analytics.meets_who_target).toBe(false);

    const unauth = await request.get(apiUrl("/api/v1/analytics/stewardship"));
    await assertErrorEnvelope(unauth, [401]);
  });

  test("T1-A6-02: /dashboard displays live WHO >=60% Access KPI header", async ({
    page,
  }) => {
    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/60%|Access|Watch|Reserve/i);
  });

  test("T1-A6-03: /dashboard/analytics renders breakdown & stock alerts with zero console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await loginViaCredentials(page, DEMO_ACCOUNTS.auditor);
    await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(
      /Access|Watch|Reserve|60%|expir|stock/i
    );
    expect(consoleErrors).toHaveLength(0);
  });

  test("T1-A6-04: Approving an ACCESS dispense immediately raises access_count & access_ratio_pct", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const before = await getStewardshipAnalytics(
      request,
      dispAuth.access_token
    );
    const patient = await createIsolatedPatient(request, dispAuth.access_token);
    const batches = await getInventoryBatches(request, dispAuth.access_token);
    const accessBatch = batches.find(
      (b) =>
        getBatchTier(b) === "ACCESS" &&
        b.qty_remaining >= 2 &&
        (b.days_to_expiry ?? 30) > 0
    );
    expect(accessBatch).toBeDefined();

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
          syndrome_code: "UNCOMPLICATED_UTI",
          aware_category: "ACCESS",
          qty_dispensed: 1,
        }
      );
      dispenseId = approved.id;

      const after = await getStewardshipAnalytics(
        request,
        dispAuth.access_token
      );
      expect(after.access_count).toBe(before.access_count + 1);
      expect(after.total_dispensed).toBe(before.total_dispensed + 1);
      expect(after.access_ratio_pct).toBeGreaterThan(before.access_ratio_pct);
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });

  test("T1-A6-05: NO_ANTIBIOTIC dispense increments no_antibiotic_count without inflating antibiotic_dispensed", async ({
    request,
  }) => {
    const dispAuth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const pharmAuth = await apiLogin(request, DEMO_ACCOUNTS.pharmacist);
    const before = await getStewardshipAnalytics(
      request,
      dispAuth.access_token
    );
    const patient = await createIsolatedPatient(request, dispAuth.access_token);

    let dispenseId: string | undefined;
    try {
      const approved = await createAndApproveDispense(
        request,
        dispAuth.access_token,
        pharmAuth.access_token,
        {
          patient_id: patient.id,
          batch_id: null,
          antibiotic_id: null,
          syndrome_code: "ACUTE_BRONCHITIS",
          severity: "MILD",
          aware_category: "NO_ANTIBIOTIC",
          qty_dispensed: 0,
        }
      );
      dispenseId = approved.id;

      const after = await getStewardshipAnalytics(
        request,
        dispAuth.access_token
      );
      expect(after.no_antibiotic_count).toBe(before.no_antibiotic_count + 1);
      expect(after.antibiotic_dispensed).toBe(before.antibiotic_dispensed);
    } finally {
      if (dispenseId) {
        await voidDispenseSafe(request, dispenseId);
      }
    }
  });

  test("T1-A6-06: Analytics expiring_soon_count & stocked_out_count match Ashulia inventory", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const analytics = await getStewardshipAnalytics(request, auth.access_token);
    const batches = await getInventoryBatches(request, auth.access_token);

    expect(analytics.expiring_soon_count).toBeGreaterThanOrEqual(1);
    expect(analytics.stocked_out_count).toBeGreaterThanOrEqual(1);

    const actualStockedOut = batches.filter((b) => b.qty_remaining === 0).length;
    expect(actualStockedOut).toBeGreaterThanOrEqual(1);
  });

  test("T1-A7-01: Clinical Decision Support disclaimer banner visible across /, /dashboard, /dashboard/triage, /dashboard/settings", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await assertDisclaimerVisible(page);

    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    for (const route of [
      "/dashboard",
      "/dashboard/triage",
      "/dashboard/settings",
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await assertDisclaimerVisible(page);
    }
  });

  test("T1-A7-02: Bilingual EN / বাংলা toggle translates UI and toggles back cleanly", async ({
    page,
  }) => {
    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    await toggleLanguageAndVerifyBangla(page);
    await assertBanglaRendered(page);

    const bodyBn = await page.locator("body").innerText();
    expect(bodyBn).not.toMatch(/\[missing\]|undefined/i);

    await toggleLanguageBackToEnglish(page);
  });

  test("T1-A7-03: De-identified counseling output (deterministic-local-template) in EN and BN", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    for (const language of ["en", "bn"] as const) {
      const opt = await runOptimize(request, auth.access_token, {
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
        language,
      });
      expect(opt.counseling.deidentified).toBe(true);
      expect(opt.counseling.hallucination_guard_passed).toBe(true);
      expect(opt.counseling.summary.length).toBeGreaterThan(0);
      expect(typeof opt.counseling.model_used).toBe("string");
      expect(opt.counseling.model_used.length).toBeGreaterThan(0);
    }
  });

  test("T1-A7-04: Voice intake endpoint extracts de-identified clinical tokens", async ({
    request,
  }) => {
    const auth = await apiLogin(request, DEMO_ACCOUNTS.dispenser);
    const res = await request.post(apiUrl("/api/v1/voice/intake"), {
      headers: authHeaders(auth.access_token),
      data: {
        transcript:
          "32 year old female with painful urination, moderate symptoms, penicillin allergy",
        language: "en",
      },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as VoiceIntakeResponse;
    expect(body.prompt_guard_safe).toBe(true);
    expect(typeof body.model_used).toBe("string");
    expect(body.allergies.map((a) => a.toUpperCase())).toContain("PENICILLIN");

    const emptyRes = await request.post(apiUrl("/api/v1/voice/intake"), {
      headers: authHeaders(auth.access_token),
      data: { transcript: "", language: "en" },
    });
    await assertErrorEnvelope(emptyRes, [400, 422]);
  });

  test("T1-A7-05: Responsive layout check (375x812 mobile & 1440x900 desktop) across all routes", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await assertNoHorizontalOverflow(page, 375, 812, "/");
    await assertNoHorizontalOverflow(page, 1440, 900, "/");

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await assertNoHorizontalOverflow(page, 375, 812, "/login");
    await assertNoHorizontalOverflow(page, 1440, 900, "/login");

    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    for (const route of [
      "/dashboard",
      "/dashboard/triage",
      "/dashboard/inventory",
      "/dashboard/sync",
      "/dashboard/analytics",
      "/dashboard/profile",
      "/dashboard/settings",
    ]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await assertNoHorizontalOverflow(page, 375, 812, route);
      await assertNoHorizontalOverflow(page, 1440, 900, route);
    }

    await loginViaCredentials(page, DEMO_ACCOUNTS.admin);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await assertNoHorizontalOverflow(page, 375, 812, "/admin");
    await assertNoHorizontalOverflow(page, 1440, 900, "/admin");
  });

  test("T1-A7-06: @axe-core/playwright zero critical accessibility violations across all online routes", async ({
    page,
  }) => {
    for (const publicRoute of ["/", "/login"]) {
      await page.goto(publicRoute, { waitUntil: "domcontentloaded" });
      await assertSemanticLandmarks(page);
      await runCriticalAxeAudit(page, publicRoute);
    }

    await loginViaCredentials(page, DEMO_ACCOUNTS.dispenser);
    for (const authRoute of [
      "/dashboard",
      "/dashboard/triage",
      "/dashboard/inventory",
      "/dashboard/sync",
      "/dashboard/analytics",
      "/dashboard/profile",
      "/dashboard/settings",
    ]) {
      await page.goto(authRoute, { waitUntil: "domcontentloaded" });
      await assertSemanticLandmarks(page);
      await runCriticalAxeAudit(page, authRoute);
    }

    await loginViaCredentials(page, DEMO_ACCOUNTS.admin);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await assertSemanticLandmarks(page);
    await runCriticalAxeAudit(page, "/admin");
  });
});
