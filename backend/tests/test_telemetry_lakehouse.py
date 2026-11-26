"""Tests for Datadog-compatible telemetry and Databricks Lakehouse NDJSON export."""

from __future__ import annotations

import json

from httpx import AsyncClient

ADMIN = ("admin@awaregrid.org", "Admin#2026!")
DISPENSER = ("dispenser@awaregrid.org", "Dispenser#2026!")


async def test_telemetry_and_response_time_header(client: AsyncClient, login_as) -> None:
    token, _ = await login_as(*ADMIN)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/admin/telemetry", headers=headers)
    assert res.status_code == 200, res.text
    assert "X-Trace-Id" in res.headers
    assert float(res.headers["X-Response-Time-Ms"]) >= 0.0
    body = res.json()
    assert body["total_requests"] >= 1
    assert "auth" in body["route_groups"]

    prom = await client.get("/api/v1/admin/telemetry/prometheus", headers=headers)
    assert prom.status_code == 200
    assert "shasthogrid_http_requests_total" in prom.text
    assert "shasthogrid_http_duration_p95_ms" in prom.text


async def test_telemetry_forbidden_for_dispenser(client: AsyncClient, login_as) -> None:
    token, _ = await login_as(*DISPENSER)
    res = await client.get("/api/v1/admin/telemetry", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


async def test_lakehouse_ndjson_export_is_deidentified(client: AsyncClient, login_as) -> None:
    token, _ = await login_as(*DISPENSER)
    res = await client.get("/api/v1/analytics/lakehouse-export", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith("application/x-ndjson")
    for line in res.text.strip().splitlines():
        row = json.loads(line)
        assert row["record_type"] == "stewardship_dispense"
        assert "patient_name" not in row
        assert "mrn" not in row
        assert "email" not in row


async def test_webhook_test_endpoint_and_pii_sanitizer(client: AsyncClient, login_as) -> None:
    from app.core.webhooks import build_webhook_envelope

    env = build_webhook_envelope(
        event_type="TEST",
        trace_id="trace-1234",
        summary="ok",
        details={"clinic_id": "c1", "patient_name": "Secret", "mrn": "123", "email": "a@b.com"},
    )
    assert env["details"] == {"clinic_id": "c1"}

    token, _ = await login_as(*ADMIN)
    res = await client.post("/api/v1/admin/webhooks/test", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["envelope"]["event_type"] == "SHASTHOGRID_WEBHOOK_TEST"
    assert body["delivered"] is False


async def test_auth_permissions_jwt_claims_and_teamwork_graph(client: AsyncClient, login_as) -> None:
    from app.core.security import decode_access_token

    token, _ = await login_as(*DISPENSER)
    claims = decode_access_token(token)
    assert claims.iss == "shasthogrid"
    assert claims.jti is not None

    perm = await client.get("/api/v1/auth/permissions", headers={"Authorization": f"Bearer {token}"})
    assert perm.status_code == 200, perm.text
    pbody = perm.json()
    assert pbody["role"] == "dispenser"
    assert pbody["isolation_scope"] == "clinic"
    assert "stewardship:optimize" in pbody["scopes"]

    tw = await client.get("/api/v1/analytics/teamwork-graph?days=7", headers={"Authorization": f"Bearer {token}"})
    assert tw.status_code == 200, tw.text
    tw_body = tw.json()
    assert tw_body["window_days"] == 7
    assert "dispenser" in tw_body["roles"]
    assert all("email" not in edge for edge in tw_body["edges"])


async def test_telemetry_readiness_and_rate_limit_fail_closed(
    client: AsyncClient,
    login_as,
    monkeypatch,
) -> None:
    from app.core import rate_limit
    from app.core.config import settings

    token, _ = await login_as(*ADMIN)
    res = await client.get("/api/v1/admin/telemetry", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text
    readiness = res.json()["readiness"]
    assert readiness["environment"] == settings.ENVIRONMENT
    assert readiness["allow_demo_data_in_production"] is settings.ALLOW_DEMO_DATA_IN_PRODUCTION
    assert readiness["rate_limit_fail_closed_on_sensitive"] is settings.RATE_LIMIT_FAIL_CLOSED_ON_SENSITIVE
    assert readiness["rate_limiter_backend"] in {"redis", "upstash"}

    async def _broken_check(*_args, **_kwargs):
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(rate_limit, "check_rate_limit", _broken_check)

    monkeypatch.setattr(settings, "RATE_LIMIT_FAIL_CLOSED_ON_SENSITIVE", False)
    degraded = await client.post("/api/v1/auth/login", json={"email": "x@y.z", "password": "bad"})
    assert degraded.headers.get("X-RateLimit-Status") == "degraded"

    monkeypatch.setattr(settings, "RATE_LIMIT_FAIL_CLOSED_ON_SENSITIVE", True)
    closed = await client.post("/api/v1/auth/login", json={"email": "x@y.z", "password": "bad"})
    assert closed.status_code == 503
    assert closed.json()["error_code"] == "RATE_LIMITER_UNAVAILABLE"


async def test_lakehouse_audit_webhook_ssrf_and_like_escape(
    client: AsyncClient,
    login_as,
    monkeypatch,
) -> None:
    from app.core.config import settings
    from app.core.webhooks import _is_safe_webhook_url

    admin_tok, _ = await login_as(*ADMIN)
    admin_headers = {"Authorization": f"Bearer {admin_tok}"}

    exp = await client.get("/api/v1/analytics/lakehouse-export", headers=admin_headers)
    assert exp.status_code == 200
    logs = await client.get("/api/v1/admin/audit-logs?action=LAKEHOUSE_EXPORT", headers=admin_headers)
    assert logs.status_code == 200
    assert any(item["action"] == "LAKEHOUSE_EXPORT" for item in logs.json())

    # SQL LIKE wildcard '%' must be escaped rather than matching all facilities.
    fac_res = await client.get("/api/v1/facilities?q=%25", headers=admin_headers)
    assert fac_res.status_code == 200
    assert fac_res.json()["items"] == []

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert _is_safe_webhook_url("https://hooks.example.org/shasthogrid") is True
    assert _is_safe_webhook_url("http://hooks.example.org/shasthogrid") is False
    assert _is_safe_webhook_url("https://127.0.0.1/hook") is False
    assert _is_safe_webhook_url("https://10.0.0.5/hook") is False
    assert _is_safe_webhook_url("https://localhost/hook") is False
