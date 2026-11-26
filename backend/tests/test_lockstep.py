"""Milestone 4: LockStep + RaceLab (A05 concurrency & transaction management)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from httpx import AsyncClient
from sqlalchemy import select, update

from app.db.models import AuditLog, BloodInventory, Facility, HospitalResource, Reservation

DISPATCHER = ("dispatcher@shasthogrid.org", "Dispatcher#2026!")
BMU_ADMIN = ("bmu.admin@shasthogrid.org", "Hospital#2026!")
SYS_ADMIN = ("admin@awaregrid.org", "Admin#2026!")


async def _headers(login_as, creds) -> dict[str, str]:
    token, _ = await login_as(*creds)
    return {"Authorization": f"Bearer {token}"}


def _key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


async def _facility(db_session, code: str) -> SimpleNamespace:
    """Plain values (not an ORM object) so later expire_all() calls can't trigger lazy IO."""
    f = (await db_session.execute(select(Facility).where(Facility.code == code))).scalar_one()
    return SimpleNamespace(id=f.id, code=f.code)


async def _resource(db_session, facility_id, rtype: str) -> HospitalResource:
    db_session.expire_all()
    return (
        await db_session.execute(
            select(HospitalResource).where(
                HospitalResource.facility_id == facility_id, HospitalResource.resource_type == rtype
            )
        )
    ).scalar_one()


async def _blood(db_session, facility_id, group: str) -> BloodInventory:
    db_session.expire_all()
    return (
        await db_session.execute(
            select(BloodInventory).where(
                BloodInventory.facility_id == facility_id, BloodInventory.blood_type == group
            )
        )
    ).scalar_one()


# ------------------------------------------------------------- the A05 race ----


async def test_25_concurrent_requests_for_the_final_bed(client: AsyncClient, login_as, db_session) -> None:
    headers = await _headers(login_as, DISPATCHER)
    reset = (await client.post("/api/v1/racelab/reset", headers=headers)).json()
    assert reset["available_count"] == 1

    async def grab():
        return await client.post(
            "/api/v1/reservations",
            json={"hospital_id": reset["facility_id"]},
            headers={**headers, **_key()},
        )

    responses = await asyncio.gather(*(grab() for _ in range(25)))
    codes = [r.status_code for r in responses]
    assert codes.count(201) == 1, codes
    assert codes.count(409) == 24, codes
    assert all(r.json()["error_code"] == "RESOURCE_EXHAUSTED" for r in responses if r.status_code == 409)

    bed = await _resource(db_session, uuid.UUID(reset["facility_id"]), "ICU_BED")
    assert bed.available_count == 0
    held = (
        await db_session.execute(
            select(Reservation).where(Reservation.icu_resource_id == bed.id, Reservation.status == "HELD")
        )
    ).scalars().all()
    assert len(held) == 1  # zero double bookings

    rejected = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "RESERVATION_RACE_REJECTED"))
    ).scalars().all()
    assert len(rejected) >= 24


