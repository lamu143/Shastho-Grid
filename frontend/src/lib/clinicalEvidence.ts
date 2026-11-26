/**
 * Verified open-access Europe PMC citations and pharmacogenomic / target-mechanism
 * annotations for ShasthoGrid's clinical stewardship & triage workflows.
 */

import type { Locale } from "@/lib/i18n";

export interface LiteratureReference {
  pmcid: string;
  pmid: string;
  doi: string;
  title: string;
  journal: string;
  year: string;
  url: string;
  topic: Record<Locale, string>;
}

export const EUROPE_PMC_REFERENCES: LiteratureReference[] = [
  {
    pmcid: "PMC8654683",
    pmid: "34774223",
    doi: "10.1016/s2542-5196(21)00280-1",
    title: "Global antibiotic consumption and usage in humans, 2000-18: a spatial modelling study.",
    journal: "The Lancet Planetary Health",
    year: "2021",
    url: "https://europepmc.org/article/PMC/PMC8654683",
    topic: {
      en: "Global AWaRe consumption",
      bn: "বৈশ্বিক AWaRe ব্যবহার",
    },
  },
  {
    pmcid: "PMC10675245",
    pmid: "38004480",
    doi: "10.3390/ph16111615",
    title: "Origin of Antibiotics and Antibiotic Resistance, and Their Impacts on Drug Development: A Narrative Review.",
    journal: "Pharmaceuticals (Basel)",
    year: "2023",
    url: "https://europepmc.org/article/PMC/PMC10675245",
    topic: {
      en: "AMR & drug stewardship",
      bn: "এএমআর ও ওষুধ তত্ত্বাবধান",
    },
  },
  {
    pmcid: "PMC7159295",
    pmid: "27832874",
    doi: "10.1016/s0140-6736(16)31599-9",
    title: "Essential medicines for universal health coverage.",
    journal: "The Lancet",
    year: "2017",
    url: "https://europepmc.org/article/PMC/PMC7159295",
    topic: {
      en: "Essential medicines",
      bn: "অত্যাবশ্যকীয় ওষুধ",
    },
  },
  {
    pmcid: "PMC8929648",
    pmid: "35298560",
    doi: "10.1371/journal.pone.0265559",
    title: "The use of early warning system scores in prehospital and emergency department settings to predict clinical deterioration: A systematic review and meta-analysis.",
    journal: "PLOS ONE",
    year: "2022",
    url: "https://europepmc.org/article/PMC/PMC8929648",
    topic: {
      en: "NEWS2 early warning",
      bn: "NEWS2 প্রাথমিক সতর্কতা",
    },
  },
];

export interface PharmacogenomicNote {
  target: string;
  pgxFlag: Record<Locale, string>;
}

