"""CareMatch + ConflictProof: critical-care allocation with Google OR-Tools CP-SAT.

Pass 1  Single-hospital CP-SAT: pick exactly one hospital minimising
        patient ETA + ICU load + private-tier penalty + blood-substitution cost,
        subject to the active constraint groups (each guarded by an assumption literal).
Pass 2  If infeasible: (a) CP-SAT sufficient-assumptions core with presolve off,
        one worker and no objective; (b) exact enumeration of ALL minimal
        unsatisfiable subsets (MUS) over the <= 6 constraint groups.
Pass 3  Solver-verified repairs, never relaxing clinical safety (ICU, ventilator,
        specialty, blood compatibility):
          1. Split-resource co-dispatch: a hospital meeting every rule except blood,
             paired (two-node CP-SAT) with a blood source sending a courier.
          2. Relax public-only.
          3. Relax the maximum ETA.

Pure functions over immutable snapshots: no database or network access here.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from itertools import combinations
from typing import Literal

from ortools.sat.python import cp_model

from app.services.blood_compat import RBC_DONORS, allocation_plan, compatible_units

ConstraintCode = Literal["C_ICU", "C_VENT", "C_SPEC", "C_BLOOD", "C_PUBLIC", "C_ETA"]

CONSTRAINT_LABELS: dict[str, str] = {
    "C_ICU": "A staffed ICU bed must be free",
    "C_VENT": "A ventilator must be free",
    "C_SPEC": "The hospital must provide the required specialty",
    "C_BLOOD": "Compatible blood must be in stock at the hospital",
    "C_PUBLIC": "Only public (free) hospitals are allowed",
    "C_ETA": "The patient must arrive within the maximum ETA",
}
# Clinical-safety groups are never relaxed by a repair.
SAFETY_CONSTRAINTS = frozenset({"C_ICU", "C_VENT", "C_SPEC", "C_BLOOD"})
_ORDER = ("C_ICU", "C_VENT", "C_SPEC", "C_BLOOD", "C_PUBLIC", "C_ETA")


@dataclass(frozen=True)
class FacilitySnapshot:
    id: str
    code: str
    name: str
    tier: Literal["PUBLIC", "PRIVATE", "BLOOD_HUB"]
    lat: float
    lon: float
    specialties: tuple[str, ...]
    icu_available: int
    icu_staffed: int
    vent_available: int
    blood: dict[str, int]
    eta_minutes: float
    distance_km: float
    # Real (staff/feed) counts not refreshed within CAPACITY_STALE_MINUTES.
    stale: bool = False


# Prefer hospitals whose live counts are fresh: stale data might no longer be true.
STALE_PENALTY = 400


@dataclass(frozen=True)
class CareRequest:
    needs_icu: bool = True
    needs_vent: bool = False
    specialty: str | None = None
    blood_type: str | None = None
    blood_units: int = 0
    public_only: bool = False
    max_eta_minutes: float | None = None

    def active_constraints(self) -> tuple[str, ...]:
        active = []
        if self.needs_icu:
            active.append("C_ICU")
        if self.needs_vent:
            active.append("C_VENT")
        if self.specialty:
            active.append("C_SPEC")
        if self.blood_type and self.blood_units > 0:
            active.append("C_BLOOD")
        if self.public_only:
            active.append("C_PUBLIC")
        if self.max_eta_minutes is not None:
            active.append("C_ETA")
        return tuple(active)


@dataclass
class HospitalOption:
    facility_id: str
    code: str
    name: str
    tier: str
    eta_minutes: float
    distance_km: float
    icu_available: int
    vent_available: int
    blood_plan: list[tuple[str, int]] | None
    cost: int


@dataclass
class Repair:
    repair_type: Literal["SPLIT_RESOURCE_CO_DISPATCH", "RELAX_PUBLIC_ONLY", "RELAX_MAX_ETA"]
    title: str
    relaxed: list[str]
    clinical_compromise: bool
    hospital: HospitalOption
    blood_source: dict | None = None
    note: str = ""


@dataclass
class CareMatchResult:
    status: Literal["OPTIMAL", "INFEASIBLE"]
    active_constraints: list[str]
    recommendation: HospitalOption | None
    alternatives: list[HospitalOption] = field(default_factory=list)
    mus_cores: list[list[str]] = field(default_factory=list)
    solver_core: list[str] = field(default_factory=list)
    repairs: list[Repair] = field(default_factory=list)
    wall_time_ms: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #


def _violations(f: FacilitySnapshot, req: CareRequest) -> set[str]:
    """Constraint groups this facility fails (only for groups the request activates)."""
    bad: set[str] = set()
    if req.needs_icu and f.icu_available < 1:
        bad.add("C_ICU")
    if req.needs_vent and f.vent_available < 1:
        bad.add("C_VENT")
    if req.specialty and req.specialty not in f.specialties:
        bad.add("C_SPEC")
    if req.blood_type and req.blood_units > 0 and compatible_units(f.blood, req.blood_type) < req.blood_units:
        bad.add("C_BLOOD")
    if req.public_only and f.tier != "PUBLIC":
        bad.add("C_PUBLIC")
    if req.max_eta_minutes is not None and f.eta_minutes > req.max_eta_minutes:
        bad.add("C_ETA")
    return bad


def _cost(f: FacilitySnapshot, req: CareRequest) -> int:
    eta = int(round(f.eta_minutes * 100))
    load = int(round((1 - f.icu_available / f.icu_staffed) * 250)) if f.icu_staffed else 250
    tier = 300 if f.tier == "PRIVATE" else 0
    blood = 0
    if req.blood_type and req.blood_units > 0:
        plan = allocation_plan(f.blood, req.blood_type, req.blood_units)
        if plan and any(group != req.blood_type for group, _ in plan):
            blood = 200 if any(group == "O-" for group, _ in plan) else 50
    return eta + load + tier + blood + (STALE_PENALTY if f.stale else 0)


def _option(f: FacilitySnapshot, req: CareRequest) -> HospitalOption:
    plan = (
        allocation_plan(f.blood, req.blood_type, req.blood_units)
        if req.blood_type and req.blood_units > 0
        else None
    )
    return HospitalOption(
        facility_id=f.id,
        code=f.code,
        name=f.name,
        tier=f.tier,
        eta_minutes=f.eta_minutes,
        distance_km=f.distance_km,
        icu_available=f.icu_available,
        vent_available=f.vent_available,
        blood_plan=plan,
        cost=_cost(f, req),
    )


def _build_model(
    hospitals: list[FacilitySnapshot], req: CareRequest, enabled: tuple[str, ...]
) -> tuple[cp_model.CpModel, dict[str, cp_model.IntVar], dict[str, cp_model.IntVar]]:
    model = cp_model.CpModel()
    pick = {h.id: model.new_bool_var(f"pick_{h.code}") for h in hospitals}
    model.add_exactly_one(pick.values())
    assume = {c: model.new_bool_var(c) for c in enabled}
    for h in hospitals:
        for c in _violations(h, req) & set(enabled):
            model.add(pick[h.id] == 0).only_enforce_if(assume[c])
    return model, pick, assume


def _solve_optimal(
    hospitals: list[FacilitySnapshot], req: CareRequest, enabled: tuple[str, ...]
) -> FacilitySnapshot | None:
    if not hospitals:
        return None
    model, pick, assume = _build_model(hospitals, req, enabled)
    for lit in assume.values():
        model.add(lit == 1)
    model.minimize(sum(_cost(h, req) * pick[h.id] for h in hospitals))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2.0
    solver.parameters.num_workers = 1  # deterministic results for demos and tests
    if solver.solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    return next(h for h in hospitals if solver.value(pick[h.id]))


def _is_feasible(hospitals: list[FacilitySnapshot], req: CareRequest, subset: tuple[str, ...]) -> bool:
    model, _, assume = _build_model(hospitals, req, subset)
    for lit in assume.values():
        model.add(lit == 1)
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    return solver.solve(model) in (cp_model.OPTIMAL, cp_model.FEASIBLE)


def sufficient_assumptions_core(
    hospitals: list[FacilitySnapshot], req: CareRequest, enabled: tuple[str, ...]
) -> list[str]:
    """CP-SAT's own infeasibility core: presolve off, one worker, no objective."""
    model, _, assume = _build_model(hospitals, req, enabled)
    model.add_assumptions(list(assume.values()))
    solver = cp_model.CpSolver()
    solver.parameters.cp_model_presolve = False
    solver.parameters.num_workers = 1
    solver.parameters.max_time_in_seconds = 2.0
    if solver.solve(model) != cp_model.INFEASIBLE:
        return []
    by_index = {lit.index: code for code, lit in assume.items()}
    return sorted(by_index[i] for i in solver.sufficient_assumptions_for_infeasibility() if i in by_index)


