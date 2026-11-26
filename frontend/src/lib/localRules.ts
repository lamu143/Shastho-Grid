import {
  getDb,
  type AwareCategory,
  type AwareVerdictCategory,
  type BatchRecord,
  type CatalogDrugRecord,
  type GuidelineRecord,
  type Severity,
  type Sex,
} from "@/db/dexie";

export const VIRAL_MILD_SYNDROMES = new Set<string>([
  "ACUTE_BRONCHITIS",
  "COMMON_COLD",
  "VIRAL_URI",
]);

export const ALLERGY_EXPANSION_MAP: Record<string, string[]> = {
  PENICILLIN: [
    "PENICILLIN",
    "AMOXICILLIN",
    "AMPICILLIN",
    "PHENOXYMETHYLPENICILLIN",
    "CLOXACILLIN",
    "PIPERACILLIN_TAZOBACTAM",
  ],
  BETA_LACTAM: [
    "BETA_LACTAM",
    "PENICILLIN",
    "CEPHALOSPORIN",
    "CARBAPENEM",
    "AMOXICILLIN",
    "AMPICILLIN",
    "PHENOXYMETHYLPENICILLIN",
    "CLOXACILLIN",
    "CEPHALEXIN",
    "CEFIXIME",
    "CEFTRIAXONE",
    "PIPERACILLIN_TAZOBACTAM",
    "MEROPENEM",
  ],
  CEPHALOSPORIN: [
    "CEPHALOSPORIN",
    "CEPHALEXIN",
    "CEFIXIME",
    "CEFTRIAXONE",
  ],
  CARBAPENEM: ["CARBAPENEM", "MEROPENEM"],
  SULFONAMIDE: ["SULFONAMIDE", "COTRIMOXAZOLE"],
  FLUOROQUINOLONE: ["FLUOROQUINOLONE", "CIPROFLOXACIN", "LEVOFLOXACIN"],
  MACROLIDE: ["MACROLIDE", "AZITHROMYCIN"],
  TETRACYCLINE: ["TETRACYCLINE", "DOXYCYCLINE"],
  AMINOGLYCOSIDE: ["AMINOGLYCOSIDE", "GENTAMICIN"],
};

const ALLERGY_SYNONYM_MAP: Record<string, string> = {
  SULFA: "SULFONAMIDE",
  SULFA_DRUG: "SULFONAMIDE",
  SULFA_DRUGS: "SULFONAMIDE",
  SULFONAMIDES: "SULFONAMIDE",
  SULPHONAMIDE: "SULFONAMIDE",
  SULPHONAMIDES: "SULFONAMIDE",
  TMP_SMX: "COTRIMOXAZOLE",
  SMX_TMP: "COTRIMOXAZOLE",
  TRIMETHOPRIM_SULFAMETHOXAZOLE: "COTRIMOXAZOLE",
  CO_TRIMOXAZOLE: "COTRIMOXAZOLE",
  SULFAMETHOXAZOLE: "SULFONAMIDE",
  TRIMETHOPRIM: "COTRIMOXAZOLE",
  BACTRIM: "COTRIMOXAZOLE",
  SEPTRA: "COTRIMOXAZOLE",
  AUGMENTIN: "AMOXICILLIN",
  CO_AMOXICLAV: "AMOXICILLIN",
  PENICILLINS: "PENICILLIN",
  PENICILLIN_G: "PENICILLIN",
  PENICILLIN_V: "PENICILLIN",
  PENICILLIN_VK: "PENICILLIN",
  BENZATHINE_PENICILLIN: "PENICILLIN",
  PROCAINE_PENICILLIN: "PENICILLIN",
  BETA_LACTAMS: "BETA_LACTAM",
  BETALACTAM: "BETA_LACTAM",
  BETALACTAMS: "BETA_LACTAM",
  CEPHALOSPORINS: "CEPHALOSPORIN",
  CEPHALEXIN: "CEPHALEXIN",
  CEFALEXIN: "CEPHALEXIN",
  CARBAPENEMS: "CARBAPENEM",
  FLUOROQUINOLONES: "FLUOROQUINOLONE",
  QUINOLONE: "FLUOROQUINOLONE",
  QUINOLONES: "FLUOROQUINOLONE",
  CIPRO: "CIPROFLOXACIN",
  MACROLIDES: "MACROLIDE",
  TETRACYCLINES: "TETRACYCLINE",
  DOXY: "DOXYCYCLINE",
  AMINOGLYCOSIDES: "AMINOGLYCOSIDE",
  AMOX: "AMOXICILLIN",
  PIP_TAZO: "PIPERACILLIN_TAZOBACTAM",
  PIPERACILLIN: "PIPERACILLIN_TAZOBACTAM",
};

