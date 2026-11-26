from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from groq import AsyncGroq, GroqError

from app.core.config import settings
from app.core.errors import AppError, ValidationAppError
from app.solver.aware_cpsat import SolverResult

logger = logging.getLogger(__name__)

GROQ_COUNSELING_MODEL = "openai/gpt-oss-120b"
GROQ_VOICE_MODEL = "whisper-large-v3-turbo"
GROQ_PROMPT_GUARD_MODEL = "llama-prompt-guard-2-86m"
GEMINI_COUNSELING_MODEL = "gemini-3.5-flash-lite"
DETERMINISTIC_MODEL_NAME = "deterministic-local-template"

KNOWN_SYNDROME_CODES: frozenset[str] = frozenset(
    {
        "ACUTE_BRONCHITIS",
        "COMMON_COLD",
        "VIRAL_URI",
        "CAP_MILD",
        "CAP_MODERATE",
        "ACUTE_OTITIS_MEDIA",
        "STREP_PHARYNGITIS",
        "UNCOMPLICATED_UTI",
        "PYELONEPHRITIS",
        "CELLULITIS",
        "ACUTE_BACTERIAL_SINUSITIS",
        "CHOLERA_WATERY_DIARRHEA",
        "SHIGELLOSIS_DYSENTERY",
        "ENTERIC_FEVER_TYPHOID",
        "INTRA_ABDOMINAL_SEPSIS",
    }
)

FORBIDDEN_PII_KEYS: frozenset[str] = frozenset(
    {
        "full_name",
        "name",
        "patient_name",
        "mrn",
        "phone",
        "mobile",
        "telephone",
        "email",
        "nid",
        "national_id",
        "dob",
        "date_of_birth",
        "address",
        "passport",
        "patient_id",
        "ssn",
    }
)

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_BD_PHONE_RE = re.compile(r"(?:\+?880\s*-?|0)1[3-9]\d{2}[\s-]?\d{6}\b")
_INTL_PHONE_RE = re.compile(
    r"(?!\d{4}-\d{2}-\d{2}\b)(?:\+\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s.-]\d{3,4}[\s.-]\d{4}\b)"
)
_LONG_NUMERIC_ID_RE = re.compile(r"(?<!\d)\d{10,17}(?!\d)")
_LABELED_ID_RE = re.compile(
    r"\b(?:NID|MRN|NATIONAL[\s_-]*ID|PASSPORT)\s*[:#-]?\s*[A-Z0-9-]{4,}\b",
    re.IGNORECASE,
)
_MRN_PREFIX_RE = re.compile(r"\bMRN-[A-Z0-9-]{2,}\b", re.IGNORECASE)
_DOB_RE = re.compile(r"\b(?:DOB|date\s+of\s+birth|birth\s*date)\b", re.IGNORECASE)
_NAMED_PATIENT_RE = re.compile(
    r"\b(?i:(?:for\s+)?(?:patient(?:\s+name)?\s*[:\-]?|mrs?\.?|ms\.?))\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*"
)

_PROMPT_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|system)\s+instructions?",
        re.IGNORECASE,
    ),
    re.compile(
        r"disregard\s+(?:all\s+|any\s+|previous|prior|above)\s+(?:instructions?|rules?)",
        re.IGNORECASE,
    ),
    re.compile(
        r"override\s+(?:all\s+|safety|clinical|system|previous)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:reveal|print|show|dump|bypass)\s+(?:your\s+)?(?:system\s+prompt|instructions?|guardrails?|rules?)",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:jailbreak|developer\s+mode|dan\s+mode|you\s+are\s+now)\b", re.IGNORECASE),
    re.compile(r"(?:<\|(?:system|im_start|endoftext)\|>|###\s*SYSTEM\b)", re.IGNORECASE),
)

