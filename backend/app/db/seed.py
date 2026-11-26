from __future__ import annotations

import asyncio
import csv
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_secret
from app.db.models import (
    AntibioticCatalog,
    AwareGuideline,
    Clinic,
    Dispense,
    InventoryBatch,
    Patient,
    User,
)
from app.db.seed_critical_care import COMMAND_CLINIC, CRITICAL_CARE_USERS, seed_facilities
from app.db.session import AsyncSessionLocal, engine, init_db

SEED_NAMESPACE = uuid.UUID("7f3b9a10-2026-4d8e-b1c4-000000000001")


def seed_uuid(kind: str, key: str) -> uuid.UUID:
    """Generate deterministic UUIDv5 IDs for idempotent seed records."""
    return uuid.uuid5(SEED_NAMESPACE, f"{kind}:{key}")


CLINICS_DATA: list[dict[str, Any]] = [
    {
        "code": "ASHULIA-01",
        "name": "Ashulia Union Sub-Center",
        "upazila": "Savar",
        "district": "Dhaka",
        "target_access_pct": Decimal("60.00"),
    },
    {
        "code": "DHAMRAI-01",
        "name": "Dhamrai Community Dispensary",
        "upazila": "Dhamrai",
        "district": "Dhaka",
        "target_access_pct": Decimal("60.00"),
    },
]

USERS_DATA: list[dict[str, str]] = [
    {
        "email": "dispenser@awaregrid.org",
        "full_name": "Tariqul Islam (Dispenser)",
        "role": "dispenser",
        "password": "Dispenser#2026!",
        "pin": "2026",
        "clinic_code": "ASHULIA-01",
    },
    {
        "email": "pharmacist@awaregrid.org",
        "full_name": "Dr. Farhana Rahman (Pharmacist)",
        "role": "pharmacist",
        "password": "Pharmacist#2026!",
        "pin": "2026",
        "clinic_code": "ASHULIA-01",
    },
    {
        "email": "auditor@awaregrid.org",
        "full_name": "Mahmudul Hasan (Stewardship Auditor)",
        "role": "auditor",
        "password": "Auditor#2026!",
        "pin": "2026",
        "clinic_code": "ASHULIA-01",
    },
    {
        "email": "admin@awaregrid.org",
        "full_name": "Nadia Sultana (Clinic Admin)",
        "role": "admin",
        "password": "Admin#2026!",
        "pin": "2026",
        "clinic_code": "ASHULIA-01",
    },
    {
        "email": "dhamrai.dispenser@awaregrid.org",
        "full_name": "Jahangir Alam (Dhamrai Dispenser)",
        "role": "dispenser",
        "password": "Dispenser#2026!",
        "pin": "2026",
        "clinic_code": "DHAMRAI-01",
    },
]