def exact_mus_cores(
    hospitals: list[FacilitySnapshot], req: CareRequest, enabled: tuple[str, ...]
) -> list[list[str]]:
    """All minimal unsatisfiable subsets, found by growing subsets in size order.

    Any infeasible subset with no infeasible proper subset is minimal, so
    skipping supersets of already-found cores yields exactly the MUS family.
    With <= 6 groups this is at most 63 tiny CP-SAT checks.
    """
    cores: list[set[str]] = []
    for size in range(1, len(enabled) + 1):
        for subset in combinations(enabled, size):
            s = set(subset)
            if any(core <= s for core in cores):
                continue
            if not _is_feasible(hospitals, req, subset):
                cores.append(s)
    return [sorted(core, key=_ORDER.index) for core in cores]


def _split_co_dispatch(
    facilities: list[FacilitySnapshot],
    hospitals: list[FacilitySnapshot],
    req: CareRequest,
    enabled: tuple[str, ...],
    courier: Callable[[FacilitySnapshot, FacilitySnapshot], tuple[float, float]],
) -> Repair | None:
    """Two-node CP-SAT: a hospital meeting every rule but blood + a blood source with a courier."""
    if "C_BLOOD" not in enabled:
        return None
    without_blood = tuple(c for c in enabled if c != "C_BLOOD")
    bed_ok = [h for h in hospitals if not (_violations(h, req) & set(without_blood))]
    sources = [
        f for f in facilities if compatible_units(f.blood, req.blood_type) >= req.blood_units
    ]
    pairs: dict[tuple[str, str], tuple[FacilitySnapshot, FacilitySnapshot, float, float, int]] = {}
    for h in bed_ok:
        for b in sources:
            if b.id == h.id:
                continue
            c_km, c_eta = courier(b, h)
            if req.max_eta_minutes is not None and c_eta > req.max_eta_minutes:
                continue  # blood must also arrive inside the window
            plan = allocation_plan(b.blood, req.blood_type, req.blood_units) or []
            o_neg_spent = any(g == "O-" and req.blood_type != "O-" for g, _ in plan)
            score = int(round(h.eta_minutes * 100 + c_eta * 60)) + _cost(h, req) - int(
                round(h.eta_minutes * 100)
            ) + (200 if o_neg_spent else 0)
            pairs[(h.id, b.id)] = (h, b, c_km, c_eta, score)
    if not pairs:
        return None

    model = cp_model.CpModel()
    choose = {k: model.new_bool_var(f"pair_{v[0].code}_{v[1].code}") for k, v in pairs.items()}
    model.add_exactly_one(choose.values())
    model.minimize(sum(v[4] * choose[k] for k, v in pairs.items()))
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = 1
    if solver.solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None
    h, b, c_km, c_eta, _ = pairs[next(k for k, v in choose.items() if solver.value(v))]
    return Repair(
        repair_type="SPLIT_RESOURCE_CO_DISPATCH",
        title="Split-resource co-dispatch: ICU here, blood by courier",
        relaxed=[],
        clinical_compromise=False,
        hospital=_option(h, req),
        blood_source={
            "facility_id": b.id,
            "code": b.code,
            "name": b.name,
            "tier": b.tier,
            "blood_type": req.blood_type,
            "units": req.blood_units,
            "plan": allocation_plan(b.blood, req.blood_type, req.blood_units),
            "courier_distance_km": c_km,
            "courier_eta_minutes": c_eta,
        },
        note="Every rule is met: the patient goes to the ICU and the blood travels separately.",
    )


