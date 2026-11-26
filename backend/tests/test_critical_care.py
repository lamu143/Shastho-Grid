"""Milestone 2: PulseScore (NEWS2 + ABO/Rh), routing, and the critical-care registry API."""

from __future__ import annotations

import itertools

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.db.models import AuditLog, HospitalResource
from app.services.blood_compat import (
    BLOOD_GROUPS,
    RBC_DONORS,
    allocation_plan,
    can_receive,
    compatible_units,
    donor_cost,
)
from app.services.news2 import News2Input, compute_news2
from app.services.routing import estimate_route, haversine_km

FARMGATE = (23.7572, 90.3900)


def vitals(**overrides):
    base = dict(
        respiration_rate=16,
        spo2=98,
        on_oxygen=False,
        systolic_bp=120,
        pulse=75,
        consciousness="A",
        temperature_c=37.0,
    )
    base.update(overrides)
    return News2Input(**base)


# ---------------------------------------------------------------- NEWS2 ----


def test_news2_normal_is_zero_green() -> None:
    r = compute_news2(vitals())
    assert r.score == 0 and r.acuity == "GREEN_STABLE" and r.red_flags == []


def test_news2_farmgate_case_scores_15_red_critical() -> None:
    r = compute_news2(
        vitals(
            respiration_rate=24,
            spo2=89,
            on_oxygen=True,
            systolic_bp=84,
            pulse=126,
            consciousness="C",
            temperature_c=36.2,
        )
    )
    assert r.score == 15
    assert r.acuity == "RED_CRITICAL"
    assert r.breakdown == {
        "respiration_rate": 2,
        "spo2": 3,
        "air_or_oxygen": 2,
        "systolic_bp": 3,
        "pulse": 2,
        "consciousness": 3,
        "temperature": 0,
    }
    assert r.red_flags == ["consciousness", "spo2", "systolic_bp"]


@pytest.mark.parametrize(
    ("field", "value", "points"),
    [
        ("respiration_rate", 8, 3), ("respiration_rate", 9, 1), ("respiration_rate", 11, 1),
        ("respiration_rate", 12, 0), ("respiration_rate", 20, 0), ("respiration_rate", 21, 2),
        ("respiration_rate", 24, 2), ("respiration_rate", 25, 3),
        ("spo2", 91, 3), ("spo2", 92, 2), ("spo2", 93, 2), ("spo2", 94, 1), ("spo2", 95, 1), ("spo2", 96, 0),
        ("systolic_bp", 90, 3), ("systolic_bp", 91, 2), ("systolic_bp", 100, 2), ("systolic_bp", 101, 1),
        ("systolic_bp", 110, 1), ("systolic_bp", 111, 0), ("systolic_bp", 219, 0), ("systolic_bp", 220, 3),
        ("pulse", 40, 3), ("pulse", 41, 1), ("pulse", 50, 1), ("pulse", 51, 0), ("pulse", 90, 0),
        ("pulse", 91, 1), ("pulse", 110, 1), ("pulse", 111, 2), ("pulse", 130, 2), ("pulse", 131, 3),
        ("temperature_c", 35.0, 3), ("temperature_c", 35.1, 1), ("temperature_c", 36.0, 1),
        ("temperature_c", 36.1, 0), ("temperature_c", 38.0, 0), ("temperature_c", 38.1, 1),
        ("temperature_c", 39.0, 1), ("temperature_c", 39.1, 2),
    ],
)
def test_news2_parameter_boundaries(field: str, value: float, points: int) -> None:
    key = {"temperature_c": "temperature"}.get(field, field)
    assert compute_news2(vitals(**{field: value})).breakdown[key] == points


@pytest.mark.parametrize(
    ("spo2", "on_oxygen", "points"),
    [(83, False, 3), (84, False, 2), (86, True, 1), (88, True, 0), (92, True, 0),
     (93, False, 0), (98, False, 0), (93, True, 1), (95, True, 2), (97, True, 3)],
)
def test_news2_spo2_scale2(spo2: int, on_oxygen: bool, points: int) -> None:
    r = compute_news2(vitals(spo2=spo2, on_oxygen=on_oxygen, spo2_scale2=True))
    assert r.breakdown["spo2"] == points


def test_news2_single_red_parameter_is_yellow_elevated() -> None:
    r = compute_news2(vitals(consciousness="V"))
    assert r.score == 3 and r.acuity == "YELLOW_ELEVATED" and r.clinical_risk == "LOW_MEDIUM"


def test_news2_medium_band_is_orange() -> None:
    r = compute_news2(vitals(respiration_rate=22, pulse=115, temperature_c=38.5))
    assert r.score == 5 and r.acuity == "ORANGE_URGENT"


