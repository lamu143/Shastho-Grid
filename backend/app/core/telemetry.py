"""Datadog-compatible structured request telemetry and RED metrics (Requests, Errors, Duration)."""

from __future__ import annotations

import json
import logging
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field

telemetry_logger = logging.getLogger("shasthogrid.telemetry")

_MAX_SAMPLES = 200


def _route_group(path: str) -> str:
    if path == "/healthz":
        return "health"
    trimmed = path.removeprefix("/api/v1/")
    head = trimmed.split("/", 1)[0]
    if head in {
        "auth",
        "admin",
        "patients",
        "inventory",
        "optimize",
        "dispenses",
        "sync",
        "analytics",
        "voice",
        "facilities",
        "carematch",
        "critical-care",
        "reservations",
        "racelab",
        "copilot",
        "feed",
        "sathi",
    }:
        return head.replace("-", "_")
    return "other"


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = min(len(sorted_vals) - 1, max(0, math.ceil((pct / 100.0) * len(sorted_vals)) - 1))
    return round(sorted_vals[idx], 2)


@dataclass
class _GroupBucket:
    requests: int = 0
    errors_4xx: int = 0
    errors_5xx: int = 0
    samples_ms: deque[float] = field(default_factory=lambda: deque(maxlen=_MAX_SAMPLES))


class TelemetryStore:
    def __init__(self) -> None:
        self.started_at = time.time()
        self.total_requests = 0
        self.errors_4xx = 0
        self.errors_5xx = 0
        self._groups: dict[str, _GroupBucket] = defaultdict(_GroupBucket)

    def record(self, *, method: str, path: str, status_code: int, duration_ms: float, trace_id: str) -> None:
        self.total_requests += 1
        if 400 <= status_code < 500:
            self.errors_4xx += 1
        elif status_code >= 500:
            self.errors_5xx += 1

        group = _route_group(path)
        bucket = self._groups[group]
        bucket.requests += 1
        if 400 <= status_code < 500:
            bucket.errors_4xx += 1
        elif status_code >= 500:
            bucket.errors_5xx += 1
        bucket.samples_ms.append(round(duration_ms, 2))

        if path != "/healthz":
            telemetry_logger.info(
                json.dumps(
                    {
                        "dd": {"trace_id": trace_id},
                        "http": {"method": method, "route": path, "status_code": status_code},
                        "duration_ms": round(duration_ms, 2),
                        "route_group": group,
                    },
                    separators=(",", ":"),
                )
            )

    def snapshot(self) -> dict:
        groups_out = {}
        for name in sorted(self._groups):
            b = self._groups[name]
            ordered = sorted(b.samples_ms)
            groups_out[name] = {
                "requests": b.requests,
                "errors_4xx": b.errors_4xx,
                "errors_5xx": b.errors_5xx,
                "p50_ms": _percentile(ordered, 50),
                "p95_ms": _percentile(ordered, 95),
                "max_ms": round(ordered[-1], 2) if ordered else 0.0,
            }
        return {
            "uptime_seconds": round(time.time() - self.started_at, 1),
            "total_requests": self.total_requests,
            "errors_4xx": self.errors_4xx,
            "errors_5xx": self.errors_5xx,
            "route_groups": groups_out,
        }

    def to_prometheus(self) -> str:
        lines = [
            "# HELP shasthogrid_http_requests_total Total HTTP requests by route group.",
            "# TYPE shasthogrid_http_requests_total counter",
        ]
        for name in sorted(self._groups):
            b = self._groups[name]
            lines.append(f'shasthogrid_http_requests_total{{route_group="{name}"}} {b.requests}')

        lines.extend(
            [
                "# HELP shasthogrid_http_errors_total Total HTTP 4xx/5xx responses by route group.",
                "# TYPE shasthogrid_http_errors_total counter",
            ]
        )
        for name in sorted(self._groups):
            b = self._groups[name]
            lines.append(f'shasthogrid_http_errors_total{{route_group="{name}",class="4xx"}} {b.errors_4xx}')
            lines.append(f'shasthogrid_http_errors_total{{route_group="{name}",class="5xx"}} {b.errors_5xx}')

        lines.extend(
            [
                "# HELP shasthogrid_http_duration_p95_ms Rolling p95 latency in milliseconds by route group.",
                "# TYPE shasthogrid_http_duration_p95_ms gauge",
            ]
        )
        for name in sorted(self._groups):
            ordered = sorted(self._groups[name].samples_ms)
            lines.append(f'shasthogrid_http_duration_p95_ms{{route_group="{name}"}} {_percentile(ordered, 95)}')

        return "\n".join(lines) + "\n"


telemetry = TelemetryStore()
