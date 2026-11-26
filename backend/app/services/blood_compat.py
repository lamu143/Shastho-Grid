"""PulseScore companion: ABO/RhD packed red blood cell (RBC) compatibility.

RBC_DONORS[recipient] lists donor groups whose red cells the recipient can receive.
O- is the universal RBC donor and is scarce, so allocation prefers an exact
group match and penalises spending O- on non-O- recipients.
"""

from __future__ import annotations

from collections.abc import Mapping

BLOOD_GROUPS: tuple[str, ...] = ("O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+")

RBC_DONORS: dict[str, tuple[str, ...]] = {
    "O-": ("O-",),
    "O+": ("O+", "O-"),
    "A-": ("A-", "O-"),
    "A+": ("A+", "A-", "O+", "O-"),
    "B-": ("B-", "O-"),
    "B+": ("B+", "B-", "O+", "O-"),
    "AB-": ("AB-", "A-", "B-", "O-"),
    "AB+": ("AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"),
}

# Cost added when a non-exact donor group is used; O- is the most precious.
_SUBSTITUTE_PENALTY = 50
_O_NEG_PENALTY = 200


def can_receive(recipient: str, donor: str) -> bool:
    if recipient not in RBC_DONORS:
        raise ValueError(f"Unknown blood group: {recipient}")
    if donor not in RBC_DONORS:
        raise ValueError(f"Unknown blood group: {donor}")
    return donor in RBC_DONORS[recipient]


def compatible_units(stock: Mapping[str, int], recipient: str) -> int:
    """Total units in `stock` that `recipient` can safely receive."""
    return sum(max(0, stock.get(donor, 0)) for donor in RBC_DONORS[recipient])


def donor_cost(recipient: str, donor: str) -> int:
    """0 for an exact match; higher for substitutes, highest for spending O- on others."""
    if not can_receive(recipient, donor):
        raise ValueError(f"{recipient} cannot receive {donor} red cells")
    if donor == recipient:
        return 0
    return _O_NEG_PENALTY if donor == "O-" else _SUBSTITUTE_PENALTY


def allocation_plan(stock: Mapping[str, int], recipient: str, units: int) -> list[tuple[str, int]] | None:
    """Cheapest donor mix covering `units`, or None if stock is insufficient."""
    if units <= 0:
        return []
    donors = sorted(RBC_DONORS[recipient], key=lambda d: donor_cost(recipient, d))
    plan: list[tuple[str, int]] = []
    remaining = units
    for donor in donors:
        take = min(max(0, stock.get(donor, 0)), remaining)
        if take:
            plan.append((donor, take))
            remaining -= take
        if remaining == 0:
            return plan
    return None