GUIDELINES_DATA: list[dict[str, Any]] = [
    {
        "syndrome_code": "ACUTE_BRONCHITIS",
        "syndrome_name_en": "Acute Bronchitis (Uncomplicated)",
        "syndrome_name_bn": "তীব্র ব্রঙ্কাইটিস (জটিলতাবিহীন)",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": True,
        "first_line_drug_codes": [],
        "second_line_drug_codes": ["AMOXICILLIN", "DOXYCYCLINE"],
        "default_duration_days": 5,
        "guidance_en": "Usually viral in mild uncomplicated cases; provide hydration, rest, and symptomatic relief without antibiotics.",
        "guidance_bn": "হালকা ও জটিলতাবিহীন ক্ষেত্রে সাধারণত ভাইরাসজনিত; অ্যান্টিবায়োটিক ছাড়া পর্যাপ্ত পানি, বিশ্রাম ও লক্ষণভিত্তিক চিকিৎসা দিন।",
    },
    {
        "syndrome_code": "COMMON_COLD",
        "syndrome_name_en": "Common Cold / Acute Nasopharyngitis",
        "syndrome_name_bn": "সাধারণ সর্দি-কাশি",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": True,
        "first_line_drug_codes": [],
        "second_line_drug_codes": [],
        "default_duration_days": 5,
        "guidance_en": "Self-limiting viral illness; antibiotics are contraindicated. Recommend fluids, saline nasal drops, and paracetamol if febrile.",
        "guidance_bn": "স্বতঃসিদ্ধভাবে সেরে যাওয়া ভাইরাল রোগ; অ্যান্টিবায়োটিক দেবেন না। তরল খাবার, স্যালাইন ড্রপ ও জ্বর থাকলে প্যারাসিটামল দিন।",
    },
    {
        "syndrome_code": "VIRAL_URI",
        "syndrome_name_en": "Viral Upper Respiratory Infection",
        "syndrome_name_bn": "ভাইরাল আপার রেসপিরেটরি ইনফেকশন",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": True,
        "first_line_drug_codes": [],
        "second_line_drug_codes": [],
        "default_duration_days": 5,
        "guidance_en": "Viral URI requires supportive care only; counsel patient on red-flag symptoms requiring follow-up.",
        "guidance_bn": "ভাইরাল শ্বাসতন্ত্রের সংক্রমণে শুধুমাত্র সহায়ক চিকিৎসা প্রয়োজন; বিপজ্জনক লক্ষণ দেখা দিলে পুনরায় আসার পরামর্শ দিন।",
    },
    {
        "syndrome_code": "CAP_MILD",
        "syndrome_name_en": "Community-Acquired Pneumonia (Mild)",
        "syndrome_name_bn": "কমিউনিটি-অ্যাকোয়ার্ড নিউমোনিয়া (হালকা)",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["AMOXICILLIN", "DOXYCYCLINE", "PHENOXYMETHYLPENICILLIN"],
        "second_line_drug_codes": ["AZITHROMYCIN", "CEFIXIME", "LEVOFLOXACIN"],
        "default_duration_days": 5,
        "guidance_en": "WHO AWaRe Access first-line oral therapy (Amoxicillin preferred unless penicillin-allergic).",
        "guidance_bn": "হালকা নিউমোনিয়ায় ডব্লিউএইচও অ্যাক্সেস গ্রুপের অ্যামোক্সিসিলিন প্রথম পছন্দ (পেনিসিলিন অ্যালার্জি না থাকলে)।",
    },
    {
        "syndrome_code": "CAP_MODERATE",
        "syndrome_name_en": "Community-Acquired Pneumonia (Moderate)",
        "syndrome_name_bn": "কমিউনিটি-অ্যাকোয়ার্ড নিউমোনিয়া (মাঝারি)",
        "severity": "MODERATE",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["AMOXICILLIN", "AMPICILLIN", "DOXYCYCLINE"],
        "second_line_drug_codes": ["CEFTRIAXONE", "AZITHROMYCIN", "LEVOFLOXACIN"],
        "default_duration_days": 7,
        "guidance_en": "Initiate Access beta-lactam; escalate to Watch Ceftriaxone/Macrolide only with clinical justification and pharmacist review.",
        "guidance_bn": "অ্যাক্সেস বিটা-ল্যাকটাম দিয়ে শুরু করুন; প্রয়োজন হলে ফার্মাসিস্টের অনুমোদনে ওয়াচ গ্রুপ ব্যবহার করুন।",
    },
    {
        "syndrome_code": "ACUTE_OTITIS_MEDIA",
        "syndrome_name_en": "Acute Otitis Media",
        "syndrome_name_bn": "তীব্র মধ্যকর্ণের সংক্রমণ",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["AMOXICILLIN", "COTRIMOXAZOLE"],
        "second_line_drug_codes": ["CEFIXIME", "AZITHROMYCIN"],
        "default_duration_days": 5,
        "guidance_en": "High-dose Amoxicillin is first-line Access therapy for bacterial acute otitis media.",
        "guidance_bn": "ব্যাকটেরিয়াজনিত কানের সংক্রমণে অ্যামোক্সিসিলিন প্রথম সারির অ্যাক্সেস অ্যান্টিবায়োটিক।",
    },
    {
        "syndrome_code": "STREP_PHARYNGITIS",
        "syndrome_name_en": "Streptococcal Pharyngitis",
        "syndrome_name_bn": "স্ট্রেপ্টোকক্কাল ফ্যারিঞ্জাইটিস (গলা ব্যথা)",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["PHENOXYMETHYLPENICILLIN", "AMOXICILLIN", "CEPHALEXIN"],
        "second_line_drug_codes": ["AZITHROMYCIN"],
        "default_duration_days": 10,
        "guidance_en": "Narrow-spectrum Phenoxymethylpenicillin or Amoxicillin for 10 days to prevent rheumatic fever.",
        "guidance_bn": "রিউম্যাটিক জ্বর প্রতিরোধে ১০ দিন ফেনক্সিমিথাইলপেনিসিলিন বা অ্যামোক্সিসিলিন দিন।",
    },
    {
        "syndrome_code": "UNCOMPLICATED_UTI",
        "syndrome_name_en": "Uncomplicated Urinary Tract Infection",
        "syndrome_name_bn": "জটিলতাবিহীন মূত্রনালির সংক্রমণ",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["NITROFURANTOIN", "COTRIMOXAZOLE", "CEPHALEXIN"],
        "second_line_drug_codes": ["CIPROFLOXACIN", "CEFIXIME"],
        "default_duration_days": 5,
        "guidance_en": "Nitrofurantoin or Cotrimoxazole (check pregnancy & renal eGFR) are Access first-line choices; avoid fluoroquinolones.",
        "guidance_bn": "নাইট্রোফুরানটোইন বা কোট্রাইমোক্সাজল প্রথম পছন্দ (গর্ভাবস্থা ও কিডনি ফাংশন যাচাই করুন)।",
    },
    {
        "syndrome_code": "PYELONEPHRITIS",
        "syndrome_name_en": "Acute Pyelonephritis",
        "syndrome_name_bn": "তীব্র পাইলোনেফ্রাইটিস (কিডনির সংক্রমণ)",
        "severity": "MODERATE",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["GENTAMICIN", "AMPICILLIN"],
        "second_line_drug_codes": ["CIPROFLOXACIN", "CEFTRIAXONE", "LEVOFLOXACIN", "PIPERACILLIN_TAZOBACTAM"],
        "default_duration_days": 10,
        "guidance_en": "Check eGFR before Gentamicin or Fluoroquinolones; escalate to Ceftriaxone when Access options are contraindicated.",
        "guidance_bn": "জেন্টামাইসিন বা ফ্লুরোকুইনোলোন দেওয়ার আগে ইজিএফআর পরীক্ষা করুন।",
    },
    {
        "syndrome_code": "CELLULITIS",
        "syndrome_name_en": "Acute Bacterial Cellulitis",
        "syndrome_name_bn": "তীব্র ব্যাকটেরিয়াল সেলুলাইটিস (ত্বকের সংক্রমণ)",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["CLOXACILLIN", "CEPHALEXIN", "COTRIMOXAZOLE"],
        "second_line_drug_codes": ["VANCOMYCIN", "LINEZOLID"],
        "default_duration_days": 7,
        "guidance_en": "Target Gram-positive skin flora with Access Cloxacillin or Cephalexin.",
        "guidance_bn": "ত্বকের সংক্রমণে অ্যাক্সেস ক্লোক্সাসিলিন বা সেফালেক্সিন ব্যবহার করুন।",
    },
    {
        "syndrome_code": "ACUTE_BACTERIAL_SINUSITIS",
        "syndrome_name_en": "Acute Bacterial Rhinosinusitis",
        "syndrome_name_bn": "তীব্র ব্যাকটেরিয়াল সাইনোসাইটিস",
        "severity": "MILD",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["AMOXICILLIN", "DOXYCYCLINE"],
        "second_line_drug_codes": ["CEFIXIME", "LEVOFLOXACIN"],
        "default_duration_days": 5,
        "guidance_en": "Reserve antibiotics for symptoms >10 days or severe worsening; Amoxicillin is Access first-line.",
        "guidance_bn": "১০ দিনের বেশি স্থায়ী বা তীব্র ব্যাকটেরিয়াল সাইনোসাইটিসে অ্যামোক্সিসিলিন ব্যবহার করুন।",
    },
    {
        "syndrome_code": "CHOLERA_WATERY_DIARRHEA",
        "syndrome_name_en": "Severe Acute Watery Diarrhea (Cholera Suspected)",
        "syndrome_name_bn": "তীব্র পানির মতো ডায়রিয়া (কলেরা সন্দেহ)",
        "severity": "MODERATE",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["DOXYCYCLINE", "COTRIMOXAZOLE"],
        "second_line_drug_codes": ["AZITHROMYCIN", "CIPROFLOXACIN"],
        "default_duration_days": 3,
        "guidance_en": "Prioritize ORS/IV rehydration; use Doxycycline (age >=8, non-pregnant) or Azithromycin in pregnancy/children.",
        "guidance_bn": "ওআরএস/শিরায় স্যালাইন অগ্রাধিকার দিন; ডক্সিসাইক্লিন (গর্ভাবস্থায় নয়) বা অ্যাজিথ্রোমাইসিন ব্যবহার করুন।",
    },
    {
        "syndrome_code": "SHIGELLOSIS_DYSENTERY",
        "syndrome_name_en": "Invasive Bacterial Dysentery (Shigellosis)",
        "syndrome_name_bn": "রক্ত আমাশয় (শিগেলোসিস)",
        "severity": "MODERATE",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["COTRIMOXAZOLE"],
        "second_line_drug_codes": ["CIPROFLOXACIN", "AZITHROMYCIN", "CEFTRIAXONE"],
        "default_duration_days": 3,
        "guidance_en": "Use Access Cotrimoxazole if susceptible and non-pregnant; Watch Azithromycin/Ciprofloxacin as second-line.",
        "guidance_bn": "সংবেদনশীল হলে কোট্রাইমোক্সাজল বা দ্বিতীয় সারিতে অ্যাজিথ্রোমাইসিন/সিপ্রোফ্লক্সাসিন দিন।",
    },
    {
        "syndrome_code": "ENTERIC_FEVER_TYPHOID",
        "syndrome_name_en": "Enteric Fever (Suspected Typhoid)",
        "syndrome_name_bn": "এন্টেরিক ফিভার (টাইফয়েড জ্বর)",
        "severity": "MODERATE",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["COTRIMOXAZOLE", "AMOXICILLIN"],
        "second_line_drug_codes": ["AZITHROMYCIN", "CEFIXIME", "CEFTRIAXONE", "CIPROFLOXACIN"],
        "default_duration_days": 10,
        "guidance_en": "Oral Azithromycin or Cefixime where fluoroquinolone resistance is prevalent; verify blood culture when available.",
        "guidance_bn": "টাইফয়েড সন্দেহে স্থানীয় সংবেদনশীলতা অনুযায়ী চিকিৎসা ও রক্ত পরীক্ষার পরামর্শ দিন।",
    },
    {
        "syndrome_code": "INTRA_ABDOMINAL_SEPSIS",
        "syndrome_name_en": "Severe Intra-Abdominal Infection / Sepsis",
        "syndrome_name_bn": "গুরুতর পেটের সংক্রমণ / সেপসিস",
        "severity": "SEVERE",
        "viral_no_antibiotic_if_mild": False,
        "first_line_drug_codes": ["AMPICILLIN", "GENTAMICIN", "METRONIDAZOLE"],
        "second_line_drug_codes": ["CEFTRIAXONE", "PIPERACILLIN_TAZOBACTAM", "MEROPENEM", "VANCOMYCIN", "COLISTIN"],
        "default_duration_days": 7,
        "guidance_en": "Stabilize hemodynamically and initiate broad coverage; escalate Watch/Reserve only with pharmacist/specialist authorization.",
        "guidance_bn": "রোগীকে দ্রুত স্থিতিশীল করুন এবং বিশেষজ্ঞ/ফার্মাসিস্টের অনুমোদনে ব্রড-স্পেকট্রাম চিকিৎসা দিন।",
    },
]

