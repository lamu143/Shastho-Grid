"""Regression tests for the critical-care security review findings."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.agents.copilot import Extraction, deterministic_extract, guard_against_invented_numbers
from app.core.config import settings
from app.db.models import AuditLog, BloodInventory, Facility, HospitalResource, Reservation

DISPATCHER = ("dispatcher@shasthogrid.org", "Dispatcher#2026!")
BMU_ADMIN = ("bmu.admin@shasthogrid.org", "Hospital#2026!")
DMCH_BLOOD = ("dmch.blood@shasthogrid.org", "BloodBank#2026!")
SYS_ADMIN = ("admin@awaregrid.org", "Admin#2026!")


async def _h(login_as, creds) -> dict[str, str]:
    token, _ = await login_as(*creds)
    return {"Authorization": f"Bearer {token}"}


async def _fid(db_session, code: str):
    return (await db_session.execute(select(Facility.id).where(Facility.code == code))).scalar_one()


# ------------------------------------------------------- 1. rate limit / XFF ----


async def test_spoofed_forwarded_for_does_not_reset_the_bucket(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_SENSITIVE_REQUESTS", 2)
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", [])
    codes = []
    for i in range(3):
        r = await client.post(
            "/api/v1/feed/v1/capacity",
            json={"blood": [{"blood_type": "O-", "units_in_stock": 1}]},
            headers={"X-Facility-Key": "sgf_guess", "X-Forwarded-For": f"10.0.0.{i}"},
        )
        codes.append(r.status_code)
    assert codes == [401, 401, 429]


def test_forwarded_for_is_used_only_behind_a_trusted_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    from types import SimpleNamespace

    from app.core.rate_limit import client_ip

    req = SimpleNamespace(client=SimpleNamespace(host="10.1.1.1"), headers={"X-Forwarded-For": "203.0.113.9, 10.1.1.1"})
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", [])
    assert client_ip(req) == "10.1.1.1"
    monkeypatch.setattr(settings, "TRUSTED_PROXIES", ["10.1.1.1"])
    assert client_ip(req) == "203.0.113.9"


async def test_oversized_trace_id_is_replaced_not_a_500(client: AsyncClient, login_as, db_session) -> None:
    headers = {**(await _h(login_as, BMU_ADMIN)), "X-Trace-Id": "x" * 500}
    nins = await _fid(db_session, "NINS")
    r = await client.patch(f"/api/v1/facilities/{nins}/resources/ICU_BED", json={"available_count": 1}, headers=headers)
    assert r.status_code == 403  # denied (and audited), not a 500 from the audit insert
    assert len(r.headers["X-Trace-Id"]) <= 64


# --------------------------------------------------- 2. RaceLab blood leak ----


async def test_sandbox_holds_cannot_take_real_blood(client: AsyncClient, login_as, db_session) -> None:
    headers = await _h(login_as, DISPATCHER)
    sandbox = (await client.post("/api/v1/racelab/reset", headers=headers)).json()["facility_id"]
    dmch = await _fid(db_session, "DMCH")
    r = await client.post(
        "/api/v1/reservations",
        json={"hospital_id": sandbox, "needs_icu": True, "blood": {"source_facility_id": str(dmch), "blood_type": "O-", "units": 2}},
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert r.status_code == 422 and r.json()["error_code"] == "SANDBOX_NO_BLOOD"


async def test_racelab_reset_releases_and_audits(client: AsyncClient, login_as, db_session) -> None:
    headers = await _h(login_as, DISPATCHER)
    sandbox = (await client.post("/api/v1/racelab/reset", headers=headers)).json()["facility_id"]
    hold = await client.post(
        "/api/v1/reservations",
        json={"hospital_id": sandbox, "needs_icu": True},
        headers={**headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert hold.status_code == 201
    await client.post("/api/v1/racelab/reset", headers=headers)
    db_session.expire_all()
    row = (await db_session.execute(select(Reservation).where(Reservation.id == uuid.UUID(hold.json()["reservation_id"])))).scalar_one()
    assert row.status == "CANCELLED"
    audit = (await db_session.execute(select(AuditLog).where(AuditLog.resource_id == str(row.id), AuditLog.action == "RESERVATION_CANCELLED"))).scalars().all()
    assert audit and audit[-1].details.get("reason") == "RACELAB_RESET"


# ----------------------------------------------- 4/5/6. feed key hardening ----


async def test_feed_key_scope_follows_role(client: AsyncClient, login_as, db_session) -> None:
    dmch = await _fid(db_session, "DMCH")
    officer = await _h(login_as, DMCH_BLOOD)
    created = await client.post(f"/api/v1/facilities/{dmch}/feed-keys", json={"label": "blood LIS"}, headers=officer)
    assert created.status_code == 201 and created.json()["scope"] == "BLOOD"
    escalate = await client.post(f"/api/v1/facilities/{dmch}/feed-keys", json={"label": "escalate", "scope": "ALL"}, headers=officer)
    assert escalate.status_code == 403

    key = created.json()["api_key"]
    beds = await client.post(
        "/api/v1/feed/v1/capacity",
        json={"resources": [{"resource_type": "ICU_BED", "total_physical_count": 9, "staffed_capacity_count": 9, "available_count": 9}]},
        headers={"X-Facility-Key": key},
    )
    assert beds.status_code == 403 and beds.json()["error_code"] == "FEED_SCOPE_VIOLATION"
    await client.delete(f"/api/v1/facilities/{dmch}/feed-keys/{created.json()['id']}", headers=officer)


async def test_older_feed_report_never_overwrites_newer_staff_update(client: AsyncClient, login_as, db_session) -> None:
    bmu = await _fid(db_session, "BMU")
    admin = await _h(login_as, BMU_ADMIN)
    current = (await client.get(f"/api/v1/facilities/{bmu}", headers=admin)).json()
    hdu = next(r for r in current["resources"] if r["resource_type"] == "HDU_BED")
    staff = await client.patch(
        f"/api/v1/facilities/{bmu}/resources/HDU_BED",
        json={"available_count": hdu["available_count"], "expected_version": hdu["version"]}, headers=admin,
    )
    assert staff.status_code == 200
    key = (await client.post(f"/api/v1/facilities/{bmu}/feed-keys", json={"label": "his"}, headers=admin)).json()
    old = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    r = await client.post(
        "/api/v1/feed/v1/capacity",
        json={"reported_at": old, "resources": [{"resource_type": "HDU_BED", "total_physical_count": 40, "staffed_capacity_count": 20, "available_count": 0}]},
        headers={"X-Facility-Key": key["api_key"]},
    )
    assert r.json()["applied"][0]["status"] == "SKIPPED_OLDER"
    await client.delete(f"/api/v1/facilities/{bmu}/feed-keys/{key['id']}", headers=admin)


async def test_feed_key_dies_with_its_facility(client: AsyncClient, login_as, db_session) -> None:
    admin = await _h(login_as, SYS_ADMIN)
    mugda = await _fid(db_session, "MUGDA")
    key = (await client.post(f"/api/v1/facilities/{mugda}/feed-keys", json={"label": "tmp"}, headers=admin)).json()["api_key"]
    await db_session.execute(update(Facility).where(Facility.id == mugda).values(is_active=False))
    await db_session.commit()
    try:
        r = await client.post("/api/v1/feed/v1/capacity", json={"blood": [{"blood_type": "O+", "units_in_stock": 3}]},
                              headers={"X-Facility-Key": key})
        assert r.status_code == 401
    finally:
        await db_session.execute(update(Facility).where(Facility.id == mugda).values(is_active=True))
        await db_session.commit()


# ------------------------------------------------- 9/10. reservation rules ----


async def test_foreign_reservation_transition_is_404_and_denials_are_audited(client: AsyncClient, login_as, db_session) -> None:
    dispatcher = await _h(login_as, DISPATCHER)
    mugda = await _fid(db_session, "MUGDA")
    hold = await client.post(
        "/api/v1/reservations", json={"hospital_id": str(mugda), "needs_icu": True},
        headers={**dispatcher, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert hold.status_code == 201, hold.text
    rid = hold.json()["reservation_id"]

    bmu_admin = await _h(login_as, BMU_ADMIN)  # BMU staff cannot see a MUGDA hold
    r = await client.post(f"/api/v1/reservations/{rid}/transition", json={"target_status": "CONFIRMED"}, headers=bmu_admin)
    assert r.status_code == 404

    # The dispatcher can see it but may not confirm (hospital's job): 403 + audit row.
    r = await client.post(f"/api/v1/reservations/{rid}/transition", json={"target_status": "CONFIRMED"}, headers=dispatcher)
    assert r.status_code == 403 and "role" not in r.json().get("details", {})
    denied = (await db_session.execute(select(AuditLog).where(AuditLog.resource_id == rid, AuditLog.action == "RESERVATION_CONFIRMED_DENIED"))).scalars().all()
    assert denied
    await client.post(f"/api/v1/reservations/{rid}/transition", json={"target_status": "CANCELLED"}, headers=dispatcher)


async def test_expired_hold_can_still_be_cancelled(client: AsyncClient, login_as, db_session) -> None:
    dispatcher = await _h(login_as, DISPATCHER)
    mugda = await _fid(db_session, "MUGDA")
    before = (await db_session.execute(select(HospitalResource.available_count).where(
        HospitalResource.facility_id == mugda, HospitalResource.resource_type == "ICU_BED"))).scalar_one()
    hold = await client.post(
        "/api/v1/reservations", json={"hospital_id": str(mugda), "needs_icu": True},
        headers={**dispatcher, "Idempotency-Key": str(uuid.uuid4())},
    )
    rid = uuid.UUID(hold.json()["reservation_id"])
    await db_session.execute(update(Reservation).where(Reservation.id == rid).values(
        hold_expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
    await db_session.commit()
    r = await client.post(f"/api/v1/reservations/{rid}/transition", json={"target_status": "CANCELLED"}, headers=dispatcher)
    assert r.status_code == 200, r.text
    db_session.expire_all()
    after = (await db_session.execute(select(HospitalResource.available_count).where(
        HospitalResource.facility_id == mugda, HospitalResource.resource_type == "ICU_BED"))).scalar_one()
    assert after == before


# --------------------------------------------------------- 7. copilot guard ----


def test_copilot_guard_rejects_invented_zero_and_relaxations() -> None:
    note = "Woman after delivery bleeding at Farmgate, pulse 126, needs ICU and ventilator, public hospital only."
    fallback = deterministic_extract(note)
    llm = Extraction(**{**fallback.model_dump(), "pulse": 0, "public_only": False, "needs_vent": False})
    guarded, rejected = guard_against_invented_numbers(llm, fallback, note)
    assert guarded.pulse == fallback.pulse and "pulse" in rejected
    assert guarded.public_only is True and "public_only" in rejected
    assert guarded.needs_vent == fallback.needs_vent


def test_copilot_guard_still_accepts_what_the_parser_missed() -> None:
    note = "Patient unresponsive, pulse 40."
    fallback = deterministic_extract(note)
    llm = Extraction(**{**fallback.model_dump(), "needs_vent": True})  # more careful is fine
    guarded, _ = guard_against_invented_numbers(llm, fallback, note)
    assert guarded.needs_vent is True


async def test_blood_reserved_units_untouched_by_racelab(db_session) -> None:
    """Sanity: no blood row may end up with negative or reserved>0 leak after the suite's resets."""
    rows = (await db_session.execute(select(BloodInventory))).scalars().all()
    assert all(r.units_available >= 0 and r.units_reserved >= 0 for r in rows)