export const DEFAULT_CATALOG: CatalogDrugRecord[] = [
  {
    id: "cat-amoxicillin",
    drug_code: "AMOXICILLIN",
    generic_name: "Amoxicillin",
    generic_name_bn: "অ্যামোক্সিসিলিন",
    drug_class: "PENICILLIN",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0,
    dose_regimen_en: "500 mg PO every 8 hours for 5–7 days",
    dose_regimen_bn: "৫০০ মিগ্রা মুখে প্রতি ৮ ঘণ্টায় ৫–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-ampicillin",
    drug_code: "AMPICILLIN",
    generic_name: "Ampicillin",
    generic_name_bn: "অ্যাম্পিসিলিন",
    drug_class: "PENICILLIN",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0,
    dose_regimen_en: "500 mg PO/IV every 6 hours for 5–7 days",
    dose_regimen_bn: "৫০০ মিগ্রা প্রতি ৬ ঘণ্টায় ৫–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-cotrimoxazole",
    drug_code: "COTRIMOXAZOLE",
    generic_name: "Cotrimoxazole (TMP-SMX)",
    generic_name_bn: "কোট্রাইমোক্সাজল",
    drug_class: "SULFONAMIDE",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: true,
    renal_contraindicated_egfr_lt: 30,
    min_age_years: 0.25,
    dose_regimen_en: "960 mg (160/800 mg) PO every 12 hours for 3–5 days",
    dose_regimen_bn: "৯৬০ মিগ্রা মুখে প্রতি ১২ ঘণ্টায় ৩–৫ দিন",
    is_active: true,
  },
  {
    id: "cat-doxycycline",
    drug_code: "DOXYCYCLINE",
    generic_name: "Doxycycline",
    generic_name_bn: "ডক্সিসাইক্লিন",
    drug_class: "TETRACYCLINE",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: true,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 8,
    dose_regimen_en: "100 mg PO every 12 hours (or 300 mg single dose for cholera)",
    dose_regimen_bn: "১০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টায়",
    is_active: true,
  },
  {
    id: "cat-nitrofurantoin",
    drug_code: "NITROFURANTOIN",
    generic_name: "Nitrofurantoin",
    generic_name_bn: "নাইট্রোফুরান্টোইন",
    drug_class: "NITROFURAN",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: 30,
    min_age_years: 1,
    dose_regimen_en: "100 mg PO every 12 hours for 5 days",
    dose_regimen_bn: "১০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টায় ৫ দিন",
    is_active: true,
  },
  {
    id: "cat-phenoxymethylpenicillin",
    drug_code: "PHENOXYMETHYLPENICILLIN",
    generic_name: "Phenoxymethylpenicillin (Penicillin V)",
    generic_name_bn: "পেনিসিলিন ভি",
    drug_class: "PENICILLIN",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0,
    dose_regimen_en: "500 mg PO every 12 hours for 10 days",
    dose_regimen_bn: "৫০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টায় ১০ দিন",
    is_active: true,
  },
  {
    id: "cat-cloxacillin",
    drug_code: "CLOXACILLIN",
    generic_name: "Cloxacillin",
    generic_name_bn: "ক্লোক্সাসিলিন",
    drug_class: "PENICILLIN",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0,
    dose_regimen_en: "500 mg PO every 6 hours for 5–7 days",
    dose_regimen_bn: "৫০০ মিগ্রা মুখে প্রতি ৬ ঘণ্টায় ৫–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-cephalexin",
    drug_code: "CEPHALEXIN",
    generic_name: "Cephalexin",
    generic_name_bn: "সেফালেক্সিন",
    drug_class: "CEPHALOSPORIN",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0,
    dose_regimen_en: "500 mg PO every 8 hours for 5–7 days",
    dose_regimen_bn: "৫০০ মিগ্রা মুখে প্রতি ৮ ঘণ্টায় ৫–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-metronidazole",
    drug_code: "METRONIDAZOLE",
    generic_name: "Metronidazole",
    generic_name_bn: "মেট্রোনিডাজল",
    drug_class: "NITROIMIDAZOLE",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0,
    dose_regimen_en: "400 mg PO every 8 hours for 5–7 days",
    dose_regimen_bn: "৪০০ মিগ্রা মুখে প্রতি ৮ ঘণ্টায় ৫–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-gentamicin",
    drug_code: "GENTAMICIN",
    generic_name: "Gentamicin",
    generic_name_bn: "জেন্টামাইসিন",
    drug_class: "AMINOGLYCOSIDE",
    aware_category: "ACCESS",
    aware_tier_cost: 1,
    pregnancy_contraindicated: true,
    renal_contraindicated_egfr_lt: 30,
    min_age_years: 0,
    dose_regimen_en: "5 mg/kg IV/IM once daily with renal monitoring",
    dose_regimen_bn: "৫ মিগ্রা/কেজি দিনে ১ বার (চিকিৎসকের তত্ত্বাবধানে)",
    is_active: true,
  },
  {
    id: "cat-azithromycin",
    drug_code: "AZITHROMYCIN",
    generic_name: "Azithromycin",
    generic_name_bn: "অ্যাজিথ্রোমাইসিন",
    drug_class: "MACROLIDE",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0.5,
    dose_regimen_en: "500 mg PO once daily for 3–5 days",
    dose_regimen_bn: "৫০০ মিগ্রা মুখে দিনে ১ বার ৩–৫ দিন",
    is_active: true,
  },
  {
    id: "cat-ciprofloxacin",
    drug_code: "CIPROFLOXACIN",
    generic_name: "Ciprofloxacin",
    generic_name_bn: "সিপ্রোফ্লক্সাসিন",
    drug_class: "FLUOROQUINOLONE",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: true,
    renal_contraindicated_egfr_lt: 30,
    min_age_years: 18,
    dose_regimen_en: "500 mg PO every 12 hours for 3–7 days",
    dose_regimen_bn: "৫০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টায় ৩–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-cefixime",
    drug_code: "CEFIXIME",
    generic_name: "Cefixime",
    generic_name_bn: "সেফিক্সিম",
    drug_class: "CEPHALOSPORIN",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: 20,
    min_age_years: 0.5,
    dose_regimen_en: "400 mg PO once daily for 5–7 days",
    dose_regimen_bn: "৪০০ মিগ্রা মুখে দিনে ১ বার ৫–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-ceftriaxone",
    drug_code: "CEFTRIAXONE",
    generic_name: "Ceftriaxone",
    generic_name_bn: "সেফট্রিয়াক্সোন",
    drug_class: "CEPHALOSPORIN",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 0,
    dose_regimen_en: "1–2 g IV/IM once daily for 5–7 days",
    dose_regimen_bn: "১–২ গ্রাম ইনজেকশন দিনে ১ বার ৫–৭ দিন",
    is_active: true,
  },
  {
    id: "cat-levofloxacin",
    drug_code: "LEVOFLOXACIN",
    generic_name: "Levofloxacin",
    generic_name_bn: "লেভোফ্লক্সাসিন",
    drug_class: "FLUOROQUINOLONE",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: true,
    renal_contraindicated_egfr_lt: 30,
    min_age_years: 18,
    dose_regimen_en: "500 mg PO once daily for 5 days",
    dose_regimen_bn: "৫০০ মিগ্রা মুখে দিনে ১ বার ৫ দিন",
    is_active: true,
  },
  {
    id: "cat-vancomycin",
    drug_code: "VANCOMYCIN",
    generic_name: "Vancomycin",
    generic_name_bn: "ভ্যানকোমাইসিন",
    drug_class: "GLYCOPEPTIDE",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: 30,
    min_age_years: 0,
    dose_regimen_en: "15 mg/kg IV every 12 hours (hospital protocol)",
    dose_regimen_bn: "১৫ মিগ্রা/কেজি প্রতি ১২ ঘণ্টায় (হাসপাতাল প্রোটোকল)",
    is_active: true,
  },
  {
    id: "cat-pip-tazo",
    drug_code: "PIPERACILLIN_TAZOBACTAM",
    generic_name: "Piperacillin-Tazobactam",
    generic_name_bn: "পিপেরাসিলিন-ট্যাজোব্যাকটাম",
    drug_class: "PENICILLIN",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: 20,
    min_age_years: 2,
    dose_regimen_en: "4.5 g IV every 6–8 hours (inpatient referral)",
    dose_regimen_bn: "৪.৫ গ্রাম শিরায় প্রতি ৬–৮ ঘণ্টায়",
    is_active: true,
  },
  {
    id: "cat-meropenem",
    drug_code: "MEROPENEM",
    generic_name: "Meropenem",
    generic_name_bn: "মেরোপেনেম",
    drug_class: "CARBAPENEM",
    aware_category: "WATCH",
    aware_tier_cost: 15,
    pregnancy_contraindicated: false,
    renal_contraindicated_egfr_lt: 20,
    min_age_years: 0.25,
    dose_regimen_en: "1 g IV every 8 hours (specialist inpatient use)",
    dose_regimen_bn: "১ গ্রাম শিরায় প্রতি ৮ ঘণ্টায় (বিশেষজ্ঞ তত্ত্বাবধানে)",
    is_active: true,
  },
  {
    id: "cat-linezolid",
    drug_code: "LINEZOLID",
    generic_name: "Linezolid",
    generic_name_bn: "লাইনেজোলিড",
    drug_class: "OXAZOLIDINONE",
    aware_category: "RESERVE",
    aware_tier_cost: 120,
    pregnancy_contraindicated: true,
    renal_contraindicated_egfr_lt: null,
    min_age_years: 12,
    dose_regimen_en: "600 mg PO/IV every 12 hours (Reserve stewardship)",
    dose_regimen_bn: "৬০০ মিগ্রা প্রতি ১২ ঘণ্টায় (রিজার্ভ প্রোটোকল)",
    is_active: true,
  },
  {
    id: "cat-colistin",
    drug_code: "COLISTIN",
    generic_name: "Colistin",
    generic_name_bn: "কলিস্টিন",
    drug_class: "POLYMYXIN",
    aware_category: "RESERVE",
    aware_tier_cost: 120,
    pregnancy_contraindicated: true,
    renal_contraindicated_egfr_lt: 30,
    min_age_years: 18,
    dose_regimen_en: "Reserve ICU-only salvage regimen",
    dose_regimen_bn: "শুধুমাত্র রিজার্ভ আইসিইউ রেফারেল",
    is_active: true,
  },
];

