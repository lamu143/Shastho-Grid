"use client";

import React, { useState } from "react";
import { Atom, Check, Copy, ExternalLink } from "lucide-react";
import {
  ANTIBIOTIC_CHEMISTRY,
  formatFormula,
  lipinskiViolations,
} from "@/lib/antibioticChemistry";
import { ANTIBIOTIC_PHARMACOGENOMICS } from "@/lib/clinicalEvidence";
import { useI18n } from "@/lib/i18n";

interface MoleculeCardProps {
  drugCode: string;
  genericName?: string;
  compact?: boolean;
}

export function MoleculeCard({ drugCode, genericName, compact = false }: MoleculeCardProps) {
  const { locale } = useI18n();
  const L = (en: string, bn: string) => (locale === "bn" ? bn : en);
  const chem = ANTIBIOTIC_CHEMISTRY[drugCode.toUpperCase()];
  const pgx = ANTIBIOTIC_PHARMACOGENOMICS[drugCode.toUpperCase()];
  const [imgFailed, setImgFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!chem) return null;

  const violations = lipinskiViolations(chem);
  const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/compound/${chem.cid}`;
  const imgUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${chem.cid}/PNG?image_size=220x220`;

  const copySmiles = async () => {
    try {
      await navigator.clipboard.writeText(chem.smiles);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface/80 p-3.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-ink">
          <Atom className="h-4 w-4 text-brand-ink" aria-hidden="true" />
          <span>{L("Molecular Profile (PubChem)", "আণবিক প্রোফাইল (PubChem)")}</span>
        </div>
        <a
          href={pubchemUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-line bg-fill px-2.5 py-0.5 font-mono text-[11px] font-semibold text-brand-ink transition hover:border-brand/40"
        >
          CID {chem.cid}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <div className={`mt-3 flex gap-3.5 ${compact ? "flex-col sm:flex-row sm:items-center" : "flex-col sm:flex-row"}`}>
        {/* 2D Structure Preview (with offline formula fallback) */}
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-1.5">
          {!imgFailed ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imgUrl}
              alt={`${genericName ?? chem.queryName} 2D chemical structure`}
              className="h-full w-full object-contain"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="text-center font-mono text-[11px] font-bold text-[#0E1E25]">
              {formatFormula(chem.formula)}
            </span>
          )}
        </div>

        {/* Computed Properties */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-brand-soft px-2 py-0.5 font-mono font-bold text-brand-ink">
              {formatFormula(chem.formula)}
            </span>
            <span className="rounded-md bg-fill px-2 py-0.5 font-mono font-semibold text-ink-2">
              MW {chem.weight} g/mol
            </span>
            <span
              className={`rounded-md px-2 py-0.5 font-semibold ${
                violations === 0
                  ? "bg-success-soft text-success-ink"
                  : "bg-warn-soft text-warn-ink"
              }`}
            >
              {violations === 0
                ? L("Lipinski Ro5: Pass", "লিপিনস্কি Ro5: পাস")
                : L(`Ro5: ${violations} flag${violations > 1 ? "s" : ""}`, `Ro5: ${violations}টি ফ্ল্যাগ`)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-2 sm:grid-cols-4">
            <span>
              XLogP: <strong className="font-mono text-ink">{chem.xlogp ?? "—"}</strong>
            </span>
            <span>
              TPSA: <strong className="font-mono text-ink">{chem.tpsa ?? "—"} Å²</strong>
            </span>
            <span>
              HBD: <strong className="font-mono text-ink">{chem.hbd ?? "—"}</strong>
            </span>
            <span>
              HBA: <strong className="font-mono text-ink">{chem.hba ?? "—"}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-fill px-2 py-1 font-mono text-[11px] text-ink-3" title={chem.smiles}>
              {chem.smiles}
            </code>
            <button
              type="button"
              onClick={() => void copySmiles()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-ink-2 transition hover:text-ink"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-success-ink" aria-hidden="true" />
                  {L("Copied", "কপি হয়েছে")}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  SMILES
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {pgx && (
        <div className="mt-2.5 rounded-lg border border-line/70 bg-fill/60 px-2.5 py-2 text-[11px] text-ink-2">
          <span className="font-semibold text-ink">{L("Target", "লক্ষ্য")}:</span> {pgx.target} ·{" "}
          <span>{pgx.pgxFlag[locale] ?? pgx.pgxFlag.en}</span>
        </div>
      )}
    </div>
  );
}