_CATALOG_DRUG_ALIASES: dict[str, tuple[str, ...]] = {
    "AMOXICILLIN": ("amoxicillin", "amox", "augmentin", "co-amoxiclav", "অ্যামোক্সিসিলিন"),
    "AMPICILLIN": ("ampicillin", "অ্যাম্পিসিলিন"),
    "COTRIMOXAZOLE": (
        "cotrimoxazole",
        "co-trimoxazole",
        "sulfamethoxazole",
        "trimethoprim",
        "tmp-smx",
        "smx-tmp",
        "bactrim",
        "septra",
        "কোট্রাইমোক্সাজল",
    ),
    "DOXYCYCLINE": ("doxycycline", "doxy", "ডক্সিসাইক্লিন"),
    "NITROFURANTOIN": ("nitrofurantoin", "নাইট্রোফুরানটোইন"),
    "PHENOXYMETHYLPENICILLIN": (
        "phenoxymethylpenicillin",
        "penicillin v",
        "penicillin",
        "ফেনক্সিমিথাইলপেনিসিলিন",
    ),
    "CLOXACILLIN": ("cloxacillin", "ক্লোক্সাসিলিন"),
    "CEPHALEXIN": ("cephalexin", "cefalexin", "সেফালেক্সিন"),
    "METRONIDAZOLE": ("metronidazole", "flagyl", "মেট্রোনিডাজল"),
    "GENTAMICIN": ("gentamicin", "জেন্টামাইসিন"),
    "AZITHROMYCIN": ("azithromycin", "azithro", "অ্যাজিথ্রোমাইসিন"),
    "CIPROFLOXACIN": ("ciprofloxacin", "cipro", "সিপ্রোফ্লক্সাসিন"),
    "CEFIXIME": ("cefixime", "সেফিক্সিম"),
    "CEFTRIAXONE": ("ceftriaxone", "সেফট্রিয়াক্সোন", "সেফট্রিয়াক্সোন"),
    "LEVOFLOXACIN": ("levofloxacin", "লেভোফ্লক্সাসিন"),
    "VANCOMYCIN": ("vancomycin", "ভ্যানকোমাইসিন"),
    "PIPERACILLIN_TAZOBACTAM": (
        "piperacillin/tazobactam",
        "piperacillin-tazobactam",
        "piperacillin",
        "tazobactam",
        "pip-tazo",
        "পাইপেরাসিলিন",
        "ট্যাজোব্যাকটাম",
    ),
    "MEROPENEM": ("meropenem", "মেরোপেনেম"),
    "LINEZOLID": ("linezolid", "লাইনেজোলিড"),
    "COLISTIN": ("colistin", "polymyxin e", "polymyxin", "কলিস্টিন"),
}

_ANTIBIOTIC_SUFFIX_RE = re.compile(
    r"\b(?:[a-z]{4,}(?:cillin|mycin|cycline|floxacin|oxacin|penem|zolid|micin|"
    r"conazole|furantoin|nidazole|moxazole|bactam)|[a-z]{3,}kacin|cef[a-z]{3,})\b"
)

DETERMINISTIC_FALLBACK_CARDS: dict[str, dict[str, dict[str, Any]]] = {
    "OPTIMAL": {
        "en": {
            "summary": "Selected {drug_name} ({aware_category}) from FEFO lot {lot_number} (expires {expiry_date}).",
            "instructions": [
                "Regimen: {dose_regimen}.",
                "Complete the full {duration_days}-day course even if symptoms improve early.",
                "Take doses at evenly spaced intervals and report any rash or gastrointestinal distress.",
            ],
            "red_flags": [
                "Return immediately if rash, facial swelling, breathing difficulty, or persistent fever after 48-72 hours occurs.",
            ],
        },
        "bn": {
            "summary": "{drug_name} ({aware_category}) নির্বাচিত হয়েছে — FEFO ব্যাচ {lot_number} (মেয়াদ {expiry_date})।",
            "instructions": [
                "মাত্রা ও নিয়ম: {dose_regimen}।",
                "উপসর্গ কমলেও নির্ধারিত {duration_days} দিনের পূর্ণ কোর্স সম্পন্ন করুন।",
                "নির্দিষ্ট সময় পরপর ওষুধ সেবন করুন এবং কোনো পার্শ্বপ্রতিক্রিয়া দেখা দিলে জানান।",
            ],
            "red_flags": [
                "ত্বকে র‍্যাশ, মুখ ফোলা, শ্বাসকষ্ট বা ৪৮–৭২ ঘণ্টায় জ্বর না কমলে দ্রুত ক্লিনিকে যোগাযোগ করুন।",
            ],
        },
    },
    "NO_ANTIBIOTIC": {
        "en": {
            "summary": "No antibiotic is indicated for mild viral presentation ({syndrome_code}); supportive care is recommended.",
            "instructions": [
                "Provide hydration, rest, and symptomatic fever or pain control (e.g., paracetamol as appropriate).",
                "Avoid unnecessary antibiotic exposure to protect community AWaRe stewardship.",
                "Clinically reassess within 48-72 hours if symptoms worsen or fail to improve.",
            ],
            "red_flags": [
                "Seek urgent medical review for shortness of breath, chest pain, high persistent fever, or altered mental status.",
            ],
        },
        "bn": {
            "summary": "মৃদু ভাইরাসজনিত উপসর্গে ({syndrome_code}) অ্যান্টিবায়োটিক প্রয়োজন নেই; সহায়ক ও উপসর্গভিত্তিক পরিচর্যা অনুসরণ করুন।",
            "instructions": [
                "পর্যাপ্ত বিশ্রাম ও নিরাপদ পানীয়/তরল গ্রহণ নিশ্চিত করুন।",
                "প্রয়োজনে জ্বর বা ব্যথার জন্য প্যারাসিটামল ব্যবহার করুন এবং অপ্রয়োজনীয় অ্যান্টিবায়োটিক এড়িয়ে চলুন।",
                "উপসর্গ বাড়লে বা ৪৮–৭২ ঘণ্টায় উন্নতি না হলে পুনরায় ক্লিনিকে মূল্যায়ন করুন।",
            ],
            "red_flags": [
                "শ্বাসকষ্ট, বুকে ব্যথা, তীব্র জ্বর বা অবস্থার দ্রুত অবনতি হলে অবিলম্বে হাসপাতালে রেফার করুন।",
            ],
        },
    },
    "INFEASIBLE": {
        "en": {
            "summary": "No local antibiotic regimen satisfies all clinical safety, WHO AWaRe tier, and FEFO stock constraints.",
            "instructions": [
                "Review documented allergy, pregnancy, renal, age, and stock exclusions before any dispense.",
                "Follow a verified safe relaxation pathway (pharmacist WATCH review, Upazila stock transfer, or symptomatic care).",
                "Document clinical escalation and arrange timely medical reassessment.",
            ],
            "red_flags": [
                "Refer urgently to an Upazila Health Complex or hospital if sepsis, hypoxia, or systemic deterioration develops.",
            ],
        },
        "bn": {
            "summary": "ক্লিনিক্যাল নিরাপত্তা, WHO AWaRe স্তর ও FEFO মজুদ শর্ত পূরণ করে এমন কোনো স্থানীয় অ্যান্টিবায়োটিক পাওয়া যায়নি।",
            "instructions": [
                "অ্যালার্জি, গর্ভাবস্থা, কিডনি বা মজুদের সীমাবদ্ধতাগুলো যাচাই করে নিরাপদ বিকল্প পথ অনুসরণ করুন।",
                "প্রয়োজনে ফার্মাসিস্ট অনুমোদন, উপজেলা স্টক স্থানান্তর বা উপসর্গভিত্তিক পরিচর্যা গ্রহণ করুন।",
                "রোগীর অবস্থা নিয়মিত পর্যবেক্ষণ ও নথিভুক্ত করুন।",
            ],
            "red_flags": [
                "উচ্চ জ্বর, শ্বাসকষ্ট, রক্তচাপ কমে যাওয়া বা দ্রুত অবনতি হলে অবিলম্বে উপজেলা হাসপাতালে রেফার করুন।",
            ],
        },
    },
}