export const DEFAULT_GUIDELINES: GuidelineRecord[] = [
  {
    id: "gl-acute-bronchitis",
    syndrome_code: "ACUTE_BRONCHITIS",
    syndrome_name_en: "Acute Bronchitis",
    syndrome_name_bn: "তীব্র ব্রঙ্কাইটিস",
    severity: "MILD",
    viral_no_antibiotic_if_mild: true,
    first_line_drug_codes: ["AMOXICILLIN", "DOXYCYCLINE"],
    second_line_drug_codes: ["AZITHROMYCIN"],
    default_duration_days: 5,
    guidance_en: "Predominantly viral when mild; prioritize hydration and symptomatic care.",
    guidance_bn: "মৃদু ক্ষেত্রে সাধারণত ভাইরাসজনিত; তরল ও উপসর্গভিত্তিক পরিচর্যা করুন।",
  },
  {
    id: "gl-common-cold",
    syndrome_code: "COMMON_COLD",
    syndrome_name_en: "Common Cold / Rhinitis",
    syndrome_name_bn: "সাধারণ সর্দি-কাশি",
    severity: "MILD",
    viral_no_antibiotic_if_mild: true,
    first_line_drug_codes: [],
    second_line_drug_codes: [],
    default_duration_days: 0,
    guidance_en: "Viral upper respiratory illness; antibiotics provide no benefit.",
    guidance_bn: "ভাইরাসজনিত সাধারণ সর্দিতে অ্যান্টিবায়োটিকের কোনো ভূমিকা নেই।",
  },
  {
    id: "gl-viral-uri",
    syndrome_code: "VIRAL_URI",
    syndrome_name_en: "Viral Upper Respiratory Infection",
    syndrome_name_bn: "ভাইরাসজনিত শ্বাসনালির সংক্রমণ",
    severity: "MILD",
    viral_no_antibiotic_if_mild: true,
    first_line_drug_codes: [],
    second_line_drug_codes: [],
    default_duration_days: 0,
    guidance_en: "Supportive care only; monitor for bacterial red flags.",
    guidance_bn: "সহায়ক চিকিৎসা দিন এবং বিপদসংকেত পর্যবেক্ষণ করুন।",
  },
  {
    id: "gl-cap-mild",
    syndrome_code: "CAP_MILD",
    syndrome_name_en: "Community-Acquired Pneumonia (Mild)",
    syndrome_name_bn: "কমিউনিটি-অ্যাকোয়ার্ড নিউমোনিয়া (মৃদু)",
    severity: "MILD",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["AMOXICILLIN", "DOXYCYCLINE"],
    second_line_drug_codes: ["AZITHROMYCIN", "CEFIXIME"],
    default_duration_days: 5,
    guidance_en: "WHO Access Amoxicillin is first-line for outpatient CAP.",
    guidance_bn: "বহির্বিভাগীয় মৃদু নিউমোনিয়ায় অ্যামোক্সিসিলিন প্রথম পছন্দ।",
  },
  {
    id: "gl-cap-moderate",
    syndrome_code: "CAP_MODERATE",
    syndrome_name_en: "Community-Acquired Pneumonia (Moderate)",
    syndrome_name_bn: "কমিউনিটি-অ্যাকোয়ার্ড নিউমোনিয়া (মাঝারি)",
    severity: "MODERATE",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["AMOXICILLIN", "DOXYCYCLINE"],
    second_line_drug_codes: ["CEFTRIAXONE", "LEVOFLOXACIN", "AZITHROMYCIN"],
    default_duration_days: 7,
    guidance_en: "Start Access beta-lactam or escalate to Watch only with pharmacist sign-off.",
    guidance_bn: "অ্যাক্সেস অ্যান্টিবায়োটিক শুরু করুন অথবা ফার্মাসিস্ট অনুমোদনে ওয়াচ বিবেচনা করুন।",
  },
  {
    id: "gl-acute-otitis-media",
    syndrome_code: "ACUTE_OTITIS_MEDIA",
    syndrome_name_en: "Acute Otitis Media",
    syndrome_name_bn: "তীব্র মধ্যকর্ণের সংক্রমণ",
    severity: "MILD",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["AMOXICILLIN"],
    second_line_drug_codes: ["CEPHALEXIN", "AZITHROMYCIN"],
    default_duration_days: 5,
    guidance_en: "Amoxicillin is first-line Access therapy.",
    guidance_bn: "অ্যামোক্সিসিলিন প্রথম সারির নিরাপদ অ্যাক্সেস চিকিৎসা।",
  },
  {
    id: "gl-strep-pharyngitis",
    syndrome_code: "STREP_PHARYNGITIS",
    syndrome_name_en: "Streptococcal Pharyngitis",
    syndrome_name_bn: "স্ট্রেপটোকক্কাল গলা ব্যথা",
    severity: "MILD",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["PHENOXYMETHYLPENICILLIN", "AMOXICILLIN"],
    second_line_drug_codes: ["CEPHALEXIN", "AZITHROMYCIN"],
    default_duration_days: 10,
    guidance_en: "Narrow-spectrum Penicillin V or Amoxicillin preferred.",
    guidance_bn: "পেনিসিলিন ভি বা অ্যামোক্সিসিলিন অগ্রাধিকারযোগ্য।",
  },
  {
    id: "gl-uncomplicated-uti",
    syndrome_code: "UNCOMPLICATED_UTI",
    syndrome_name_en: "Uncomplicated Urinary Tract Infection",
    syndrome_name_bn: "জটিলতাবিহীন মূত্রনালির সংক্রমণ",
    severity: "MILD",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["NITROFURANTOIN", "COTRIMOXAZOLE"],
    second_line_drug_codes: ["CEPHALEXIN", "CIPROFLOXACIN"],
    default_duration_days: 5,
    guidance_en: "Nitrofurantoin or Cotrimoxazole (Access); avoid fluoroquinolones first-line.",
    guidance_bn: "নাইট্রোফুরান্টোইন বা কোট্রাইমোক্সাজল প্রথম পছন্দ; ফ্লুরোকুইনোলোন এড়িয়ে চলুন।",
  },
  {
    id: "gl-pyelonephritis",
    syndrome_code: "PYELONEPHRITIS",
    syndrome_name_en: "Acute Pyelonephritis",
    syndrome_name_bn: "তীব্র পাইলোনেফ্রাইটিস",
    severity: "SEVERE",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["GENTAMICIN", "AMPICILLIN"],
    second_line_drug_codes: ["CEFTRIAXONE", "CIPROFLOXACIN"],
    default_duration_days: 7,
    guidance_en: "Assess renal function before aminoglycoside/fluoroquinolone dosing.",
    guidance_bn: "চিকিৎসার আগে কিডনির কার্যকারিতা (eGFR) যাচাই করুন।",
  },
  {
    id: "gl-cellulitis",
    syndrome_code: "CELLULITIS",
    syndrome_name_en: "Skin & Soft Tissue Cellulitis",
    syndrome_name_bn: "সেলুলাইটিস (ত্বকের সংক্রমণ)",
    severity: "MODERATE",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["CLOXACILLIN", "CEPHALEXIN"],
    second_line_drug_codes: ["VANCOMYCIN", "LINEZOLID"],
    default_duration_days: 7,
    guidance_en: "Cloxacillin or Cephalexin targets common Gram-positive skin pathogens.",
    guidance_bn: "ক্লোক্সাসিলিন বা সেফালেক্সিন ত্বকের সংক্রমণে প্রথম সারি।",
  },
  {
    id: "gl-sinusitis",
    syndrome_code: "ACUTE_BACTERIAL_SINUSITIS",
    syndrome_name_en: "Acute Bacterial Sinusitis",
    syndrome_name_bn: "তীব্র ব্যাকটেরিয়াল সাইনোসাইটিস",
    severity: "MILD",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["AMOXICILLIN", "DOXYCYCLINE"],
    second_line_drug_codes: ["CEFIXIME"],
    default_duration_days: 5,
    guidance_en: "Amoxicillin is preferred Access agent.",
    guidance_bn: "অ্যামোক্সিসিলিন প্রথম সারির অ্যাক্সেস ওষুধ।",
  },
  {
    id: "gl-cholera",
    syndrome_code: "CHOLERA_WATERY_DIARRHEA",
    syndrome_name_en: "Cholera / Severe Acute Watery Diarrhea",
    syndrome_name_bn: "কলেরা / তীব্র পাতলা পায়খানা",
    severity: "SEVERE",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["DOXYCYCLINE"],
    second_line_drug_codes: ["AZITHROMYCIN", "CIPROFLOXACIN"],
    default_duration_days: 3,
    guidance_en: "Rehydration is primary; Doxycycline first-line if non-pregnant >=8 yrs, Azithromycin in pregnancy/children.",
    guidance_bn: "ওআরএস/শিরায় স্যালাইন প্রধান; গর্ভাবস্থা ও শিশুদের ক্ষেত্রে অ্যাজিথ্রোমাইসিন নিরাপদ।",
  },
  {
    id: "gl-shigellosis",
    syndrome_code: "SHIGELLOSIS_DYSENTERY",
    syndrome_name_en: "Shigellosis / Bloody Dysentery",
    syndrome_name_bn: "শিগেলোসিস / রক্ত আমাশয়",
    severity: "MODERATE",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["COTRIMOXAZOLE"],
    second_line_drug_codes: ["CIPROFLOXACIN", "AZITHROMYCIN", "CEFTRIAXONE"],
    default_duration_days: 5,
    guidance_en: "Check local susceptibility and sulfonamide allergy history.",
    guidance_bn: "সালফোনামাইড অ্যালার্জি ও স্থানীয় সংবেদনশীলতা যাচাই করুন।",
  },
  {
    id: "gl-typhoid",
    syndrome_code: "ENTERIC_FEVER_TYPHOID",
    syndrome_name_en: "Enteric Fever (Typhoid)",
    syndrome_name_bn: "টাইফয়েড জ্বর",
    severity: "MODERATE",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["COTRIMOXAZOLE", "AMOXICILLIN"],
    second_line_drug_codes: ["AZITHROMYCIN", "CEFIXIME", "CEFTRIAXONE"],
    default_duration_days: 7,
    guidance_en: "Watch agents (Azithromycin/Cefixime) require pharmacist verification.",
    guidance_bn: "ওয়াচ শ্রেণির ওষুধে ফার্মাসিস্টের অনুমোদন প্রয়োজন।",
  },
  {
    id: "gl-intra-abdo",
    syndrome_code: "INTRA_ABDOMINAL_SEPSIS",
    syndrome_name_en: "Intra-Abdominal Sepsis",
    syndrome_name_bn: "অভ্যন্তরীণ পেটের সেপসিস",
    severity: "SEVERE",
    viral_no_antibiotic_if_mild: false,
    first_line_drug_codes: ["METRONIDAZOLE", "GENTAMICIN", "AMPICILLIN"],
    second_line_drug_codes: [
      "CEFTRIAXONE",
      "PIPERACILLIN_TAZOBACTAM",
      "MEROPENEM",
      "COLISTIN",
    ],
    default_duration_days: 7,
    guidance_en: "Urgent hospital referral for severe sepsis; preserve Reserve agents.",
    guidance_bn: "গুরুতর সেপসিসে দ্রুত হাসপাতালে রেফার করুন এবং রিজার্ভ ওষুধ সংরক্ষণ করুন।",
  },
];