ANTIBIOTICS_DATA: list[dict[str, Any]] = [
    # 10 ACCESS (cost=1)
    {
        "drug_code": "AMOXICILLIN",
        "generic_name": "Amoxicillin",
        "generic_name_bn": "অ্যামোক্সিসিলিন",
        "drug_class": "PENICILLIN",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "500 mg PO every 8 hours for 5-7 days (pediatric 40-90 mg/kg/day divided).",
        "dose_regimen_bn": "৫০০ মিগ্রা মুখে প্রতি ৮ ঘণ্টা পরপর ৫-৭ দিন।",
    },
    {
        "drug_code": "AMPICILLIN",
        "generic_name": "Ampicillin",
        "generic_name_bn": "অ্যাম্পিসিলিন",
        "drug_class": "PENICILLIN",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "500 mg PO/IV every 6 hours for 5-7 days.",
        "dose_regimen_bn": "৫০০ মিগ্রা প্রতি ৬ ঘণ্টা পরপর ৫-৭ দিন।",
    },
    {
        "drug_code": "COTRIMOXAZOLE",
        "generic_name": "Co-trimoxazole (Sulfamethoxazole/Trimethoprim)",
        "generic_name_bn": "কোট্রাইমোক্সাজল",
        "drug_class": "SULFONAMIDE",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": True,
        "renal_contraindicated_egfr_lt": Decimal("15.00"),
        "min_age_years": 0,
        "dose_regimen_en": "800/160 mg PO every 12 hours for 3-5 days.",
        "dose_regimen_bn": "৮০০/১৬০ মিগ্রা মুখে প্রতি ১২ ঘণ্টা পরপর ৩-৫ দিন।",
    },
    {
        "drug_code": "DOXYCYCLINE",
        "generic_name": "Doxycycline",
        "generic_name_bn": "ডক্সিসাইক্লিন",
        "drug_class": "TETRACYCLINE",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": True,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 8,
        "dose_regimen_en": "100 mg PO every 12 hours for 5-7 days (300 mg single dose for cholera).",
        "dose_regimen_bn": "১০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টা পরপর ৫-৭ দিন।",
    },
    {
        "drug_code": "NITROFURANTOIN",
        "generic_name": "Nitrofurantoin",
        "generic_name_bn": "নাইট্রোফুরানটোইন",
        "drug_class": "NITROFURAN",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": Decimal("30.00"),
        "min_age_years": 0,
        "dose_regimen_en": "100 mg PO every 12 hours with food for 5 days.",
        "dose_regimen_bn": "১০০ মিগ্রা খাবারের সাথে প্রতি ১২ ঘণ্টা পরপর ৫ দিন।",
    },
    {
        "drug_code": "PHENOXYMETHYLPENICILLIN",
        "generic_name": "Phenoxymethylpenicillin (Penicillin V)",
        "generic_name_bn": "ফেনক্সিমিথাইলপেনিসিলিন",
        "drug_class": "PENICILLIN",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "500 mg PO every 12 hours for 10 days.",
        "dose_regimen_bn": "৫০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টা পরপর ১০ দিন।",
    },
    {
        "drug_code": "CLOXACILLIN",
        "generic_name": "Cloxacillin",
        "generic_name_bn": "ক্লোক্সাসিলিন",
        "drug_class": "PENICILLIN",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "500 mg PO every 6 hours 1 hour before meals for 7 days.",
        "dose_regimen_bn": "৫০০ মিগ্রা খাবারের ১ ঘণ্টা আগে প্রতি ৬ ঘণ্টা পরপর ৭ দিন।",
    },
    {
        "drug_code": "CEPHALEXIN",
        "generic_name": "Cephalexin",
        "generic_name_bn": "সেফালেক্সিন",
        "drug_class": "CEPHALOSPORIN_1",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "500 mg PO every 8-12 hours for 5-7 days.",
        "dose_regimen_bn": "৫০০ মিগ্রা মুখে প্রতি ৮-১২ ঘণ্টা পরপর ৫-৭ দিন।",
    },
    {
        "drug_code": "METRONIDAZOLE",
        "generic_name": "Metronidazole",
        "generic_name_bn": "মেট্রোনিডাজল",
        "drug_class": "NITROIMIDAZOLE",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "400-500 mg PO/IV every 8 hours for 5-7 days.",
        "dose_regimen_bn": "৪০০-৫০০ মিগ্রা প্রতি ৮ ঘণ্টা পরপর ৫-৭ দিন।",
    },
    {
        "drug_code": "GENTAMICIN",
        "generic_name": "Gentamicin",
        "generic_name_bn": "জেন্টামাইসিন",
        "drug_class": "AMINOGLYCOSIDE",
        "aware_category": "ACCESS",
        "aware_tier_cost": 1,
        "pregnancy_contraindicated": True,
        "renal_contraindicated_egfr_lt": Decimal("30.00"),
        "min_age_years": 0,
        "dose_regimen_en": "5 mg/kg IV/IM once daily with renal monitoring.",
        "dose_regimen_bn": "৫ মিগ্রা/কেজি প্রতিদিন একবার শিরায় বা মাংসে (কিডনি পর্যবেক্ষণসহ)।",
    },
    # 8 WATCH (cost=15)
    {
        "drug_code": "AZITHROMYCIN",
        "generic_name": "Azithromycin",
        "generic_name_bn": "অ্যাজিথ্রোমাইসিন",
        "drug_class": "MACROLIDE",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "500 mg PO once daily for 3-5 days.",
        "dose_regimen_bn": "৫০০ মিগ্রা মুখে প্রতিদিন একবার ৩-৫ দিন।",
    },
    {
        "drug_code": "CIPROFLOXACIN",
        "generic_name": "Ciprofloxacin",
        "generic_name_bn": "সিপ্রোফ্লক্সাসিন",
        "drug_class": "FLUOROQUINOLONE",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": True,
        "renal_contraindicated_egfr_lt": Decimal("30.00"),
        "min_age_years": 18,
        "dose_regimen_en": "500 mg PO every 12 hours for 5-7 days.",
        "dose_regimen_bn": "৫০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টা পরপর ৫-৭ দিন।",
    },
    {
        "drug_code": "CEFIXIME",
        "generic_name": "Cefixime",
        "generic_name_bn": "সেফিক্সিম",
        "drug_class": "CEPHALOSPORIN_3",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "200 mg PO every 12 hours (or 400 mg once daily) for 5-10 days.",
        "dose_regimen_bn": "২০০ মিগ্রা মুখে প্রতি ১২ ঘণ্টা পরপর ৫-১০ দিন।",
    },
    {
        "drug_code": "CEFTRIAXONE",
        "generic_name": "Ceftriaxone",
        "generic_name_bn": "সেফট্রিয়াক্সোন",
        "drug_class": "CEPHALOSPORIN_3",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 0,
        "dose_regimen_en": "1-2 g IV/IM once daily for 5-7 days.",
        "dose_regimen_bn": "১-২ গ্রাম প্রতিদিন একবার শিরায় বা মাংসে ৫-৭ দিন।",
    },
    {
        "drug_code": "LEVOFLOXACIN",
        "generic_name": "Levofloxacin",
        "generic_name_bn": "লেভোফ্লক্সাসিন",
        "drug_class": "FLUOROQUINOLONE",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": True,
        "renal_contraindicated_egfr_lt": Decimal("30.00"),
        "min_age_years": 18,
        "dose_regimen_en": "500-750 mg PO once daily for 5-7 days.",
        "dose_regimen_bn": "৫০০-৭৫০ মিগ্রা মুখে প্রতিদিন একবার ৫-৭ দিন।",
    },
    {
        "drug_code": "VANCOMYCIN",
        "generic_name": "Vancomycin",
        "generic_name_bn": "ভ্যানকোমাইসিন",
        "drug_class": "GLYCOPEPTIDE",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": Decimal("30.00"),
        "min_age_years": 0,
        "dose_regimen_en": "15-20 mg/kg IV every 8-12 hours with trough & renal monitoring.",
        "dose_regimen_bn": "১৫-২০ মিগ্রা/কেজি প্রতি ৮-১২ ঘণ্টা পরপর শিরায়।",
    },
    {
        "drug_code": "PIPERACILLIN_TAZOBACTAM",
        "generic_name": "Piperacillin/Tazobactam",
        "generic_name_bn": "পাইপেরাসিলিন/ট্যাজোব্যাকটাম",
        "drug_class": "PENICILLIN",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": Decimal("20.00"),
        "min_age_years": 0,
        "dose_regimen_en": "4.5 g IV every 6-8 hours for severe hospital infections.",
        "dose_regimen_bn": "৪.৫ গ্রাম শিরায় প্রতি ৬-৮ ঘণ্টা পরপর।",
    },
    {
        "drug_code": "MEROPENEM",
        "generic_name": "Meropenem",
        "generic_name_bn": "মেরোপেনেম",
        "drug_class": "CARBAPENEM",
        "aware_category": "WATCH",
        "aware_tier_cost": 15,
        "pregnancy_contraindicated": False,
        "renal_contraindicated_egfr_lt": Decimal("25.00"),
        "min_age_years": 0,
        "dose_regimen_en": "1 g IV every 8 hours for severe multidrug-resistant sepsis.",
        "dose_regimen_bn": "১ গ্রাম শিরায় প্রতি ৮ ঘণ্টা পরপর।",
    },
    # 2 RESERVE (cost=120)
    {
        "drug_code": "LINEZOLID",
        "generic_name": "Linezolid",
        "generic_name_bn": "লাইনেজোলিড",
        "drug_class": "OXAZOLIDINONE",
        "aware_category": "RESERVE",
        "aware_tier_cost": 120,
        "pregnancy_contraindicated": True,
        "renal_contraindicated_egfr_lt": None,
        "min_age_years": 18,
        "dose_regimen_en": "600 mg PO/IV every 12 hours (Reserve tier; specialist authorization required).",
        "dose_regimen_bn": "৬০০ মিগ্রা প্রতি ১২ ঘণ্টা পরপর (রিজার্ভ গ্রুপ; বিশেষজ্ঞ অনুমোদন আবশ্যক)।",
    },
    {
        "drug_code": "COLISTIN",
        "generic_name": "Colistin (Polymyxin E)",
        "generic_name_bn": "কলিস্টিন",
        "drug_class": "POLYMYXIN",
        "aware_category": "RESERVE",
        "aware_tier_cost": 120,
        "pregnancy_contraindicated": True,
        "renal_contraindicated_egfr_lt": Decimal("30.00"),
        "min_age_years": 18,
        "dose_regimen_en": "Loading dose 9 MIU IV followed by 4.5 MIU every 12 hours (Reserve last-resort).",
        "dose_regimen_bn": "সর্বশেষ রিজার্ভ অ্যান্টিবায়োটিক; বিশেষজ্ঞ ও কিডনি পর্যবেক্ষণ আবশ্যক।",
    },
]