# --------------------------------------------------------------- ABO/Rh ----


def test_abo_rh_matrix_all_64_pairs() -> None:
    def expected(recipient: str, donor: str) -> bool:
        r_abo, r_rh = recipient[:-1], recipient[-1]
        d_abo, d_rh = donor[:-1], donor[-1]
        abo_ok = d_abo == "O" or d_abo == r_abo or r_abo == "AB"
        rh_ok = d_rh == "-" or r_rh == "+"
        return abo_ok and rh_ok

    pairs = list(itertools.product(BLOOD_GROUPS, BLOOD_GROUPS))
    assert len(pairs) == 64
    for recipient, donor in pairs:
        assert can_receive(recipient, donor) == expected(recipient, donor), (recipient, donor)
    assert sum(can_receive(r, d) for r, d in pairs) == 27


def test_o_negative_is_universal_donor_and_most_expensive_substitute() -> None:
    assert all(can_receive(g, "O-") for g in BLOOD_GROUPS)
    assert RBC_DONORS["O-"] == ("O-",)
    assert donor_cost("A+", "A+") == 0
    assert donor_cost("A+", "O-") > donor_cost("A+", "O+")


def test_allocation_plan_prefers_exact_then_spares_o_negative() -> None:
    stock = {"A+": 1, "O+": 1, "O-": 5}
    assert compatible_units(stock, "A+") == 7
    assert allocation_plan(stock, "A+", 3) == [("A+", 1), ("O+", 1), ("O-", 1)]
    assert allocation_plan(stock, "O-", 6) is None
    assert allocation_plan(stock, "B+", 0) == []


# -------------------------------------------------------------- routing ----


def test_routing_haversine_estimate() -> None:
    assert haversine_km(*FARMGATE, *FARMGATE) == 0
    est = estimate_route(*FARMGATE, 23.7389, 90.3946)  # Farmgate -> BMU
    assert est.source == "haversine_urban"
    assert 2.5 < est.distance_km < 3.2
    assert 6.5 < est.eta_minutes < 9.0


# ------------------------------------------------------------------ API ----


async def _token(login_as, email: str, password: str) -> dict[str, str]:
    token, _ = await login_as(email, password)
    return {"Authorization": f"Bearer {token}"}


async def test_facility_list_requires_auth(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/facilities")).status_code == 401


async def test_facility_list_sorted_by_eta_with_filters(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    r = await client.get(
        "/api/v1/facilities",
        params={"lat": FARMGATE[0], "lon": FARMGATE[1], "sort": "eta"},
        headers=headers,
    )
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 7
    etas = [i["eta_minutes"] for i in items]
    assert etas == sorted(etas)
    assert all(i["data_is_simulated"] for i in items)

    r = await client.get(
        "/api/v1/facilities",
        params={"tier": "PUBLIC", "specialty": "OBSTETRIC", "min_icu": 1, "min_vent": 1},
        headers=headers,
    )
    codes = {i["code"] for i in r.json()["items"]}
    assert codes == {"BMU", "MUGDA", "KURMITOLA"}


async def test_farmgate_case_is_infeasible_at_any_single_public_hospital(
    client: AsyncClient, login_as
) -> None:
    """Seed contract for the CareMatch / ConflictProof demo (milestone 3)."""
    headers = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    r = await client.get(
        "/api/v1/facilities",
        params={
            "lat": FARMGATE[0], "lon": FARMGATE[1], "tier": "PUBLIC", "specialty": "OBSTETRIC",
            "min_icu": 1, "min_vent": 1, "blood_type": "O-", "min_blood_units": 2, "max_eta_minutes": 15,
        },
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["items"] == []


async def test_lat_without_lon_is_rejected(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    r = await client.get("/api/v1/facilities", params={"lat": 23.7}, headers=headers)
    assert r.status_code == 422


async def _facility_id(client: AsyncClient, headers: dict[str, str], code: str) -> str:
    r = await client.get("/api/v1/facilities", params={"q": code}, headers=headers)
    return next(i["id"] for i in r.json()["items"] if i["code"] == code)


async def test_hospital_admin_updates_own_facility_and_is_audited(
    client: AsyncClient, login_as, db_session
) -> None:
    headers = await _token(login_as, "bmu.admin@shasthogrid.org", "Hospital#2026!")
    bmu = await _facility_id(client, headers, "BMU")
    url = f"/api/v1/facilities/{bmu}/resources/HDU_BED"

    r = await client.patch(url, json={"available_count": 4}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["available_count"] == 4

    # Stale version is rejected; then restore the seed value.
    stale = await client.patch(url, json={"available_count": 5, "expected_version": 1}, headers=headers)
    assert stale.status_code == 409
    restore = await client.patch(
        url, json={"available_count": 5, "expected_version": body["version"]}, headers=headers
    )
    assert restore.status_code == 200

    rows = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "RESOURCE_UPDATE"))
    ).scalars().all()
    assert rows


async def test_capacity_invariant_and_mass_assignment_rejected(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "bmu.admin@shasthogrid.org", "Hospital#2026!")
    bmu = await _facility_id(client, headers, "BMU")
    url = f"/api/v1/facilities/{bmu}/resources/ICU_BED"

    over = await client.patch(url, json={"available_count": 999}, headers=headers)
    assert over.status_code == 422
    assert over.json()["error_code"] == "CAPACITY_INVARIANT_VIOLATION"

    extra = await client.patch(url, json={"available_count": 1, "facility_id": "x"}, headers=headers)
    assert extra.status_code == 422


async def test_cross_facility_edit_is_forbidden_and_audited(
    client: AsyncClient, login_as, db_session
) -> None:
    headers = await _token(login_as, "bmu.admin@shasthogrid.org", "Hospital#2026!")
    dmch = await _facility_id(client, headers, "DMCH")

    r = await client.patch(
        f"/api/v1/facilities/{dmch}/resources/ICU_BED", json={"available_count": 1}, headers=headers
    )
    assert r.status_code == 403
    assert r.json()["error_code"] == "FACILITY_SCOPE_VIOLATION"

    denied = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "RESOURCE_UPDATE_DENIED", AuditLog.resource_id == dmch
            )
        )
    ).scalars().all()
    assert denied

    # The DMCH ICU count is unchanged.
    icu = (
        await db_session.execute(
            select(HospitalResource).where(
                HospitalResource.facility_id == denied[0].resource_id,
                HospitalResource.resource_type == "ICU_BED",
            )
        )
    ).scalar_one()
    assert icu.available_count == 0