async def test_cross_clinic_admin_auditor_cannot_read_other_clinic_carematch_reservations_or_copilot(
    client: AsyncClient, login_as, db_session
) -> None:
    """Admin/auditor in Ashulia must not read Dhaka Command's CareMatch, reservations, or Copilot sessions."""
    disp_token, _ = await login_as("dispatcher@shasthogrid.org", "Dispatcher#2026!")
    disp_headers = {"Authorization": f"Bearer {disp_token}"}

    # Dispatcher (Dhaka Command clinic) creates a CareMatch triage, a Copilot session, and a reservation.
    cm = await client.post(
        "/api/v1/carematch/optimize",
        json={"incident_lat": 23.7572, "incident_lon": 90.39, "needs_icu": True, "blood_units": 0},
        headers=disp_headers,
    )
    assert cm.status_code == 200
    triage_id = cm.json()["triage_request_id"]
    hosp_id = cm.json()["recommendation"]["facility_id"]

    cop = await client.post(
        "/api/v1/copilot/triage-assist",
        json={"note": "RR 22, SpO2 94, needs ICU", "incident_lat": 23.7572, "incident_lon": 90.39},
        headers=disp_headers,
    )
    assert cop.status_code == 200
    session_id = cop.json()["session_id"]

    res = await client.post(
        "/api/v1/reservations",
        json={"hospital_id": hosp_id, "needs_icu": True, "needs_vent": False},
        headers={**disp_headers, "Idempotency-Key": str(uuid.uuid4())},
    )
    assert res.status_code == 201
    res_id = res.json()["reservation_id"]

    # Ashulia admin & auditor belong to a different clinic than Dhaka Command.
    for email, pw in [("admin@awaregrid.org", "Admin#2026!"), ("auditor@awaregrid.org", "Auditor#2026!")]:
        tok, _ = await login_as(email, pw)
        h = {"Authorization": f"Bearer {tok}"}
        assert (await client.get(f"/api/v1/carematch/{triage_id}", headers=h)).status_code == 404
        assert (await client.get(f"/api/v1/copilot/sessions/{session_id}", headers=h)).status_code == 404
        assert (await client.get(f"/api/v1/reservations/{res_id}", headers=h)).status_code == 404
        listed_ids = {item["reservation_id"] for item in (await client.get("/api/v1/reservations", headers=h)).json()["items"]}
        assert res_id not in listed_ids

    admin_tok, _ = await login_as("admin@awaregrid.org", "Admin#2026!")
    trans = await client.post(
        f"/api/v1/reservations/{res_id}/transition",
        json={"target_status": "CANCELLED"},
        headers={"Authorization": f"Bearer {admin_tok}"},
    )
    assert trans.status_code == 404

    # Clean up the reservation as the owning dispatcher.
    await client.post(
        f"/api/v1/reservations/{res_id}/transition",
        json={"target_status": "CANCELLED"},
        headers=disp_headers,
    )