def _relaxation(
    hospitals: list[FacilitySnapshot], req: CareRequest, enabled: tuple[str, ...], code: str
) -> Repair | None:
    if code not in enabled or code in SAFETY_CONSTRAINTS:
        return None
    best = _solve_optimal(hospitals, req, tuple(c for c in enabled if c != code))
    if best is None:
        return None
    if code == "C_PUBLIC":
        return Repair(
            repair_type="RELAX_PUBLIC_ONLY",
            title="Allow a private hospital",
            relaxed=["C_PUBLIC"],
            clinical_compromise=False,
            hospital=_option(best, req),
            note="Fastest fully equipped option, but the family may face private charges.",
        )
    over = round(best.eta_minutes - (req.max_eta_minutes or 0), 1)
    return Repair(
        repair_type="RELAX_MAX_ETA",
        title=f"Accept a longer trip (+{over} min)",
        relaxed=["C_ETA"],
        clinical_compromise=True,
        hospital=_option(best, req),
        note="All clinical needs are met, but the patient travels beyond the target window.",
    )


def solve_carematch(
    facilities: list[FacilitySnapshot],
    req: CareRequest,
    courier: Callable[[FacilitySnapshot, FacilitySnapshot], tuple[float, float]],
    max_alternatives: int = 3,
) -> CareMatchResult:
    started = time.perf_counter()
    hospitals = [f for f in facilities if f.tier != "BLOOD_HUB"]
    enabled = req.active_constraints()

    best = _solve_optimal(hospitals, req, enabled)
    if best is not None:
        feasible = [h for h in hospitals if not (_violations(h, req) & set(enabled))]
        alternatives = sorted(
            (h for h in feasible if h.id != best.id), key=lambda h: (_cost(h, req), h.code)
        )[:max_alternatives]
        return CareMatchResult(
            status="OPTIMAL",
            active_constraints=list(enabled),
            recommendation=_option(best, req),
            alternatives=[_option(h, req) for h in alternatives],
            wall_time_ms=round((time.perf_counter() - started) * 1000, 2),
        )

    repairs = [
        r
        for r in (
            _split_co_dispatch(facilities, hospitals, req, enabled, courier),
            _relaxation(hospitals, req, enabled, "C_PUBLIC"),
            _relaxation(hospitals, req, enabled, "C_ETA"),
        )
        if r is not None
    ]
    return CareMatchResult(
        status="INFEASIBLE",
        active_constraints=list(enabled),
        recommendation=None,
        mus_cores=exact_mus_cores(hospitals, req, enabled),
        solver_core=sufficient_assumptions_core(hospitals, req, enabled),
        repairs=repairs,
        wall_time_ms=round((time.perf_counter() - started) * 1000, 2),
    )


__all__ = [
    "CONSTRAINT_LABELS",
    "RBC_DONORS",
    "CareMatchResult",
    "CareRequest",
    "FacilitySnapshot",
    "Repair",
    "exact_mus_cores",
    "solve_carematch",
    "sufficient_assumptions_core",
]