export const ANTIBIOTIC_PHARMACOGENOMICS: Record<string, PharmacogenomicNote> = {
  AMOXICILLIN: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "Check beta-lactam hypersensitivity; renal dose adjustment if eGFR < 30.",
      bn: "বিটা-ল্যাকটাম অ্যালার্জি যাচাই করুন; eGFR < 30 হলে রেনাল ডোজ সমন্বয় প্রয়োজন।",
    },
  },
  AMPICILLIN: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "Beta-lactam class; avoid in penicillin allergy.",
      bn: "বিটা-ল্যাকটাম শ্রেণি; পেনিসিলিন অ্যালার্জিতে পরিহার্য।",
    },
  },
  COTRIMOXAZOLE: {
    target: "DHPS + DHFR (folate pathway)",
    pgxFlag: {
      en: "G6PD deficiency: risk of hemolytic anemia; sulfonamide hypersensitivity.",
      bn: "G6PD ঘাটতিতে হিমোলাইটিক অ্যানিমিয়ার ঝুঁকি; সালফোনামাইড অ্যালার্জি দেখুন।",
    },
  },
  NITROFURANTOIN: {
    target: "Bacterial ribosomal & DNA damage",
    pgxFlag: {
      en: "G6PD deficiency: contraindicated near term or in G6PD-deficient patients; avoid if eGFR < 30.",
      bn: "G6PD ঘাটতি ও eGFR < 30 হলে পরিহার্য।",
    },
  },
  GENTAMICIN: {
    target: "30S ribosomal subunit",
    pgxFlag: {
      en: "MT-RNR1 variants increase aminoglycoside ototoxicity risk; monitor renal function.",
      bn: "MT-RNR1 জিনগত পরিবর্তনে কানের ক্ষতির ঝুঁকি বাড়ে; কিডনির কার্যকারিতা পর্যবেক্ষণ করুন।",
    },
  },
  CIPROFLOXACIN: {
    target: "DNA gyrase & topoisomerase IV",
    pgxFlag: {
      en: "CYP1A2 inhibitor; avoid in pregnancy/pediatrics unless no safer option.",
      bn: "CYP1A2 ইনহিবিটর; গর্ভাবস্থা ও শিশুদের ক্ষেত্রে নিরাপদ বিকল্প না থাকলে তবেই বিবেচ্য।",
    },
  },
  LEVOFLOXACIN: {
    target: "DNA gyrase & topoisomerase IV",
    pgxFlag: {
      en: "Renal clearance; adjust dose if eGFR < 50; monitor QT interval.",
      bn: "কিডনির মাধ্যমে নিষ্কাশিত; eGFR < 50 হলে ডোজ কমান ও QT ব্যবধান দেখুন।",
    },
  },
  AZITHROMYCIN: {
    target: "50S ribosomal subunit",
    pgxFlag: {
      en: "Macrolide; check QT-prolonging co-medications.",
      bn: "ম্যাক্রোলাইড; QT-দীর্ঘায়িতকারী অন্যান্য ওষুধের সাথে মিথস্ক্রিয়া দেখুন।",
    },
  },
  CEFTRIAXONE: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "Watch-tier 3rd-gen cephalosporin; dual biliary/renal clearance.",
      bn: "ওয়াচ-স্তরের তৃতীয় প্রজন্মের সেফালোস্পোরিন; পিত্ত ও কিডনি পথে নিষ্কাশিত।",
    },
  },
  VANCOMYCIN: {
    target: "D-Ala-D-Ala cell wall precursor",
    pgxFlag: {
      en: "Reserve/Watch glycopeptide; therapeutic drug monitoring for nephrotoxicity.",
      bn: "গ্লাইকোপেপটাইড; কিডনির সুরক্ষায় ডোজ ও মাত্রা পর্যবেক্ষণ জরুরি।",
    },
  },
  LINEZOLID: {
    target: "50S ribosomal subunit (23S rRNA)",
    pgxFlag: {
      en: "Reserve oxazolidinone; weak MAOI — check serotonergic drug interactions.",
      bn: "রিজার্ভ অক্সাজোলিডিনোন; সেরোটোনার্জিক ওষুধের সাথে মিথস্ক্রিয়া যাচাই করুন।",
    },
  },
  DOXYCYCLINE: {
    target: "30S ribosomal subunit",
    pgxFlag: {
      en: "Avoid in pregnancy and children <8 years (tooth/bone effects); take upright with water.",
      bn: "গর্ভাবস্থা ও ৮ বছরের কম শিশুদের ক্ষেত্রে এড়িয়ে চলুন; পর্যাপ্ত পানিসহ সোজা হয়ে সেবন করুন।",
    },
  },
  PHENOXYMETHYLPENICILLIN: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "Narrow-spectrum Access oral penicillin; verify beta-lactam allergy.",
      bn: "সংকীর্ণ-স্পেকট্রাম অ্যাক্সেস পেনিসিলিন; বিটা-ল্যাকটাম অ্যালার্জি যাচাই করুন।",
    },
  },
  CLOXACILLIN: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "Anti-staphylococcal Access penicillin; verify beta-lactam allergy and hepatic status.",
      bn: "স্ট্যাফাইলোকক্কাল-বিরোধী অ্যাক্সেস পেনিসিলিন; বিটা-ল্যাকটাম অ্যালার্জি যাচাই করুন।",
    },
  },
  CEPHALEXIN: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "1st-gen Access cephalosporin; check severe penicillin anaphylaxis history and eGFR <30.",
      bn: "প্রথম প্রজন্মের অ্যাক্সেস সেফালোস্পোরিন; তীব্র পেনিসিলিন অ্যালার্জি ও eGFR <30 হলে সতর্কতা নিন।",
    },
  },
  METRONIDAZOLE: {
    target: "Bacterial DNA strand disruption",
    pgxFlag: {
      en: "Anaerobic/antiprotozoal Access agent; avoid alcohol (disulfiram-like reaction) and check hepatic impairment.",
      bn: "অ্যানেরোবিক অ্যাক্সেস ওষুধ; অ্যালকোহল এড়িয়ে চলুন এবং যকৃতের দুর্বলতায় ডোজ সমন্বয় করুন।",
    },
  },
  CEFIXIME: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "Oral 3rd-gen Watch cephalosporin; reserve for documented typhoid/resistant Gram-negative cases.",
      bn: "মৌখিক তৃতীয় প্রজন্মের ওয়াচ সেফালোস্পোরিন; টাইফয়েড বা প্রতিরোধী সংক্রমণে সীমিত রাখুন।",
    },
  },
  PIPERACILLIN_TAZOBACTAM: {
    target: "PBPs + beta-lactamase inhibition",
    pgxFlag: {
      en: "Broad-spectrum Watch ureidopenicillin; adjust dose if eGFR <40 and monitor electrolytes.",
      bn: "বিস্তৃত-স্পেকট্রাম ওয়াচ ওষুধ; eGFR <40 হলে ডোজ সমন্বয় করুন ও ইলেক্ট্রোলাইট দেখুন।",
    },
  },
  MEROPENEM: {
    target: "Penicillin-binding proteins (PBPs)",
    pgxFlag: {
      en: "Watch/Reserve-adjacent carbapenem; renal dose adjustment required and lowers valproate levels.",
      bn: "কার্বাপেনেম; কিডনির কার্যকারিতা অনুযায়ী ডোজ সমন্বয় প্রয়োজন এবং ভালপ্রোয়েটের মাত্রা কমাতে পারে।",
    },
  },
  COLISTIN: {
    target: "Gram-negative outer membrane LPS",
    pgxFlag: {
      en: "Reserve polymyxin; high nephrotoxicity and neurotoxicity risk — requires specialist sign-off and eGFR monitoring.",
      bn: "রিজার্ভ পলিমিক্সিন; কিডনি ও স্নায়ুর ক্ষতির উচ্চ ঝুঁকি — বিশেষজ্ঞ অনুমোদন ও eGFR পর্যবেক্ষণ আবশ্যক।",
    },
  },
};