async def test_wrong_role_cannot_edit_blood(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "bmu.admin@shasthogrid.org", "Hospital#2026!")
    dmch = await _facility_id(client, headers, "DMCH")
    r = await client.patch(
        f"/api/v1/facilities/{dmch}/blood/O-", json={"units_available": 1}, headers=headers
    )
    assert r.status_code == 403
    assert r.json()["error_code"] == "FORBIDDEN_ROLE"


async def test_blood_officer_updates_own_bank(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "dmch.blood@shasthogrid.org", "BloodBank#2026!")
    dmch = await _facility_id(client, headers, "DMCH")
    url = f"/api/v1/facilities/{dmch}/blood/AB-"
    r = await client.patch(url, json={"units_available": 3}, headers=headers)
    assert r.status_code == 200 and r.json()["units_available"] == 3
    await client.patch(url, json={"units_available": 1}, headers=headers)


async def test_critical_care_summary(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "admin@awaregrid.org", "Admin#2026!")
    r = await client.get("/api/v1/critical-care/summary", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["facilities"] == 7
    assert data["icu_physical"] > data["icu_staffed"] >= data["icu_available"]
    assert data["icu_idle_unstaffed"] == data["icu_physical"] - data["icu_staffed"]
    assert "AB-" in data["scarce_blood_groups"]


async def test_pulsescore_endpoints(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    r = await client.post(
        "/api/v1/pulsescore/news2",
        json={
            "respiration_rate": 24, "spo2": 89, "on_oxygen": True, "systolic_bp": 84,
            "pulse": 126, "consciousness": "C", "temperature_c": 36.2,
        },
        headers=headers,
    )
    assert r.status_code == 200 and r.json()["score"] == 15

    bad = await client.post(
        "/api/v1/pulsescore/news2",
        json={
            "respiration_rate": 24, "spo2": 130, "on_oxygen": True, "systolic_bp": 84,
            "pulse": 126, "consciousness": "C", "temperature_c": 36.2,
        },
        headers=headers,
    )
    assert bad.status_code == 422

    compat = await client.get("/api/v1/pulsescore/blood-compatibility/A-", headers=headers)
    assert compat.json()["preferred_order"] == ["A-", "O-"]


# ----------------------------------------------------- CareMatch / ConflictProof ----

FARMGATE_CASE = {
    "incident_lat": FARMGATE[0],
    "incident_lon": FARMGATE[1],
    "vitals": {
        "respiration_rate": 24, "spo2": 89, "on_oxygen": True, "systolic_bp": 84,
        "pulse": 126, "consciousness": "C", "temperature_c": 36.2,
    },
    "needs_icu": True,
    "needs_vent": True,
    "specialty": "OBSTETRIC",
    "blood_type": "O-",
    "blood_units": 2,
    "public_only": True,
    "max_eta_minutes": 15,
}


async def test_carematch_farmgate_conflictproof_and_split_dispatch(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    r = await client.post("/api/v1/carematch/optimize", json=FARMGATE_CASE, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["status"] == "INFEASIBLE"
    assert body["news2"]["score"] == 15
    assert body["recommendation"] is None
    assert body["requires_human_approval"] is True

    proof = body["conflict_proof"]
    # Both minimal conflict sets: ICU and ventilator clash with blood/public/ETA the same way.
    assert proof["mus_cores"] == [
        ["C_ICU", "C_BLOOD", "C_PUBLIC", "C_ETA"],
        ["C_VENT", "C_BLOOD", "C_PUBLIC", "C_ETA"],
    ]
    # CP-SAT's own core is one of them.
    assert sorted(proof["solver_core"]) in [sorted(c) for c in proof["mus_cores"]]

    repairs = {rep["repair_type"]: rep for rep in proof["repairs"]}
    split = repairs["SPLIT_RESOURCE_CO_DISPATCH"]
    assert split["hospital"]["code"] == "BMU"
    assert split["blood_source"]["code"] == "DMCH"
    assert split["blood_source"]["courier_eta_minutes"] <= 15
    assert split["clinical_compromise"] is False and split["relaxed"] == []
    assert repairs["RELAX_PUBLIC_ONLY"]["hospital"]["code"] == "SQUARE"
    assert repairs["RELAX_MAX_ETA"]["hospital"]["code"] == "MUGDA"
    assert repairs["RELAX_MAX_ETA"]["clinical_compromise"] is True
    # Clinical safety rules are never relaxed.
    for rep in proof["repairs"]:
        assert not set(rep["relaxed"]) & {"C_ICU", "C_VENT", "C_SPEC", "C_BLOOD"}

    stored = await client.get(f"/api/v1/carematch/{body['triage_request_id']}", headers=headers)
    assert stored.status_code == 200
    assert stored.json()["conflict_proof"]["mus_cores"] == proof["mus_cores"]


async def test_carematch_mus_is_minimal(client: AsyncClient, login_as) -> None:
    """Dropping any one rule from each conflict set makes the request feasible."""
    headers = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    drop = {
        "C_ICU": {"needs_icu": False},
        "C_VENT": {"needs_vent": False},
        "C_BLOOD": {"blood_units": 0, "blood_type": None},
        "C_PUBLIC": {"public_only": False},
        "C_ETA": {"max_eta_minutes": None},
    }
    # With both ICU and ventilator in separate cores, dropping only one of them stays infeasible.
    for code, patch in drop.items():
        r = await client.post(
            "/api/v1/carematch/optimize", json={**FARMGATE_CASE, **patch}, headers=headers
        )
        expected = "INFEASIBLE" if code in {"C_ICU", "C_VENT"} else "OPTIMAL"
        assert r.json()["status"] == expected, (code, r.json()["status"])
    both = await client.post(
        "/api/v1/carematch/optimize",
        json={**FARMGATE_CASE, "needs_icu": False, "needs_vent": False},
        headers=headers,
    )
    assert both.json()["status"] == "OPTIMAL"


async def test_carematch_feasible_returns_best_and_alternatives(client: AsyncClient, login_as) -> None:
    headers = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    r = await client.post(
        "/api/v1/carematch/optimize",
        json={
            "incident_lat": FARMGATE[0], "incident_lon": FARMGATE[1],
            "needs_icu": True, "specialty": "NEURO", "public_only": True, "max_eta_minutes": 20,
        },
        headers=headers,
    )
    body = r.json()
    assert body["status"] == "OPTIMAL"
    assert body["recommendation"]["code"] == "BMU"
    assert body["conflict_proof"] is None
    assert [a["code"] for a in body["alternatives"]] == ["NINS"]
    assert body["wall_time_ms"] < 2000


async def test_carematch_access_and_validation(client: AsyncClient, login_as) -> None:
    officer = await _token(login_as, "bmu.admin@shasthogrid.org", "Hospital#2026!")
    r = await client.post("/api/v1/carematch/optimize", json=FARMGATE_CASE, headers=officer)
    assert r.status_code == 403

    dispatcher = await _token(login_as, "dispatcher@shasthogrid.org", "Dispatcher#2026!")
    bad = await client.post(
        "/api/v1/carematch/optimize",
        json={**FARMGATE_CASE, "blood_type": None},
        headers=dispatcher,
    )
    assert bad.status_code == 422
    outside = await client.post(
        "/api/v1/carematch/optimize", json={**FARMGATE_CASE, "incident_lat": 51.5}, headers=dispatcher
    )
    assert outside.status_code == 422