class PiiDetectedError(ValueError):
    """Raised when forbidden PII keys or patterns are detected in outbound payloads."""


@dataclass(frozen=True, slots=True)
class CounselingResult:
    summary: str
    instructions: list[str]
    red_flags: list[str]
    model_used: str
    deidentified: bool = True
    hallucination_guard_passed: bool = True


@dataclass(frozen=True, slots=True)
class VoiceIntakeResult:
    syndrome_code: str | None
    severity: Literal["MILD", "MODERATE", "SEVERE"] | None
    allergies: list[str] = field(default_factory=list)
    is_pregnant: bool | None = None
    age_years: int | None = None
    prompt_guard_safe: bool = True
    model_used: str = DETERMINISTIC_MODEL_NAME
    transcript: str | None = None


def _contains_pii_text(value: str) -> str | None:
    if _EMAIL_RE.search(value):
        return "email address"
    if _BD_PHONE_RE.search(value) or _INTL_PHONE_RE.search(value):
        return "phone number"
    if _LABELED_ID_RE.search(value) or _MRN_PREFIX_RE.search(value):
        return "NID/MRN identifier"
    if _LONG_NUMERIC_ID_RE.search(value):
        return "numeric national/phone identifier"
    if _DOB_RE.search(value):
        return "date of birth reference"
    if _NAMED_PATIENT_RE.search(value):
        return "named patient reference"
    return None


def detect_pii_reason(value: str) -> str | None:
    """Return a human-readable PII category if value matches any PII pattern, else None."""
    return _contains_pii_text(value)


def _assert_deidentified(payload: dict[str, Any]) -> None:
    """Recursively verify that an outbound LLM payload contains zero PII keys or patterns."""

    def _walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            for key, val in node.items():
                key_str = str(key)
                key_lower = key_str.strip().lower()
                if key_lower in FORBIDDEN_PII_KEYS or key_lower.endswith(
                    ("_mrn", "_nid", "_dob", "_phone", "_email")
                ):
                    raise PiiDetectedError(f"Forbidden PII key detected at '{path}.{key_str}'")
                _walk(val, f"{path}.{key_str}")
        elif isinstance(node, (list, tuple, set)):
            for idx, item in enumerate(node):
                _walk(item, f"{path}[{idx}]")
        elif isinstance(node, str):
            reason = _contains_pii_text(node)
            if reason is not None:
                raise PiiDetectedError(f"PII pattern ({reason}) detected at '{path}'")

    if not isinstance(payload, dict):
        raise PiiDetectedError("De-identified payload must be a dictionary.")
    _walk(payload, "payload")