export interface LocalOptimizeInput {
  patient_profile: {
    age_years: number;
    weight_kg: number;
    sex: Sex;
    is_pregnant: boolean;
    egfr: number | null;
    allergies: string[];
  };
  syndrome_code: string;
  severity: Severity;
  max_aware_tier?: AwareCategory;
  language?: "en" | "bn";
  today?: string;
}

export interface MusConflict {
  code: string;
  label: string;
  detail: string;
}

export interface SafeRelaxation {
  action:
    | "SWITCH_TO_SYMPTOMATIC_CARE"
    | "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL"
    | "REFER_UPAZILA_STOCK_TRANSFER";
  rationale: string;
  candidate_drug: string | null;
}

export interface LocalOptimizeResult {
  solver_status: "OPTIMAL" | "INFEASIBLE" | "NO_ANTIBIOTIC";
  recommended_antibiotic: CatalogDrugRecord | null;
  recommended_batch: (BatchRecord & { days_to_expiry: number }) | null;
  aware_category: AwareVerdictCategory;
  mus_conflicts: MusConflict[];
  safe_relaxations: SafeRelaxation[];
  counseling: {
    summary: string;
    instructions: string[];
    red_flags: string[];
    model_used: "deterministic-local-rules";
    deidentified: true;
    hallucination_guard_passed: true;
  };
  offline_mode: true;
  pending_server_verification: true;
}