# Keep stewardship tiers tied to WHO's versioned classification, rather than
# trusting copied category labels embedded in individual seed rows.
_WHO_AWARE_COST = {"ACCESS": 1, "WATCH": 15, "RESERVE": 120}
_WHO_AWARE_ALIASES = {
    "co-trimoxazole": "sulfamethoxazole/trimethoprim",
    "cephalexin": "cefalexin",
    "vancomycin": "vancomycin_iv",
    "metronidazole": "metronidazole_oral",
    "colistin": "colistin_iv",
}


def apply_who_aware_2025(data: list[dict[str, Any]]) -> None:
    source = Path(__file__).resolve().parents[2] / "data" / "reference" / "who_aware_2025.csv"
    with source.open(encoding="utf-8", newline="") as csv_file:
        categories = {
            row["antibiotic"].strip().casefold(): row["aware_category"].strip().upper()
            for row in csv.DictReader(csv_file)
        }

    for item in data:
        name = item["generic_name"].casefold().split(" (", maxsplit=1)[0].strip()
        source_name = _WHO_AWARE_ALIASES.get(name, name)
        category = categories.get(source_name)
        if category not in _WHO_AWARE_COST:
            raise ValueError(f"No WHO AWaRe 2025 category found for {item['drug_code']}: {name}")
        item["aware_category"] = category
        item["aware_tier_cost"] = _WHO_AWARE_COST[category]