def strip_pii_from_text(text: str) -> str:
    """Scrub names, emails, phones, NIDs, MRNs, and DOBs before LLM or response handling."""
    cleaned = text
    cleaned = _EMAIL_RE.sub("[REDACTED]", cleaned)
    cleaned = _BD_PHONE_RE.sub("[REDACTED]", cleaned)
    cleaned = _INTL_PHONE_RE.sub("[REDACTED]", cleaned)
    cleaned = _LABELED_ID_RE.sub("[REDACTED]", cleaned)
    cleaned = _MRN_PREFIX_RE.sub("[REDACTED]", cleaned)
    cleaned = _LONG_NUMERIC_ID_RE.sub("[REDACTED]", cleaned)
    cleaned = _NAMED_PATIENT_RE.sub("[REDACTED]", cleaned)
    cleaned = _DOB_RE.sub("[REDACTED]", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def _expand_allowed_drug_tokens(
    allowed_drugs: Iterable[str] | str | None,
    catalog_drugs: Sequence[Any] | None = None,
) -> set[str]:
    if allowed_drugs is None:
        return set()
    if isinstance(allowed_drugs, str):
        raw_items = [allowed_drugs]
    else:
        raw_items = list(allowed_drugs)

    catalog_lookup: dict[str, tuple[str, str, str]] = {}
    if catalog_drugs:
        for item in catalog_drugs:
            if isinstance(item, dict):
                code = str(item.get("drug_code", "")).upper()
                gen = str(item.get("generic_name", ""))
                gen_bn = str(item.get("generic_name_bn", ""))
            else:
                code = str(getattr(item, "drug_code", "")).upper()
                gen = str(getattr(item, "generic_name", ""))
                gen_bn = str(getattr(item, "generic_name_bn", ""))
            if code:
                catalog_lookup[code] = (code, gen, gen_bn)

    allowed_tokens: set[str] = set()
    for raw in raw_items:
        if not raw or not str(raw).strip():
            continue
        raw_str = str(raw).strip()
        raw_lower = raw_str.lower()
        raw_upper = raw_str.upper()
        allowed_tokens.add(raw_lower)

        # Split composite tokens like "Co-trimoxazole (Sulfamethoxazole/Trimethoprim)"
        for part in re.findall(r"[a-z]{4,}", raw_lower):
            allowed_tokens.add(part)

        # Match against known catalog aliases
        for code, aliases in _CATALOG_DRUG_ALIASES.items():
            alias_lowers = {a.lower() for a in aliases} | {code.lower()}
            if raw_upper == code or raw_lower in alias_lowers or any(a in raw_lower for a in alias_lowers):
                allowed_tokens.update(alias_lowers)
                for a in alias_lowers:
                    for part in re.findall(r"[a-z]{4,}", a):
                        allowed_tokens.add(part)

        if raw_upper in catalog_lookup:
            code, gen, gen_bn = catalog_lookup[raw_upper]
            allowed_tokens.add(code.lower())
            if gen:
                allowed_tokens.add(gen.lower())
                for part in re.findall(r"[a-z]{4,}", gen.lower()):
                    allowed_tokens.add(part)
            if gen_bn:
                allowed_tokens.add(gen_bn.lower())

    return allowed_tokens


def _extract_counseling_text(counseling: str | dict[str, Any] | Any) -> str:
    if isinstance(counseling, str):
        return counseling
    if isinstance(counseling, dict):
        parts = [str(counseling.get("summary", ""))]
        for key in ("instructions", "red_flags"):
            val = counseling.get(key)
            if isinstance(val, (list, tuple)):
                parts.extend(str(x) for x in val)
            elif isinstance(val, str):
                parts.append(val)
        return " ".join(parts)
    summary = str(getattr(counseling, "summary", ""))
    instructions = getattr(counseling, "instructions", []) or []
    red_flags = getattr(counseling, "red_flags", []) or []
    return " ".join([summary, *(str(x) for x in instructions), *(str(x) for x in red_flags)])


def _passes_hallucination_guard(
    counseling: str | dict[str, Any] | Any,
    allowed_drugs: Iterable[str] | str | None,
    catalog_drugs: Sequence[Any] | None = None,
) -> bool:
    """Verify every antibiotic named in counseling belongs strictly to solver-approved output."""
    text = _extract_counseling_text(counseling)
    text_lower = text.lower()
    allowed_tokens = _expand_allowed_drug_tokens(allowed_drugs, catalog_drugs)

    # 1. Check known catalog drug names and Bangla equivalents
    known_terms: set[str] = set()
    for code, aliases in _CATALOG_DRUG_ALIASES.items():
        known_terms.add(code.lower())
        known_terms.update(a.lower() for a in aliases)
    if catalog_drugs:
        for item in catalog_drugs:
            if isinstance(item, dict):
                for key in ("drug_code", "generic_name", "generic_name_bn"):
                    val = str(item.get(key, "")).strip().lower()
                    if val:
                        known_terms.add(val)
            else:
                for attr in ("drug_code", "generic_name", "generic_name_bn"):
                    val = str(getattr(item, attr, "")).strip().lower()
                    if val:
                        known_terms.add(val)

    for term in known_terms:
        if len(term) < 4:
            continue
        is_ascii = term.isascii()
        if (
            is_ascii
            and re.search(rf"(?<![a-z]){re.escape(term)}(?![a-z])", text_lower)
            and term not in allowed_tokens
        ):
            return False
        if not is_ascii and term in text_lower and term not in allowed_tokens:
            return False

    # 2. Check antibiotic suffix regex against allowed tokens
    for match in _ANTIBIOTIC_SUFFIX_RE.finditer(text_lower):
        token = match.group(0)
        if token not in allowed_tokens:
            return False

    return True


async def check_prompt_injection(text: str) -> tuple[bool, str]:
    """Run local deterministic prompt-injection rules and optional Groq llama-prompt-guard-2-86m."""
    for pattern in _PROMPT_INJECTION_PATTERNS:
        if pattern.search(text):
            return False, "local-prompt-guard"

    if settings.GROQ_API_KEY:
        try:
            client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            resp = await asyncio.wait_for(
                client.chat.completions.create(
                    model=GROQ_PROMPT_GUARD_MODEL,
                    messages=[{"role": "user", "content": text}],
                    temperature=0,
                    max_tokens=32,
                ),
                timeout=5.0,
            )
            content = (resp.choices[0].message.content or "").strip().lower()
            if (
                "unsafe" in content
                or "injection" in content
                or "jailbreak" in content
                or "malicious" in content
                or "label_1" in content
            ):
                return False, GROQ_PROMPT_GUARD_MODEL
            # Numeric score check if model returns a probability scalar
            try:
                score = float(content)
                if score > 0.5:
                    return False, GROQ_PROMPT_GUARD_MODEL
            except ValueError:
                pass
            return True, GROQ_PROMPT_GUARD_MODEL
        except (
            GroqError,
            httpx.HTTPError,
            TimeoutError,
            OSError,
            ValueError,
            RuntimeError,
            KeyError,
            IndexError,
            AttributeError,
            TypeError,
        ) as exc:
            logger.warning("Groq prompt guard fallback to local guard: %s", exc)

    return True, "local-prompt-guard"


def _build_deidentified_token_payload(
    *,
    solver_result: SolverResult,
    syndrome_code: str,
    severity: str,
    duration_days: int,
    age_years: int,
    weight_kg: float,
    sex: str,
    is_pregnant: bool,
    egfr: float | None,
    allergies: list[str],
    language: Literal["en", "bn"],
) -> dict[str, Any]:
    drug = solver_result.recommended_antibiotic
    batch = solver_result.recommended_batch
    return {
        "language": language,
        "syndrome_code": syndrome_code,
        "severity": severity,
        "duration_days": duration_days,
        "clinical_profile": {
            "age_years": age_years,
            "weight_kg": round(float(weight_kg), 2),
            "sex": sex,
            "is_pregnant": bool(is_pregnant),
            "egfr": round(float(egfr), 2) if egfr is not None else None,
            "allergies": [str(a) for a in allergies],
        },
        "solver_status": solver_result.solver_status,
        "aware_category": solver_result.aware_category,
        "approved_drug_code": drug.drug_code if drug else None,
        "approved_generic_name": drug.generic_name if drug else None,
        "approved_generic_name_bn": drug.generic_name_bn if drug else None,
        "dose_regimen": (
            (drug.dose_regimen_bn or drug.dose_regimen_en)
            if (drug and language == "bn")
            else (drug.dose_regimen_en if drug else None)
        ),
        "lot_number": batch.lot_number if batch else None,
        "expiry_date": batch.expiry_date.isoformat() if batch else None,
        "mus_conflicts": [c.to_dict() for c in solver_result.mus_conflicts],
        "safe_relaxations": [r.to_dict() for r in solver_result.safe_relaxations],
    }


def _allowed_drugs_from_solver(solver_result: SolverResult) -> set[str]:
    if solver_result.solver_status == "OPTIMAL" and solver_result.recommended_antibiotic is not None:
        return {
            solver_result.recommended_antibiotic.drug_code,
            solver_result.recommended_antibiotic.generic_name,
        }
    if solver_result.solver_status == "INFEASIBLE":
        return {
            r.candidate_drug
            for r in solver_result.safe_relaxations
            if r.candidate_drug
        }
    return set()


def _parse_counseling_json(raw_text: str) -> dict[str, Any] | None:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    summary = parsed.get("summary")
    instructions = parsed.get("instructions")
    red_flags = parsed.get("red_flags")
    if not isinstance(summary, str) or not summary.strip():
        return None
    if not isinstance(instructions, list) or not all(isinstance(x, str) and x.strip() for x in instructions):
        return None
    if not isinstance(red_flags, list) or not all(isinstance(x, str) and x.strip() for x in red_flags):
        return None
    return {
        "summary": summary.strip(),
        "instructions": [x.strip() for x in instructions],
        "red_flags": [x.strip() for x in red_flags],
    }


def _render_deterministic_counseling(
    *,
    solver_result: SolverResult,
    syndrome_code: str,
    duration_days: int,
    language: Literal["en", "bn"],
) -> CounselingResult:
    lang = "bn" if language == "bn" else "en"
    template = DETERMINISTIC_FALLBACK_CARDS[solver_result.solver_status][lang]
    drug = solver_result.recommended_antibiotic
    batch = solver_result.recommended_batch

    if drug is not None:
        drug_name = (drug.generic_name_bn or drug.generic_name) if lang == "bn" else drug.generic_name
        dose_regimen = (drug.dose_regimen_bn or drug.dose_regimen_en) if lang == "bn" else drug.dose_regimen_en
    else:
        drug_name = ""
        dose_regimen = ""

    fmt_ctx = {
        "drug_name": drug_name,
        "aware_category": solver_result.aware_category,
        "lot_number": batch.lot_number if batch else "N/A",
        "expiry_date": batch.expiry_date.isoformat() if batch else "N/A",
        "dose_regimen": dose_regimen or f"{duration_days} days",
        "duration_days": duration_days,
        "syndrome_code": syndrome_code,
    }
    return CounselingResult(
        summary=template["summary"].format(**fmt_ctx),
        instructions=[line.format(**fmt_ctx) for line in template["instructions"]],
        red_flags=[line.format(**fmt_ctx) for line in template["red_flags"]],
        model_used=DETERMINISTIC_MODEL_NAME,
        deidentified=True,
        hallucination_guard_passed=True,
    )


async def generate_counseling(
    *,
    solver_result: SolverResult,
    syndrome_code: str,
    severity: str,
    duration_days: int,
    age_years: int,
    weight_kg: float,
    sex: str,
    is_pregnant: bool,
    egfr: float | None,
    allergies: list[str],
    language: Literal["en", "bn"] = "en",
    catalog_drugs: Sequence[Any] | None = None,
) -> CounselingResult:
    """Generate de-identified bilingual counseling via Groq -> Gemini -> deterministic fallback."""
    token_payload = _build_deidentified_token_payload(
        solver_result=solver_result,
        syndrome_code=syndrome_code,
        severity=severity,
        duration_days=duration_days,
        age_years=age_years,
        weight_kg=weight_kg,
        sex=sex,
        is_pregnant=is_pregnant,
        egfr=egfr,
        allergies=allergies,
        language=language,
    )
    # Hard PII barrier before any external LLM routing
    _assert_deidentified(token_payload)

    allowed_drugs = _allowed_drugs_from_solver(solver_result)
    system_prompt = (
        "You are AWaReGrid clinical stewardship counseling assistant. "
        "Respond strictly with JSON containing keys: summary (string), instructions (list of strings), "
        "red_flags (list of strings). Write in the requested language ('en' or 'bn'). "
        "NEVER mention any antibiotic outside approved_drug_code / safe_relaxations candidate_drug. "
        "If solver_status is NO_ANTIBIOTIC, mention zero antibiotics. Never include PII."
    )
    user_prompt = json.dumps(token_payload, ensure_ascii=False)

    # Tier 1: Groq (openai/gpt-oss-120b)
    if settings.GROQ_API_KEY:
        try:
            groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            resp = await asyncio.wait_for(
                groq_client.chat.completions.create(
                    model=GROQ_COUNSELING_MODEL,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_tokens=450,
                ),
                timeout=8.0,
            )
            parsed = _parse_counseling_json(resp.choices[0].message.content or "")
            if (
                parsed is not None
                and _passes_hallucination_guard(parsed, allowed_drugs, catalog_drugs)
                and _contains_pii_text(" ".join([parsed["summary"], *parsed["instructions"], *parsed["red_flags"]])) is None
            ):
                return CounselingResult(
                    summary=parsed["summary"],
                    instructions=parsed["instructions"],
                    red_flags=parsed["red_flags"],
                    model_used=GROQ_COUNSELING_MODEL,
                    deidentified=True,
                    hallucination_guard_passed=True,
                )
        except (
            GroqError,
            httpx.HTTPError,
            TimeoutError,
            OSError,
            ValueError,
            RuntimeError,
            KeyError,
            IndexError,
            AttributeError,
            TypeError,
        ) as exc:
            logger.warning("Groq counseling generation failed/rejected, falling back: %s", exc)

    # Tier 2: Google Gemini (gemini-3.5-flash-lite)
    if settings.GEMINI_API_KEY:
        try:
            gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            resp = await asyncio.wait_for(
                gemini_client.aio.models.generate_content(
                    model=GEMINI_COUNSELING_MODEL,
                    contents=f"{system_prompt}\n\nINPUT_TOKENS:\n{user_prompt}",
                    config=genai_types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.1,
                    ),
                ),
                timeout=8.0,
            )
            parsed = _parse_counseling_json(getattr(resp, "text", "") or "")
            if (
                parsed is not None
                and _passes_hallucination_guard(parsed, allowed_drugs, catalog_drugs)
                and _contains_pii_text(" ".join([parsed["summary"], *parsed["instructions"], *parsed["red_flags"]])) is None
            ):
                return CounselingResult(
                    summary=parsed["summary"],
                    instructions=parsed["instructions"],
                    red_flags=parsed["red_flags"],
                    model_used=GEMINI_COUNSELING_MODEL,
                    deidentified=True,
                    hallucination_guard_passed=True,
                )
        except (
            genai_errors.APIError,
            httpx.HTTPError,
            TimeoutError,
            OSError,
            ValueError,
            RuntimeError,
            KeyError,
            IndexError,
            AttributeError,
            TypeError,
        ) as exc:
            logger.warning("Gemini counseling generation failed/rejected, falling back: %s", exc)

    # Tier 3: Deterministic Local Template Fallback
    return _render_deterministic_counseling(
        solver_result=solver_result,
        syndrome_code=syndrome_code,
        duration_days=duration_days,
        language=language,
    )


