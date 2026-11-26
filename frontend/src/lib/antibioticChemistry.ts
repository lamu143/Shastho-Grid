/**
 * Verified PubChem molecular profiles for ShasthoGrid's 20-antibiotic catalog.
 * Queried from NCBI PubChem PUG-REST via the chemistry plugin's pubchem_api.py.
 * Stored locally so clinical-chemistry insights work offline in the PWA.
 */

export interface AntibioticChemistry {
  cid: number;
  queryName: string;
  formula: string;
  weight: string;
  smiles: string;
  inchikey: string;
  xlogp: number | null;
  tpsa: number | null;
  hbd: number | null;
  hba: number | null;
}

export const ANTIBIOTIC_CHEMISTRY: Record<string, AntibioticChemistry> = {
  AMOXICILLIN: {
    cid: 33613,
    queryName: "Amoxicillin",
    formula: "C16H19N3O5S",
    weight: "365.4",
    smiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)C(C3=CC=C(C=C3)O)N)C(=O)O)C",
    inchikey: "LSQZJLSUYDQPKJ-NJBDSQKTSA-N",
    xlogp: -2,
    tpsa: 158,
    hbd: 4,
    hba: 7,
  },
  AMPICILLIN: {
    cid: 6249,
    queryName: "Ampicillin",
    formula: "C16H19N3O4S",
    weight: "349.4",
    smiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)C(C3=CC=CC=C3)N)C(=O)O)C",
    inchikey: "AVKUERGKIZMTKX-NJBDSQKTSA-N",
    xlogp: -1.1,
    tpsa: 138,
    hbd: 3,
    hba: 6,
  },
  COTRIMOXAZOLE: {
    cid: 5329,
    queryName: "Sulfamethoxazole",
    formula: "C10H11N3O3S",
    weight: "253.28",
    smiles: "CC1=CC(=NO1)NS(=O)(=O)C2=CC=C(C=C2)N",
    inchikey: "JLKIGFTWXXRPMT-UHFFFAOYSA-N",
    xlogp: 0.9,
    tpsa: 107,
    hbd: 2,
    hba: 6,
  },
  DOXYCYCLINE: {
    cid: 54671203,
    queryName: "Doxycycline",
    formula: "C22H24N2O8",
    weight: "444.4",
    smiles: "CC1C2C(C3C(C(=O)C(=C(C3(C(=O)C2=C(C4=C1C=CC=C4O)O)O)O)C(=O)N)N(C)C)O",
    inchikey: "SGKRLCUYIXIAHR-AKNGSSGZSA-N",
    xlogp: -0.7,
    tpsa: 182,
    hbd: 6,
    hba: 9,
  },
  NITROFURANTOIN: {
    cid: 6604200,
    queryName: "Nitrofurantoin",
    formula: "C8H6N4O5",
    weight: "238.16",
    smiles: "C1C(=O)NC(=O)N1N=CC2=CC=C(O2)[N+](=O)[O-]",
    inchikey: "NXFQHRVNIOXGAQ-YCRREMRBSA-N",
    xlogp: -0.5,
    tpsa: 121,
    hbd: 1,
    hba: 6,
  },
  PHENOXYMETHYLPENICILLIN: {
    cid: 6869,
    queryName: "Phenoxymethylpenicillin",
    formula: "C16H18N2O5S",
    weight: "350.4",
    smiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)COC3=CC=CC=C3)C(=O)O)C",
    inchikey: "BPLBGHOLXOTWMN-MBNYWOFBSA-N",
    xlogp: 2.1,
    tpsa: 121,
    hbd: 2,
    hba: 6,
  },
  CLOXACILLIN: {
    cid: 6098,
    queryName: "Cloxacillin",
    formula: "C19H18ClN3O5S",
    weight: "435.9",
    smiles: "CC1=C(C(=NO1)C2=CC=CC=C2Cl)C(=O)NC3C4N(C3=O)C(C(S4)(C)C)C(=O)O",
    inchikey: "LQOLIRLGBULYKD-JKIFEVAISA-N",
    xlogp: 2.4,
    tpsa: 138,
    hbd: 2,
    hba: 7,
  },
  CEPHALEXIN: {
    cid: 27447,
    queryName: "Cephalexin",
    formula: "C16H17N3O4S",
    weight: "347.4",
    smiles: "CC1=C(N2C(C(C2=O)NC(=O)C(C3=CC=CC=C3)N)SC1)C(=O)O",
    inchikey: "ZAIPMKNFIOOWCQ-UEKVPHQBSA-N",
    xlogp: 0.6,
    tpsa: 138,
    hbd: 3,
    hba: 6,
  },
  METRONIDAZOLE: {
    cid: 4173,
    queryName: "Metronidazole",
    formula: "C6H9N3O3",
    weight: "171.15",
    smiles: "CC1=NC=C(N1CCO)[N+](=O)[O-]",
    inchikey: "VAOCPAMSLUNLGC-UHFFFAOYSA-N",
    xlogp: 0,
    tpsa: 83.9,
    hbd: 1,
    hba: 4,
  },
  GENTAMICIN: {
    cid: 3467,
    queryName: "Gentamicin",
    formula: "C21H43N5O7",
    weight: "477.6",
    smiles: "CC(C1CCC(C(O1)OC2C(CC(C(C2O)OC3C(C(C(CO3)(C)O)NC)O)N)N)N)NC",
    inchikey: "CEAZRRDELHUEMR-UHFFFAOYSA-N",
    xlogp: -4.1,
    tpsa: 200,
    hbd: 8,
    hba: 12,
  },
  AZITHROMYCIN: {
    cid: 447043,
    queryName: "Azithromycin",
    formula: "C38H72N2O12",
    weight: "749.0",
    smiles: "CCC1C(C(C(N(CC(CC(C(C(C(C(C(=O)O1)C)OC2CC(C(C(O2)C)O)(C)OC)C)OC3C(C(CC(O3)C)N(C)C)O)(C)O)C)C)C)O)(C)O",
    inchikey: "MQTOSJVFKKJCRP-BICOPXKESA-N",
    xlogp: 4,
    tpsa: 180,
    hbd: 5,
    hba: 14,
  },
  CIPROFLOXACIN: {
    cid: 2764,
    queryName: "Ciprofloxacin",
    formula: "C17H18FN3O3",
    weight: "331.34",
    smiles: "C1CC1N2C=C(C(=O)C3=CC(=C(C=C32)N4CCNCC4)F)C(=O)O",
    inchikey: "MYSWGUAQZAJSOK-UHFFFAOYSA-N",
    xlogp: -1.1,
    tpsa: 72.9,
    hbd: 2,
    hba: 7,
  },
  CEFIXIME: {
    cid: 5362065,
    queryName: "Cefixime",
    formula: "C16H15N5O7S2",
    weight: "453.5",
    smiles: "C=CC1=C(N2C(C(C2=O)NC(=O)C(=NOCC(=O)O)C3=CSC(=N3)N)SC1)C(=O)O",
    inchikey: "OKBVVJOGVLARMR-QSWIMTSFSA-N",
    xlogp: -0.7,
    tpsa: 238,
    hbd: 4,
    hba: 12,
  },
  CEFTRIAXONE: {
    cid: 5479530,
    queryName: "Ceftriaxone",
    formula: "C18H18N8O7S3",
    weight: "554.6",
    smiles: "CN1C(=NC(=O)C(=O)N1)SCC2=C(N3C(C(C3=O)NC(=O)C(=NOC)C4=CSC(=N4)N)SC2)C(=O)O",
    inchikey: "VAAUVRVFOQPIGI-SPQHTLEESA-N",
    xlogp: -1.3,
    tpsa: 288,
    hbd: 4,
    hba: 13,
  },
  LEVOFLOXACIN: {
    cid: 149096,
    queryName: "Levofloxacin",
    formula: "C18H20FN3O4",
    weight: "361.4",
    smiles: "CC1COC2=C3N1C=C(C(=O)C3=CC(=C2N4CCN(CC4)C)F)C(=O)O",
    inchikey: "GSDSWSVVBLHKDQ-JTQLQIEISA-N",
    xlogp: -0.4,
    tpsa: 73.3,
    hbd: 1,
    hba: 8,
  },
  VANCOMYCIN: {
    cid: 14969,
    queryName: "Vancomycin",
    formula: "C66H75Cl2N9O24",
    weight: "1449.2",
    smiles: "CC1C(C(CC(O1)OC2C(C(C(OC2OC3=C4C=C5C=C3OC6=C(C=C(C=C6)C(C(C(=O)NC(C(=O)NC5C(=O)NC7C8=CC(=C(C=C8)O)C9=C(C=C(C=C9O)O)C(NC(=O)C(C(C1=CC(=C(O4)C=C1)Cl)O)NC7=O)C(=O)O)CC(=O)N)NC(=O)C(CC(C)C)NC)O)Cl)CO)O)O)(C)N)O",
    inchikey: "MYPYJXKWCTUITO-LYRMYLQWSA-N",
    xlogp: -2.6,
    tpsa: 530,
    hbd: 19,
    hba: 26,
  },
  PIPERACILLIN_TAZOBACTAM: {
    cid: 43672,
    queryName: "Piperacillin",
    formula: "C23H27N5O7S",
    weight: "517.6",
    smiles: "CCN1CCN(C(=O)C1=O)C(=O)NC(C2=CC=CC=C2)C(=O)NC3C4N(C3=O)C(C(S4)(C)C)C(=O)O",
    inchikey: "IVBHGBMCVLDMKU-GXNBUGAJSA-N",
    xlogp: 0.5,
    tpsa: 182,
    hbd: 3,
    hba: 8,
  },
  MEROPENEM: {
    cid: 441130,
    queryName: "Meropenem",
    formula: "C17H25N3O5S",
    weight: "383.5",
    smiles: "CC1C2C(C(=O)N2C(=C1SC3CC(NC3)C(=O)N(C)C)C(=O)O)C(C)O",
    inchikey: "DMJNNHOOLUXYBV-PQTSNVLCSA-N",
    xlogp: -2.4,
    tpsa: 135,
    hbd: 3,
    hba: 7,
  },
  LINEZOLID: {
    cid: 441401,
    queryName: "Linezolid",
    formula: "C16H20FN3O4",
    weight: "337.35",
    smiles: "CC(=O)NCC1CN(C(=O)O1)C2=CC(=C(C=C2)N3CCOCC3)F",
    inchikey: "TYZROVQLWOKYKF-ZDUSSCGKSA-N",
    xlogp: 0.7,
    tpsa: 71.1,
    hbd: 1,
    hba: 6,
  },
  COLISTIN: {
    cid: 5311054,
    queryName: "Colistin",
    formula: "C52H98N16O13",
    weight: "1155.4",
    smiles: "CCC(C)CCCC(=O)NC(CCN)C(=O)NC(C(C)O)C(=O)NC(CCN)C(=O)NC1CCNC(=O)C(NC(=O)C(NC(=O)C(NC(=O)C(NC(=O)C(NC(=O)C(NC1=O)CCN)CC(C)C)CC(C)C)CCN)CCN)C(C)O",
    inchikey: "YKQOSKADJPQZHB-QNPLFGSASA-N",
    xlogp: -3.3,
    tpsa: 491,
    hbd: 18,
    hba: 18,
  },
};

const SUBSCRIPTS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
};

export function formatFormula(formula: string): string {
  return formula.replace(/\d/g, (d) => SUBSCRIPTS[d] ?? d);
}

export function lipinskiViolations(chem: AntibioticChemistry): number {
  const mw = Number(chem.weight);
  let violations = 0;
  if (Number.isFinite(mw) && mw > 500) violations += 1;
  if (chem.xlogp !== null && chem.xlogp > 5) violations += 1;
  if (chem.hbd !== null && chem.hbd > 5) violations += 1;
  if (chem.hba !== null && chem.hba > 10) violations += 1;
  return violations;
}
