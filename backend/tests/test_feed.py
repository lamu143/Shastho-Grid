"""Live capacity feed: per-facility API keys, ingestion, provenance and staleness."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, update

from app.db.models import AuditLog, BloodInventory, Facility, FacilityFeedKey, HospitalResource
from app.services.carematch import CareRequest, FacilitySnapshot, solve_carematch

SYS_ADMIN = ("admin@awaregrid.org", "Admin#2026!")
BMU_ADMIN = ("bmu.admin@shasthogrid.org", "Hospital#2026!")
DISPATCHER = ("dispatcher@shasthogrid.org", "Dispatcher#2026!")
FARMGATE = (23.7572, 90.3900)


async def _headers(login_as, creds) -> dict[str, str]:
    token, _ = await login_as(*creds)
    return {"Authorization": f"Bearer {token}"}


async def _facility_id(db_session, code: str):
    return (await db_session.execute(select(Facility.id).where(Facility.code == code))).scalar_one()


@pytest_asyncio.fixture
async def restore_nins(db_session):
    """Feed tests write to NINS; put its seed values and provenance back afterwards."""
    fid = await _facility_id(db_session, "NINS")
    res = (await db_session.execute(select(HospitalResource).where(HospitalResource.facility_id == fid))).scalars().all()
    blood = (await db_session.execute(select(BloodInventory).where(BloodInventory.facility_id == fid))).scalars().all()
    snap_r = [(r.id, r.total_physical_count, r.staffed_capacity_count, r.available_count) for r in res]
    snap_b = [(b.id, b.units_available, b.nearest_expiry_date) for b in blood]
    yield fid
    for rid, phys, staffed, avail in snap_r:
        await db_session.execute(
            update(HospitalResource).where(HospitalResource.id == rid).values(
                total_physical_count=phys, staffed_capacity_count=staffed, available_count=avail,
                data_source="SEED_DEMO", reported_at=None,
            )
        )
    for bid, units, expiry in snap_b:
        await db_session.execute(
            update(BloodInventory).where(BloodInventory.id == bid).values(
                units_available=units, nearest_expiry_date=expiry, data_source="SEED_DEMO", reported_at=None,
            )
        )
    await db_session.commit()


async def _new_key(client, headers, fid) -> str:
    r = await client.post(f"/api/v1/facilities/{fid}/feed-keys", json={"label": "HIS integration"}, headers=headers)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["api_key"].startswith("sgf_") and body["key_prefix"] == body["api_key"][:12]
    return body["api_key"]


async def test_key_is_hashed_and_shown_once(client: AsyncClient, login_as, db_session, restore_nins) -> None:
    headers = await _headers(login_as, SYS_ADMIN)
    key = await _new_key(client, headers, restore_nins)
    stored = (await db_session.execute(select(FacilityFeedKey).where(FacilityFeedKey.facility_id == restore_nins))).scalars().all()
    assert stored and all(k.key_hash != key and len(k.key_hash) == 64 for k in stored)

    listed = await client.get(f"/api/v1/facilities/{restore_nins}/feed-keys", headers=headers)
    assert listed.status_code == 200
    assert all("api_key" not in item and "key_hash" not in item for item in listed.json()["items"])


async def test_officer_cannot_issue_keys_for_another_facility(client: AsyncClient, login_as, db_session) -> None:
    headers = await _headers(login_as, BMU_ADMIN)
    nins = await _facility_id(db_session, "NINS")
    r = await client.post(f"/api/v1/facilities/{nins}/feed-keys", json={"label": "sneaky"}, headers=headers)
    assert r.status_code == 403
    denied = (await db_session.execute(select(AuditLog).where(AuditLog.action == "FEED_KEY_CREATE_DENIED"))).scalars().all()
    assert denied

    dispatcher = await _headers(login_as, DISPATCHER)
    assert (await client.post(f"/api/v1/facilities/{nins}/feed-keys", json={"label": "x"}, headers=dispatcher)).status_code == 403


async def test_feed_push_updates_counts_and_marks_live(client: AsyncClient, login_as, db_session, restore_nins) -> None:
    headers = await _headers(login_as, SYS_ADMIN)
    key = await _new_key(client, headers, restore_nins)

    r = await client.post(
        "/api/v1/feed/v1/capacity",
        json={
            "resources": [{"resource_type": "ICU_BED", "total_physical_count": 30,
                           "staffed_capacity_count": 24, "available_count": 5}],
            "blood": [{"blood_type": "O+", "units_in_stock": 9}],
        },
        headers={"X-Facility-Key": key},
    )
    assert r.status_code == 200, r.text
    rows = {row["code"]: row for row in r.json()["applied"]}
    assert rows["ICU_BED"]["status"] == "APPLIED" and rows["ICU_BED"]["available_now"] == 5

    db_session.expire_all()
    icu = (await db_session.execute(select(HospitalResource).where(
        HospitalResource.facility_id == restore_nins, HospitalResource.resource_type == "ICU_BED"))).scalar_one()
    assert (icu.staffed_capacity_count, icu.available_count, icu.data_source) == (24, 5, "FEED")
    assert icu.reported_at is not None

    listing = await client.get("/api/v1/facilities", params={"q": "NINS"}, headers=headers)
    nins = next(i for i in listing.json()["items"] if i["code"] == "NINS")
    assert nins["data_freshness"] == "LIVE" and nins["last_updated_at"] is not None

    pushes = (await db_session.execute(select(AuditLog).where(AuditLog.action == "FEED_CAPACITY_PUSH"))).scalars().all()
    assert pushes and pushes[-1].details["key_prefix"] == key[:12]


async def test_feed_rejects_bad_keys_and_bad_counts(client: AsyncClient, login_as, restore_nins) -> None:
    headers = await _headers(login_as, SYS_ADMIN)
    body = {"resources": [{"resource_type": "ICU_BED", "total_physical_count": 10,
                           "staffed_capacity_count": 8, "available_count": 3}]}
    assert (await client.post("/api/v1/feed/v1/capacity", json=body)).status_code == 401
    assert (await client.post("/api/v1/feed/v1/capacity", json=body,
                              headers={"X-Facility-Key": "sgf_not-a-real-key"})).status_code == 401

    key = await _new_key(client, headers, restore_nins)
    bad = {"resources": [{"resource_type": "ICU_BED", "total_physical_count": 5,
                          "staffed_capacity_count": 8, "available_count": 3}]}
    assert (await client.post("/api/v1/feed/v1/capacity", json=bad, headers={"X-Facility-Key": key})).status_code == 422
    future = {**body, "reported_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()}
    assert (await client.post("/api/v1/feed/v1/capacity", json=future, headers={"X-Facility-Key": key})).status_code == 422

    # Revoked keys stop working immediately.
    key_id = (await client.get(f"/api/v1/facilities/{restore_nins}/feed-keys", headers=headers)).json()["items"][0]["id"]
    assert (await client.delete(f"/api/v1/facilities/{restore_nins}/feed-keys/{key_id}", headers=headers)).status_code == 200
    assert (await client.post("/api/v1/feed/v1/capacity", json=body, headers={"X-Facility-Key": key})).status_code == 401


async def test_out_of_order_report_is_skipped(client: AsyncClient, login_as, restore_nins) -> None:
    headers = await _headers(login_as, SYS_ADMIN)
    key = await _new_key(client, headers, restore_nins)
    now = datetime.now(timezone.utc)

    def report(avail: int, at: datetime) -> dict:
        return {"reported_at": at.isoformat(), "resources": [{"resource_type": "ICU_BED",
                "total_physical_count": 30, "staffed_capacity_count": 20, "available_count": avail}]}

    first = await client.post("/api/v1/feed/v1/capacity", json=report(7, now), headers={"X-Facility-Key": key})
    assert first.json()["applied"][0]["status"] == "APPLIED"
    late = await client.post("/api/v1/feed/v1/capacity", json=report(1, now - timedelta(minutes=10)),
                             headers={"X-Facility-Key": key})
    row = late.json()["applied"][0]
    assert row["status"] == "SKIPPED_OLDER" and row["available_now"] == 7


async def test_feed_subtracts_shasthogrid_holds(client: AsyncClient, login_as, restore_nins) -> None:
    """A bed held by a dispatcher is not yet in the hospital's census, so it must not be resold."""
    dispatcher = await _headers(login_as, DISPATCHER)
    hold = await client.post(
        "/api/v1/reservations",
        json={"hospital_id": str(restore_nins), "needs_icu": True, "needs_vent": False, "blood": None},
        headers={**dispatcher, "Idempotency-Key": "feed-hold-test-0001"},
    )
    assert hold.status_code == 201, hold.text

    admin = await _headers(login_as, SYS_ADMIN)
    key = await _new_key(client, admin, restore_nins)
    r = await client.post(
        "/api/v1/feed/v1/capacity",
        json={"resources": [{"resource_type": "ICU_BED", "total_physical_count": 30,
                             "staffed_capacity_count": 20, "available_count": 4}]},
        headers={"X-Facility-Key": key},
    )
    row = r.json()["applied"][0]
    assert row["held_by_shasthogrid"] >= 1
    assert row["available_now"] == 4 - row["held_by_shasthogrid"]

    cancel = await client.post(
        f"/api/v1/reservations/{hold.json()['reservation_id']}/transition",
        json={"target_status": "CANCELLED"}, headers=dispatcher,
    )
    assert cancel.status_code == 200, cancel.text