_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def _extract_clinical_tokens_deterministic(text: str) -> dict[str, Any]:
    normalized = text.translate(_BN_DIGITS)
    lower = normalized.lower()

    syndrome_code: str | None = None
    syndrome_rules: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("PYELONEPHRITIS", ("pyelonephritis", "flank pain", "kidney infection", "কোমরে ব্যথা")),
        (
            "UNCOMPLICATED_UTI",
            (
                "uncomplicated_uti",
                "uti",
                "dysuria",
                "painful urination",
                "burning urination",
                "urinary",
                "প্রস্রাবে জ্বালাপোড়া",
                "প্রস্রাবে জ্বালাপোড়া",
                "মূত্রনালী",
            ),
        ),
        (
            "ACUTE_BRONCHITIS",
            ("acute_bronchitis", "bronchitis", "cough and chest", "ব্রংকাইটিস", "কাশি"),
        ),
        ("COMMON_COLD", ("common_cold", "common cold", "runny nose", "nasal congestion", "সর্দি")),
        ("VIRAL_URI", ("viral_uri", "viral uri", "viral upper respiratory", "ভাইরাল জ্বর")),
        ("CAP_MODERATE", ("cap_moderate", "moderate pneumonia", "মাঝারি নিউমোনিয়া", "মাঝারি নিউমোনিয়া")),
        ("CAP_MILD", ("cap_mild", "pneumonia", "নিউমোনিয়া", "নিউমোনিয়া")),
        ("ACUTE_OTITIS_MEDIA", ("acute_otitis_media", "otitis media", "ear pain", "কানে ব্যথা")),
        ("STREP_PHARYNGITIS", ("strep_pharyngitis", "pharyngitis", "strep throat", "sore throat", "গলা ব্যথা")),
        ("CELLULITIS", ("cellulitis", "skin infection", "সেলুলাইটিস")),
        ("ACUTE_BACTERIAL_SINUSITIS", ("sinusitis", "সাইনোসাইটিস")),
        ("CHOLERA_WATERY_DIARRHEA", ("cholera", "watery diarrhea", "rice water", "কলেরা", "পাতলা পায়খানা")),
        ("SHIGELLOSIS_DYSENTERY", ("shigellosis", "dysentery", "bloody diarrhea", "আমাশয়")),
        ("ENTERIC_FEVER_TYPHOID", ("typhoid", "enteric fever", "টাইফয়েড")),
        ("INTRA_ABDOMINAL_SEPSIS", ("sepsis", "intra-abdominal", "সেপসিস")),
    )
    for code, keywords in syndrome_rules:
        if any(
            (re.search(r"\buti\b", lower) is not None if kw == "uti" else kw in lower)
            for kw in keywords
        ):
            syndrome_code = code
            break

    severity: Literal["MILD", "MODERATE", "SEVERE"] | None = None
    if any(w in lower for w in ("severe", "critical", "তীব্র", "গুরুতর")):
        severity = "SEVERE"
    elif any(w in lower for w in ("moderate", "মাঝারি")):
        severity = "MODERATE"
    elif any(w in lower for w in ("mild", "মৃদু", "হালকা")):
        severity = "MILD"

    allergies: list[str] = []
    allergy_rules: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("PENICILLIN", ("penicillin", "পেনিসিলিন")),
        ("BETA_LACTAM", ("beta-lactam", "beta lactam", "betalactam")),
        ("SULFONAMIDE", ("sulfonamide", "sulfa", "sulpha", "cotrimoxazole", "bactrim", "সালফা")),
        ("CEPHALOSPORIN", ("cephalosporin", "সেফালোস্পোরিন")),
        ("FLUOROQUINOLONE", ("fluoroquinolone", "quinolone", "ciprofloxacin")),
        ("MACROLIDE", ("macrolide", "azithromycin")),
        ("TETRACYCLINE", ("tetracycline", "doxycycline")),
    )
    for code, keywords in allergy_rules:
        if any(kw in lower for kw in keywords):
            allergies.append(code)

    is_pregnant: bool | None = None
    if any(
        w in lower
        for w in (
            "not pregnant",
            "non-pregnant",
            "non pregnant",
            "গর্ভবতী নন",
            "গর্ভবতী না",
            "গর্ভবতী নয়",
            "গর্ভবতী নয়",
        )
    ):
        is_pregnant = False
    elif any(w in lower for w in ("pregnant", "pregnancy", "গর্ভবতী", "অন্তঃসত্ত্বা")):
        is_pregnant = True

    age_years: int | None = None
    age_match = re.search(
        r"\b(\d{1,3})\s*(?:years?\s*old|yrs?\s*old|yo|y/o|years?|yrs?|বছর)\b",
        lower,
    )
    if age_match:
        parsed_age = int(age_match.group(1))
        if 0 <= parsed_age <= 130:
            age_years = parsed_age

    return {
        "syndrome_code": syndrome_code,
        "severity": severity,
        "allergies": allergies,
        "is_pregnant": is_pregnant,
        "age_years": age_years,
    }


