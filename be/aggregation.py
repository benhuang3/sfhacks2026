"""
=============================================================================
  Aggregation Service — WattVision (SF Hacks 2026)
=============================================================================

Computes per-home energy, cost, and CO₂ summaries from device estimates
or measured readings.  Stores ROI snapshots for historical tracking.

Formulas:
  standby_annual_kwh  = standby_watts * 24 * 365 / 1000
  active_annual_kwh   = active_watts * active_hours_per_day * 365 / 1000
  total_annual_kwh    = standby_annual_kwh + active_annual_kwh
  annual_cost         = total_annual_kwh * rate_per_kwh
  annual_co2_kg       = total_annual_kwh * kg_co2_per_kwh
=============================================================================
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from agents import get_db
from db_fallback import is_db_available, MemCollection
from homes_devices import list_devices, get_assumptions
from models import (
    Assumptions,
    DeviceBreakdown,
    ROISnapshot,
    PROFILE_ACTIVE_HOURS,
)

logger = logging.getLogger("aggregation")


# ---------------------------------------------------------------------------
# Per-device computation
# ---------------------------------------------------------------------------

def compute_device_breakdown(
    device: dict,
    assumptions: Assumptions,
) -> DeviceBreakdown:
    """Compute annual energy, cost, CO₂ for a single device."""
    power = device.get("power", {})
    standby_w = power.get("standby_watts_typical", 2.0)

    # Category-based default wattage instead of blanket 75W
    category = device.get("category", "").lower()
    _CATEGORY_WATT_DEFAULTS = {
        "television": 80, "tv": 80, "refrigerator": 150, "fridge": 150,
        "microwave": 1000, "laptop": 35, "monitor": 25, "oven": 2500,
        "toaster": 1100, "washing machine": 400, "washer": 400,
        "dryer": 2500, "hair dryer": 1500, "air conditioner": 1000,
        "heater": 1500, "space heater": 1500, "light": 10, "lamp": 10,
        "light bulb": 10, "fan": 35, "router": 8, "gaming console": 120,
        "coffee maker": 800, "blender": 400, "dishwasher": 180,
        "phone charger": 12, "stove": 1500, "cooking": 1500,
        "sofa": 0, "bed": 0, "chair": 0, "table": 0, "sink": 0,
        "toilet": 0, "bathtub": 0, "cupboard": 0,
    }
    cat_default = 50.0  # conservative default (was 75)
    for k, w in _CATEGORY_WATT_DEFAULTS.items():
        if k in category:
            cat_default = float(w)
            break

    active_w = power.get("active_watts_typical", cat_default)

    standby_range = power.get("standby_watts_range", [standby_w * 0.5, standby_w * 2])
    active_range = power.get("active_watts_range", [active_w * 0.5, active_w * 2])

    # Active hours: device-specific override → user profile → default 4h
    active_hours = device.get("active_hours_per_day")
    if not active_hours or active_hours <= 0:
        profile = device.get("usage_profile", assumptions.profile)
        active_hours = PROFILE_ACTIVE_HOURS.get(profile, 4.0)
    active_hours = min(active_hours, 24)  # clamp to valid range

    standby_hours = 24 - active_hours

    # Typical
    standby_annual_kwh = standby_w * standby_hours * 365 / 1000
    active_annual_kwh = active_w * active_hours * 365 / 1000
    total_kwh = standby_annual_kwh + active_annual_kwh

    # Min (low standby + low active)
    min_standby_kwh = standby_range[0] * standby_hours * 365 / 1000
    min_active_kwh = active_range[0] * active_hours * 365 / 1000
    min_total_kwh = min_standby_kwh + min_active_kwh

    # Max (high standby + high active)
    max_standby_kwh = standby_range[1] * standby_hours * 365 / 1000
    max_active_kwh = active_range[1] * active_hours * 365 / 1000
    max_total_kwh = max_standby_kwh + max_active_kwh

    annual_cost = total_kwh * assumptions.rate_per_kwh
    annual_co2 = total_kwh * assumptions.kg_co2_per_kwh
    standby_cost = standby_annual_kwh * assumptions.rate_per_kwh

    return DeviceBreakdown(
        deviceId=device.get("id", str(device.get("_id", ""))),
        label=device.get("label", "Unknown"),
        category=device.get("category", "Unknown"),
        annual_kwh=round(total_kwh, 2),
        annual_kwh_min=round(min_total_kwh, 2),
        annual_kwh_max=round(max_total_kwh, 2),
        annual_cost=round(annual_cost, 2),
        annual_co2_kg=round(annual_co2, 2),
        standby_annual_kwh=round(standby_annual_kwh, 2),
        standby_annual_cost=round(standby_cost, 2),
    )


# ---------------------------------------------------------------------------
# Home-level aggregation
# ---------------------------------------------------------------------------

async def compute_home_summary(home_id: str) -> dict:
    """
    Aggregate energy, cost, CO₂ across all devices in a home.
    Returns totals + per-device breakdown + range (min/typ/max).
    """
    devices = await list_devices(home_id)
    assumptions = await get_assumptions(home_id)

    breakdowns: list[DeviceBreakdown] = []
    for d in devices:
        bd = compute_device_breakdown(d, assumptions)
        breakdowns.append(bd)

    total_kwh = sum(b.annual_kwh for b in breakdowns)
    total_kwh_min = sum(b.annual_kwh_min for b in breakdowns)
    total_kwh_max = sum(b.annual_kwh_max for b in breakdowns)
    total_cost = sum(b.annual_cost for b in breakdowns)
    total_co2 = sum(b.annual_co2_kg for b in breakdowns)
    total_standby_kwh = sum(b.standby_annual_kwh for b in breakdowns)
    total_standby_cost = sum(b.standby_annual_cost for b in breakdowns)

    totals = {
        "device_count": len(devices),
        "annual_kwh": round(total_kwh, 2),
        "annual_kwh_min": round(total_kwh_min, 2),
        "annual_kwh_max": round(total_kwh_max, 2),
        "annual_cost": round(total_cost, 2),
        "annual_cost_min": round(total_kwh_min * assumptions.rate_per_kwh, 2),
        "annual_cost_max": round(total_kwh_max * assumptions.rate_per_kwh, 2),
        "annual_co2_kg": round(total_co2, 2),
        "monthly_cost": round(total_cost / 12, 2),
        "daily_cost": round(total_cost / 365, 2),
        "standby_annual_kwh": round(total_standby_kwh, 2),
        "standby_annual_cost": round(total_standby_cost, 2),
    }

    return {
        "homeId": home_id,
        "assumptions": assumptions.model_dump(),
        "totals": totals,
        "by_device": [b.model_dump() for b in breakdowns],
    }


# ---------------------------------------------------------------------------
# ROI Snapshot persistence
# ---------------------------------------------------------------------------

_MEM_SNAPSHOTS: dict[str, dict] = {}


def _snapshots_col():
    if not is_db_available():
        return MemCollection(_MEM_SNAPSHOTS, "snapshots")
    return get_db()["roi_snapshots"]


async def save_snapshot(home_id: str, summary: dict) -> str:
    """Persist a snapshot of the current summary for historical tracking."""
    doc = {
        "homeId": home_id,
        "timestamp": datetime.now(timezone.utc),
        "assumptions": summary["assumptions"],
        "totals": summary["totals"],
        "by_device": summary["by_device"],
    }
    result = await _snapshots_col().insert_one(doc)
    logger.info("Saved ROI snapshot for home %s", home_id)
    return str(result.inserted_id)


async def list_snapshots(home_id: str, limit: int = 10) -> list[dict]:
    cursor = _snapshots_col().find(
        {"homeId": home_id}, {"_id": 0}
    ).sort("timestamp", -1).limit(limit)
    results = []
    async for doc in cursor:
        for k, v in doc.items():
            if isinstance(v, datetime):
                doc[k] = v.isoformat()
        results.append(doc)
    return results
