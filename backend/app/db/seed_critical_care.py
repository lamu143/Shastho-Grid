"""Seed data for ShasthoGrid critical care (CareMatch / LockStep).

Facility names are real Dhaka institutions. Coordinates are verified for DMCH and
Mugda MCH (official/OSM) and approximate for the rest (`coords_verified=False`).
ALL bed, ventilator and blood counts are SIMULATED demo values, not live data.

The stock is shaped so the "Farmgate obstetric haemorrhage" demo case is
infeasible at any single public hospital within 15 minutes, which lets
CareMatch / ConflictProof show a split-resource co-dispatch:
  - DMCH has O- blood but no free ICU bed or ventilator,
  - BMU has a free ICU + ventilator + obstetrics but no O- blood,
  - Mugda and Kurmitola have everything but are too far,
  - Square has everything but is private.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import BloodInventory, Facility, HospitalResource

SEED_NAMESPACE = uuid.UUID("7f3b9a10-2026-4d8e-b1c4-000000000002")

COMMAND_CLINIC: dict[str, Any] = {
    "code": "DHAKA-CMD",
    "name": "Dhaka Regional Health Command",
    "upazila": "Dhaka City",
    "district": "Dhaka",
}

RACELAB_FACILITY_CODE = "RACELAB-SANDBOX"

ALL_SPECIALTIES = ["TRAUMA", "OBSTETRIC", "NEURO", "CARDIAC", "PEDIATRIC"]

# resources: {type: (physical, staffed, available)}; blood: {group: units}
FACILITIES_DATA: list[dict[str, Any]] = [
    {
        "code": "DMCH",
        "name": "Dhaka Medical College Hospital",
        "tier": "PUBLIC",
        "lat": 23.7257,
        "lon": 90.3971,
        "coords_verified": True,
        "specialties": ALL_SPECIALTIES,
        "resources": {"ICU_BED": (20, 10, 0), "VENTILATOR": (15, 8, 0), "HDU_BED": (30, 20, 3)},
        "blood": {"O-": 6, "O+": 20, "A-": 2, "A+": 15, "B-": 2, "B+": 18, "AB-": 1, "AB+": 6},
    },
    {
        "code": "BMU",
        "name": "Bangladesh Medical University Super Specialised Hospital",
        "tier": "PUBLIC",
        "lat": 23.7389,
        "lon": 90.3946,
        "coords_verified": False,
        "specialties": ["OBSTETRIC", "NEURO", "CARDIAC", "TRAUMA"],
        "resources": {"ICU_BED": (100, 20, 2), "VENTILATOR": (60, 18, 2), "HDU_BED": (40, 20, 5)},
        "blood": {"O-": 0, "O+": 4, "A-": 0, "A+": 5, "B-": 0, "B+": 6, "AB-": 0, "AB+": 2},
    },
    {
        "code": "MUGDA",
        "name": "Mugda Medical College Hospital",
        "tier": "PUBLIC",
        "lat": 23.7331,
        "lon": 90.4303,
        "coords_verified": True,
        "specialties": ["OBSTETRIC", "TRAUMA", "PEDIATRIC"],
        "resources": {"ICU_BED": (10, 8, 1), "VENTILATOR": (8, 6, 1), "NICU_BED": (10, 8, 2)},
        "blood": {"O-": 3, "O+": 10, "A-": 1, "A+": 8, "B-": 1, "B+": 9, "AB-": 0, "AB+": 3},
    },
    {
        "code": "NINS",
        "name": "National Institute of Neurosciences & Hospital",
        "tier": "PUBLIC",
        "lat": 23.7765,
        "lon": 90.3697,
        "coords_verified": False,
        "specialties": ["NEURO", "TRAUMA"],
        "resources": {"ICU_BED": (30, 16, 1), "VENTILATOR": (25, 14, 1), "HDU_BED": (20, 12, 2)},
        "blood": {"O-": 1, "O+": 8, "A-": 0, "A+": 6, "B-": 1, "B+": 7, "AB-": 0, "AB+": 2},
    },
    {
        "code": "KURMITOLA",
        "name": "Kurmitola General Hospital",
        "tier": "PUBLIC",
        "lat": 23.8197,
        "lon": 90.4069,
        "coords_verified": False,
        "specialties": ["TRAUMA", "CARDIAC", "OBSTETRIC"],
        "resources": {"ICU_BED": (26, 12, 3), "VENTILATOR": (20, 10, 2), "HDU_BED": (16, 10, 2)},
        "blood": {"O-": 2, "O+": 9, "A-": 1, "A+": 7, "B-": 1, "B+": 8, "AB-": 0, "AB+": 2},
    },
    {
        "code": "SQUARE",
        "name": "Square Hospital (Private)",
        "tier": "PRIVATE",
        "lat": 23.7531,
        "lon": 90.3814,
        "coords_verified": False,
        "specialties": ALL_SPECIALTIES,
        "resources": {"ICU_BED": (40, 40, 4), "VENTILATOR": (30, 30, 3), "NICU_BED": (20, 20, 3)},
        "blood": {"O-": 4, "O+": 12, "A-": 2, "A+": 10, "B-": 2, "B+": 11, "AB-": 1, "AB+": 4},
    },
    {
        "code": "BDRCS-MPUR",
        "name": "BDRCS Blood Centre, Mohammadpur",
        "tier": "BLOOD_HUB",
        "lat": 23.7629,
        "lon": 90.3577,
        "coords_verified": False,
        "specialties": [],
        "resources": {},
        "blood": {"O-": 9, "O+": 30, "A-": 4, "A+": 22, "B-": 4, "B+": 26, "AB-": 2, "AB+": 8},
    },
    {
        # Hidden sandbox for RaceLab: inactive, so it never appears in search or CareMatch,
        # and resetting it never touches real demo stock.
        "code": RACELAB_FACILITY_CODE,
        "name": "RaceLab Sandbox ICU (demo only)",
        "tier": "PUBLIC",
        "lat": 23.7500,
        "lon": 90.3900,
        "coords_verified": False,
        "is_active": False,
        "specialties": ALL_SPECIALTIES,
        "resources": {"ICU_BED": (1, 1, 1)},
        "blood": {},
    },
]

CRITICAL_CARE_USERS: list[dict[str, str]] = [
    {
        "email": "dispatcher@shasthogrid.org",
        "full_name": "Rakibul Hasan (Emergency Dispatcher)",
        "role": "dispatcher",
        "password": "Dispatcher#2026!",
        "pin": "2026",
        "clinic_code": "DHAKA-CMD",
    },
    {
        "email": "bmu.admin@shasthogrid.org",
        "full_name": "Dr. Sabrina Akter (BMU ICU Charge)",
        "role": "hospital_admin",
        "password": "Hospital#2026!",
        "pin": "2026",
        "clinic_code": "DHAKA-CMD",
        "facility_code": "BMU",
    },
    {
        "email": "dmch.blood@shasthogrid.org",
        "full_name": "Shafiqul Islam (DMCH Blood Bank)",
        "role": "blood_bank_officer",
        "password": "BloodBank#2026!",
        "pin": "2026",
        "clinic_code": "DHAKA-CMD",
        "facility_code": "DMCH",
    },
]


def facility_uuid(kind: str, key: str) -> uuid.UUID:
    return uuid.uuid5(SEED_NAMESPACE, f"{kind}:{key}")


async def seed_facilities(session: AsyncSession, today: date) -> dict[str, Facility]:
    """Idempotently create facilities, their staffed resources and blood stock."""
    facilities: dict[str, Facility] = {}
    for item in FACILITIES_DATA:
        facility = (
            await session.execute(select(Facility).where(Facility.code == item["code"]))
        ).scalar_one_or_none()
        if facility is None:
            facility = Facility(
                id=facility_uuid("facility", item["code"]),
                code=item["code"],
                name=item["name"],
                tier=item["tier"],
                lat=item["lat"],
                lon=item["lon"],
                coords_verified=item["coords_verified"],
                specialties=list(item["specialties"]),
                is_active=item.get("is_active", True),
            )
            session.add(facility)
            await session.flush()

            for rtype, (physical, staffed, available) in item["resources"].items():
                session.add(
                    HospitalResource(
                        id=facility_uuid("resource", f"{item['code']}:{rtype}"),
                        facility_id=facility.id,
                        resource_type=rtype,
                        total_physical_count=physical,
                        staffed_capacity_count=staffed,
                        available_count=available,
                    )
                )
            for offset, (group, units) in enumerate(item["blood"].items()):
                session.add(
                    BloodInventory(
                        id=facility_uuid("blood", f"{item['code']}:{group}"),
                        facility_id=facility.id,
                        blood_type=group,
                        units_available=units,
                        nearest_expiry_date=today + timedelta(days=12 + offset * 3),
                    )
                )
        facilities[item["code"]] = facility
    await session.flush()
    return facilities
