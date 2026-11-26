from __future__ import annotations

import asyncio
import uuid
from collections.abc import Callable, Coroutine
from datetime import date, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AntibioticCatalog, AuditLog, InventoryBatch


def _auth(token: str, extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {"Authorization": f"Bearer {token}"}
    if extra:
        headers.update(extra)
    return headers


def _assert_error(body: dict[str, Any], expected_code: str | None = None) -> None:
    assert {"error_code", "message", "details", "trace_id"}.issubset(body.keys())
    assert isinstance(body["error_code"], str) and body["error_code"]
    assert isinstance(body["message"], str) and body["message"]
    assert isinstance(body["details"], dict)
    assert str(uuid.UUID(body["trace_id"])) == body["trace_id"]
    if expected_code is not None:
        assert body["error_code"] == expected_code


@pytest.mark.asyncio
async def test_patients_crud_idempotency_version_and_tenant_isolation(
    client: AsyncClient,
    login_as: Callable[[str, str], Coroutine[Any, Any, tuple[str, dict[str, Any]]]],
) -> None:
    disp_token, disp_user = await login_as("dispenser@awaregrid.org", "Dispenser#2026!")
    aud_token, _ = await login_as("auditor@awaregrid.org", "Auditor#2026!")
    dhamrai_token, _ = await login_as("dhamrai.dispenser@awaregrid.org", "Dispenser#2026!")

    # List returns bare JSON array, clinic-scoped, supports ?q=
    list_res = await client.get("/api/v1/patients?q=ASH-MRN-001", headers=_auth(disp_token))
    assert list_res.status_code == 200
    rows = list_res.json()
    assert isinstance(rows, list)
    assert len(rows) == 1
    assert rows[0]["mrn"] == "ASH-MRN-001"
    assert rows[0]["clinic_id"] == disp_user["clinic_id"]

    # Auditor cannot create or patch patient
    aud_create = await client.post(
        "/api/v1/patients",
        headers=_auth(aud_token),
        json={
            "mrn": f"AUD-{uuid.uuid4().hex[:6]}",
            "full_name": "Blocked Patient",
            "age_years": 28,
            "weight_kg": 60,
            "sex": "F",
            "is_pregnant": False,
        },
    )
    assert aud_create.status_code == 403
    _assert_error(aud_create.json(), "FORBIDDEN_ROLE")

    # Pregnancy on male rejected with 422
    bad_preg = await client.post(
        "/api/v1/patients",
        headers=_auth(disp_token),
        json={
            "mrn": f"BAD-{uuid.uuid4().hex[:6]}",
            "full_name": "Invalid Pregnancy",
            "age_years": 30,
            "weight_kg": 70,
            "sex": "M",
            "is_pregnant": True,
        },
    )
    assert bad_preg.status_code == 422
    _assert_error(bad_preg.json(), "VALIDATION_ERROR")

    # Create with client UUIDv4 + Idempotency-Key
    client_id = str(uuid.uuid4())
    idem_key = f"pat-create-{uuid.uuid4()}"
    payload = {
        "id": client_id,
        "mrn": f"ASH-TEST-{uuid.uuid4().hex[:6]}",
        "full_name": "Fatema Begum",
        "age_years": 29,
        "weight_kg": 54.5,
        "sex": "F",
        "is_pregnant": True,
        "egfr": 95.0,
        "allergies": ["PENICILLIN"],
    }
    c1 = await client.post(
        "/api/v1/patients",
        headers=_auth(disp_token, {"Idempotency-Key": idem_key}),
        json=payload,
    )
    assert c1.status_code == 201
    created = c1.json()
    assert created["id"] == client_id
    assert created["version"] == 1
    assert created["allergies"] == ["PENICILLIN"]

    c2 = await client.post(
        "/api/v1/patients",
        headers=_auth(disp_token, {"Idempotency-Key": idem_key}),
        json=payload,
    )
    assert c2.status_code == 201
    assert c2.headers.get("X-Idempotent-Replay") == "true"
    assert c2.json()["id"] == client_id

    # Same Idempotency-Key with different payload -> 409
    c_mismatch = await client.post(
        "/api/v1/patients",
        headers=_auth(disp_token, {"Idempotency-Key": idem_key}),
        json={**payload, "weight_kg": 60.0},
    )
    assert c_mismatch.status_code == 409
    _assert_error(c_mismatch.json(), "IDEMPOTENCY_KEY_CONFLICT")

    # Cross-clinic GET & PATCH -> 403; unknown ID -> 404
    cross_get = await client.get(f"/api/v1/patients/{client_id}", headers=_auth(dhamrai_token))
    assert cross_get.status_code == 403
    _assert_error(cross_get.json(), "CROSS_TENANT_FORBIDDEN")

    missing_get = await client.get(f"/api/v1/patients/{uuid.uuid4()}", headers=_auth(disp_token))
    assert missing_get.status_code == 404
    _assert_error(missing_get.json(), "PATIENT_NOT_FOUND")

    # PATCH with matching base_version increments version -> 2
    ok_patch = await client.patch(
        f"/api/v1/patients/{client_id}",
        headers=_auth(disp_token),
        json={"base_version": 1, "weight_kg": 56.0, "egfr": None},
    )
    assert ok_patch.status_code == 200
    assert ok_patch.json()["version"] == 2
    assert ok_patch.json()["weight_kg"] == 56.0
    assert ok_patch.json()["egfr"] is None

    # Stale base_version on PATCH -> 409
    stale_patch = await client.patch(
        f"/api/v1/patients/{client_id}",
        headers=_auth(disp_token),
        json={"base_version": 1, "weight_kg": 58.0},
    )
    assert stale_patch.status_code == 409
    _assert_error(stale_patch.json(), "PATIENT_VERSION_CONFLICT")


@pytest.mark.asyncio
async def test_inventory_fefo_sorting_filters_and_rbac(
    client: AsyncClient,
    login_as: Callable[[str, str], Coroutine[Any, Any, tuple[str, dict[str, Any]]]],
    db_session: AsyncSession,
) -> None:
    disp_token, _ = await login_as("dispenser@awaregrid.org", "Dispenser#2026!")
    pharm_token, _ = await login_as("pharmacist@awaregrid.org", "Pharmacist#2026!")

    # List batches: strictly FEFO sorted (expiry_date ASC) and joined with catalog + days_to_expiry
    res = await client.get("/api/v1/inventory/batches", headers=_auth(disp_token))
    assert res.status_code == 200
    batches = res.json()
    assert isinstance(batches, list) and len(batches) >= 20
    expiry_dates = [b["expiry_date"] for b in batches]
    assert expiry_dates == sorted(expiry_dates)
    for b in batches:
        assert "drug_code" in b
        assert "generic_name" in b
        assert "aware_category" in b
        assert "aware_tier_cost" in b
        assert isinstance(b["days_to_expiry"], int)
        assert b["batch_number"] == b["lot_number"]

    # Expiring soon filter
    soon_res = await client.get(
        "/api/v1/inventory/batches?expiring_soon=true", headers=_auth(disp_token)
    )
    assert soon_res.status_code == 200
    soon_batches = soon_res.json()
    assert len(soon_batches) >= 1
    assert all(0 < b["days_to_expiry"] <= 30 and b["qty_remaining"] > 0 for b in soon_batches)

    # Stocked out filter (in_stock=false)
    out_res = await client.get(
        "/api/v1/inventory/batches?in_stock=false", headers=_auth(disp_token)
    )
    assert out_res.status_code == 200
    assert any(b["qty_remaining"] == 0 and b["drug_code"] == "COLISTIN" for b in out_res.json())

    # Tier + q filter
    tier_res = await client.get(
        "/api/v1/inventory/batches?tier=ACCESS&q=COTRIM", headers=_auth(disp_token)
    )
    assert tier_res.status_code == 200
    assert all(b["aware_category"] == "ACCESS" and "COTRIM" in b["drug_code"] for b in tier_res.json())

    # Dispenser blocked from creating or patching batches (pharmacist/admin only)
    amox_id = str(
        (
            await db_session.execute(
                select(AntibioticCatalog.id).where(AntibioticCatalog.drug_code == "AMOXICILLIN")
            )
        ).scalar_one()
    )
    disp_create = await client.post(
        "/api/v1/inventory/batches",
        headers=_auth(disp_token),
        json={
            "antibiotic_id": amox_id,
            "lot_number": f"LOT-DISP-{uuid.uuid4().hex[:6]}",
            "qty_initial": 10,
            "expiry_date": (date.today() + timedelta(days=90)).isoformat(),
        },
    )
    assert disp_create.status_code == 403
    _assert_error(disp_create.json(), "FORBIDDEN_ROLE")

    # Pharmacist creates batch with batch_number alias & default qty_remaining
    lot_num = f"LOT-PHARM-{uuid.uuid4().hex[:6]}"
    create_res = await client.post(
        "/api/v1/inventory/batches",
        headers=_auth(pharm_token, {"Idempotency-Key": f"batch-{uuid.uuid4()}"}),
        json={
            "antibiotic_id": amox_id,
            "batch_number": lot_num,
            "qty_initial": 25,
            "expiry_date": (date.today() + timedelta(days=120)).isoformat(),
        },
    )
    assert create_res.status_code == 201
    created_batch = create_res.json()
    assert created_batch["lot_number"] == lot_num
    assert created_batch["qty_remaining"] == 25
    assert created_batch["version"] == 1

    # Pharmacist patches qty_remaining -> version increments
    patch_res = await client.patch(
        f"/api/v1/inventory/batches/{created_batch['id']}",
        headers=_auth(pharm_token),
        json={"qty_remaining": 20},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["qty_remaining"] == 20
    assert patch_res.json()["version"] == 2


@pytest.mark.asyncio
async def test_dispense_state_machine_atomic_decrement_race_expired_and_void(
    client: AsyncClient,
    login_as: Callable[[str, str], Coroutine[Any, Any, tuple[str, dict[str, Any]]]],
    db_session: AsyncSession,
) -> None:
    disp_token, _ = await login_as("dispenser@awaregrid.org", "Dispenser#2026!")
    pharm_token, _ = await login_as("pharmacist@awaregrid.org", "Pharmacist#2026!")
    aud_token, _ = await login_as("auditor@awaregrid.org", "Auditor#2026!")

    amox_id = str(
        (
            await db_session.execute(
                select(AntibioticCatalog.id).where(AntibioticCatalog.drug_code == "AMOXICILLIN")
            )
        ).scalar_one()
    )
    patient_res = await client.post(
        "/api/v1/patients",
        headers=_auth(disp_token),
        json={
            "mrn": f"ASH-SM-{uuid.uuid4().hex[:6]}",
            "full_name": "State Machine Patient",
            "age_years": 35,
            "weight_kg": 65,
            "sex": "M",
            "is_pregnant": False,
        },
    )
    assert patient_res.status_code == 201
    patient_id = patient_res.json()["id"]

    # 1. Create a 2-unit batch & test over-quantity + concurrent race on last unit
    lot_res = await client.post(
        "/api/v1/inventory/batches",
        headers=_auth(pharm_token),
        json={
            "antibiotic_id": amox_id,
            "lot_number": f"LOT-RACE-{uuid.uuid4().hex[:6]}",
            "qty_initial": 1,
            "qty_remaining": 1,
            "expiry_date": (date.today() + timedelta(days=180)).isoformat(),
        },
    )
    assert lot_res.status_code == 201
    one_unit_batch_id = lot_res.json()["id"]

    # Dispenser creates two drafts for the 1-unit batch and submits both
    draft_ids: list[str] = []
    for idx in range(2):
        d_res = await client.post(
            "/api/v1/dispenses",
            headers=_auth(disp_token, {"Idempotency-Key": f"race-d-{idx}-{uuid.uuid4()}"}),
            json={
                "patient_id": patient_id,
                "batch_id": one_unit_batch_id,
                "antibiotic_id": amox_id,
                "syndrome_code": "CAP_MILD",
                "severity": "MILD",
                "aware_category": "ACCESS",
                "qty": 1,
                "notes": "Race test",
            },
        )
        assert d_res.status_code == 201
        d_body = d_res.json()
        assert d_body["status"] == "DRAFT"
        assert d_body["qty"] == 1 and d_body["qty_dispensed"] == 1
        assert d_body["syndrome_code"] == "CAP_MILD"
        assert d_body["drug_code"] == "AMOXICILLIN"
        draft_ids.append(d_body["id"])

    # Dispenser cannot approve or void
    await client.post(f"/api/v1/dispenses/{draft_ids[0]}/submit", headers=_auth(disp_token))
    await client.post(f"/api/v1/dispenses/{draft_ids[1]}/submit", headers=_auth(disp_token))

    disp_approve = await client.post(
        f"/api/v1/dispenses/{draft_ids[0]}/approve", headers=_auth(disp_token)
    )
    assert disp_approve.status_code == 403
    _assert_error(disp_approve.json(), "FORBIDDEN_ROLE")

    # Auditor cannot create dispense
    aud_disp = await client.post(
        "/api/v1/dispenses",
        headers=_auth(aud_token),
        json={"patient_id": patient_id, "syndrome_code": "COMMON_COLD", "aware_category": "NO_ANTIBIOTIC", "qty": 0},
    )
    assert aud_disp.status_code == 403

    # Concurrent approval race on 1 remaining unit: exactly 1 succeeds (200), 1 fails (409)
    r1, r2 = await asyncio.gather(
        client.post(f"/api/v1/dispenses/{draft_ids[0]}/approve", headers=_auth(pharm_token)),
        client.post(f"/api/v1/dispenses/{draft_ids[1]}/approve", headers=_auth(pharm_token)),
    )
    statuses = sorted([r1.status_code, r2.status_code])
    assert statuses == [200, 409]
    winner_id = draft_ids[0] if r1.status_code == 200 else draft_ids[1]
    loser_id = draft_ids[1] if r1.status_code == 200 else draft_ids[0]

    # Verify batch qty_remaining is 0 and version bumped to 2
    batch_after = (
        await db_session.execute(select(InventoryBatch).where(InventoryBatch.id == uuid.UUID(one_unit_batch_id)))
    ).scalar_one()
    await db_session.refresh(batch_after)
    assert batch_after.qty_remaining == 0
    assert batch_after.version == 2

    # Voiding winner restores stock to 1; double-void returns 409 and does NOT restore twice
    v1 = await client.post(f"/api/v1/dispenses/{winner_id}/void", headers=_auth(pharm_token))
    assert v1.status_code == 200
    assert v1.json()["status"] == "VOIDED"

    v2 = await client.post(f"/api/v1/dispenses/{winner_id}/void", headers=_auth(pharm_token))
    assert v2.status_code == 409
    _assert_error(v2.json(), "INVALID_STATE_TRANSITION")

    await db_session.refresh(batch_after)
    assert batch_after.qty_remaining == 1

    # Reject the loser draft (still PENDING_APPROVAL) with empty body
    rej = await client.post(f"/api/v1/dispenses/{loser_id}/reject", headers=_auth(pharm_token))
    assert rej.status_code == 200
    assert rej.json()["status"] == "REJECTED"

    # Illegal transition: approve a REJECTED dispense -> 409
    bad_approve = await client.post(
        f"/api/v1/dispenses/{loser_id}/approve", headers=_auth(pharm_token)
    )
    assert bad_approve.status_code == 409
    _assert_error(bad_approve.json(), "INVALID_STATE_TRANSITION")

    # 2. Expired batch cannot be approved
    exp_lot_res = await client.post(
        "/api/v1/inventory/batches",
        headers=_auth(pharm_token),
        json={
            "antibiotic_id": amox_id,
            "lot_number": f"LOT-EXP-{uuid.uuid4().hex[:6]}",
            "qty_initial": 5,
            "expiry_date": (date.today() - timedelta(days=3)).isoformat(),
        },
    )
    assert exp_lot_res.status_code == 201
    exp_batch_id = exp_lot_res.json()["id"]

    exp_draft = await client.post(
        "/api/v1/dispenses",
        headers=_auth(disp_token),
        json={
            "patient_id": patient_id,
            "batch_id": exp_batch_id,
            "antibiotic_id": amox_id,
            "syndrome_code": "CAP_MILD",
            "aware_category": "ACCESS",
            "qty_dispensed": 1,
        },
    )
    assert exp_draft.status_code == 201
    exp_d_id = exp_draft.json()["id"]
    await client.post(f"/api/v1/dispenses/{exp_d_id}/submit", headers=_auth(disp_token))
    exp_app = await client.post(f"/api/v1/dispenses/{exp_d_id}/approve", headers=_auth(pharm_token))
    assert exp_app.status_code == 409
    _assert_error(exp_app.json(), "INSUFFICIENT_OR_EXPIRED_STOCK")

    # Invalid enum filter on GET /dispenses -> 422
    bad_filter = await client.get("/api/v1/dispenses?status=UNKNOWN", headers=_auth(disp_token))
    assert bad_filter.status_code == 422
    _assert_error(bad_filter.json(), "VALIDATION_ERROR")


@pytest.mark.asyncio
async def test_ashulia_analytics_crosses_60_pct_and_excludes_no_antibiotic(
    client: AsyncClient,
    login_as: Callable[[str, str], Coroutine[Any, Any, tuple[str, dict[str, Any]]]],
) -> None:
    disp_token, _ = await login_as("dispenser@awaregrid.org", "Dispenser#2026!")
    pharm_token, _ = await login_as("pharmacist@awaregrid.org", "Pharmacist#2026!")

    base_res = await client.get("/api/v1/analytics/stewardship", headers=_auth(disp_token))
    assert base_res.status_code == 200
    base = base_res.json()
    assert base["clinic_name"] == "Ashulia Union Sub-Center"
    assert base["access_count"] == 13
    assert base["watch_count"] == 11
    assert base["reserve_count"] == 1
    assert base["antibiotic_dispensed"] == 25
    assert base["access_ratio_pct"] == 52.0
    assert base["target_access_pct"] == 60.0
    assert base["meets_who_target"] is False
    assert base["expiring_soon_count"] >= 1
    assert base["stocked_out_count"] >= 1

    batches = (await client.get("/api/v1/inventory/batches?tier=ACCESS&in_stock=true", headers=_auth(disp_token))).json()
    access_batch = next(b for b in batches if b["days_to_expiry"] > 30 and b["qty_remaining"] >= 10)
    patient_id = (await client.get("/api/v1/patients?q=ASH-MRN-002", headers=_auth(disp_token))).json()[0]["id"]

    created_ids: list[str] = []
    try:
        # 1 NO_ANTIBIOTIC dispense must NOT change antibiotic_dispensed or access_ratio_pct
        no_abx = await client.post(
            "/api/v1/dispenses",
            headers=_auth(disp_token),
            json={
                "patient_id": patient_id,
                "syndrome_code": "COMMON_COLD",
                "severity": "MILD",
                "aware_category": "NO_ANTIBIOTIC",
                "qty": 0,
            },
        )
        assert no_abx.status_code == 201
        no_abx_id = no_abx.json()["id"]
        created_ids.append(no_abx_id)
        await client.post(f"/api/v1/dispenses/{no_abx_id}/submit", headers=_auth(disp_token))
        assert (
            await client.post(f"/api/v1/dispenses/{no_abx_id}/approve", headers=_auth(pharm_token))
        ).status_code == 200

        mid = (await client.get("/api/v1/analytics/stewardship", headers=_auth(disp_token))).json()
        assert mid["no_antibiotic_count"] == base["no_antibiotic_count"] + 1
        assert mid["antibiotic_dispensed"] == 25
        assert mid["access_ratio_pct"] == 52.0

        # Add 5 compliant ACCESS dispenses -> 18/30 = 60.0%
        for _ in range(5):
            d = await client.post(
                "/api/v1/dispenses",
                headers=_auth(disp_token),
                json={
                    "patient_id": patient_id,
                    "batch_id": access_batch["id"],
                    "antibiotic_id": access_batch["antibiotic_id"],
                    "syndrome_code": "CAP_MILD",
                    "aware_category": "ACCESS",
                    "qty": 1,
                },
            )
            assert d.status_code == 201
            did = d.json()["id"]
            created_ids.append(did)
            await client.post(f"/api/v1/dispenses/{did}/submit", headers=_auth(disp_token))
            assert (
                await client.post(f"/api/v1/dispenses/{did}/approve", headers=_auth(pharm_token))
            ).status_code == 200

        target_hit = (await client.get("/api/v1/analytics/stewardship", headers=_auth(disp_token))).json()
        assert target_hit["access_count"] == 18
        assert target_hit["antibiotic_dispensed"] == 30
        assert target_hit["access_ratio_pct"] == 60.0
        assert target_hit["meets_who_target"] is True
    finally:
        for did in created_ids:
            await client.post(f"/api/v1/dispenses/{did}/void", headers=_auth(pharm_token))


@pytest.mark.asyncio
async def test_sync_bootstrap_offline_create_version_skew_cpsat_and_resolve(
    client: AsyncClient,
    login_as: Callable[[str, str], Coroutine[Any, Any, tuple[str, dict[str, Any]]]],
    db_session: AsyncSession,
) -> None:
    disp_token, disp_user = await login_as("dispenser@awaregrid.org", "Dispenser#2026!")
    pharm_token, _ = await login_as("pharmacist@awaregrid.org", "Pharmacist#2026!")
    aud_token, _ = await login_as("auditor@awaregrid.org", "Auditor#2026!")

    # 1. Bootstrap returns full clinic snapshot
    boot_res = await client.get("/api/v1/sync/bootstrap", headers=_auth(disp_token))
    assert boot_res.status_code == 200
    boot = boot_res.json()
    assert len(boot["guidelines"]) == 15
    assert len(boot["catalog"]) == 20
    assert len(boot["batches"]) >= 20
    assert boot["analytics"]["clinic_id"] == disp_user["clinic_id"]

    # 2. Offline patient CREATE via sync/mutations (entity not in DB, base_version=0)
    offline_patient_id = str(uuid.uuid4())
    create_mut_id = str(uuid.uuid4())
    offline_create_res = await client.post(
        "/api/v1/sync/mutations",
        headers=_auth(disp_token, {"Idempotency-Key": f"sync-create-{uuid.uuid4()}"}),
        json={
            "client_mutation_id": create_mut_id,
            "entity_type": "PATIENT",
            "entity_id": offline_patient_id,
            "base_version": 0,
            "payload": {
                "mrn": f"ASH-OFF-{uuid.uuid4().hex[:6]}",
                "full_name": "Offline Sync Patient",
                "age_years": 32,
                "weight_kg": 60,
                "sex": "F",
                "is_pregnant": False,
                "egfr": 90,
                "allergies": [],
            },
        },
    )
    assert offline_create_res.status_code == 200
    assert offline_create_res.json()["status"] == "SYNCED"
    assert offline_create_res.json()["new_version"] == 1

    # Duplicate client_mutation_id does NOT bump version twice
    dup_res = await client.post(
        "/api/v1/sync/mutations",
        headers=_auth(disp_token, {"Idempotency-Key": f"sync-dup-{uuid.uuid4()}"}),
        json={
            "client_mutation_id": create_mut_id,
            "entity_type": "PATIENT",
            "entity_id": offline_patient_id,
            "base_version": 0,
            "payload": {"full_name": "Should Not Reapply"},
        },
    )
    assert dup_res.status_code == 200
    assert dup_res.json()["new_version"] == 1

    # 3. Clean update when base_version == server_version (1 -> 2)
    clean_mut = await client.post(
        "/api/v1/sync/mutations",
        headers=_auth(disp_token),
        json={
            "client_mutation_id": str(uuid.uuid4()),
            "entity_type": "PATIENT",
            "entity_id": offline_patient_id,
            "base_version": 1,
            "payload": {"weight_kg": 61},
        },
    )
    assert clean_mut.status_code == 200
    assert clean_mut.json()["new_version"] == 2

    # 4. Concurrent online Cotrimoxazole dispense + server version bump (2 -> 3)
    cotrim_batch = next(
        b for b in boot["batches"] if b["drug_code"] == "COTRIMOXAZOLE" and b["qty_remaining"] >= 1
    )
    d_res = await client.post(
        "/api/v1/dispenses",
        headers=_auth(disp_token),
        json={
            "patient_id": offline_patient_id,
            "batch_id": cotrim_batch["id"],
            "antibiotic_id": cotrim_batch["antibiotic_id"],
            "syndrome_code": "UNCOMPLICATED_UTI",
            "aware_category": "ACCESS",
            "qty_dispensed": 1,
        },
    )
    assert d_res.status_code == 201
    dispense_id = d_res.json()["id"]
    await client.post(f"/api/v1/dispenses/{dispense_id}/submit", headers=_auth(disp_token))
    assert (
        await client.post(f"/api/v1/dispenses/{dispense_id}/approve", headers=_auth(pharm_token))
    ).status_code == 200

    bump_res = await client.patch(
        f"/api/v1/patients/{offline_patient_id}",
        headers=_auth(pharm_token),
        json={"base_version": 2, "weight_kg": 62},
    )
    assert bump_res.status_code == 200
    assert bump_res.json()["version"] == 3

    # 5. Offline stale edit adds SULFONAMIDE allergy with base_version=2 (skew against server v3)
    # Must reject LWW, invoke real CP-SAT on merged state vs COTRIMOXAZOLE, and return 409!
    skew_mut_id = str(uuid.uuid4())
    conflict_res = await client.post(
        "/api/v1/sync/mutations",
        headers=_auth(disp_token, {"Idempotency-Key": f"skew-{uuid.uuid4()}"}),
        json={
            "client_mutation_id": skew_mut_id,
            "entity_type": "PATIENT",
            "entity_id": offline_patient_id,
            "base_version": 2,
            "payload": {"allergies": ["SULFONAMIDE"]},
        },
    )
    assert conflict_res.status_code == 409
    c_body = conflict_res.json()
    _assert_error(c_body, "SYNC_VERSION_CONFLICT")
    conflict_id = c_body["conflict_id"]
    assert c_body["details"]["conflict_id"] == conflict_id
    assert c_body["details"]["server_snapshot"] == c_body["server_snapshot"]
    assert c_body["details"]["client_snapshot"] == c_body["client_snapshot"]
    assert c_body["details"]["cpsat_verdict"] == c_body["cpsat_verdict"]
    assert c_body["cpsat_verdict"]["solver_status"] == "INFEASIBLE"
    mus_codes = {m["code"] for m in c_body["cpsat_verdict"]["mus_conflicts"]}
    assert "ALLERGY_SULFONAMIDE" in mus_codes

    # Duplicate skew client_mutation_id replays exact same conflict_id without duplicating event
    skew_replay = await client.post(
        "/api/v1/sync/mutations",
        headers=_auth(disp_token),
        json={
            "client_mutation_id": skew_mut_id,
            "entity_type": "PATIENT",
            "entity_id": offline_patient_id,
            "base_version": 2,
            "payload": {"allergies": ["SULFONAMIDE"]},
        },
    )
    assert skew_replay.status_code == 409
    assert skew_replay.json()["conflict_id"] == conflict_id

    # GET /sync/conflicts exposes status + mutation_id
    conflicts_list = (await client.get("/api/v1/sync/conflicts", headers=_auth(disp_token))).json()
    target_conflict = next(c for c in conflicts_list if c["id"] == conflict_id)
    assert target_conflict["status"] == "OPEN"
    assert isinstance(target_conflict["mutation_id"], str)

    # Auditor blocked from resolving conflict (403)
    aud_resolve = await client.post(
        f"/api/v1/sync/conflicts/{conflict_id}/resolve",
        headers=_auth(aud_token),
        json={"resolution": "RESOLVED_SERVER", "notes": "Not allowed"},
    )
    assert aud_resolve.status_code == 403

    # Dispenser blocked from RESOLVED_CLIENT override on INFEASIBLE conflict (403)
    disp_override = await client.post(
        f"/api/v1/sync/conflicts/{conflict_id}/resolve",
        headers=_auth(disp_token),
        json={"resolution": "RESOLVED_CLIENT", "notes": "Unsafe override"},
    )
    assert disp_override.status_code == 403
    _assert_error(disp_override.json(), "UNSAFE_CLIENT_OVERRIDE_FORBIDDEN")

    # Safe RESOLVED_MERGED resolution succeeds, preserves SULFONAMIDE allergy, bumps version -> 4,
    # and re-runs CP-SAT without forced Cotrimoxazole to recommend a safe ACCESS alternative
    resolve_res = await client.post(
        f"/api/v1/sync/conflicts/{conflict_id}/resolve",
        headers=_auth(disp_token),
        json={
            "resolution": "RESOLVED_MERGED",
            "notes": "Merged Sulfonamide allergy and switched regimen",
            "merged_payload": {"allergies": ["SULFONAMIDE"]},
        },
    )
    assert resolve_res.status_code == 200
    r_body = resolve_res.json()
    assert r_body["id"] == conflict_id
    assert r_body["status"] == "RESOLVED_MERGED"
    assert r_body["entity_snapshot"]["version"] == 4
    assert "SULFONAMIDE" in r_body["entity_snapshot"]["allergies"]
    assert r_body["cpsat_verdict"]["solver_status"] == "OPTIMAL"
    assert r_body["cpsat_verdict"]["recommended_drug_code"] != "COTRIMOXAZOLE"

    # Double resolution returns 409
    double_resolve = await client.post(
        f"/api/v1/sync/conflicts/{conflict_id}/resolve",
        headers=_auth(pharm_token),
        json={"resolution": "RESOLVED_SERVER", "notes": "Second attempt"},
    )
    assert double_resolve.status_code == 409
    _assert_error(double_resolve.json(), "CONFLICT_ALREADY_RESOLVED")

    # Audit log recorded both detection and resolution
    audits = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.resource_id == conflict_id)
        )
    ).scalars().all()
    assert {a.action for a in audits} >= {"SYNC_CONFLICT_DETECTED", "SYNC_CONFLICT_RESOLVE"}

    # Clean up the test dispense
    await client.post(f"/api/v1/dispenses/{dispense_id}/void", headers=_auth(pharm_token))
