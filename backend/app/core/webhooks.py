"""De-identified outbound webhook dispatcher for Zapier / automation integrations."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_BLOCKED_PII_KEYS = frozenset({"patient_name", "full_name", "mrn", "email", "phone", "address"})


def _sanitize(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: _sanitize(v)
            for k, v in obj.items()
            if k.lower() not in _BLOCKED_PII_KEYS
        }
    if isinstance(obj, list):
        return [_sanitize(item) for item in obj]
    return obj


def build_webhook_envelope(
    *,
    event_type: str,
    trace_id: str,
    summary: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "source": "shasthogrid",
        "event_type": event_type,
        "trace_id": trace_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "details": _sanitize(details or {}),
    }


def _is_safe_webhook_url(url: str) -> bool:
    parsed = urlparse(url)
    is_dev = settings.ENVIRONMENT.strip().lower() in {"development", "dev", "local", "test"}
    allowed_schemes = {"https", "http"} if is_dev else {"https"}
    if parsed.scheme not in allowed_schemes or not parsed.hostname:
        return False
    if not is_dev:
        try:
            ip = ipaddress.ip_address(parsed.hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        except ValueError:
            if parsed.hostname.lower() in {"localhost", "localhost.localdomain"}:
                return False
    return True


async def dispatch_webhook(
    *,
    event_type: str,
    trace_id: str,
    summary: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Send a de-identified webhook event if ALERT_WEBHOOK_URL is configured."""
    envelope = build_webhook_envelope(
        event_type=event_type,
        trace_id=trace_id,
        summary=summary,
        details=details,
    )
    target = (settings.ALERT_WEBHOOK_URL or "").strip()
    if not target:
        return {
            "delivered": False,
            "reason": "ALERT_WEBHOOK_URL_NOT_CONFIGURED",
            "envelope": envelope,
        }
    if not _is_safe_webhook_url(target):
        logger.warning("Blocked unsafe webhook URL scheme/host for %s", event_type)
        return {
            "delivered": False,
            "reason": "UNSAFE_WEBHOOK_URL",
            "envelope": envelope,
        }

    payload_bytes = json.dumps(envelope, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(settings.JWT_SECRET_KEY.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                target,
                content=payload_bytes,
                headers={
                    "Content-Type": "application/json",
                    "X-ShasthoGrid-Signature": f"sha256={sig}",
                },
            )
        return {
            "delivered": 200 <= resp.status_code < 300,
            "status_code": resp.status_code,
            "envelope": envelope,
        }
    except Exception as exc:
        logger.warning("Outbound webhook failed (%s): %s", event_type, exc)
        return {
            "delivered": False,
            "reason": "DELIVERY_FAILED",
            "envelope": envelope,
        }