apply_who_aware_2025(ANTIBIOTICS_DATA)

PATIENTS_DATA: list[dict[str, Any]] = [
    {
        "clinic_code": "ASHULIA-01",
        "mrn": "ASH-MRN-001",
        "full_name": "Rahima Khatun",
        "age_years": 26,
        "weight_kg": Decimal("54.00"),
        "sex": "F",
        "is_pregnant": True,
        "egfr": Decimal("95.00"),
        "allergies": [],
    },
    {
        "clinic_code": "ASHULIA-01",
        "mrn": "ASH-MRN-002",
        "full_name": "Kamal Uddin",
        "age_years": 42,
        "weight_kg": Decimal("66.00"),
        "sex": "M",
        "is_pregnant": False,
        "egfr": Decimal("88.00"),
        "allergies": [],
    },
    {
        "clinic_code": "ASHULIA-01",
        "mrn": "ASH-MRN-003",
        "full_name": "Nusrat Jahan",
        "age_years": 5,
        "weight_kg": Decimal("18.50"),
        "sex": "F",
        "is_pregnant": False,
        "egfr": Decimal("105.00"),
        "allergies": [],
    },
    {
        "clinic_code": "ASHULIA-01",
        "mrn": "ASH-MRN-004",
        "full_name": "Abul Kashem",
        "age_years": 64,
        "weight_kg": Decimal("62.00"),
        "sex": "M",
        "is_pregnant": False,
        "egfr": Decimal("22.00"),
        "allergies": ["PENICILLIN"],
    },
    {
        "clinic_code": "DHAMRAI-01",
        "mrn": "DHM-MRN-001",
        "full_name": "Salma Begum",
        "age_years": 31,
        "weight_kg": Decimal("58.00"),
        "sex": "F",
        "is_pregnant": False,
        "egfr": Decimal("92.00"),
        "allergies": [],
    },
    {
        "clinic_code": "DHAMRAI-01",
        "mrn": "DHM-MRN-002",
        "full_name": "Rafiqul Islam",
        "age_years": 49,
        "weight_kg": Decimal("70.00"),
        "sex": "M",
        "is_pregnant": False,
        "egfr": Decimal("80.00"),
        "allergies": [],
    },
]