async def test_racelab_run_endpoint(client: AsyncClient, login_as) -> None:
    headers = await _headers(login_as, DISPATCHER)
    r = await client.post("/api/v1/racelab/run", json={"concurrency": 25}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["winners"] == 1
    assert body["rejected"] == 24
    assert body["errors"] == 0
    assert body["db_available_after"] == 0
    assert body["double_bookings"] == 0
    assert len(body["attempts"]) == 25


# ------------------------------------------------------------- idempotency ----


async def test_idempotent_replay_tamper_and_missing_key(client: AsyncClient, login_as, db_session) -> None:
    headers = await _headers(login_as, DISPATCHER)
    reset = (await client.post("/api/v1/racelab/reset", headers=headers)).json()
    key = _key()
    body = {"hospital_id": reset["facility_id"]}

    first = await client.post("/api/v1/reservations", json=body, headers={**headers, **key})
    retry = await client.post("/api/v1/reservations", json=body, headers={**headers, **key})
    assert first.status_code == 201 and retry.status_code == 201
    assert retry.headers.get("X-Idempotent-Replay") == "true"
    assert retry.json()["reservation_id"] == first.json()["reservation_id"]
    bed = await _resource(db_session, uuid.UUID(reset["facility_id"]), "ICU_BED")
    assert bed.available_count == 0  # decremented once, not twice

    tampered = await client.post(
        "/api/v1/reservations", json={**body, "needs_vent": True}, headers={**headers, **key}
    )
    assert tampered.status_code == 409
    assert tampered.json()["error_code"] == "IDEMPOTENCY_KEY_CONFLICT"

    missing = await client.post("/api/v1/reservations", json=body, headers=headers)
    assert missing.status_code == 422
    assert missing.json()["error_code"] == "IDEMPOTENCY_KEY_REQUIRED"

    # A lost race is remembered too: same key -> same 409.
    lost_key = _key()
    lost = await client.post("/api/v1/reservations", json=body, headers={**headers, **lost_key})
    again = await client.post("/api/v1/reservations", json=body, headers={**headers, **lost_key})
    assert lost.status_code == again.status_code == 409
    assert again.headers.get("X-Idempotent-Replay") == "true"


# ----------------------------------------------------- split dispatch + atomicity ----


async def test_split_dispatch_is_atomic_and_cancel_restores(client: AsyncClient, login_as, db_session) -> None:
    headers = await _headers(login_as, DISPATCHER)
    bmu, dmch = await _facility(db_session, "BMU"), await _facility(db_session, "DMCH")
    icu0 = (await _resource(db_session, bmu.id, "ICU_BED")).available_count
    vent0 = (await _resource(db_session, bmu.id, "VENTILATOR")).available_count
    oneg0 = await _blood(db_session, dmch.id, "O-")
    o_avail0, o_res0 = oneg0.units_available, oneg0.units_reserved

    r = await client.post(
        "/api/v1/reservations",
        json={
            "hospital_id": str(bmu.id),
            "needs_icu": True,
            "needs_vent": True,
            "blood": {"source_facility_id": str(dmch.id), "blood_type": "O-", "units": 2},
        },
        headers={**headers, **_key()},
    )
    assert r.status_code == 201, r.text
    res = r.json()
    assert res["is_split_dispatch"] is True
    assert res["blood"] == [res["blood"][0]] and res["blood"][0]["units"] == 2
    assert res["blood"][0]["courier_eta_minutes"] < 15

    assert (await _resource(db_session, bmu.id, "ICU_BED")).available_count == icu0 - 1
    assert (await _resource(db_session, bmu.id, "VENTILATOR")).available_count == vent0 - 1
    oneg = await _blood(db_session, dmch.id, "O-")
    assert (oneg.units_available, oneg.units_reserved) == (o_avail0 - 2, o_res0 + 2)

    cancel = await client.post(
        f"/api/v1/reservations/{res['reservation_id']}/transition",
        json={"target_status": "CANCELLED"},
        headers=headers,
    )
    assert cancel.status_code == 200 and cancel.json()["status"] == "CANCELLED"
    assert (await _resource(db_session, bmu.id, "ICU_BED")).available_count == icu0
    assert (await _resource(db_session, bmu.id, "VENTILATOR")).available_count == vent0
    oneg = await _blood(db_session, dmch.id, "O-")
    assert (oneg.units_available, oneg.units_reserved) == (o_avail0, o_res0)


async def test_blood_shortage_rolls_back_the_bed(client: AsyncClient, login_as, db_session) -> None:
    headers = await _headers(login_as, DISPATCHER)
    bmu, dmch = await _facility(db_session, "BMU"), await _facility(db_session, "DMCH")
    icu0 = (await _resource(db_session, bmu.id, "ICU_BED")).available_count

    r = await client.post(
        "/api/v1/reservations",
        json={
            "hospital_id": str(bmu.id),
            "blood": {"source_facility_id": str(dmch.id), "blood_type": "O-", "units": 10},
        },
        headers={**headers, **_key()},
    )
    assert r.status_code == 409 and r.json()["error_code"] == "BLOOD_EXHAUSTED"
    assert (await _resource(db_session, bmu.id, "ICU_BED")).available_count == icu0  # nothing held


async def test_opposing_split_dispatches_never_deadlock(client: AsyncClient, login_as, db_session) -> None:
    """A books Mugda bed + Kurmitola blood while B books Kurmitola bed + Mugda blood, 10x at once."""
    headers = await _headers(login_as, DISPATCHER)
    mugda, kurm = await _facility(db_session, "MUGDA"), await _facility(db_session, "KURMITOLA")

    def body(hospital, source):
        return {
            "hospital_id": str(hospital.id),
            "blood": {"source_facility_id": str(source.id), "blood_type": "A+", "units": 1},
        }

    calls = []
    for _ in range(10):
        calls.append(client.post("/api/v1/reservations", json=body(mugda, kurm), headers={**headers, **_key()}))
        calls.append(client.post("/api/v1/reservations", json=body(kurm, mugda), headers={**headers, **_key()}))
    responses = await asyncio.gather(*calls)

    assert {r.status_code for r in responses} <= {201, 409}, [r.text for r in responses if r.status_code >= 500]
    for r in responses:
        if r.status_code == 201:
            await client.post(
                f"/api/v1/reservations/{r.json()['reservation_id']}/transition",
                json={"target_status": "CANCELLED"},
                headers=headers,
            )


# ------------------------------------------------------------------ lifecycle ----


async def test_lifecycle_roles_and_admission(client: AsyncClient, login_as, db_session) -> None:
    dispatcher = await _headers(login_as, DISPATCHER)
    hospital = await _headers(login_as, BMU_ADMIN)
    bmu, dmch = await _facility(db_session, "BMU"), await _facility(db_session, "DMCH")
    icu_before = (await _resource(db_session, bmu.id, "ICU_BED")).available_count
    blood_before = await _blood(db_session, dmch.id, "O-")
    avail_before, reserved_before = blood_before.units_available, blood_before.units_reserved

    res = (
        await client.post(
            "/api/v1/reservations",
            json={
                "hospital_id": str(bmu.id),
                "blood": {"source_facility_id": str(dmch.id), "blood_type": "O-", "units": 1},
            },
            headers={**dispatcher, **_key()},
        )
    ).json()
    url = f"/api/v1/reservations/{res['reservation_id']}/transition"

    assert (await client.post(url, json={"target_status": "CONFIRMED"}, headers=dispatcher)).status_code == 403
    assert (await client.post(url, json={"target_status": "ADMITTED"}, headers=hospital)).status_code == 409
    assert (await client.post(url, json={"target_status": "CONFIRMED"}, headers=hospital)).json()["status"] == "CONFIRMED"
    assert (await client.post(url, json={"target_status": "EN_ROUTE"}, headers=dispatcher)).json()["status"] == "EN_ROUTE"
    admitted = (await client.post(url, json={"target_status": "ADMITTED"}, headers=hospital)).json()
    assert admitted["status"] == "ADMITTED"
    assert admitted["blood"][0]["status"] == "DELIVERED"

    final = await client.post(url, json={"target_status": "CANCELLED"}, headers=hospital)
    assert final.status_code == 409 and final.json()["error_code"] == "INVALID_TRANSITION"

    # Admission keeps the bed occupied and consumes the blood.
    assert (await _resource(db_session, bmu.id, "ICU_BED")).available_count == icu_before - 1
    blood = await _blood(db_session, dmch.id, "O-")
    assert (blood.units_available, blood.units_reserved) == (avail_before - 1, reserved_before)

    listing = (await client.get("/api/v1/reservations", headers=hospital)).json()["items"]
    assert listing and all(i["hospital_id"] == str(bmu.id) for i in listing)

    # Restore demo stock for later tests.
    await db_session.execute(
        update(HospitalResource)
        .where(HospitalResource.facility_id == bmu.id, HospitalResource.resource_type == "ICU_BED")
        .values(available_count=icu_before)
    )
    await db_session.execute(
        update(BloodInventory)
        .where(BloodInventory.facility_id == dmch.id, BloodInventory.blood_type == "O-")
        .values(units_available=avail_before)
    )
    await db_session.commit()


async def test_sweeper_expires_overdue_holds(client: AsyncClient, login_as, db_session) -> None:
    dispatcher = await _headers(login_as, DISPATCHER)
    admin = await _headers(login_as, SYS_ADMIN)
    reset = (await client.post("/api/v1/racelab/reset", headers=dispatcher)).json()
    res = (
        await client.post(
            "/api/v1/reservations",
            json={"hospital_id": reset["facility_id"]},
            headers={**dispatcher, **_key()},
        )
    ).json()

    await db_session.execute(
        update(Reservation)
        .where(Reservation.id == uuid.UUID(res["reservation_id"]))
        .values(hold_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    )
    await db_session.commit()

    late = await client.post(
        f"/api/v1/reservations/{res['reservation_id']}/transition",
        json={"target_status": "EN_ROUTE"},
        headers=dispatcher,
    )
    assert late.status_code == 409 and late.json()["error_code"] == "HOLD_EXPIRED"

    assert (await client.post("/api/v1/reservations/sweep-expired", headers=dispatcher)).status_code == 403
    swept = await client.post("/api/v1/reservations/sweep-expired", headers=admin)
    assert swept.status_code == 200 and swept.json()["expired"] >= 1

    after = (await client.get(f"/api/v1/reservations/{res['reservation_id']}", headers=dispatcher)).json()
    assert after["status"] == "EXPIRED"
    bed = await _resource(db_session, uuid.UUID(reset["facility_id"]), "ICU_BED")
    assert bed.available_count == 1
