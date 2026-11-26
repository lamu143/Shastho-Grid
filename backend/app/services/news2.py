"""PulseScore: Royal College of Physicians NEWS2 (2017) aggregate score.

Pure functions, no I/O. Supports SpO2 Scale 1 and Scale 2 (for patients with
confirmed hypercapnic respiratory failure, e.g. COPD, as directed by a clinician).

Clinical-risk bands follow the RCP chart:
  0-4 low; any single parameter scoring 3 = low-medium (urgent ward review);
  5-6 medium (urgent response); >=7 high (emergency response).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

Consciousness = Literal["A", "C", "V", "P", "U"]
Acuity = Literal["RED_CRITICAL", "ORANGE_URGENT", "YELLOW_ELEVATED", "GREEN_STABLE"]


@dataclass(frozen=True)
class News2Input:
    respiration_rate: int
    spo2: int
    on_oxygen: bool
    systolic_bp: int
    pulse: int
    consciousness: Consciousness
    temperature_c: float
    spo2_scale2: bool = False


@dataclass(frozen=True)
class News2Result:
    score: int
    acuity: Acuity
    clinical_risk: Literal["LOW", "LOW_MEDIUM", "MEDIUM", "HIGH"]
    response: str
    breakdown: dict[str, int] = field(default_factory=dict)
    red_flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _score_respiration(rr: int) -> int:
    if rr <= 8:
        return 3
    if rr <= 11:
        return 1
    if rr <= 20:
        return 0
    if rr <= 24:
        return 2
    return 3


def _score_spo2_scale1(spo2: int) -> int:
    if spo2 <= 91:
        return 3
    if spo2 <= 93:
        return 2
    if spo2 <= 95:
        return 1
    return 0


def _score_spo2_scale2(spo2: int, on_oxygen: bool) -> int:
    if spo2 <= 83:
        return 3
    if spo2 <= 85:
        return 2
    if spo2 <= 87:
        return 1
    if spo2 <= 92 or not on_oxygen:
        return 0
    # >= 93 while on oxygen
    if spo2 <= 94:
        return 1
    if spo2 <= 96:
        return 2
    return 3


def _score_systolic(sbp: int) -> int:
    if sbp <= 90:
        return 3
    if sbp <= 100:
        return 2
    if sbp <= 110:
        return 1
    if sbp <= 219:
        return 0
    return 3


def _score_pulse(pulse: int) -> int:
    if pulse <= 40:
        return 3
    if pulse <= 50:
        return 1
    if pulse <= 90:
        return 0
    if pulse <= 110:
        return 1
    if pulse <= 130:
        return 2
    return 3


def _score_temperature(temp: float) -> int:
    if temp <= 35.0:
        return 3
    if temp <= 36.0:
        return 1
    if temp <= 38.0:
        return 0
    if temp <= 39.0:
        return 1
    return 2


_RESPONSES = {
    "LOW": "Routine ward-based monitoring; assess by a registered nurse.",
    "LOW_MEDIUM": "Urgent ward-based review by a clinician (single parameter scored 3).",
    "MEDIUM": "Urgent response: clinician review and consider critical-care referral.",
    "HIGH": "Emergency response: critical-care team assessment; consider ICU transfer.",
}


def compute_news2(data: News2Input) -> News2Result:
    breakdown = {
        "respiration_rate": _score_respiration(data.respiration_rate),
        "spo2": (
            _score_spo2_scale2(data.spo2, data.on_oxygen)
            if data.spo2_scale2
            else _score_spo2_scale1(data.spo2)
        ),
        "air_or_oxygen": 2 if data.on_oxygen else 0,
        "systolic_bp": _score_systolic(data.systolic_bp),
        "pulse": _score_pulse(data.pulse),
        "consciousness": 0 if data.consciousness == "A" else 3,
        "temperature": _score_temperature(data.temperature_c),
    }
    score = sum(breakdown.values())
    red_flags = sorted(k for k, v in breakdown.items() if v == 3)

    if score >= 7:
        risk, acuity = "HIGH", "RED_CRITICAL"
    elif score >= 5:
        risk, acuity = "MEDIUM", "ORANGE_URGENT"
    elif red_flags:
        risk, acuity = "LOW_MEDIUM", "YELLOW_ELEVATED"
    else:
        risk, acuity = "LOW", "GREEN_STABLE"

    return News2Result(
        score=score,
        acuity=acuity,
        clinical_risk=risk,
        response=_RESPONSES[risk],
        breakdown=breakdown,
        red_flags=red_flags,
    )