def _build_batches_data(today: date) -> list[dict[str, Any]]:
    return [
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "AMOXICILLIN",
            "lot_number": "ASH-AMX-EXP07",
            "qty_initial": 200,
            "qty_remaining": 60,
            "expiry_date": today + timedelta(days=7),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "AMOXICILLIN",
            "lot_number": "ASH-AMX-365",
            "qty_initial": 300,
            "qty_remaining": 240,
            "expiry_date": today + timedelta(days=365),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "COTRIMOXAZOLE",
            "lot_number": "ASH-COT-01",
            "qty_initial": 180,
            "qty_remaining": 120,
            "expiry_date": today + timedelta(days=14),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "COTRIMOXAZOLE",
            "lot_number": "ASH-COT-02",
            "qty_initial": 200,
            "qty_remaining": 200,
            "expiry_date": today + timedelta(days=240),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "NITROFURANTOIN",
            "lot_number": "ASH-NIT-01",
            "qty_initial": 200,
            "qty_remaining": 140,
            "expiry_date": today + timedelta(days=90),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "CEPHALEXIN",
            "lot_number": "ASH-CEP-01",
            "qty_initial": 180,
            "qty_remaining": 130,
            "expiry_date": today + timedelta(days=120),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "DOXYCYCLINE",
            "lot_number": "ASH-DOX-01",
            "qty_initial": 160,
            "qty_remaining": 120,
            "expiry_date": today + timedelta(days=150),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "AMPICILLIN",
            "lot_number": "ASH-AMP-01",
            "qty_initial": 150,
            "qty_remaining": 110,
            "expiry_date": today + timedelta(days=160),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "PHENOXYMETHYLPENICILLIN",
            "lot_number": "ASH-PHN-01",
            "qty_initial": 140,
            "qty_remaining": 110,
            "expiry_date": today + timedelta(days=200),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "CLOXACILLIN",
            "lot_number": "ASH-CLX-01",
            "qty_initial": 150,
            "qty_remaining": 120,
            "expiry_date": today + timedelta(days=210),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "METRONIDAZOLE",
            "lot_number": "ASH-MET-01",
            "qty_initial": 200,
            "qty_remaining": 160,
            "expiry_date": today + timedelta(days=180),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "GENTAMICIN",
            "lot_number": "ASH-GEN-01",
            "qty_initial": 80,
            "qty_remaining": 60,
            "expiry_date": today + timedelta(days=190),
            "unit": "vials",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "AZITHROMYCIN",
            "lot_number": "ASH-AZM-01",
            "qty_initial": 150,
            "qty_remaining": 90,
            "expiry_date": today + timedelta(days=110),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "CIPROFLOXACIN",
            "lot_number": "ASH-CIP-01",
            "qty_initial": 150,
            "qty_remaining": 100,
            "expiry_date": today + timedelta(days=130),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "CEFIXIME",
            "lot_number": "ASH-CFX-01",
            "qty_initial": 140,
            "qty_remaining": 100,
            "expiry_date": today + timedelta(days=140),
            "unit": "capsules",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "CEFTRIAXONE",
            "lot_number": "ASH-CTR-01",
            "qty_initial": 80,
            "qty_remaining": 60,
            "expiry_date": today + timedelta(days=220),
            "unit": "vials",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "LEVOFLOXACIN",
            "lot_number": "ASH-LEV-01",
            "qty_initial": 100,
            "qty_remaining": 80,
            "expiry_date": today + timedelta(days=250),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "VANCOMYCIN",
            "lot_number": "ASH-VAN-01",
            "qty_initial": 40,
            "qty_remaining": 30,
            "expiry_date": today + timedelta(days=260),
            "unit": "vials",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "PIPERACILLIN_TAZOBACTAM",
            "lot_number": "ASH-PIP-01",
            "qty_initial": 40,
            "qty_remaining": 30,
            "expiry_date": today + timedelta(days=240),
            "unit": "vials",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "MEROPENEM",
            "lot_number": "ASH-MER-01",
            "qty_initial": 30,
            "qty_remaining": 25,
            "expiry_date": today + timedelta(days=270),
            "unit": "vials",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "LINEZOLID",
            "lot_number": "ASH-LIN-01",
            "qty_initial": 40,
            "qty_remaining": 26,
            "expiry_date": today + timedelta(days=280),
            "unit": "tablets",
        },
        {
            "clinic_code": "ASHULIA-01",
            "drug_code": "COLISTIN",
            "lot_number": "ASH-COL-00",
            "qty_initial": 20,
            "qty_remaining": 0,
            "expiry_date": today + timedelta(days=180),
            "unit": "vials",
        },
        {
            "clinic_code": "DHAMRAI-01",
            "drug_code": "AMOXICILLIN",
            "lot_number": "DHM-AMX-01",
            "qty_initial": 200,
            "qty_remaining": 160,
            "expiry_date": today + timedelta(days=180),
            "unit": "capsules",
        },
        {
            "clinic_code": "DHAMRAI-01",
            "drug_code": "COTRIMOXAZOLE",
            "lot_number": "DHM-COT-01",
            "qty_initial": 160,
            "qty_remaining": 140,
            "expiry_date": today + timedelta(days=160),
            "unit": "tablets",
        },
        {
            "clinic_code": "DHAMRAI-01",
            "drug_code": "NITROFURANTOIN",
            "lot_number": "DHM-NIT-01",
            "qty_initial": 150,
            "qty_remaining": 120,
            "expiry_date": today + timedelta(days=150),
            "unit": "capsules",
        },
        {
            "clinic_code": "DHAMRAI-01",
            "drug_code": "AZITHROMYCIN",
            "lot_number": "DHM-AZM-01",
            "qty_initial": 120,
            "qty_remaining": 100,
            "expiry_date": today + timedelta(days=140),
            "unit": "tablets",
        },
        {
            "clinic_code": "DHAMRAI-01",
            "drug_code": "CIPROFLOXACIN",
            "lot_number": "DHM-CIP-01",
            "qty_initial": 120,
            "qty_remaining": 110,
            "expiry_date": today + timedelta(days=170),
            "unit": "tablets",
        },
    ]