const TIER_RANK: Record<AwareCategory, number> = {
  ACCESS: 1,
  WATCH: 2,
  RESERVE: 3,
};

function normalizeAllergyToken(raw: string): string {
  let normalized = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  // Strip trailing dose/formulation/salt tokens (e.g. _500MG, _500_MG, _SODIUM, _HCL, _G, _V)
  let prev = "";
  while (normalized !== prev) {
    prev = normalized;
    normalized = normalized
      .replace(/_\d+(?:\.\d+)?_?(?:MG|G|GM|MCG|UG|ML|IU)?$/i, "")
      .replace(
        /_(?:SODIUM|POTASSIUM|SULFATE|SULPHATE|HYCLATE|HCL|HYDROCHLORIDE|TRIHYDRATE|MONOHYDRATE|TABLET|TABLETS|CAPSULE|CAPSULES|IV|PO|ORAL|ALLERGY|G|V|VK)$/i,
        ""
      )
      .replace(/_+$/g, "");
  }

  return normalized;
}

function addAllergyKey(expanded: Set<string>, candidate: string): void {
  if (!candidate) return;
  const canonical = ALLERGY_SYNONYM_MAP[candidate] ?? candidate;
  expanded.add(candidate);
  expanded.add(canonical);

  const expansionKeys = new Set<string>([candidate, canonical]);
  if (canonical.length > 4 && canonical.endsWith("S")) {
    const singular = canonical.slice(0, -1);
    const singularCanonical = ALLERGY_SYNONYM_MAP[singular] ?? singular;
    expanded.add(singular);
    expanded.add(singularCanonical);
    expansionKeys.add(singular);
    expansionKeys.add(singularCanonical);
  }

  for (const key of expansionKeys) {
    const mapped = ALLERGY_EXPANSION_MAP[key];
    if (mapped) {
      for (const item of mapped) {
        expanded.add(item);
      }
    }
  }
}

function expandAllergies(allergies: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const raw of allergies) {
    const rawUpper = raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!rawUpper) continue;

    const normalized = normalizeAllergyToken(raw);
    addAllergyKey(expanded, rawUpper);
    addAllergyKey(expanded, normalized);

    const parts = (normalized || rawUpper).split("_").filter(Boolean);
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].length >= 4) {
        addAllergyKey(expanded, parts[i]);
      }
      if (i + 1 < parts.length) {
        addAllergyKey(expanded, `${parts[i]}_${parts[i + 1]}`);
      }
    }
  }
  return expanded;
}

function isDrugAllergic(
  drug: CatalogDrugRecord,
  expandedAllergies: Set<string>
): boolean {
  const drugCodeUpper = drug.drug_code.toUpperCase();
  const drugClassUpper = drug.drug_class.toUpperCase();
  if (
    expandedAllergies.has(drugCodeUpper) ||
    expandedAllergies.has(drugClassUpper)
  ) {
    return true;
  }

  const genericNorm = normalizeAllergyToken(
    drug.generic_name.replace(/\([^)]*\)/g, " ")
  );
  if (genericNorm && expandedAllergies.has(genericNorm)) {
    return true;
  }

  return false;
}

function diffDays(targetIso: string, todayIso: string): number {
  const targetMs = Date.parse(`${targetIso.slice(0, 10)}T00:00:00Z`);
  const todayMs = Date.parse(`${todayIso.slice(0, 10)}T00:00:00Z`);
  return Math.ceil((targetMs - todayMs) / 86_400_000);
}

function buildDrugFromBatch(batch: BatchRecord): CatalogDrugRecord {
  return {
    id: batch.antibiotic_id,
    drug_code: batch.drug_code,
    generic_name: batch.generic_name,
    generic_name_bn: batch.generic_name_bn,
    drug_class: batch.drug_class,
    aware_category: batch.aware_category,
    aware_tier_cost: batch.aware_tier_cost,
    pregnancy_contraindicated: batch.pregnancy_contraindicated,
    renal_contraindicated_egfr_lt: batch.renal_contraindicated_egfr_lt,
    min_age_years: batch.min_age_years,
    dose_regimen_en: batch.dose_regimen_en,
    dose_regimen_bn: batch.dose_regimen_bn,
    is_active: true,
  };
}