async def test_stale_real_data_is_flagged_in_carematch(client: AsyncClient, login_as, db_session, restore_nins) -> None:
    await db_session.execute(
        update(HospitalResource).where(HospitalResource.facility_id == restore_nins).values(
            data_source="FEED", reported_at=datetime.now(timezone.utc) - timedelta(days=1))
    )
    await db_session.commit()
    headers = await _headers(login_as, DISPATCHER)
    r = await client.post(
        "/api/v1/carematch/optimize",
        json={"incident_lat": FARMGATE[0], "incident_lon": FARMGATE[1], "needs_icu": True,
              "specialty": "NEURO", "public_only": True, "max_eta_minutes": 20},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert "NINS" in r.json()["stale_facilities"]


def _snap(code: str, eta: float, stale: bool) -> FacilitySnapshot:
    return FacilitySnapshot(
        id=code, code=code, name=code, tier="PUBLIC", lat=23.7, lon=90.4, specialties=("NEURO",),
        icu_available=3, icu_staffed=10, vent_available=1, blood={}, eta_minutes=eta, distance_km=eta / 2,
        stale=stale,
    )


def test_stale_penalty_prefers_fresh_hospital_when_close() -> None:
    req = CareRequest(needs_icu=True)
    fresh_far = _snap("FRESH", 9.0, stale=False)
    stale_near = _snap("STALE", 7.0, stale=True)
    result = solve_carematch([stale_near, fresh_far], req, courier=lambda a, b: (0.0, 0.0)).to_dict()
    assert result["recommendation"]["code"] == "FRESH"
    # ...but a stale hospital is still used when it is the only option.
    only = solve_carematch([stale_near], req, courier=lambda a, b: (0.0, 0.0)).to_dict()
    assert only["recommendation"]["code"] == "STALE"


async def test_blood_officer_sees_holds_on_their_stock_read_only(client: AsyncClient, login_as, db_session) -> None:
    bmu = await _facility_id(db_session, "BMU")
    dmch = await _facility_id(db_session, "DMCH")
    dispatcher = await _headers(login_as, DISPATCHER)
    hold = await client.post(
        "/api/v1/reservations",
        json={"hospital_id": str(bmu), "needs_icu": True, "needs_vent": False,
              "blood": {"source_facility_id": str(dmch), "blood_type": "O-", "units": 1}},
        headers={**dispatcher, "Idempotency-Key": "blood-officer-visibility-01"},
    )
    assert hold.status_code == 201, hold.text
    rid = hold.json()["reservation_id"]
    assert hold.json()["created_at"]

    officer = await _headers(login_as, ("dmch.blood@shasthogrid.org", "BloodBank#2026!"))
    listed = await client.get("/api/v1/reservations", headers=officer)
    assert rid in {r["reservation_id"] for r in listed.json()["items"]}
    assert (await client.get(f"/api/v1/reservations/{rid}", headers=officer)).status_code == 200
    # Read-only: the blood bank cannot confirm or cancel the hospital's bed.
    forbidden = await client.post(f"/api/v1/reservations/{rid}/transition",
                                  json={"target_status": "CANCELLED"}, headers=officer)
    assert forbidden.status_code == 403

    cancel = await client.post(f"/api/v1/reservations/{rid}/transition",
                               json={"target_status": "CANCELLED"}, headers=dispatcher)
    assert cancel.status_code == 200, cancel.text


async def test_critical_care_insights_shape_and_access(client: AsyncClient, login_as) -> None:
    dispatcher = await _headers(login_as, DISPATCHER)
    r = await client.get("/api/v1/critical-care/insights", params={"days": 7}, headers=dispatcher)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["facilities"]) == 7
    assert 0 <= body["icu_occupancy_pct"] <= 100
    assert set(body["holds_by_status"]) == {"HELD", "CONFIRMED", "EN_ROUTE", "ADMITTED", "EXPIRED", "CANCELLED"}
    dmch = next(f for f in body["facilities"] if f["code"] == "DMCH")
    assert "O-" in dmch["blood"] and dmch["icu"]["staffed"] >= dmch["icu"]["available"]

    pharmacist = await _headers(login_as, ("pharmacist@awaregrid.org", "Pharmacist#2026!"))
    assert (await client.get("/api/v1/critical-care/insights", headers=pharmacist)).status_code == 403
    assert (await client.get("/api/v1/critical-care/insights", params={"days": 365}, headers=dispatcher)).status_code == 422