ASHULIA_HISTORICAL_DISPENSES: list[tuple[str, str, str, str, str, int, int, int]] = [
    ("ASH-HIST-01", "ASH-MRN-001", "CAP_MILD", "AMOXICILLIN", "ASH-AMX-EXP07", 15, 5, 14),
    ("ASH-HIST-02", "ASH-MRN-002", "CAP_MILD", "AMOXICILLIN", "ASH-AMX-EXP07", 15, 5, 13),
    ("ASH-HIST-03", "ASH-MRN-003", "ACUTE_OTITIS_MEDIA", "AMOXICILLIN", "ASH-AMX-EXP07", 15, 5, 12),
    ("ASH-HIST-04", "ASH-MRN-001", "ACUTE_BACTERIAL_SINUSITIS", "AMOXICILLIN", "ASH-AMX-EXP07", 15, 5, 11),
    ("ASH-HIST-05", "ASH-MRN-002", "UNCOMPLICATED_UTI", "COTRIMOXAZOLE", "ASH-COT-01", 10, 5, 11),
    ("ASH-HIST-06", "ASH-MRN-002", "SHIGELLOSIS_DYSENTERY", "COTRIMOXAZOLE", "ASH-COT-01", 10, 3, 10),
    ("ASH-HIST-07", "ASH-MRN-003", "ACUTE_OTITIS_MEDIA", "COTRIMOXAZOLE", "ASH-COT-01", 10, 5, 10),
    ("ASH-HIST-08", "ASH-MRN-001", "UNCOMPLICATED_UTI", "NITROFURANTOIN", "ASH-NIT-01", 10, 5, 9),
    ("ASH-HIST-09", "ASH-MRN-002", "UNCOMPLICATED_UTI", "NITROFURANTOIN", "ASH-NIT-01", 10, 5, 8),
    ("ASH-HIST-10", "ASH-MRN-001", "UNCOMPLICATED_UTI", "NITROFURANTOIN", "ASH-NIT-01", 10, 5, 7),
    ("ASH-HIST-11", "ASH-MRN-004", "CELLULITIS", "CEPHALEXIN", "ASH-CEP-01", 15, 7, 7),
    ("ASH-HIST-12", "ASH-MRN-002", "CELLULITIS", "CEPHALEXIN", "ASH-CEP-01", 15, 7, 6),
    ("ASH-HIST-13", "ASH-MRN-002", "CHOLERA_WATERY_DIARRHEA", "DOXYCYCLINE", "ASH-DOX-01", 14, 7, 6),
    ("ASH-HIST-14", "ASH-MRN-002", "ENTERIC_FEVER_TYPHOID", "AZITHROMYCIN", "ASH-AZM-01", 6, 5, 5),
    ("ASH-HIST-15", "ASH-MRN-001", "CAP_MILD", "AZITHROMYCIN", "ASH-AZM-01", 6, 5, 5),
    ("ASH-HIST-16", "ASH-MRN-004", "STREP_PHARYNGITIS", "AZITHROMYCIN", "ASH-AZM-01", 6, 5, 4),
    ("ASH-HIST-17", "ASH-MRN-003", "ENTERIC_FEVER_TYPHOID", "AZITHROMYCIN", "ASH-AZM-01", 6, 5, 4),
    ("ASH-HIST-18", "ASH-MRN-002", "PYELONEPHRITIS", "CIPROFLOXACIN", "ASH-CIP-01", 10, 5, 3),
    ("ASH-HIST-19", "ASH-MRN-002", "SHIGELLOSIS_DYSENTERY", "CIPROFLOXACIN", "ASH-CIP-01", 10, 5, 3),
    ("ASH-HIST-20", "ASH-MRN-002", "UNCOMPLICATED_UTI", "CIPROFLOXACIN", "ASH-CIP-01", 10, 5, 2),
    ("ASH-HIST-21", "ASH-MRN-002", "ENTERIC_FEVER_TYPHOID", "CIPROFLOXACIN", "ASH-CIP-01", 10, 5, 2),
    ("ASH-HIST-22", "ASH-MRN-001", "ENTERIC_FEVER_TYPHOID", "CEFIXIME", "ASH-CFX-01", 10, 5, 2),
    ("ASH-HIST-23", "ASH-MRN-003", "ACUTE_OTITIS_MEDIA", "CEFIXIME", "ASH-CFX-01", 10, 5, 1),
    ("ASH-HIST-24", "ASH-MRN-002", "ACUTE_BACTERIAL_SINUSITIS", "CEFIXIME", "ASH-CFX-01", 10, 5, 1),
    ("ASH-HIST-25", "ASH-MRN-004", "CELLULITIS", "LINEZOLID", "ASH-LIN-01", 14, 7, 1),
]

DHAMRAI_HISTORICAL_DISPENSES: list[tuple[str, str, str, str, str, int, int, int]] = [
    ("DHM-HIST-01", "DHM-MRN-001", "CAP_MILD", "AMOXICILLIN", "DHM-AMX-01", 15, 5, 6),
    ("DHM-HIST-02", "DHM-MRN-002", "ACUTE_BACTERIAL_SINUSITIS", "AMOXICILLIN", "DHM-AMX-01", 15, 5, 5),
    ("DHM-HIST-03", "DHM-MRN-002", "SHIGELLOSIS_DYSENTERY", "COTRIMOXAZOLE", "DHM-COT-01", 10, 5, 4),
    ("DHM-HIST-04", "DHM-MRN-001", "UNCOMPLICATED_UTI", "NITROFURANTOIN", "DHM-NIT-01", 10, 5, 3),
    ("DHM-HIST-05", "DHM-MRN-002", "ENTERIC_FEVER_TYPHOID", "AZITHROMYCIN", "DHM-AZM-01", 6, 5, 2),
]