export function evaluateLocalRegimen(
  input: LocalOptimizeInput,
  datasets: {
    batches: BatchRecord[];
    guidelines?: GuidelineRecord[];
    catalog?: CatalogDrugRecord[];
  }
): LocalOptimizeResult {
  const lang = input.language ?? "en";
  const todayIso = (input.today ?? new Date().toISOString().slice(0, 10)).slice(
    0,
    10
  );
  const syndromeCode = input.syndrome_code.trim().toUpperCase();

  const guidelines =
    datasets.guidelines && datasets.guidelines.length > 0
      ? datasets.guidelines
      : DEFAULT_GUIDELINES;
  const catalogSource =
    datasets.catalog && datasets.catalog.length > 0
      ? datasets.catalog
      : DEFAULT_CATALOG;

  const guideline = guidelines.find(
    (g) => g.syndrome_code.toUpperCase() === syndromeCode
  );

  // Rule 1: Viral Mild No-Antibiotic OR Pure Viral Syndrome (guideline defines no antibiotic drugs)
  const isViralMild =
    (VIRAL_MILD_SYNDROMES.has(syndromeCode) ||
      Boolean(guideline?.viral_no_antibiotic_if_mild)) &&
    input.severity === "MILD";

  const isPureViralNoAntibiotic =
    Boolean(guideline) &&
    guideline!.first_line_drug_codes.length === 0 &&
    guideline!.second_line_drug_codes.length === 0;

  if (isViralMild || isPureViralNoAntibiotic) {
    const isSevere = input.severity === "SEVERE";
    const isModerate = input.severity === "MODERATE";
    return {
      solver_status: "NO_ANTIBIOTIC",
      recommended_antibiotic: null,
      recommended_batch: null,
      aware_category: "NO_ANTIBIOTIC",
      mus_conflicts: [],
      safe_relaxations: [],
      counseling: {
        summary:
          lang === "bn"
            ? isSevere
              ? "তীব্র উপসর্গসহ ভাইরাসজনিত সিনড্রোমে রুটিন অ্যান্টিবায়োটিক নির্দেশিত নয়; দ্রুত চিকিৎসক/উপজেলা স্বাস্থ্য কমপ্লেক্সে রেফার করে ব্যাকটেরিয়াল সুপারইনফেকশন যাচাই করুন।"
              : isModerate
              ? "ভাইরাসজনিত সিনড্রোমে অ্যান্টিবায়োটিক প্রয়োজন নেই; উপসর্গভিত্তিক পরিচর্যা ও ২৪–৪৮ ঘণ্টায় পুনর্মূল্যায়ন করুন।"
              : "মৃদু ভাইরাসজনিত সংক্রমণে অ্যান্টিবায়োটিক প্রয়োজন নেই; সহায়ক ও উপসর্গভিত্তিক পরিচর্যা অনুসরণ করুন।"
            : isSevere
            ? "No routine antibiotic indicated for this pure viral syndrome; due to SEVERE presentation, escalate urgently for physician/hospital evaluation of bacterial superinfection or alternative diagnosis."
            : isModerate
            ? "No antibiotic indicated for this viral syndrome; provide symptomatic care and clinically reassess within 24–48 hours."
            : "No antibiotic indicated for mild viral syndrome; provide symptomatic and hydration care.",
        instructions:
          lang === "bn"
            ? isSevere
              ? [
                  "তাৎক্ষণিকভাবে ভাইটাল সাইন ও অক্সিজেন স্যাচুরেশন পরীক্ষা করুন।",
                  "অপ্রয়োজনীয় অ্যান্টিবায়োটিক না দিয়ে দ্রুত মেডিকেল অফিসার/উপজেলা স্বাস্থ্য কমপ্লেক্সে রেফার করুন।",
                  "হাইড্রেশন ও জ্বর নিয়ন্ত্রণ বজায় রাখুন।",
                ]
              : [
                  "পর্যাপ্ত বিশ্রাম ও নিরাপদ পানীয়/তরল গ্রহণ করুন।",
                  "জ্বর বা ব্যথা থাকলে প্যারাসিটামল ব্যবহার করুন।",
                  "অ্যান্টিবায়োটিক ছাড়াই ২৪–৭২ ঘণ্টায় উন্নতি পর্যবেক্ষণ করুন।",
                ]
            : isSevere
            ? [
                "Assess vital signs, respiratory distress, and oxygen saturation immediately.",
                "Do not dispense empiric antibiotics for a pure viral diagnosis; refer urgently to a physician or Upazila Health Complex.",
                "Maintain hydration and fever control during transfer.",
              ]
            : [
                "Rest and maintain oral hydration.",
                "Use paracetamol as needed for fever or discomfort.",
                "Reassess in 24–72 hours without unnecessary antibiotic exposure.",
              ],
        red_flags:
          lang === "bn"
            ? [
                "শ্বাসকষ্ট, উচ্চ জ্বর, বুকে ব্যথা, বিভ্রান্তি বা দ্রুত অবনতি হলে অবিলম্বে হাসপাতালে রেফার করুন।",
              ]
            : [
                "Escalate immediately to hospital care if shortness of breath, hypoxia, chest pain, altered mental status, or clinical deterioration occurs.",
              ],
        model_used: "deterministic-local-rules",
        deidentified: true,
        hallucination_guard_passed: true,
      },
      offline_mode: true,
      pending_server_verification: true,
    };
  }

  const catalogByCode = new Map<string, CatalogDrugRecord>();
  for (const item of catalogSource) {
    if (item.is_active) {
      catalogByCode.set(item.drug_code.toUpperCase(), item);
    }
  }
  for (const b of datasets.batches) {
    const code = b.drug_code.toUpperCase();
    if (!catalogByCode.has(code)) {
      catalogByCode.set(code, buildDrugFromBatch(b));
    }
  }

  const candidateEntries: Array<{ code: string; linePenalty: number }> = [];
  const seenCodes = new Set<string>();
  if (guideline) {
    for (const c of guideline.first_line_drug_codes) {
      const up = c.toUpperCase();
      if (!seenCodes.has(up)) {
        seenCodes.add(up);
        candidateEntries.push({ code: up, linePenalty: 0 });
      }
    }
    for (const c of guideline.second_line_drug_codes) {
      const up = c.toUpperCase();
      if (!seenCodes.has(up)) {
        seenCodes.add(up);
        candidateEntries.push({ code: up, linePenalty: 1 });
      }
    }
  } else {
    for (const drug of catalogByCode.values()) {
      const up = drug.drug_code.toUpperCase();
      if (!seenCodes.has(up)) {
        seenCodes.add(up);
        candidateEntries.push({ code: up, linePenalty: 1 });
      }
    }
  }

  const expandedAllergies = expandAllergies(input.patient_profile.allergies);
  const musMap = new Map<string, MusConflict>();

  interface FeasibleCandidate {
    drug: CatalogDrugRecord;
    batch: BatchRecord & { days_to_expiry: number };
    score: number;
  }

  const feasible: FeasibleCandidate[] = [];
  const clinicallySafeWithoutTierCap: Array<{
    drug: CatalogDrugRecord;
    linePenalty: number;
    validBatch: (BatchRecord & { days_to_expiry: number }) | null;
    blockedByTierCap: boolean;
  }> = [];

  for (const entry of candidateEntries) {
    const drug = catalogByCode.get(entry.code);
    if (!drug) continue;

    let clinicalUnsafe = false;

    const drugCodeUpper = drug.drug_code.toUpperCase();
    const drugClassUpper = drug.drug_class.toUpperCase();
    if (isDrugAllergic(drug, expandedAllergies)) {
      clinicalUnsafe = true;
      const code = `ALLERGY_${drugClassUpper}`;
      musMap.set(code, {
        code,
        label:
          lang === "bn"
            ? `${drugClassUpper} অ্যালার্জি দ্বন্দ্ব`
            : `${drugClassUpper} Allergy Exclusion`,
        detail: `${drug.generic_name} (${drugClassUpper}) conflicts with documented patient allergies.`,
      });
    }

    if (input.patient_profile.is_pregnant && drug.pregnancy_contraindicated) {
      clinicalUnsafe = true;
      musMap.set("PREGNANCY_CONTRAINDICATED", {
        code: "PREGNANCY_CONTRAINDICATED",
        label:
          lang === "bn"
            ? "গর্ভাবস্থায় নিষিদ্ধ"
            : "Pregnancy Contraindication",
        detail: `${drug.generic_name} is contraindicated during pregnancy.`,
      });
    }

    if (
      drug.renal_contraindicated_egfr_lt !== null &&
      input.patient_profile.egfr !== null &&
      input.patient_profile.egfr < drug.renal_contraindicated_egfr_lt
    ) {
      clinicalUnsafe = true;
      musMap.set("RENAL_EGFR_BELOW_THRESHOLD", {
        code: "RENAL_EGFR_BELOW_THRESHOLD",
        label:
          lang === "bn"
            ? "কিডনি eGFR সীমার নিচে"
            : "Renal Impairment Exclusion",
        detail: `${drug.generic_name} requires eGFR >= ${drug.renal_contraindicated_egfr_lt} (patient eGFR: ${input.patient_profile.egfr}).`,
      });
    }

    if (input.patient_profile.age_years < drug.min_age_years) {
      clinicalUnsafe = true;
      musMap.set("BELOW_MIN_AGE", {
        code: "BELOW_MIN_AGE",
        label:
          lang === "bn" ? "সর্বনিম্ন বয়সসীমা" : "Minimum Age Contraindication",
        detail: `${drug.generic_name} requires age >= ${drug.min_age_years} years (patient age: ${input.patient_profile.age_years}).`,
      });
    }

    if (clinicalUnsafe) {
      continue;
    }

    const blockedByTierCap = Boolean(
      input.max_aware_tier &&
        TIER_RANK[drug.aware_category] > TIER_RANK[input.max_aware_tier]
    );
    if (blockedByTierCap && input.max_aware_tier) {
      const tierCode = `TIER_CAP_${input.max_aware_tier}`;
      musMap.set(tierCode, {
        code: tierCode,
        label:
          lang === "bn"
            ? `AWaRe স্তর সীমা (${input.max_aware_tier})`
            : `AWaRe Tier Cap (${input.max_aware_tier})`,
        detail: `${drug.generic_name} (${drug.aware_category}) exceeds max_aware_tier=${input.max_aware_tier}.`,
      });
    }

    const matchingBatches = datasets.batches.filter(
      (b) => b.drug_code.toUpperCase() === drugCodeUpper
    );
    const validBatches = matchingBatches
      .filter((b) => b.qty_remaining >= 1 && b.expiry_date.slice(0, 10) > todayIso)
      .sort((a, b) =>
        a.expiry_date.slice(0, 10).localeCompare(b.expiry_date.slice(0, 10))
      );

    let chosenBatch: (BatchRecord & { days_to_expiry: number }) | null = null;
    if (validBatches.length > 0) {
      const first = validBatches[0];
      chosenBatch = {
        ...first,
        days_to_expiry: Math.max(1, diffDays(first.expiry_date, todayIso)),
      };
    } else if (!blockedByTierCap) {
      const hasExpiredWithStock = matchingBatches.some(
        (b) => b.qty_remaining >= 1 && b.expiry_date.slice(0, 10) <= todayIso
      );
      if (hasExpiredWithStock) {
        musMap.set("BATCH_EXPIRED", {
          code: "BATCH_EXPIRED",
          label:
            lang === "bn" ? "ব্যাচের মেয়াদ উত্তীর্ণ" : "FEFO Batch Expired",
          detail: `Available batches for ${drug.generic_name} have expired as of ${todayIso}.`,
        });
      } else {
        musMap.set("OUT_OF_STOCK", {
          code: "OUT_OF_STOCK",
          label:
            lang === "bn" ? "ক্লিনিকে মজুদ নেই" : "Out of Clinic Stock",
          detail: `No active FEFO stock remaining for ${drug.generic_name}.`,
        });
      }
    }

    clinicallySafeWithoutTierCap.push({
      drug,
      linePenalty: entry.linePenalty,
      validBatch: chosenBatch,
      blockedByTierCap,
    });

    if (!blockedByTierCap && chosenBatch) {
      const score =
        drug.aware_tier_cost * 10_000 +
        entry.linePenalty * 100 +
        Math.min(chosenBatch.days_to_expiry, 9999);
      feasible.push({ drug, batch: chosenBatch, score });
    }
  }

  if (feasible.length > 0) {
    feasible.sort((a, b) => a.score - b.score);
    const winner = feasible[0];
    const duration = guideline?.default_duration_days || 5;
    const drugLabel =
      lang === "bn"
        ? winner.drug.generic_name_bn || winner.drug.generic_name
        : winner.drug.generic_name;
    const regimenLabel =
      lang === "bn"
        ? winner.drug.dose_regimen_bn || winner.drug.dose_regimen_en
        : winner.drug.dose_regimen_en;

    return {
      solver_status: "OPTIMAL",
      recommended_antibiotic: winner.drug,
      recommended_batch: winner.batch,
      aware_category: winner.drug.aware_category,
      mus_conflicts: [],
      safe_relaxations: [],
      counseling: {
        summary:
          lang === "bn"
            ? `${drugLabel} (${winner.drug.aware_category}) নির্বাচিত হয়েছে — ব্যাচ ${winner.batch.lot_number} (মেয়াদ ${winner.batch.expiry_date})।`
            : `Selected ${drugLabel} (${winner.drug.aware_category}) from FEFO lot ${winner.batch.lot_number} (expires ${winner.batch.expiry_date}).`,
        instructions:
          lang === "bn"
            ? [
                `মাত্রা ও সময়কাল: ${regimenLabel || `${duration} দিন`}।`,
                "উপসর্গ কমলেও নির্ধারিত পূর্ণ কোর্স সম্পন্ন করুন।",
                "অফলাইন স্থানীয় নিয়মে অনুমোদিত; অনলাইন সিঙ্কের পর সার্ভারে যাচাই হবে।",
              ]
            : [
                `Regimen: ${regimenLabel || `${duration} days`}.`,
                "Complete the full prescribed course even if symptoms improve early.",
                "Computed via offline deterministic safety rules; queued for server CP-SAT verification.",
              ],
        red_flags:
          lang === "bn"
            ? [
                "ত্বকে র‍্যাশ, শ্বাসকষ্ট বা ৪৮–৭২ ঘণ্টায় জ্বর না কমলে দ্রুত ক্লিনিকে যোগাযোগ করুন।",
              ]
            : [
                "Seek immediate clinical review for rash, breathing difficulty, or persistent fever after 48–72 hours.",
              ],
        model_used: "deterministic-local-rules",
        deidentified: true,
        hallucination_guard_passed: true,
      },
      offline_mode: true,
      pending_server_verification: true,
    };
  }

  const mus_conflicts = Array.from(musMap.values());
  const safe_relaxations: SafeRelaxation[] = [];

  const watchEscalation = clinicallySafeWithoutTierCap
    .filter(
      (c) =>
        c.blockedByTierCap &&
        c.drug.aware_category === "WATCH" &&
        c.validBatch !== null
    )
    .sort((a, b) => a.linePenalty - b.linePenalty)[0];

  if (watchEscalation) {
    safe_relaxations.push({
      action: "ESCALATE_WATCH_WITH_PHARMACIST_APPROVAL",
      rationale:
        lang === "bn"
          ? `নিরাপদ ACCESS বিকল্প না থাকায় ফার্মাসিস্ট অনুমোদনে WATCH শ্রেণির ${watchEscalation.drug.generic_name} বিবেচনা করা যায়।`
          : `No feasible ACCESS regimen available; escalate to WATCH agent ${watchEscalation.drug.generic_name} with pharmacist approval.`,
      candidate_drug: watchEscalation.drug.generic_name,
    });
  }

  const outOfStockSafe = clinicallySafeWithoutTierCap
    .filter((c) => !c.blockedByTierCap && c.validBatch === null)
    .sort(
      (a, b) =>
        a.drug.aware_tier_cost - b.drug.aware_tier_cost ||
        a.linePenalty - b.linePenalty
    )[0];

  if (outOfStockSafe) {
    safe_relaxations.push({
      action: "REFER_UPAZILA_STOCK_TRANSFER",
      rationale:
        lang === "bn"
          ? `চিকিৎসাগতভাবে নিরাপদ ${outOfStockSafe.drug.generic_name} ক্লিনিকে মজুদ নেই; উপজেলা হাব থেকে জরুরি স্টক ট্রান্সফার বা রেফারেল করুন।`
          : `Clinically safe ${outOfStockSafe.drug.generic_name} lacks valid FEFO stock; request Upazila stock transfer or patient referral.`,
      candidate_drug: outOfStockSafe.drug.generic_name,
    });
  }

  if (
    input.severity === "MILD" ||
    safe_relaxations.length === 0 ||
    clinicallySafeWithoutTierCap.length === 0
  ) {
    safe_relaxations.push({
      action: "SWITCH_TO_SYMPTOMATIC_CARE",
      rationale:
        lang === "bn"
          ? "নিরাপদ অ্যান্টিবায়োটিক পাওয়া যায়নি; সহায়ক পরিচর্যা ও নিবিড় পর্যবেক্ষণে রাখুন অথবা উচ্চতর কেন্দ্রে রেফার করুন।"
          : "No safe antibiotic satisfies all clinical and stock constraints; provide symptomatic supportive care and clinical escalation if needed.",
      candidate_drug: null,
    });
  }

  return {
    solver_status: "INFEASIBLE",
    recommended_antibiotic: null,
    recommended_batch: null,
    aware_category: "NO_ANTIBIOTIC",
    mus_conflicts,
    safe_relaxations,
    counseling: {
      summary:
        lang === "bn"
          ? "কোনো অ্যান্টিবায়োটিক সকল নিরাপত্তা ও স্টক শর্ত পূরণ করতে পারেনি (INFEASIBLE)।"
          : "No antibiotic satisfies all clinical safety and FEFO stock constraints (INFEASIBLE).",
      instructions:
        lang === "bn"
          ? [
              "নিচের MUS দ্বন্দ্ব ও নিরাপদ শিথিলকরণ বিকল্পসমূহ পর্যালোচনা করুন।",
              "ফার্মাসিস্ট বা মেডিকেল অফিসারের সাথে পরামর্শ ছাড়া অ্যান্টিবায়োটিক দেবেন না।",
            ]
          : [
              "Review the MUS conflict cores and safe relaxation options below.",
              "Do not dispense a contraindicated antibiotic; consult pharmacist or refer.",
            ],
      red_flags:
        lang === "bn"
          ? ["তীব্র উপসর্গ থাকলে অবিলম্বে উপজেলা স্বাস্থ্য কমপ্লেক্সে রেফার করুন।"]
          : [
              "Refer immediately to the Upazila Health Complex if severe clinical signs are present.",
            ],
      model_used: "deterministic-local-rules",
      deidentified: true,
      hallucination_guard_passed: true,
    },
    offline_mode: true,
    pending_server_verification: true,
  };
}

export async function evaluateOfflineRegimenFromDexie(
  clinicId: string,
  input: LocalOptimizeInput
): Promise<LocalOptimizeResult> {
  const database = getDb();
  const [batches, guidelines, catalog] = await Promise.all([
    database.batches.where("clinic_id").equals(clinicId).toArray(),
    database.guidelines.toArray(),
    database.catalog.toArray(),
  ]);

  return evaluateLocalRegimen(input, {
    batches,
    guidelines,
    catalog,
  });
}
