"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Mic,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getDb,
  type AwareCategory,
  type DispenseRecord,
  type GuidelineRecord,
  type PatientRecord,
  type SessionUser,
  type Severity,
  type Sex,
} from "@/db/dexie";
import {
  ApiError,
  adminListGuidelines,
  createDispense,
  createPatient,
  listPatients,
  optimizeRegimen,
  patchPatient,
  voiceIntake,
  type OptimizeResponse,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_GUIDELINES,
  evaluateOfflineRegimenFromDexie,
  type LocalOptimizeResult,
} from "@/lib/localRules";
import {
  bootstrapClinicState,
  enqueueDispenseMutation,
  enqueuePatientCreate,
  enqueuePatientUpdate,
} from "@/lib/syncEngine";

function parseAllergyList(text: string): string[] {
  const tokens = text
    .split(/[,\n;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

function hasAllergyToken(allergies: string[], token: string): boolean {
  const upper = token.toUpperCase();
  return allergies.some((a) => a.trim().toUpperCase() === upper);
}

function toggleAllergyToken(
  allergies: string[],
  token: string,
  enabled: boolean
): string[] {
  const upper = token.toUpperCase();
  const filtered = allergies.filter((a) => a.trim().toUpperCase() !== upper);
  if (enabled) {
    filtered.push(upper);
  }
  return Array.from(new Set(filtered));
}

type TriageVerdict = (OptimizeResponse | LocalOptimizeResult) & {
  offline_mode?: boolean;
  pending_server_verification?: boolean;
};

function TriageContent({ user }: { user: SessionUser }) {
  const { locale, t } = useI18n();
  const isReadOnlyAuditor = user.role === "auditor";

  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [guidelines, setGuidelines] = useState<GuidelineRecord[]>(DEFAULT_GUIDELINES);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");

  // Patient profile form state (Create mode when selectedPatientId === "")
  const [fullName, setFullName] = useState("");
  const [mrn, setMrn] = useState("");
  const [ageYears, setAgeYears] = useState<string>("30");
  const [weightKg, setWeightKg] = useState<string>("60");
  const [sex, setSex] = useState<Sex>("F");
  const [isPregnant, setIsPregnant] = useState(false);
  const [egfr, setEgfr] = useState<string>("95");
  const [allergiesText, setAllergiesText] = useState("");

  // Voice intake state
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceGuardAlert, setVoiceGuardAlert] = useState<string | null>(null);
  const [voiceModelUsed, setVoiceModelUsed] = useState<string | null>(null);

  // Solver controls
  const [syndromeCode, setSyndromeCode] = useState<string>("UNCOMPLICATED_UTI");
  const [severity, setSeverity] = useState<Severity>("MODERATE");
  const [maxAwareTier, setMaxAwareTier] = useState<AwareCategory | "">("");
  const [dispenseQty, setDispenseQty] = useState<string>("14");

  // Results & feedback
  const [verdict, setVerdict] = useState<TriageVerdict | null>(null);
  const [patientNotice, setPatientNotice] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savingPatient, setSavingPatient] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);

  const parsedAllergies = useMemo(
    () => parseAllergyList(allergiesText),
    [allergiesText]
  );
  const sulfonamideChecked = useMemo(
    () => hasAllergyToken(parsedAllergies, "SULFONAMIDE"),
    [parsedAllergies]
  );
  const penicillinChecked = useMemo(
    () => hasAllergyToken(parsedAllergies, "PENICILLIN"),
    [parsedAllergies]
  );

  const resetFormToCreateDefaults = useCallback(() => {
    setSelectedPatientId("");
    setFullName("");
    setMrn("");
    setAgeYears("30");
    setWeightKg("60");
    setSex("F");
    setIsPregnant(false);
    setEgfr("95");
    setAllergiesText("");
  }, []);

  const populateFormFromPatient = useCallback((p: PatientRecord) => {
    setSelectedPatientId(p.id);
    setFullName(p.full_name);
    setMrn(p.mrn);
    setAgeYears(String(Math.round(p.age_years)));
    setWeightKg(String(p.weight_kg));
    setSex(p.sex);
    setIsPregnant(p.sex === "F" ? p.is_pregnant : false);
    setEgfr(p.egfr === null ? "" : String(p.egfr));
    setAllergiesText((p.allergies ?? []).join(", "));
  }, []);

  const loadInitialData = useCallback(async () => {
    const database = getDb();
    const online = typeof window !== "undefined" && window.navigator.onLine;

    if (online) {
      try {
        await bootstrapClinicState({ clinicId: user.clinic_id });
      } catch {
        // Ignore offline/bootstrap error
      }
      try {
        const [srvPatients, srvGuidelines] = await Promise.all([
          listPatients(),
          adminListGuidelines(),
        ]);
        if (srvGuidelines.length > 0) {
          setGuidelines(srvGuidelines);
          await database.guidelines.bulkPut(srvGuidelines);
        }
        const localDirty = await database.patients
          .where("clinic_id")
          .equals(user.clinic_id)
          .toArray();
        const dirtyMap = new Map<string, PatientRecord>();
        for (const lp of localDirty) {
          if (lp._dirty) dirtyMap.set(lp.id, lp);
        }
        const mergedPatients = srvPatients.map((sp) =>
          dirtyMap.get(sp.id) ?? { ...sp, _dirty: false }
        );
        for (const lp of localDirty) {
          if (!mergedPatients.some((mp) => mp.id === lp.id)) {
            mergedPatients.push(lp);
          }
        }
        setPatients(mergedPatients);
        return;
      } catch {
        // Fall through to Dexie
      }
    }

    try {
      const [localPatients, localGuidelines] = await Promise.all([
        database.patients.where("clinic_id").equals(user.clinic_id).toArray(),
        database.guidelines.toArray(),
      ]);
      setPatients(localPatients);
      if (localGuidelines.length > 0) {
        setGuidelines(localGuidelines);
      }
    } catch {
      // Keep default guidelines
    }
  }, [user.clinic_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitialData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInitialData]);

  const handlePatientSelectChange = (nextId: string) => {
    setPatientNotice(null);
    setErrorMsg(null);
    if (!nextId) {
      resetFormToCreateDefaults();
      return;
    }
    const found = patients.find((p) => p.id === nextId);
    if (found) {
      populateFormFromPatient(found);
    }
  };

  const handleSexChange = (nextSex: Sex) => {
    setSex(nextSex);
    if (nextSex !== "F") {
      setIsPregnant(false);
    }
  };

  const handleAllergyCheckbox = (token: string, checked: boolean) => {
    const next = toggleAllergyToken(parsedAllergies, token, checked);
    setAllergiesText(next.join(", "));
  };

  const buildProfilePayload = () => {
    const parsedAge = Math.max(0, Math.min(130, Math.round(Number(ageYears) || 30)));
    const parsedWeight = Math.max(1, Math.min(500, Number(weightKg) || 60));
    const parsedEgfr =
      egfr.trim() === "" ? null : Math.max(0, Math.min(300, Number(egfr) || 95));
    return {
      age_years: parsedAge,
      weight_kg: parsedWeight,
      sex,
      is_pregnant: sex === "F" ? isPregnant : false,
      egfr: parsedEgfr,
      allergies: parsedAllergies,
    };
  };

  const handleSavePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyAuditor) return;
    setErrorMsg(null);
    setPatientNotice(null);

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMsg("Patient full name is required.");
      return;
    }

    const profile = buildProfilePayload();
    const database = getDb();
    const online = typeof window !== "undefined" && window.navigator.onLine;
    setSavingPatient(true);

    try {
      if (!selectedPatientId) {
        const newId = crypto.randomUUID();
        const generatedMrn =
          mrn.trim() || `MRN-${newId.slice(0, 8).toUpperCase()}`;

        if (online) {
          try {
            const created = await createPatient({
              id: newId,
              mrn: generatedMrn,
              full_name: trimmedName,
              ...profile,
            });
            const record: PatientRecord = { ...created, _dirty: false };
            await database.patients.put(record);
            setPatients((prev) => [record, ...prev]);
            resetFormToCreateDefaults();
            setPatientNotice(t("triage.patientSavedOnline"));
            return;
          } catch (err) {
            if (err instanceof ApiError) {
              setErrorMsg(err.message);
              return;
            }
            // Network failure -> fall back to offline Dexie queue
          }
        }

        const { patient } = await enqueuePatientCreate({
          id: newId,
          clinic_id: user.clinic_id,
          mrn: generatedMrn,
          full_name: trimmedName,
          ...profile,
        });
        setPatients((prev) => [patient, ...prev]);
        resetFormToCreateDefaults();
        setPatientNotice(t("triage.patientSavedOffline"));
      } else {
        const existing = patients.find((p) => p.id === selectedPatientId);
        if (!existing) {
          setErrorMsg("Selected patient not found.");
          return;
        }

        if (online && !existing._dirty) {
          try {
            const updated = await patchPatient(existing.id, {
              full_name: trimmedName,
              ...profile,
              base_version: existing.version,
            });
            const record: PatientRecord = { ...updated, _dirty: false };
            await database.patients.put(record);
            setPatients((prev) =>
              prev.map((p) => (p.id === record.id ? record : p))
            );
            populateFormFromPatient(record);
            setPatientNotice(t("triage.patientSavedOnline"));
            return;
          } catch (err) {
            if (err instanceof ApiError) {
              setErrorMsg(err.message);
              return;
            }
            // Network error -> fall back to offline queue
          }
        }

        const { patient } = await enqueuePatientUpdate(existing, {
          full_name: trimmedName,
          ...profile,
        });
        setPatients((prev) =>
          prev.map((p) => (p.id === patient.id ? patient : p))
        );
        populateFormFromPatient(patient);
        setPatientNotice(t("triage.patientSavedOffline"));
      }
    } finally {
      setSavingPatient(false);
    }
  };

  const handleVoiceIntake = async () => {
    setErrorMsg(null);
    setVoiceGuardAlert(null);
    setVoiceModelUsed(null);

    if (!voiceFile && !voiceTranscript.trim()) {
      setErrorMsg("Enter a clinical symptom transcript or attach an audio file.");
      return;
    }

    setVoiceLoading(true);
    try {
      let res;
      if (voiceFile) {
        const fd = new FormData();
        fd.append("file", voiceFile);
        fd.append("language", locale);
        res = await voiceIntake(fd);
      } else {
        res = await voiceIntake({
          transcript: voiceTranscript.trim(),
          language: locale,
        });
      }

      setVoiceModelUsed(res.model_used);
      if (res.transcript && !voiceTranscript.trim()) {
        setVoiceTranscript(res.transcript);
      }

      if (!res.prompt_guard_safe) {
        setVoiceGuardAlert(t("triage.promptGuardBlocked"));
        return;
      }

      if (res.syndrome_code) {
        setSyndromeCode(res.syndrome_code);
      }
      if (res.severity) {
        setSeverity(res.severity);
      }
      if (res.age_years !== null && res.age_years !== undefined) {
        setAgeYears(String(Math.round(res.age_years)));
      }
      if (res.is_pregnant !== null && res.is_pregnant !== undefined && sex === "F") {
        setIsPregnant(res.is_pregnant);
      }
      if (res.allergies && res.allergies.length > 0) {
        const merged = Array.from(
          new Set([
            ...parsedAllergies,
            ...res.allergies.map((a) => a.trim().toUpperCase()),
          ])
        );
        setAllergiesText(merged.join(", "));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Voice intake service unreachable while offline.");
      }
    } finally {
      setVoiceLoading(false);
    }
  };

  const runOptimize = async (overrideTier?: AwareCategory) => {
    setErrorMsg(null);
    setDraftNotice(null);
    setOptimizing(true);

    const profile = buildProfilePayload();
    const tierCap = overrideTier ?? (maxAwareTier || undefined);
    if (overrideTier) {
      setMaxAwareTier(overrideTier);
    }

    const selectedPatient = patients.find((p) => p.id === selectedPatientId);
    const online = typeof window !== "undefined" && window.navigator.onLine;

    try {
      if (online) {
        try {
          const result = await optimizeRegimen({
            patient_id:
              selectedPatient && !selectedPatient._dirty
                ? selectedPatient.id
                : undefined,
            patient_profile: profile,
            syndrome_code: syndromeCode,
            severity,
            max_aware_tier: tierCap,
            language: locale,
          });
          setVerdict(result);
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            setErrorMsg(err.message);
            return;
          }
          // Network failure -> fall back to deterministic local rules
        }
      }

      const offlineResult: LocalOptimizeResult =
        await evaluateOfflineRegimenFromDexie(user.clinic_id, {
          patient_profile: profile,
          syndrome_code: syndromeCode,
          severity,
          max_aware_tier: tierCap,
          language: locale,
        });
      setVerdict(offlineResult);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Optimization failed."
      );
    } finally {
      setOptimizing(false);
    }
  };

  const handleCreateDraftDispense = async () => {
    if (isReadOnlyAuditor || !verdict) return;
    setErrorMsg(null);
    setDraftNotice(null);

    if (!selectedPatientId) {
      setErrorMsg(
        "Select a patient from the dropdown (or save and select a new patient) before creating a dispense draft."
      );
      return;
    }

    const qtyNum = Math.max(1, Math.round(Number(dispenseQty) || 1));
    const batchId =
      verdict.recommended_batch &&
      typeof verdict.recommended_batch.id === "string"
        ? verdict.recommended_batch.id
        : null;
    const antibioticId =
      verdict.recommended_antibiotic &&
      typeof verdict.recommended_antibiotic.id === "string"
        ? verdict.recommended_antibiotic.id
        : null;
    const drugCode =
      verdict.recommended_antibiotic &&
      typeof verdict.recommended_antibiotic.drug_code === "string"
        ? verdict.recommended_antibiotic.drug_code
        : null;

    const draftId = crypto.randomUUID();
    const online = typeof window !== "undefined" && window.navigator.onLine;
    setCreatingDraft(true);

    try {
      if (online) {
        try {
          const created = await createDispense({
            id: draftId,
            patient_id: selectedPatientId,
            batch_id: batchId,
            antibiotic_id: antibioticId,
            syndrome_code: syndromeCode,
            aware_category: verdict.aware_category,
            qty: qtyNum,
          });
          await getDb().dispenses.put(created);
          setDraftNotice(t("triage.draftCreated"));
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            setErrorMsg(err.message);
            return;
          }
          // Network failure -> queue offline
        }
      }

      const nowIso = new Date().toISOString();
      const offlineRecord: DispenseRecord = {
        id: draftId,
        clinic_id: user.clinic_id,
        patient_id: selectedPatientId,
        batch_id: batchId,
        antibiotic_id: antibioticId,
        drug_code: drugCode,
        syndrome_code: syndromeCode,
        aware_category: verdict.aware_category,
        qty: qtyNum,
        status: "DRAFT",
        version: 1,
        created_at: nowIso,
        updated_at: nowIso,
      };
      await getDb().dispenses.put(offlineRecord);
      await enqueueDispenseMutation({
        clinicId: user.clinic_id,
        entityId: draftId,
        mutationType: "CREATE",
        baseVersion: 0,
        payload: {
          id: draftId,
          patient_id: selectedPatientId,
          batch_id: batchId,
          antibiotic_id: antibioticId,
          syndrome_code: syndromeCode,
          aware_category: verdict.aware_category,
          qty: qtyNum,
        },
      });
      setDraftNotice(t("triage.draftQueuedOffline"));
    } finally {
      setCreatingDraft(false);
    }
  };

  const recAbx = verdict?.recommended_antibiotic as
    | Record<string, unknown>
    | null
    | undefined;
  const recBatch = verdict?.recommended_batch as
    | Record<string, unknown>
    | null
    | undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#172A33] sm:text-3xl">
          {t("triage.title")}
        </h1>
        <p className="text-sm text-[#536975]">{t("triage.subtitle")}</p>
      </div>

      {isReadOnlyAuditor && (
        <div
          role="status"
          className="rounded-lg border border-[#0284C7]/40 bg-[#E0F2FE] px-4 py-2.5 text-xs font-semibold text-[#075985]"
        >
          {t("common.readOnlyAuditor")}
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2] px-4 py-3 text-sm font-medium text-[#991B1B]"
        >
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-label={t("triage.patientSectionTitle")}
          className="min-w-0 mac-card p-5 lg:col-span-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-[#172A33]">
              {t("triage.patientSectionTitle")}
            </h2>
            <button
              type="button"
              onClick={() => {
                resetFormToCreateDefaults();
                setPatientNotice(null);
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] px-3 py-1.5 text-xs font-semibold text-[#172A33] hover:bg-[#EDF3F5]"
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5 text-[#0F766E]" />
              <span>{t("triage.newPatientBtn")}</span>
            </button>
          </div>

          <div className="mt-4 space-y-1.5">
            <label
              htmlFor="triage-patient-select"
              className="block text-xs font-semibold text-[#405663]"
            >
              {t("triage.selectPatientLabel")}
            </label>
            <select
              id="triage-patient-select"
              value={selectedPatientId}
              onChange={(e) => handlePatientSelectChange(e.target.value)}
              className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
            >
              <option value="">{t("triage.createModeOption")}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.mrn}) · v{p.version}
                  {p._dirty ? " *" : ""}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSavePatient} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="patient-full-name"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.fullNameLabel")}
                </label>
                <input
                  id="patient-full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("triage.fullNamePlaceholder")}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33] placeholder:text-[#5C727E]"
                />
              </div>

              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="patient-mrn"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.mrnLabel")}
                </label>
                <input
                  id="patient-mrn"
                  type="text"
                  value={mrn}
                  onChange={(e) => setMrn(e.target.value)}
                  placeholder={t("triage.mrnPlaceholder")}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33] placeholder:text-[#5C727E]"
                />
              </div>

              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="patient-age"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.ageLabel")}
                </label>
                <input
                  id="patient-age"
                  type="number"
                  min={0}
                  max={130}
                  value={ageYears}
                  onChange={(e) => setAgeYears(e.target.value)}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                />
              </div>

              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="patient-weight"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.weightLabel")}
                </label>
                <input
                  id="patient-weight"
                  type="number"
                  min={1}
                  max={500}
                  step="0.5"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                />
              </div>

              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="patient-sex"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.sexLabel")}
                </label>
                <select
                  id="patient-sex"
                  value={sex}
                  onChange={(e) => handleSexChange(e.target.value as Sex)}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                >
                  <option value="F">{t("triage.sexFemale")}</option>
                  <option value="M">{t("triage.sexMale")}</option>
                  <option value="O">{t("triage.sexOther")}</option>
                </select>
              </div>

              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="patient-egfr"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.egfrLabel")}
                </label>
                <input
                  id="patient-egfr"
                  type="number"
                  min={0}
                  max={300}
                  value={egfr}
                  onChange={(e) => setEgfr(e.target.value)}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-[#172A33]">
                <input
                  id="patient-pregnant"
                  type="checkbox"
                  disabled={sex !== "F"}
                  checked={sex === "F" && isPregnant}
                  onChange={(e) => setIsPregnant(e.target.checked)}
                  className="h-4 w-4 accent-[#0F766E]"
                />
                <span>{t("triage.pregnantLabel")}</span>
              </label>

              <label
                htmlFor="allergy-sulfonamide"
                className="flex items-center gap-2 text-xs font-semibold text-[#172A33]"
              >
                <input
                  id="allergy-sulfonamide"
                  type="checkbox"
                  checked={sulfonamideChecked}
                  onChange={(e) =>
                    handleAllergyCheckbox("SULFONAMIDE", e.target.checked)
                  }
                  className="h-4 w-4 accent-[#0F766E]"
                />
                <span>{t("triage.sulfonamideCheckbox")}</span>
              </label>

              <label
                htmlFor="allergy-penicillin"
                className="flex items-center gap-2 text-xs font-semibold text-[#172A33]"
              >
                <input
                  id="allergy-penicillin"
                  type="checkbox"
                  checked={penicillinChecked}
                  onChange={(e) =>
                    handleAllergyCheckbox("PENICILLIN", e.target.checked)
                  }
                  className="h-4 w-4 accent-[#0F766E]"
                />
                <span>{t("triage.penicillinCheckbox")}</span>
              </label>

              <div className="pt-1">
                <label
                  htmlFor="triage-allergies"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.allergiesLabel")}
                </label>
                <input
                  id="triage-allergies"
                  type="text"
                  value={allergiesText}
                  onChange={(e) => setAllergiesText(e.target.value)}
                  placeholder={t("triage.allergiesPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-xs text-[#172A33] placeholder:text-[#5C727E]"
                />
              </div>
            </div>

            {patientNotice && (
              <div
                role="status"
                className="rounded-lg border border-[#059669]/40 bg-[#ECFDF5] px-3 py-2 text-xs font-semibold text-[#065F46]"
              >
                {patientNotice}
              </div>
            )}

            {!isReadOnlyAuditor && (
              <button
                type="submit"
                disabled={savingPatient}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
              >
                <Save aria-hidden="true" className="h-3.5 w-3.5" />
                <span>
                  {savingPatient
                    ? t("triage.savingPatient")
                    : t("triage.savePatientBtn")}
                </span>
              </button>
            )}
          </form>
        </section>

        <div className="min-w-0 space-y-6 lg:col-span-6">
          <section
            aria-label={t("triage.voiceSectionTitle")}
            className="mac-card p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-[#172A33]">
                {t("triage.voiceSectionTitle")}
              </h2>
              {voiceModelUsed && (
                <span className="rounded-full border border-[#0F766E]/30 bg-[#F0FDFA] px-2.5 py-0.5 text-[11px] font-semibold text-[#0F766E]">
                  {voiceModelUsed}
                </span>
              )}
            </div>

            {voiceGuardAlert && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2] px-3 py-2.5 text-xs font-semibold text-[#991B1B]"
              >
                <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{voiceGuardAlert}</span>
              </div>
            )}

            <div className="mt-3 space-y-3">
              <div>
                <label
                  htmlFor="voice-transcript"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.voiceTranscriptLabel")}
                </label>
                <textarea
                  id="voice-transcript"
                  rows={2}
                  value={voiceTranscript}
                  onChange={(e) => setVoiceTranscript(e.target.value)}
                  placeholder={t("triage.voiceTranscriptPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-xs text-[#172A33] placeholder:text-[#5C727E]"
                />
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="voice-audio"
                    className="block text-xs font-semibold text-[#405663]"
                  >
                    {t("triage.voiceAudioLabel")}
                  </label>
                  <input
                    id="voice-audio"
                    type="file"
                    accept="audio/*"
                    onChange={(e) => setVoiceFile(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-xs text-[#405663] file:mr-3 file:rounded-md file:border file:border-[#D1DEE3] file:bg-[#F3F7F8] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[#172A33]"
                  />
                </div>
                <button
                  type="button"
                  disabled={voiceLoading}
                  onClick={handleVoiceIntake}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#0F766E] bg-[#F0FDFA] px-3.5 py-2 text-xs font-semibold text-[#0F766E] hover:bg-[#CCFBF1] disabled:opacity-60"
                >
                  <Mic aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>
                    {voiceLoading
                      ? t("triage.voiceAnalyzing")
                      : t("triage.voiceAnalyzeBtn")}
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section
            aria-label={t("triage.solverSectionTitle")}
            className="mac-card p-5"
          >
            <h2 className="text-base font-bold text-[#172A33]">
              {t("triage.solverSectionTitle")}
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1 sm:col-span-2">
                <label
                  htmlFor="triage-syndrome"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.syndromeLabel")}
                </label>
                <select
                  id="triage-syndrome"
                  value={syndromeCode}
                  onChange={(e) => setSyndromeCode(e.target.value)}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                >
                  {guidelines.map((g) => (
                    <option key={g.syndrome_code} value={g.syndrome_code}>
                      {locale === "bn" && g.syndrome_name_bn
                        ? `${g.syndrome_name_bn} (${g.syndrome_code})`
                        : `${g.syndrome_name_en} (${g.syndrome_code})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="triage-severity"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.severityLabel")}
                </label>
                <select
                  id="triage-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                >
                  <option value="MILD">{t("triage.severityMild")}</option>
                  <option value="MODERATE">{t("triage.severityModerate")}</option>
                  <option value="SEVERE">{t("triage.severitySevere")}</option>
                </select>
              </div>

              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="triage-max-tier"
                  className="block text-xs font-semibold text-[#405663]"
                >
                  {t("triage.maxTierLabel")}
                </label>
                <select
                  id="triage-max-tier"
                  value={maxAwareTier}
                  onChange={(e) =>
                    setMaxAwareTier(e.target.value as AwareCategory | "")
                  }
                  className="w-full rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                >
                  <option value="">{t("triage.maxTierAny")}</option>
                  <option value="ACCESS">{t("aware.ACCESS")}</option>
                  <option value="WATCH">{t("aware.WATCH")}</option>
                  <option value="RESERVE">{t("aware.RESERVE")}</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                disabled={optimizing}
                onClick={() => runOptimize()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
              >
                <Stethoscope aria-hidden="true" className="h-4 w-4" />
                <span>
                  {optimizing
                    ? t("triage.optimizing")
                    : t("triage.optimizeBtn")}
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>

      {verdict && (
        <section
          aria-label={t("triage.verdictSectionTitle")}
          className="mac-card p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE6E9] pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-[#172A33]">
                {t("triage.verdictSectionTitle")}
              </h2>
              <span className="rounded-full border border-[#D1DEE3] bg-[#F3F7F8] px-3 py-0.5 text-xs font-bold text-[#172A33]">
                {t("triage.solverStatus")}: {verdict.solver_status}
              </span>
              <StatusBadge variant={verdict.aware_category} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {verdict.offline_mode && (
                <span className="rounded-full border border-[#D97706]/45 bg-[#FEF3C7] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">
                  {t("triage.offlineRulesBadge")}
                </span>
              )}
              {verdict.counseling.deidentified && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#059669]/40 bg-[#ECFDF5] px-2.5 py-0.5 text-xs font-semibold text-[#065F46]">
                  <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>{t("triage.deidentifiedBadge")}</span>
                </span>
              )}
              {verdict.counseling.hallucination_guard_passed && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#0284C7]/40 bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-semibold text-[#075985]">
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                  <span>
                    {t("triage.hallucinationGuardBadge")} (
                    {verdict.counseling.model_used})
                  </span>
                </span>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="min-w-0 space-y-4">
              {verdict.solver_status === "NO_ANTIBIOTIC" && (
                <div className="rounded-lg border border-[#0284C7]/40 bg-[#E0F2FE] p-4 text-sm font-semibold text-[#075985]">
                  {t("triage.viralNoAbx")}
                </div>
              )}

              {recAbx && (
                <div className="rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[#536975]">
                    {t("triage.recommendedDrug")}
                  </h3>
                  <p className="mt-1 text-base font-bold text-[#172A33]">
                    {String(recAbx.generic_name ?? recAbx.drug_code ?? "")}{" "}
                    <span className="text-xs font-medium text-[#536975]">
                      ({String(recAbx.drug_code ?? "")})
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[#405663]">
                    {locale === "bn"
                      ? String(recAbx.dose_regimen_bn ?? recAbx.dose_regimen_en ?? "")
                      : String(recAbx.dose_regimen_en ?? "")}
                  </p>

                  {recBatch && (
                    <div className="mt-3 border-t border-[#DCE6E9] pt-2 text-xs text-[#405663]">
                      <span className="font-semibold">
                        {t("triage.recommendedBatch")}:
                      </span>{" "}
                      Lot {String(recBatch.lot_number ?? "-")} · Exp{" "}
                      {String(recBatch.expiry_date ?? "-")} · Qty{" "}
                      {String(recBatch.qty_remaining ?? 0)}{" "}
                      {String(recBatch.unit ?? "units")}
                    </div>
                  )}
                </div>
              )}

              {verdict.mus_conflicts.length > 0 && (
                <div className="rounded-lg border border-[#DC2626]/40 bg-[#FEE2E2]/60 p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#991B1B]">
                    <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                    <span>{t("triage.musTitle")}</span>
                  </h3>
                  <ul className="mt-2 space-y-2 text-xs text-[#7F1D1D]">
                    {verdict.mus_conflicts.map((m, idx) => (
                      <li key={`${m.code}-${idx}`} className="rounded bg-white/80 p-2">
                        <p className="font-bold">
                          [{m.code}] {m.label}
                        </p>
                        <p className="mt-0.5">{m.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {verdict.safe_relaxations.length > 0 && (
                <div className="rounded-lg border border-[#D97706]/45 bg-[#FEF3C7]/60 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[#92400E]">
                    {t("triage.relaxationsTitle")}
                  </h3>
                  <ul className="mt-2 space-y-2 text-xs text-[#78350F]">
                    {verdict.safe_relaxations.map((rel, idx) => (
                      <li
                        key={`${rel.action}-${idx}`}
                        className="rounded bg-white/85 p-2.5"
                      >
                        <p className="font-bold">
                          {rel.action}
                          {rel.candidate_drug ? ` -> ${rel.candidate_drug}` : ""}
                        </p>
                        <p className="mt-0.5">{rel.rationale}</p>
                        {rel.action ===
                          "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL" && (
                          <button
                            type="button"
                            onClick={() => runOptimize("WATCH")}
                            className="mt-2 inline-flex items-center rounded-md bg-[#0F766E] px-3 py-1 text-xs font-semibold text-white hover:bg-[#115E59]"
                          >
                            {t("triage.escalateWatchBtn")}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              <div className="rounded-lg border border-[#DCE6E9] bg-[#F3F7F8] p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-[#536975]">
                  {t("triage.counselingTitle")}
                </h3>
                <p className="mt-1.5 text-sm font-medium text-[#172A33]">
                  {verdict.counseling.summary}
                </p>

                {verdict.counseling.instructions.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold text-[#405663]">
                      {t("triage.instructionsLabel")}
                    </h4>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[#405663]">
                      {verdict.counseling.instructions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {verdict.counseling.red_flags.length > 0 && (
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold text-[#991B1B]">
                      {t("triage.redFlagsLabel")}
                    </h4>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[#991B1B]">
                      {verdict.counseling.red_flags.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {!isReadOnlyAuditor && verdict.solver_status !== "INFEASIBLE" && (
                <div className="rounded-lg border border-[#DCE6E9] bg-[#FFFFFF] p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label
                        htmlFor="triage-dispense-qty"
                        className="block text-xs font-semibold text-[#405663]"
                      >
                        {t("triage.dispenseQtyLabel")}
                      </label>
                      <input
                        id="triage-dispense-qty"
                        type="number"
                        min={1}
                        max={200}
                        value={dispenseQty}
                        onChange={(e) => setDispenseQty(e.target.value)}
                        className="mt-1 w-28 rounded-lg border border-[#D1DEE3] bg-[#FFFFFF] px-3 py-2 text-sm text-[#172A33]"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={creatingDraft}
                      onClick={handleCreateDraftDispense}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#115E59] disabled:opacity-60"
                    >
                      <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                      <span>
                        {creatingDraft
                          ? t("triage.creatingDraft")
                          : t("triage.createDraftBtn")}
                      </span>
                    </button>
                  </div>

                  {draftNotice && (
                    <div
                      role="status"
                      className="mt-3 rounded-lg border border-[#059669]/40 bg-[#ECFDF5] px-3 py-2 text-xs font-semibold text-[#065F46]"
                    >
                      {draftNotice}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function TriagePage() {
  const { t } = useI18n();
  return (
    <AuthGuard pageTitle={t("triage.title")}>
      {(user) => <TriageContent user={user} />}
    </AuthGuard>
  );
}