async def seed_database(session: AsyncSession) -> dict[str, int]:
    """Idempotently populate reference data, clinics, users, patients, batches, and baseline dispenses."""
    if settings.ENVIRONMENT.strip().lower() in {"prod", "production"}:
        raise RuntimeError(
            "The bundled seed records include synthetic patients, accounts, inventory, "
            "dispenses, and hospital capacity. Seeding is disabled in production; "
            "load verified, authorized data through the production onboarding process."
        )

    now = datetime.now(timezone.utc)
    today = now.date()

    clinics_by_code: dict[str, Clinic] = {}
    for item in [*CLINICS_DATA, {**COMMAND_CLINIC, "target_access_pct": Decimal("60.00")}]:
        clinic = (
            await session.execute(select(Clinic).where(Clinic.code == item["code"]))
        ).scalar_one_or_none()
        if clinic is None:
            clinic = Clinic(
                id=seed_uuid("clinic", item["code"]),
                code=item["code"],
                name=item["name"],
                upazila=item["upazila"],
                district=item["district"],
                target_access_pct=item["target_access_pct"],
            )
            session.add(clinic)
        clinics_by_code[item["code"]] = clinic
    await session.flush()

    facilities_by_code = await seed_facilities(session, today)

    shared_pin_hash: str | None = None
    users_by_email: dict[str, User] = {}
    for item in [*USERS_DATA, *CRITICAL_CARE_USERS]:
        email = item["email"].lower()
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            if shared_pin_hash is None:
                shared_pin_hash = hash_secret(item["pin"])
            user = User(
                id=seed_uuid("user", email),
                clinic_id=clinics_by_code[item["clinic_code"]].id,
                facility_id=(
                    facilities_by_code[item["facility_code"]].id if item.get("facility_code") else None
                ),
                email=email,
                full_name=item["full_name"],
                role=item["role"],
                password_hash=hash_secret(item["password"]),
                pin_hash=shared_pin_hash,
                is_active=True,
            )
            session.add(user)
        users_by_email[email] = user
    await session.flush()

    guidelines_by_code: dict[str, AwareGuideline] = {}
    for item in GUIDELINES_DATA:
        guideline = (
            await session.execute(
                select(AwareGuideline).where(AwareGuideline.syndrome_code == item["syndrome_code"])
            )
        ).scalar_one_or_none()
        if guideline is None:
            guideline = AwareGuideline(
                id=seed_uuid("guideline", item["syndrome_code"]),
                **item,
            )
            session.add(guideline)
        guidelines_by_code[item["syndrome_code"]] = guideline
    await session.flush()

    antibiotics_by_code: dict[str, AntibioticCatalog] = {}
    for item in ANTIBIOTICS_DATA:
        abx = (
            await session.execute(
                select(AntibioticCatalog).where(AntibioticCatalog.drug_code == item["drug_code"])
            )
        ).scalar_one_or_none()
        if abx is None:
            abx = AntibioticCatalog(
                id=seed_uuid("antibiotic", item["drug_code"]),
                **item,
            )
            session.add(abx)
        antibiotics_by_code[item["drug_code"]] = abx
    await session.flush()

    batches_by_key: dict[tuple[str, str], InventoryBatch] = {}
    for item in _build_batches_data(today):
        clinic = clinics_by_code[item["clinic_code"]]
        abx = antibiotics_by_code[item["drug_code"]]
        batch = (
            await session.execute(
                select(InventoryBatch).where(
                    InventoryBatch.clinic_id == clinic.id,
                    InventoryBatch.antibiotic_id == abx.id,
                    InventoryBatch.lot_number == item["lot_number"],
                )
            )
        ).scalar_one_or_none()
        if batch is None:
            batch = InventoryBatch(
                id=seed_uuid("batch", f"{item['clinic_code']}:{item['lot_number']}"),
                clinic_id=clinic.id,
                antibiotic_id=abx.id,
                lot_number=item["lot_number"],
                qty_initial=item["qty_initial"],
                qty_remaining=item["qty_remaining"],
                expiry_date=item["expiry_date"],
                unit=item["unit"],
                version=1,
            )
            session.add(batch)
        batches_by_key[(item["clinic_code"], item["lot_number"])] = batch
    await session.flush()

    patients_by_mrn: dict[tuple[str, str], Patient] = {}
    for item in PATIENTS_DATA:
        clinic = clinics_by_code[item["clinic_code"]]
        patient = (
            await session.execute(
                select(Patient).where(
                    Patient.clinic_id == clinic.id,
                    Patient.mrn == item["mrn"],
                )
            )
        ).scalar_one_or_none()
        if patient is None:
            patient = Patient(
                id=seed_uuid("patient", f"{item['clinic_code']}:{item['mrn']}"),
                clinic_id=clinic.id,
                mrn=item["mrn"],
                full_name=item["full_name"],
                age_years=item["age_years"],
                weight_kg=item["weight_kg"],
                sex=item["sex"],
                is_pregnant=item["is_pregnant"],
                egfr=item["egfr"],
                allergies=list(item["allergies"]),
                version=1,
            )
            session.add(patient)
        patients_by_mrn[(item["clinic_code"], item["mrn"])] = patient
    await session.flush()

    ashulia_dispenser = users_by_email["dispenser@awaregrid.org"]
    ashulia_pharmacist = users_by_email["pharmacist@awaregrid.org"]
    dhamrai_dispenser = users_by_email["dhamrai.dispenser@awaregrid.org"]

    async def _seed_dispenses(
        clinic_code: str,
        rows: list[tuple[str, str, str, str, str, int, int, int]],
        prescriber: User,
        approver: User | None,
    ) -> None:
        clinic = clinics_by_code[clinic_code]
        for key, mrn, syndrome_code, drug_code, lot_number, qty, days_supply, days_ago in rows:
            disp_id = seed_uuid("dispense", key)
            existing = (
                await session.execute(select(Dispense.id).where(Dispense.id == disp_id))
            ).scalar_one_or_none()
            if existing is not None:
                continue
            abx = antibiotics_by_code[drug_code]
            guideline = guidelines_by_code[syndrome_code]
            batch = batches_by_key[(clinic_code, lot_number)]
            patient = patients_by_mrn[(clinic_code, mrn)]
            dispensed_ts = now - timedelta(days=days_ago)
            session.add(
                Dispense(
                    id=disp_id,
                    clinic_id=clinic.id,
                    patient_id=patient.id,
                    guideline_id=guideline.id,
                    antibiotic_id=abx.id,
                    batch_id=batch.id,
                    prescriber_id=prescriber.id,
                    approver_id=approver.id if approver else None,
                    status="DISPENSED",
                    aware_category_snapshot=abx.aware_category,
                    qty_dispensed=qty,
                    days_supply=days_supply,
                    solver_status="OPTIMAL",
                    solver_verdict={"seeded": True, "drug_code": drug_code, "syndrome_code": syndrome_code},
                    decision_reason=f"Baseline historical dispense ({syndrome_code})",
                    version=1,
                    created_at=dispensed_ts,
                    dispensed_at=dispensed_ts,
                    updated_at=dispensed_ts,
                )
            )

    await _seed_dispenses("ASHULIA-01", ASHULIA_HISTORICAL_DISPENSES, ashulia_dispenser, ashulia_pharmacist)
    await _seed_dispenses("DHAMRAI-01", DHAMRAI_HISTORICAL_DISPENSES, dhamrai_dispenser, None)
    await session.flush()
    await session.commit()

    return {
        "clinics": int((await session.execute(select(func.count(Clinic.id)))).scalar_one()),
        "users": int((await session.execute(select(func.count(User.id)))).scalar_one()),
        "guidelines": int((await session.execute(select(func.count(AwareGuideline.id)))).scalar_one()),
        "antibiotics": int((await session.execute(select(func.count(AntibioticCatalog.id)))).scalar_one()),
        "batches": int((await session.execute(select(func.count(InventoryBatch.id)))).scalar_one()),
        "patients": int((await session.execute(select(func.count(Patient.id)))).scalar_one()),
        "dispenses": int((await session.execute(select(func.count(Dispense.id)))).scalar_one()),
    }


async def main() -> None:
    await init_db()
    async with AsyncSessionLocal() as session:
        counts = await seed_database(session)
    await engine.dispose()
    print("ShasthoGrid seed completed:", counts)


if __name__ == "__main__":
    asyncio.run(main())
