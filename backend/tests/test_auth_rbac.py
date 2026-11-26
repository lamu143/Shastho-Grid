from __future__ import annotations

import asyncio
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from jose import jwt
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.requests import Request

from app.core.config import Settings, normalize_async_database_url, settings
from app.core.idempotency import _ADVISORY_LOCK_STMT, _advisory_lock_key
from app.core.security import create_access_token
from app.db.models import (
    AntibioticCatalog,
    AuditLog,
    AwareGuideline,
    Clinic,
    Dispense,
    IdempotencyKey,
    InventoryBatch,
    Patient,
    User,
)
from app.db.seed import seed_database
from app.main import app


def _assert_standard_error(body: dict[str, Any], expected_code: str) -> None:
    assert set(["error_code", "message", "details", "trace_id"]).issubset(body.keys())
    assert body["error_code"] == expected_code
    assert isinstance(body["message"], str) and len(body["message"]) > 0
    assert isinstance(body["details"], dict)
    parsed_trace = uuid.UUID(body["trace_id"])
    assert str(parsed_trace) == body["trace_id"]


@pytest.mark.asyncio
async def test_all_11_tables_exist(db_session: AsyncSession) -> None:
    result = await db_session.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            """
        )
    )
    table_names = {row[0] for row in result.all()}
    expected_tables = {
        "clinics",
        "users",
        "patients",
        "aware_guidelines",
        "antibiotic_catalog",
        "inventory_batches",
        "dispenses",
        "sync_mutations_log",
        "conflict_resolution_events",
        "idempotency_keys",
        "audit_logs",
    }
    assert expected_tables.issubset(table_names)


@pytest.mark.asyncio
async def test_postgres_check_fk_and_unique_constraints(db_session: AsyncSession) -> None:
    ashulia_id = (
        await db_session.execute(select(Clinic.id).where(Clinic.code == "ASHULIA-01"))
    ).scalar_one()
    amox_id = (
        await db_session.execute(select(AntibioticCatalog.id).where(AntibioticCatalog.drug_code == "AMOXICILLIN"))
    ).scalar_one()

    # 1. Invalid users.role
    db_session.add(
        User(
            clinic_id=ashulia_id,
            email=f"invalid-role-{uuid.uuid4()}@awaregrid.org",
            full_name="Invalid Role",
            role="nurse",
            password_hash="$argon2id$dummy",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 2. Negative inventory_batches.qty_remaining
    db_session.add(
        InventoryBatch(
            clinic_id=ashulia_id,
            antibiotic_id=amox_id,
            lot_number=f"NEG-{uuid.uuid4().hex[:8]}",
            qty_initial=10,
            qty_remaining=-1,
            expiry_date=date.today() + timedelta(days=30),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 3. qty_remaining > qty_initial
    db_session.add(
        InventoryBatch(
            clinic_id=ashulia_id,
            antibiotic_id=amox_id,
            lot_number=f"OVER-{uuid.uuid4().hex[:8]}",
            qty_initial=10,
            qty_remaining=11,
            expiry_date=date.today() + timedelta(days=30),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 4. Pregnant male
    db_session.add(
        Patient(
            clinic_id=ashulia_id,
            mrn=f"PREGM-{uuid.uuid4().hex[:8]}",
            full_name="Constraint Test",
            age_years=30,
            weight_kg=Decimal("65.00"),
            sex="M",
            is_pregnant=True,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 5. Mismatched aware_tier_cost
    db_session.add(
        AntibioticCatalog(
            drug_code=f"BADTIER_{uuid.uuid4().hex[:6]}",
            generic_name="Bad Tier",
            generic_name_bn="টেস্ট",
            drug_class="PENICILLIN",
            aware_category="ACCESS",
            aware_tier_cost=15,
            dose_regimen_en="500mg",
            dose_regimen_bn="৫০০ মিগ্রা",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 6. FK violation on users.clinic_id
    db_session.add(
        User(
            clinic_id=uuid.uuid4(),
            email=f"bad-fk-{uuid.uuid4()}@awaregrid.org",
            full_name="Bad FK",
            role="dispenser",
            password_hash="$argon2id$dummy",
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 7. UNIQUE NULLS NOT DISTINCT on idempotency_keys
    shared_key = f"null-scope-{uuid.uuid4()}"
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    db_session.add(
        IdempotencyKey(
            clinic_id=None,
            user_id=None,
            idempotency_key=shared_key,
            method="POST",
            path="/api/v1/test",
            request_hash="a" * 64,
            response_status=200,
            response_body={"ok": True},
            expires_at=expires,
        )
    )
    await db_session.flush()
    db_session.add(
        IdempotencyKey(
            clinic_id=None,
            user_id=None,
            idempotency_key=shared_key,
            method="POST",
            path="/api/v1/test",
            request_hash="a" * 64,
            response_status=200,
            response_body={"ok": True},
            expires_at=expires,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_seed_idempotency_and_clinical_baseline(db_session: AsyncSession) -> None:
    counts = await seed_database(db_session)
    # Ashulia + Dhamrai dispensaries + Dhaka Regional Health Command (critical care).
    assert counts["clinics"] == 3
    assert counts["users"] >= 8
    assert counts["guidelines"] == 15
    assert counts["antibiotics"] == 20
    assert counts["dispenses"] == 30

    ashulia = (
        await db_session.execute(select(Clinic).where(Clinic.code == "ASHULIA-01"))
    ).scalar_one()
    dhamrai = (
        await db_session.execute(select(Clinic).where(Clinic.code == "DHAMRAI-01"))
    ).scalar_one()

    # Verify viral mild guidelines
    viral_codes = set(
        (
            await db_session.execute(
                select(AwareGuideline.syndrome_code).where(AwareGuideline.viral_no_antibiotic_if_mild.is_(True))
            )
        ).scalars()
    )
    assert viral_codes == {"ACUTE_BRONCHITIS", "COMMON_COLD", "VIRAL_URI"}

    # Verify Ashulia baseline 13 ACCESS, 11 WATCH, 1 RESERVE (52.0%)
    rows = (
        await db_session.execute(
            select(Dispense.aware_category_snapshot, func.count(Dispense.id))
            .where(Dispense.clinic_id == ashulia.id, Dispense.status == "DISPENSED")
            .group_by(Dispense.aware_category_snapshot)
        )
    ).all()
    by_cat = {cat: cnt for cat, cnt in rows}
    assert by_cat == {"ACCESS": 13, "WATCH": 11, "RESERVE": 1}

    # Verify Dhamrai baseline 4 ACCESS, 1 WATCH
    dhamrai_rows = (
        await db_session.execute(
            select(Dispense.aware_category_snapshot, func.count(Dispense.id))
            .where(Dispense.clinic_id == dhamrai.id, Dispense.status == "DISPENSED")
            .group_by(Dispense.aware_category_snapshot)
        )
    ).all()
    assert dict(dhamrai_rows) == {"ACCESS": 4, "WATCH": 1}

    # Verify expiring soon batch, stocked-out batch, and COTRIMOXAZOLE SULFONAMIDE stock
    expiring_soon = (
        await db_session.execute(
            select(func.count(InventoryBatch.id)).where(
                InventoryBatch.clinic_id == ashulia.id,
                InventoryBatch.qty_remaining > 0,
                InventoryBatch.expiry_date <= date.today() + timedelta(days=30),
            )
        )
    ).scalar_one()
    assert expiring_soon >= 1

    stocked_out = (
        await db_session.execute(
            select(func.count(InventoryBatch.id)).where(
                InventoryBatch.clinic_id == ashulia.id,
                InventoryBatch.qty_remaining == 0,
            )
        )
    ).scalar_one()
    assert stocked_out >= 1

    cotrim = (
        await db_session.execute(
            select(AntibioticCatalog).where(AntibioticCatalog.drug_code == "COTRIMOXAZOLE")
        )
    ).scalar_one()
    assert cotrim.drug_class == "SULFONAMIDE"
    cotrim_stock = (
        await db_session.execute(
            select(func.coalesce(func.sum(InventoryBatch.qty_remaining), 0)).where(
                InventoryBatch.clinic_id == ashulia.id,
                InventoryBatch.antibiotic_id == cotrim.id,
            )
        )
    ).scalar_one()
    assert cotrim_stock > 0


@pytest.mark.asyncio
async def test_argon2id_jwt_and_offline_pin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    dispenser = (
        await db_session.execute(select(User).where(User.email == "dispenser@awaregrid.org"))
    ).scalar_one()
    assert dispenser.password_hash.startswith("$argon2id$")
    assert dispenser.pin_hash is not None and dispenser.pin_hash.startswith("$argon2id$")

    # Valid login
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "dispenser@awaregrid.org", "password": "Dispenser#2026!"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "dispenser"
    assert body["user"]["clinic_name"] == "Ashulia Union Sub-Center"

    claims = jwt.decode(body["access_token"], settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    assert set(["sub", "email", "role", "clinic_id", "clinic_name", "iat", "exp"]).issubset(claims.keys())
    assert claims["sub"] == str(dispenser.id)
    assert claims["role"] == "dispenser"

    # Invalid password -> standard error envelope
    bad_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "dispenser@awaregrid.org", "password": "wrong-password"},
    )
    assert bad_login.status_code == 401
    _assert_standard_error(bad_login.json(), "INVALID_CREDENTIALS")

    # Valid PIN
    pin_ok = await client.post(
        "/api/v1/auth/verify-pin",
        json={"email": "dispenser@awaregrid.org", "pin": "2026"},
    )
    assert pin_ok.status_code == 200
    assert pin_ok.json() == {"verified": True}

    # Invalid PIN -> standard error envelope + audit log entry
    pin_bad = await client.post(
        "/api/v1/auth/verify-pin",
        json={"email": "dispenser@awaregrid.org", "pin": "9999"},
    )
    assert pin_bad.status_code == 401
    _assert_standard_error(pin_bad.json(), "INVALID_PIN")

    pin_fail_log = (
        await db_session.execute(
            select(AuditLog)
            .where(
                AuditLog.action == "AUTH_VERIFY_PIN_FAILED",
                AuditLog.actor_user_id == dispenser.id,
            )
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    assert pin_fail_log is not None
    assert pin_fail_log.details.get("email") == "dispenser@awaregrid.org"

    # /me valid, missing, tampered, expired
    me_ok = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert me_ok.status_code == 200
    assert me_ok.json()["email"] == "dispenser@awaregrid.org"

    me_missing = await client.get("/api/v1/auth/me")
    assert me_missing.status_code == 401
    _assert_standard_error(me_missing.json(), "AUTHENTICATION_REQUIRED")

    me_tampered = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {body['access_token']}tamper"},
    )
    assert me_tampered.status_code == 401
    _assert_standard_error(me_tampered.json(), "INVALID_OR_EXPIRED_TOKEN")

    expired_token = create_access_token(
        user_id=dispenser.id,
        email=dispenser.email,
        role=dispenser.role,
        clinic_id=dispenser.clinic_id,
        clinic_name="Ashulia Union Sub-Center",
        expires_delta=timedelta(minutes=-5),
    )
    me_expired = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert me_expired.status_code == 401
    _assert_standard_error(me_expired.json(), "INVALID_OR_EXPIRED_TOKEN")


@pytest.mark.asyncio
async def test_rbac_all_four_roles_and_tenant_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    login_as: Any,
) -> None:
    dispenser_token, dispenser_user = await login_as("dispenser@awaregrid.org", "Dispenser#2026!")
    pharmacist_token, _ = await login_as("pharmacist@awaregrid.org", "Pharmacist#2026!")
    auditor_token, _ = await login_as("auditor@awaregrid.org", "Auditor#2026!")
    admin_token, admin_user = await login_as("admin@awaregrid.org", "Admin#2026!")
    dhamrai_token, dhamrai_user = await login_as("dhamrai.dispenser@awaregrid.org", "Dispenser#2026!")

    assert dhamrai_user["clinic_id"] != dispenser_user["clinic_id"]
    assert dhamrai_user["clinic_name"] == "Dhamrai Community Dispensary"
    dhamrai_me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {dhamrai_token}"})
    assert dhamrai_me.status_code == 200
    assert dhamrai_me.json()["clinic_id"] == dhamrai_user["clinic_id"]

    # Dispenser & Pharmacist RBAC
    for tok in (dispenser_token, pharmacist_token):
        hdrs = {"Authorization": f"Bearer {tok}"}
        assert (await client.get("/api/v1/admin/clinics", headers=hdrs)).status_code == 403
        assert (await client.get("/api/v1/admin/users", headers=hdrs)).status_code == 403
        assert (await client.get("/api/v1/admin/audit-logs", headers=hdrs)).status_code == 403
        guidelines = await client.get("/api/v1/admin/guidelines", headers=hdrs)
        catalog = await client.get("/api/v1/admin/catalog", headers=hdrs)
        assert guidelines.status_code == 200 and len(guidelines.json()) == 15
        assert catalog.status_code == 200 and len(catalog.json()) == 20

    # Auditor RBAC
    aud_hdrs = {"Authorization": f"Bearer {auditor_token}"}
    assert (await client.get("/api/v1/admin/clinics", headers=aud_hdrs)).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=aud_hdrs)).status_code == 403
    assert (
        await client.post(
            "/api/v1/admin/users",
            headers=aud_hdrs,
            json={
                "email": f"blocked-{uuid.uuid4().hex[:6]}@awaregrid.org",
                "full_name": "Blocked User",
                "role": "dispenser",
                "password": "Password#2026!",
            },
        )
    ).status_code == 403
    aud_logs = await client.get("/api/v1/admin/audit-logs", headers=aud_hdrs)
    assert aud_logs.status_code == 200
    assert all(item["clinic_id"] == dispenser_user["clinic_id"] for item in aud_logs.json())

    # Admin RBAC & default tenant scoping (omitting ?clinic_id must never leak other clinics)
    adm_hdrs = {"Authorization": f"Bearer {admin_token}"}
    clinics_resp = await client.get("/api/v1/admin/clinics", headers=adm_hdrs)
    assert clinics_resp.status_code == 200
    clinics_data = clinics_resp.json()
    assert len(clinics_data) == 1
    assert clinics_data[0]["id"] == admin_user["clinic_id"]
    assert clinics_data[0]["code"] == "ASHULIA-01"

    clinics_explicit = await client.get(
        f"/api/v1/admin/clinics?clinic_id={admin_user['clinic_id']}",
        headers=adm_hdrs,
    )
    assert clinics_explicit.status_code == 200
    assert len(clinics_explicit.json()) == 1
    assert clinics_explicit.json()[0]["code"] == "ASHULIA-01"

    users_resp = await client.get("/api/v1/admin/users", headers=adm_hdrs)
    assert users_resp.status_code == 200
    users_data = users_resp.json()
    assert len(users_data) >= 4
    assert all(u["clinic_id"] == admin_user["clinic_id"] for u in users_data)
    assert all(u["email"] != "dhamrai.dispenser@awaregrid.org" for u in users_data)

    adm_logs_resp = await client.get("/api/v1/admin/audit-logs", headers=adm_hdrs)
    assert adm_logs_resp.status_code == 200
    assert all(item["clinic_id"] == admin_user["clinic_id"] for item in adm_logs_resp.json())

    # Cross-tenant isolation: Ashulia admin querying or creating in Dhamrai clinic -> 403
    dhamrai_clinic_id = dhamrai_user["clinic_id"]
    for path in (
        f"/api/v1/admin/clinics?clinic_id={dhamrai_clinic_id}",
        f"/api/v1/admin/users?clinic_id={dhamrai_clinic_id}",
        f"/api/v1/admin/audit-logs?clinic_id={dhamrai_clinic_id}",
    ):
        cross = await client.get(path, headers=adm_hdrs)
        assert cross.status_code == 403
        _assert_standard_error(cross.json(), "CROSS_TENANT_FORBIDDEN")

    cross_post = await client.post(
        "/api/v1/admin/users",
        headers=adm_hdrs,
        json={
            "email": f"cross-{uuid.uuid4().hex[:6]}@awaregrid.org",
            "full_name": "Cross Tenant",
            "role": "dispenser",
            "password": "Password#2026!",
            "clinic_id": dhamrai_clinic_id,
        },
    )
    assert cross_post.status_code == 403
    _assert_standard_error(cross_post.json(), "CROSS_TENANT_FORBIDDEN")
    assert admin_user["clinic_id"] != dhamrai_clinic_id


@pytest.mark.asyncio
async def test_idempotency_key_replay_and_conflict(
    client: AsyncClient,
    db_session: AsyncSession,
    login_as: Any,
) -> None:
    admin_token, _ = await login_as("admin@awaregrid.org", "Admin#2026!")
    idem_key = f"create-user-{uuid.uuid4()}"
    unique_email = f"idem.{uuid.uuid4().hex[:8]}@awaregrid.org"
    payload = {
        "email": unique_email,
        "full_name": "Idempotent Clinician",
        "role": "dispenser",
        "password": "Password#2026!",
        "pin": "2026",
    }

    first = await client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {admin_token}", "Idempotency-Key": idem_key},
        json=payload,
    )
    assert first.status_code == 201
    created_id = first.json()["id"]

    # Replay with exact same logical JSON (even reordered keys)
    reordered_payload = {
        "pin": "2026",
        "password": "Password#2026!",
        "role": "dispenser",
        "full_name": "Idempotent Clinician",
        "email": unique_email,
    }
    second = await client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {admin_token}", "Idempotency-Key": idem_key},
        json=reordered_payload,
    )
    assert second.status_code == 201
    assert second.headers.get("X-Idempotent-Replay") == "true"
    assert second.json()["id"] == created_id

    user_count = (
        await db_session.execute(select(func.count(User.id)).where(User.email == unique_email))
    ).scalar_one()
    assert user_count == 1

    # Conflict with same key + different payload
    conflict = await client.post(
        "/api/v1/admin/users",
        headers={"Authorization": f"Bearer {admin_token}", "Idempotency-Key": idem_key},
        json={**payload, "full_name": "Different Clinician Name"},
    )
    assert conflict.status_code == 409
    _assert_standard_error(conflict.json(), "IDEMPOTENCY_KEY_CONFLICT")


@pytest.mark.asyncio
async def test_concurrent_idempotency_same_payload_replays_cleanly(
    client: AsyncClient,
    db_session: AsyncSession,
    login_as: Any,
) -> None:
    admin_token, _ = await login_as("admin@awaregrid.org", "Admin#2026!")
    idem_key = f"conc-same-{uuid.uuid4()}"
    unique_email = f"conc.same.{uuid.uuid4().hex[:8]}@awaregrid.org"
    payload = {
        "email": unique_email,
        "full_name": "Concurrent Same Payload",
        "role": "dispenser",
        "password": "Password#2026!",
        "pin": "2026",
    }
    headers = {"Authorization": f"Bearer {admin_token}", "Idempotency-Key": idem_key}

    responses = await asyncio.gather(
        client.post("/api/v1/admin/users", headers=headers, json=payload),
        client.post("/api/v1/admin/users", headers=headers, json=payload),
    )

    assert sorted(r.status_code for r in responses) == [201, 201]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    assert [r.headers.get("X-Idempotent-Replay") for r in responses].count("true") == 1

    user_count = (
        await db_session.execute(select(func.count(User.id)).where(User.email == unique_email))
    ).scalar_one()
    assert user_count == 1


@pytest.mark.asyncio
async def test_concurrent_idempotency_different_payload_returns_409(
    client: AsyncClient,
    db_session: AsyncSession,
    login_as: Any,
) -> None:
    admin_token, _ = await login_as("admin@awaregrid.org", "Admin#2026!")
    idem_key = f"conc-diff-{uuid.uuid4()}"
    email_a = f"conc.a.{uuid.uuid4().hex[:8]}@awaregrid.org"
    email_b = f"conc.b.{uuid.uuid4().hex[:8]}@awaregrid.org"
    headers = {"Authorization": f"Bearer {admin_token}", "Idempotency-Key": idem_key}

    payload_a = {
        "email": email_a,
        "full_name": "Concurrent User A",
        "role": "dispenser",
        "password": "Password#2026!",
    }
    payload_b = {
        "email": email_b,
        "full_name": "Concurrent User B",
        "role": "dispenser",
        "password": "Password#2026!",
    }

    responses = await asyncio.gather(
        client.post("/api/v1/admin/users", headers=headers, json=payload_a),
        client.post("/api/v1/admin/users", headers=headers, json=payload_b),
    )

    assert sorted(r.status_code for r in responses) == [201, 409]
    created_resp = next(r for r in responses if r.status_code == 201)
    conflict_resp = next(r for r in responses if r.status_code == 409)
    _assert_standard_error(conflict_resp.json(), "IDEMPOTENCY_KEY_CONFLICT")

    created_email = created_resp.json()["email"]
    rejected_email = email_b if created_email == email_a else email_a
    assert (
        await db_session.execute(select(func.count(User.id)).where(User.email == created_email))
    ).scalar_one() == 1
    assert (
        await db_session.execute(select(func.count(User.id)).where(User.email == rejected_email))
    ).scalar_one() == 0


@pytest.mark.asyncio
async def test_idempotency_lock_released_on_rollback_allows_retry(
    client: AsyncClient,
    db_session: AsyncSession,
    login_as: Any,
) -> None:
    admin_token, admin_user = await login_as("admin@awaregrid.org", "Admin#2026!")

    # Part A: Business error rollback does not poison the Idempotency-Key
    retry_key = f"rollback-retry-{uuid.uuid4()}"
    headers_retry = {"Authorization": f"Bearer {admin_token}", "Idempotency-Key": retry_key}
    bad_attempt = await client.post(
        "/api/v1/admin/users",
        headers=headers_retry,
        json={
            "email": "dispenser@awaregrid.org",
            "full_name": "Duplicate Email Failure",
            "role": "dispenser",
            "password": "Password#2026!",
        },
    )
    assert bad_attempt.status_code == 409
    _assert_standard_error(bad_attempt.json(), "EMAIL_ALREADY_EXISTS")

    good_email = f"retry.ok.{uuid.uuid4().hex[:8]}@awaregrid.org"
    good_attempt = await client.post(
        "/api/v1/admin/users",
        headers=headers_retry,
        json={
            "email": good_email,
            "full_name": "Recovered After Rollback",
            "role": "dispenser",
            "password": "Password#2026!",
        },
    )
    assert good_attempt.status_code == 201
    assert good_attempt.json()["email"] == good_email

    # Part B: Deterministic pg_advisory_xact_lock wait & rollback release proof
    lock_key_str = f"advisory-wait-{uuid.uuid4()}"
    lock_int = _advisory_lock_key(
        uuid.UUID(admin_user["clinic_id"]),
        uuid.UUID(admin_user["id"]),
        "POST",
        "/api/v1/admin/users",
        lock_key_str,
    )
    session_factory = async_sessionmaker(
        bind=db_session.bind,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    async with session_factory() as lock_session:
        await lock_session.execute(_ADVISORY_LOCK_STMT, {"lock_key": lock_int})
        wait_email = f"lock.wait.{uuid.uuid4().hex[:8]}@awaregrid.org"
        task = asyncio.create_task(
            client.post(
                "/api/v1/admin/users",
                headers={"Authorization": f"Bearer {admin_token}", "Idempotency-Key": lock_key_str},
                json={
                    "email": wait_email,
                    "full_name": "Advisory Lock Waiter",
                    "role": "dispenser",
                    "password": "Password#2026!",
                },
            )
        )
        await asyncio.sleep(0.05)
        assert not task.done()
        await lock_session.rollback()
        resp = await task

    assert resp.status_code == 201
    assert resp.json()["email"] == wait_email


@pytest.mark.asyncio
async def test_healthz_standard_error_envelope_and_neon_url(client: AsyncClient) -> None:
    # Healthz against live PostgreSQL 16 + Redis 7
    health = await client.get("/healthz")
    assert health.status_code == 200
    assert health.json() == {"status": "ok", "db": "ok", "redis": "ok"}

    # 404 & 422 standard error payloads
    not_found = await client.get("/api/v1/nonexistent-endpoint")
    assert not_found.status_code == 404
    _assert_standard_error(not_found.json(), "NOT_FOUND")

    validation_err = await client.post("/api/v1/auth/login", json={"email": "not-an-email"})
    assert validation_err.status_code == 422
    _assert_standard_error(validation_err.json(), "VALIDATION_ERROR")

    # Neon URL normalization probe (including mixed/uppercase schemes and query keys)
    neon_raw = "postgresql://user:pass@ep-cool-host.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    normalized = normalize_async_database_url(neon_raw)
    assert normalized.startswith("postgresql+asyncpg://")
    assert "channel_binding" not in normalized
    assert "sslmode" not in normalized
    assert "ssl=require" in normalized

    for raw_variant, expected_ssl in (
        ("POSTGRES://u:p@h:5432/db", None),
        ("POSTGRESQL://u:p@h:5432/db", None),
        ("Postgres://u:p@h:5432/db?SSLMODE=require&CHANNEL_BINDING=require", "ssl=require"),
        ("POSTGRESQL+ASYNCPG://u:p@h:5432/db?SSLMODE=disable&CHANNEL_BINDING=require", "ssl=disable"),
    ):
        norm = normalize_async_database_url(raw_variant)
        assert norm.startswith("postgresql+asyncpg://"), norm
        assert "CHANNEL_BINDING" not in norm and "channel_binding" not in norm, norm
        assert "SSLMODE" not in norm and "sslmode" not in norm, norm
        if expected_ssl:
            assert expected_ssl in norm, norm

    # Production JWT_SECRET_KEY startup guard
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="production")
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="prod", JWT_SECRET_KEY="too-short-secret")
    with pytest.raises(ValueError):
        Settings(ENVIRONMENT="development", JWT_SECRET_KEY="   ")
    prod_ok = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="a-very-strong-production-secret-key-2026-valid",
    )
    assert prod_ok.ENVIRONMENT == "production"


@pytest.mark.asyncio
async def test_integrity_error_handler_maps_23505_to_409_only() -> None:
    handler = app.exception_handlers[IntegrityError]

    def _make_request() -> Request:
        return Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/api/v1/test-integrity",
                "headers": [],
            }
        )

    class _FakePgError(Exception):
        def __init__(self, pgcode: str) -> None:
            self.pgcode = pgcode

    unique_exc = IntegrityError("INSERT ...", {}, _FakePgError("23505"))
    resp_409 = await handler(_make_request(), unique_exc)
    assert resp_409.status_code == 409
    _assert_standard_error(json.loads(resp_409.body.decode("utf-8")), "CONFLICT")

    wrapper_orig = Exception("wrapper")
    wrapper_orig.__cause__ = _FakePgError("23502")
    other_exc = IntegrityError("INSERT ...", {}, wrapper_orig)
    resp_500 = await handler(_make_request(), other_exc)
    assert resp_500.status_code == 500
    _assert_standard_error(json.loads(resp_500.body.decode("utf-8")), "INTERNAL_SERVER_ERROR")


@pytest.mark.asyncio
async def test_rate_limit_enforced_via_real_redis(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_REQUESTS", 3)
    monkeypatch.setattr(settings, "RATE_LIMIT_SENSITIVE_REQUESTS", 3)
    monkeypatch.setattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)

    for _ in range(3):
        res = await client.post(
            "/api/v1/auth/verify-pin",
            json={"email": "dispenser@awaregrid.org", "pin": "2026"},
        )
        assert res.status_code == 200

    limited = await client.post(
        "/api/v1/auth/verify-pin",
        json={"email": "dispenser@awaregrid.org", "pin": "2026"},
    )
    assert limited.status_code == 429
    assert "Retry-After" in limited.headers
    _assert_standard_error(limited.json(), "RATE_LIMIT_EXCEEDED")
