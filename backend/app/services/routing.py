"""Travel-time estimates for CareMatch.

Default: Haversine distance x urban road factor (1.35 for Dhaka) at a fixed speed.
Optional: OSRM public routing (OSRM_ENABLED=true) with a short timeout, a 5-minute
in-memory cache and automatic fallback, so routing never blocks a dispatch.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Literal

import httpx

from app.core.config import settings

_EARTH_RADIUS_KM = 6371.0088
_CACHE_TTL_SECONDS = 300
_cache: dict[tuple[float, float, float, float], tuple[float, "RouteEstimate"]] = {}


@dataclass(frozen=True)
class RouteEstimate:
    distance_km: float
    eta_minutes: float
    source: Literal["osrm", "haversine_urban"]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def estimate_route(
    lat1: float, lon1: float, lat2: float, lon2: float, speed_kmh: float | None = None
) -> RouteEstimate:
    """Deterministic, network-free estimate used for sorting and as the OSRM fallback."""
    speed = speed_kmh or settings.AMBULANCE_SPEED_KMH
    road_km = haversine_km(lat1, lon1, lat2, lon2) * settings.URBAN_ROAD_FACTOR
    return RouteEstimate(
        distance_km=round(road_km, 2),
        eta_minutes=round(road_km / speed * 60, 1),
        source="haversine_urban",
    )


async def route(
    lat1: float, lon1: float, lat2: float, lon2: float, speed_kmh: float | None = None
) -> RouteEstimate:
    """OSRM when enabled and reachable; otherwise the Haversine estimate."""
    fallback = estimate_route(lat1, lon1, lat2, lon2, speed_kmh)
    if not settings.OSRM_ENABLED:
        return fallback

    key = (round(lat1, 5), round(lon1, 5), round(lat2, 5), round(lon2, 5))
    cached = _cache.get(key)
    if cached and time.monotonic() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{lon1},{lat1};{lon2},{lat2}"
    try:
        async with httpx.AsyncClient(timeout=settings.OSRM_TIMEOUT_SECONDS) as client:
            response = await client.get(url, params={"overview": "false"})
            response.raise_for_status()
            leg = response.json()["routes"][0]
        result = RouteEstimate(
            distance_km=round(leg["distance"] / 1000, 2),
            eta_minutes=round(leg["duration"] / 60, 1),
            source="osrm",
        )
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return fallback

    _cache[key] = (time.monotonic(), result)
    return result