async def process_voice_intake(
    *,
    transcript: str | None = None,
    audio_bytes: bytes | None = None,
    audio_filename: str = "audio.webm",
    language: Literal["en", "bn"] = "en",
) -> VoiceIntakeResult:
    """Transcribe optional audio, scrub PII, enforce prompt guard, and extract clinical tokens."""
    model_used = DETERMINISTIC_MODEL_NAME
    raw_text = (transcript or "").strip()

    if audio_bytes is not None:
        if not audio_bytes:
            raise ValidationAppError(
                message="Uploaded audio file is empty.",
                error_code="EMPTY_AUDIO_FILE",
            )
        if not settings.GROQ_API_KEY:
            raise ValidationAppError(
                message="Audio transcription requires GROQ_API_KEY; submit text transcript in offline/local mode.",
                error_code="VOICE_PROVIDER_UNAVAILABLE",
                details={"provider": "groq", "model": GROQ_VOICE_MODEL},
            )
        try:
            groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            transcription = await asyncio.wait_for(
                groq_client.audio.transcriptions.create(
                    file=(audio_filename or "audio.webm", audio_bytes),
                    model=GROQ_VOICE_MODEL,
                    language=language,
                ),
                timeout=15.0,
            )
        except (
            GroqError,
            httpx.HTTPError,
            TimeoutError,
            OSError,
            ValueError,
            RuntimeError,
            AttributeError,
            TypeError,
        ) as exc:
            logger.warning("Groq audio transcription failed: %s", exc)
            raise AppError(
                status_code=502,
                error_code="VOICE_PROVIDER_ERROR",
                message="Voice transcription provider failed; please retry or submit a text transcript.",
                details={"provider": "groq", "model": GROQ_VOICE_MODEL},
            ) from exc
        raw_text = str(getattr(transcription, "text", "") or "").strip()
        model_used = GROQ_VOICE_MODEL

    if not raw_text:
        raise ValidationAppError(
            message="Voice transcript cannot be empty.",
            error_code="EMPTY_VOICE_TRANSCRIPT",
        )

    scrubbed_text = strip_pii_from_text(raw_text)
    safe, guard_model = await check_prompt_injection(scrubbed_text)
    if not safe:
        return VoiceIntakeResult(
            syndrome_code=None,
            severity=None,
            allergies=[],
            is_pregnant=None,
            age_years=None,
            prompt_guard_safe=False,
            model_used=guard_model,
            transcript=None,
        )

    extracted = _extract_clinical_tokens_deterministic(scrubbed_text)

    # Optionally refine extraction with de-identified LLM if configured
    if settings.GROQ_API_KEY:
        payload = {"language": language, "scrubbed_transcript": scrubbed_text}
        _assert_deidentified(payload)
        try:
            groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
            resp = await asyncio.wait_for(
                groq_client.chat.completions.create(
                    model=GROQ_COUNSELING_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Extract strictly de-identified clinical tokens as JSON with keys: "
                                "syndrome_code (one of known WHO AWaRe codes or null), "
                                "severity ('MILD'|'MODERATE'|'SEVERE'|null), "
                                "allergies (list of drug class strings), is_pregnant (bool|null), "
                                "age_years (int|null)."
                            ),
                        },
                        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.0,
                    max_tokens=200,
                ),
                timeout=6.0,
            )
            llm_data = json.loads((resp.choices[0].message.content or "").strip())
            if isinstance(llm_data, dict):
                syn = llm_data.get("syndrome_code")
                if isinstance(syn, str) and syn.upper() in KNOWN_SYNDROME_CODES:
                    extracted["syndrome_code"] = syn.upper()
                sev = llm_data.get("severity")
                if sev in ("MILD", "MODERATE", "SEVERE"):
                    extracted["severity"] = sev
                if isinstance(llm_data.get("allergies"), list):
                    extracted["allergies"] = [
                        str(a).strip().upper()
                        for a in llm_data["allergies"]
                        if isinstance(a, str) and a.strip()
                    ]
                if isinstance(llm_data.get("is_pregnant"), bool):
                    extracted["is_pregnant"] = llm_data["is_pregnant"]
                if isinstance(llm_data.get("age_years"), int) and 0 <= llm_data["age_years"] <= 130:
                    extracted["age_years"] = llm_data["age_years"]
                if model_used == DETERMINISTIC_MODEL_NAME:
                    model_used = GROQ_COUNSELING_MODEL
        except (
            GroqError,
            httpx.HTTPError,
            TimeoutError,
            OSError,
            ValueError,
            RuntimeError,
            KeyError,
            IndexError,
            AttributeError,
            TypeError,
        ) as exc:
            logger.warning("Groq voice extraction fallback to deterministic extractor: %s", exc)

    return VoiceIntakeResult(
        syndrome_code=extracted["syndrome_code"],
        severity=extracted["severity"],
        allergies=extracted["allergies"],
        is_pregnant=extracted["is_pregnant"],
        age_years=extracted["age_years"],
        prompt_guard_safe=True,
        model_used=model_used,
        transcript=scrubbed_text,
    )
