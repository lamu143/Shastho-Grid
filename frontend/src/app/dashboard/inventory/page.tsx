"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Atom, Edit3, Plus, Search, X } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { MoleculeCard } from "@/components/MoleculeCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ANTIBIOTIC_CHEMISTRY, formatFormula } from "@/lib/antibioticChemistry";
import {
  getDb,
  type AwareCategory,
  type BatchRecord,
  type CatalogDrugRecord,
  type SessionUser,
} from "@/db/dexie";
import {
  ApiError,
  adminListCatalog,
  createBatch,
  listInventoryBatches,
  patchBatch,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_CATALOG } from "@/lib/localRules";

type StockFilter = "ALL" | "IN_STOCK" | "EXPIRING_SOON" | "STOCKED_OUT";
type SortOrder = "FEFO" | "QTY_ASC" | "QTY_DESC";

function getBatchStockState(
  batch: BatchRecord,
  nowMs: number
): "STOCKED_OUT" | "EXPIRED" | "EXPIRING_SOON" | "IN_STOCK" {
  if (batch.qty_remaining <= 0) return "STOCKED_OUT";
  const expMs = Date.parse(`${batch.expiry_date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(expMs) || expMs <= nowMs) return "EXPIRED";
  if (expMs <= nowMs + 14 * 86_400_000) return "EXPIRING_SOON";
  return "IN_STOCK";
}

function InventoryContent({ user }: { user: SessionUser }) {
  const { locale, t } = useI18n();
  const canManageInventory =
    user.role === "pharmacist" || user.role === "admin";

  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [catalog, setCatalog] = useState<CatalogDrugRecord[]>(DEFAULT_CATALOG);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<AwareCategory | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<StockFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("FEFO");
  const [selectedChemDrug, setSelectedChemDrug] = useState<{ code: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal state (only for pharmacist/admin)
  const [modalMode, setModalMode] = useState<"create" | "adjust" | null>(null);
  const [editingBatch, setEditingBatch] = useState<BatchRecord | null>(null);
  const [formAntibioticId, setFormAntibioticId] = useState("");
  const [formLotNumber, setFormLotNumber] = useState("");
  const [formQtyInitial, setFormQtyInitial] = useState("100");
  const [formQtyRemaining, setFormQtyRemaining] = useState("100");
  const [formExpiryDate, setFormExpiryDate] = useState("");
  const [formUnit, setFormUnit] = useState("tablets");
  const [submittingModal, setSubmittingModal] = useState(false);

  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  const loadInventory = useCallback(async () => {
    setErrorMsg(null);
    const database = getDb();
    const online = typeof window !== "undefined" && window.navigator.onLine;

    if (online) {
      try {
        const [srvBatches, srvCatalog] = await Promise.all([
          listInventoryBatches(),
          adminListCatalog(),
        ]);
        await database.batches.bulkPut(srvBatches);
        if (srvCatalog.length > 0) {
          await database.catalog.bulkPut(srvCatalog);
          setCatalog(srvCatalog);
        }
        setBatches(srvBatches);
        setLoading(false);
        return;
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          setErrorMsg(err.message);
        }
      }
    }

    try {
      const [localBatches, localCatalog] = await Promise.all([
        database.batches.where("clinic_id").equals(user.clinic_id).toArray(),
        database.catalog.toArray(),
      ]);
      setBatches(localBatches);
      if (localCatalog.length > 0) {
        setCatalog(localCatalog);
      }
    } catch {
      setErrorMsg("Unable to load inventory cache.");
    } finally {
      setLoading(false);
    }
  }, [user.clinic_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInventory();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadInventory]);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setEditingBatch(null);
    window.setTimeout(() => {
      lastTriggerRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (!modalMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalMode, closeModal]);

  const openCreateModal = (trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    const defaultDate = new Date(Date.now() + 180 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    setFormAntibioticId(catalog[0]?.id ?? "");
    setFormLotNumber("");
    setFormQtyInitial("100");
    setFormQtyRemaining("100");
    setFormExpiryDate(defaultDate);
    setFormUnit("tablets");
    setEditingBatch(null);
    setModalMode("create");
  };

  const openAdjustModal = (batch: BatchRecord, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setEditingBatch(batch);
    setFormLotNumber(batch.lot_number);
    setFormQtyRemaining(String(batch.qty_remaining));
    setFormExpiryDate(batch.expiry_date.slice(0, 10));
    setModalMode("adjust");
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageInventory) return;
    setErrorMsg(null);
    setSubmittingModal(true);

    try {
      if (modalMode === "create") {
        const created = await createBatch({
          antibiotic_id: formAntibioticId,
          lot_number: formLotNumber.trim(),
          qty_initial: Math.max(1, Math.round(Number(formQtyInitial) || 1)),
          qty_remaining: Math.max(0, Math.round(Number(formQtyRemaining) || 0)),
          expiry_date: formExpiryDate,
          unit: formUnit.trim() || "tablets",
        });
        await getDb().batches.put(created);
      } else if (modalMode === "adjust" && editingBatch) {
        const updated = await patchBatch(editingBatch.id, {
          qty_remaining: Math.max(0, Math.round(Number(formQtyRemaining) || 0)),
          expiry_date: formExpiryDate,
          lot_number: formLotNumber.trim(),
        });
        await getDb().batches.put(updated);
      }
      closeModal();
      await loadInventory();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Unable to save inventory batch.");
      }
    } finally {
      setSubmittingModal(false);
    }
  };

  const [nowMs] = useState(() => Date.now());

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = batches.filter((b) => {
      if (tierFilter !== "ALL" && b.aware_category !== tierFilter) return false;
      const state = getBatchStockState(b, nowMs);
      if (statusFilter === "IN_STOCK" && b.qty_remaining <= 0) return false;
      if (statusFilter === "EXPIRING_SOON" && state !== "EXPIRING_SOON")
        return false;
      if (statusFilter === "STOCKED_OUT" && state !== "STOCKED_OUT")
        return false;
      if (q) {
        const haystack =
          `${b.generic_name} ${b.generic_name_bn} ${b.drug_code} ${b.drug_class} ${b.lot_number}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortOrder === "QTY_ASC") {
        return a.qty_remaining - b.qty_remaining;
      }
      if (sortOrder === "QTY_DESC") {
        return b.qty_remaining - a.qty_remaining;
      }
      return (
        a.expiry_date.localeCompare(b.expiry_date) ||
        a.lot_number.localeCompare(b.lot_number)
      );
    });
  }, [batches, searchQuery, tierFilter, statusFilter, sortOrder, nowMs]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {t("inventory.title")}
          </h1>
          <p className="text-sm text-ink-2">{t("inventory.subtitle")}</p>
        </div>

        {canManageInventory && (
          <button
            type="button"
            onClick={(e) => openCreateModal(e.currentTarget)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-strong"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            <span>{t("inventory.createBatchBtn")}</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm font-medium text-danger-ink"
        >
          {errorMsg}
        </div>
      )}

      <section
        aria-label={t("inventory.title")}
        className="mac-card p-5"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <label
              htmlFor="inventory-search"
              className="block text-xs font-semibold text-ink-2"
            >
              {t("inventory.searchLabel")}
            </label>
            <div className="relative mt-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-3"
              />
              <input
                id="inventory-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("inventory.searchPlaceholder")}
                className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-9 text-xs text-ink placeholder:text-ink-3"
              />
            </div>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="inventory-tier-filter"
              className="block text-xs font-semibold text-ink-2"
            >
              {t("inventory.tierFilterLabel")}
            </label>
            <select
              id="inventory-tier-filter"
              value={tierFilter}
              onChange={(e) =>
                setTierFilter(e.target.value as AwareCategory | "ALL")
              }
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
            >
              <option value="ALL">{t("common.all")}</option>
              <option value="ACCESS">{t("aware.ACCESS")}</option>
              <option value="WATCH">{t("aware.WATCH")}</option>
              <option value="RESERVE">{t("aware.RESERVE")}</option>
            </select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="inventory-status-filter"
              className="block text-xs font-semibold text-ink-2"
            >
              {t("inventory.statusFilterLabel")}
            </label>
            <select
              id="inventory-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StockFilter)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
            >
              <option value="ALL">{t("common.all")}</option>
              <option value="IN_STOCK">{t("inventory.statusInStock")}</option>
              <option value="EXPIRING_SOON">
                {t("inventory.statusExpiring")}
              </option>
              <option value="STOCKED_OUT">
                {t("inventory.statusStockedOut")}
              </option>
            </select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="inventory-sort"
              className="block text-xs font-semibold text-ink-2"
            >
              {t("inventory.sortLabel")}
            </label>
            <select
              id="inventory-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
            >
              <option value="FEFO">{t("inventory.sortFefo")}</option>
              <option value="QTY_ASC">{t("inventory.sortQtyAsc")}</option>
              <option value="QTY_DESC">{t("inventory.sortQtyDesc")}</option>
            </select>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          {selectedChemDrug && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs font-semibold text-ink-2">
                <span>{selectedChemDrug.name} ({selectedChemDrug.code})</span>
                <button
                  type="button"
                  onClick={() => setSelectedChemDrug(null)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-ink-3 hover:bg-fill hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  {locale === "bn" ? "বন্ধ করুন" : "Close"}
                </button>
              </div>
              <MoleculeCard drugCode={selectedChemDrug.code} genericName={selectedChemDrug.name} />
            </div>
          )}
          {loading ? (
            <p className="py-6 text-sm text-ink-2">{t("common.loading")}</p>
          ) : filteredAndSorted.length === 0 ? (
            <p className="py-6 text-sm font-medium text-ink-2">
              {t("inventory.emptyState")}
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-canvas text-ink-2">
                  <th scope="col" className="px-2.5 py-2.5 font-semibold">
                    {t("inventory.colDrug")}
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold">
                    {t("inventory.colClass")}
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold">
                    {t("inventory.colTier")}
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold whitespace-nowrap">
                    {t("inventory.colLot")}
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold whitespace-nowrap">
                    {t("inventory.colQty")}
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold whitespace-nowrap">
                    {t("inventory.colExpiry")}
                  </th>
                  <th scope="col" className="px-2.5 py-2.5 font-semibold whitespace-nowrap">
                    {t("inventory.colStatus")}
                  </th>
                  {canManageInventory && (
                    <th scope="col" className="px-2.5 py-2.5 font-semibold">
                      {t("common.actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DCE6E9]">
                {filteredAndSorted.map((b) => {
                  const stockState = getBatchStockState(b, nowMs);
                  return (
                    <tr key={b.id} className="hover:bg-canvas">
                      <td className="px-3 py-3 font-semibold text-ink">
                        <div>
                          {locale === "bn" && b.generic_name_bn
                            ? `${b.generic_name_bn} (${b.generic_name})`
                            : b.generic_name}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-normal text-ink-2">
                          <span>{b.drug_code}</span>
                          {ANTIBIOTIC_CHEMISTRY[b.drug_code.toUpperCase()] && (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedChemDrug((prev) =>
                                  prev?.code === b.drug_code ? null : { code: b.drug_code, name: b.generic_name }
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-fill px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-ink transition hover:border-brand/40"
                            >
                              <Atom className="h-2.5 w-2.5" aria-hidden="true" />
                              {formatFormula(ANTIBIOTIC_CHEMISTRY[b.drug_code.toUpperCase()].formula)}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-2">{b.drug_class}</td>
                      <td className="px-3 py-3">
                        <StatusBadge variant={b.aware_category} />
                      </td>
                      <td className="px-2.5 py-3 whitespace-nowrap font-mono text-ink">
                        {b.lot_number}
                      </td>
                      <td className="px-2.5 py-3 whitespace-nowrap font-semibold text-ink">
                        {b.qty_remaining} / {b.qty_initial} {b.unit}
                      </td>
                      <td className="px-2.5 py-3 whitespace-nowrap text-ink-2">
                        {b.expiry_date.slice(0, 10)}
                      </td>
                      <td className="px-3 py-3">
                        {stockState === "STOCKED_OUT" ? (
                          <span className="inline-flex rounded-full border border-danger/45 bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger-ink">
                            {t("inventory.badgeStockedOut")}
                          </span>
                        ) : stockState === "EXPIRED" ? (
                          <span className="inline-flex rounded-full border border-danger/45 bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger-ink">
                            {t("inventory.badgeExpired")}
                          </span>
                        ) : stockState === "EXPIRING_SOON" ? (
                          <span className="inline-flex rounded-full border border-warn/55 bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn-ink">
                            {t("inventory.badgeExpiring")}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-success/45 bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success-ink">
                            {t("inventory.badgeHealthy")}
                          </span>
                        )}
                      </td>
                      {canManageInventory && (
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={(e) => openAdjustModal(b, e.currentTarget)}
                            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-fill"
                          >
                            <Edit3 aria-hidden="true" className="h-3 w-3 text-brand-ink" />
                            <span>{t("inventory.adjustStockBtn")}</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {modalMode && canManageInventory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172A33]/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-modal-title"
            className="w-full max-w-md mac-card p-6 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <h2
                id="inventory-modal-title"
                className="text-base font-bold text-ink"
              >
                {modalMode === "create"
                  ? t("inventory.modalCreateTitle")
                  : t("inventory.modalAdjustTitle")}
              </h2>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={closeModal}
                className="rounded-lg p-1 text-ink-2 hover:bg-fill"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleModalSubmit} className="mt-4 space-y-3">
              {modalMode === "create" && (
                <div>
                  <label
                    htmlFor="batch-antibiotic"
                    className="block text-xs font-semibold text-ink-2"
                  >
                    {t("inventory.antibioticLabel")}
                  </label>
                  <select
                    id="batch-antibiotic"
                    value={formAntibioticId}
                    onChange={(e) => setFormAntibioticId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                  >
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.generic_name} ({c.aware_category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="batch-lot"
                  className="block text-xs font-semibold text-ink-2"
                >
                  {t("inventory.lotLabel")}
                </label>
                <input
                  id="batch-lot"
                  type="text"
                  required
                  value={formLotNumber}
                  onChange={(e) => setFormLotNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                />
              </div>

              {modalMode === "create" && (
                <div>
                  <label
                    htmlFor="batch-qty-initial"
                    className="block text-xs font-semibold text-ink-2"
                  >
                    {t("inventory.qtyInitialLabel")}
                  </label>
                  <input
                    id="batch-qty-initial"
                    type="number"
                    min={1}
                    required
                    value={formQtyInitial}
                    onChange={(e) => setFormQtyInitial(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="batch-qty-remaining"
                  className="block text-xs font-semibold text-ink-2"
                >
                  {t("inventory.qtyRemainingLabel")}
                </label>
                <input
                  id="batch-qty-remaining"
                  type="number"
                  min={0}
                  required
                  value={formQtyRemaining}
                  onChange={(e) => setFormQtyRemaining(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                />
              </div>

              <div>
                <label
                  htmlFor="batch-expiry"
                  className="block text-xs font-semibold text-ink-2"
                >
                  {t("inventory.expiryDateLabel")}
                </label>
                <input
                  id="batch-expiry"
                  type="date"
                  required
                  value={formExpiryDate}
                  onChange={(e) => setFormExpiryDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                />
              </div>

              {modalMode === "create" && (
                <div>
                  <label
                    htmlFor="batch-unit"
                    className="block text-xs font-semibold text-ink-2"
                  >
                    {t("inventory.unitLabel")}
                  </label>
                  <input
                    id="batch-unit"
                    type="text"
                    required
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-ink-2 hover:bg-fill"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
                >
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useI18n();
  return (
    <AuthGuard pageTitle={t("inventory.title")}>
      {(user) => <InventoryContent user={user} />}
    </AuthGuard>
  );
}