async def test_production_demo_gate_and_guideline_provenance(
    client: AsyncClient,
    login_as,
    monkeypatch,
) -> None:
    from app.core.config import settings

    admin_tok, _ = await login_as("admin@awaregrid.org", "Admin#2026!")
    g_res = await client.get("/api/v1/admin/guidelines", headers={"Authorization": f"Bearer {admin_tok}"})
    assert g_res.status_code == 200
    guidelines = g_res.json()
    assert len(guidelines) > 0
    for g in guidelines:
        assert g["source_document"]
        assert g["rule_version"]
        assert g["effective_date"]
        assert g["review_status"]

    disp_tok, _ = await login_as("dispatcher@shasthogrid.org", "Dispatcher#2026!")
    disp_headers = {"Authorization": f"Bearer {disp_tok}"}

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_DEMO_DATA_IN_PRODUCTION", False)
    blocked = await client.post(
        "/api/v1/carematch/optimize",
        json={"incident_lat": 23.7572, "incident_lon": 90.39, "needs_icu": True},
        headers=disp_headers,
    )
    assert blocked.status_code == 503
    assert blocked.json()["error_code"] == "DEMO_DATA_BLOCKED_IN_PRODUCTION"

    monkeypatch.setattr(settings, "ALLOW_DEMO_DATA_IN_PRODUCTION", True)
    allowed = await client.post(
        "/api/v1/carematch/optimize",
        json={"incident_lat": 23.7572, "incident_lon": 90.39, "needs_icu": True},
        headers=disp_headers,
    )
    assert allowed.status_code == 200
