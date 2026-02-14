"""
=============================================================================
  Homes & Devices Service — SmartGrid Home (SF Hacks 2026)
=============================================================================

CRUD for homes and devices collections in MongoDB.
=============================================================================
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from agents import get_db, _resolve_fallback
from models import (
    CreateHomeRequest,
    HomeDoc,
    AddDeviceRequest,
    DeviceDoc,
    DevicePower,
    DeviceControl,
    Assumptions,
    SetAssumptionsRequest,
)

logger = logging.getLogger("homes_devices")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _oid(s: str) -> ObjectId:
    """Convert string to ObjectId, raising ValueError on invalid."""
    try:
        return ObjectId(s)
    except Exception:
        raise ValueError(f"Invalid ObjectId: {s}")


def _serialize(doc: dict) -> dict:
    """Serialize a MongoDB document for JSON output."""
    if doc is None:
        return {}
    out = {**doc}
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    # Convert datetimes to ISO strings
    for k, v in out.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


# ---------------------------------------------------------------------------
# Homes
# ---------------------------------------------------------------------------

def _homes_col():
    return get_db()["homes"]


def _assumptions_col():
    return get_db()["assumptions"]


async def create_home(req: CreateHomeRequest) -> dict:
    doc = {
        "userId": req.userId,
        "name": req.name,
        "rooms": req.rooms,
        "createdAt": datetime.now(timezone.utc),
    }
    result = await _homes_col().insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("Created home '%s' (id=%s) for user %s", req.name, result.inserted_id, req.userId)
    return _serialize(doc)


async def get_home(home_id: str) -> Optional[dict]:
    doc = await _homes_col().find_one({"_id": _oid(home_id)})
    return _serialize(doc) if doc else None


async def list_homes(user_id: str) -> list[dict]:
    cursor = _homes_col().find({"userId": user_id}).sort("createdAt", -1)
    return [_serialize(doc) async for doc in cursor]


async def update_home_rooms(home_id: str, rooms: list[str]) -> dict:
    result = await _homes_col().find_one_and_update(
        {"_id": _oid(home_id)},
        {"$set": {"rooms": rooms}},
        return_document=True,
    )
    return _serialize(result) if result else {}


async def delete_home(home_id: str) -> bool:
    oid = _oid(home_id)
    # Delete associated devices
    await _devices_col().delete_many({"homeId": home_id})
    # Delete home
    result = await _homes_col().delete_one({"_id": oid})
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

def _devices_col():
    return get_db()["devices"]


async def add_device(home_id: str, req: AddDeviceRequest) -> dict:
    # Resolve power profile from category if not provided
    power = req.power
    if power is None:
        fallback = _resolve_fallback(req.category)
        power = DevicePower(
            standby_watts_typical=fallback.standby_watts_typical,
            standby_watts_range=fallback.standby_watts_range,
            active_watts_typical=fallback.active_watts_typical,
            active_watts_range=fallback.active_watts_range,
            source="category_estimate",
            confidence=fallback.confidence,
        )

    doc = {
        "homeId": home_id,
        "roomId": req.roomId,
        "label": req.label,
        "brand": req.brand,
        "model": req.model,
        "category": req.category,
        "power": power.model_dump(),
        "is_critical": req.is_critical,
        "last_measured": None,
        "control": (req.control or DeviceControl()).model_dump(),
        "active_hours_per_day": req.active_hours_per_day,
        "usage_profile": req.usage_profile,
        "addedAt": datetime.now(timezone.utc),
    }
    result = await _devices_col().insert_one(doc)
    doc["_id"] = result.inserted_id
    logger.info("Added device '%s' to home %s", req.label, home_id)
    return _serialize(doc)


async def get_device(device_id: str) -> Optional[dict]:
    doc = await _devices_col().find_one({"_id": _oid(device_id)})
    return _serialize(doc) if doc else None


async def list_devices(home_id: str) -> list[dict]:
    cursor = _devices_col().find({"homeId": home_id}).sort("addedAt", -1)
    return [_serialize(doc) async for doc in cursor]


async def update_device(device_id: str, updates: dict) -> dict:
    result = await _devices_col().find_one_and_update(
        {"_id": _oid(device_id)},
        {"$set": updates},
        return_document=True,
    )
    return _serialize(result) if result else {}


async def delete_device(device_id: str) -> bool:
    result = await _devices_col().delete_one({"_id": _oid(device_id)})
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Assumptions per home
# ---------------------------------------------------------------------------

DEFAULT_ASSUMPTIONS = Assumptions()


async def get_assumptions(home_id: str) -> Assumptions:
    doc = await _assumptions_col().find_one({"homeId": home_id})
    if doc:
        return Assumptions(
            rate_per_kwh=doc.get("rate_per_kwh", 0.30),
            kg_co2_per_kwh=doc.get("kg_co2_per_kwh", 0.25),
            profile=doc.get("profile", "typical"),
            standby_reduction=doc.get("standby_reduction", 0.8),
        )
    return DEFAULT_ASSUMPTIONS.model_copy()


async def set_assumptions(home_id: str, req: SetAssumptionsRequest) -> Assumptions:
    current = await get_assumptions(home_id)
    updates: dict = {"homeId": home_id}
    if req.rate_per_kwh is not None:
        updates["rate_per_kwh"] = req.rate_per_kwh
    else:
        updates["rate_per_kwh"] = current.rate_per_kwh
    if req.kg_co2_per_kwh is not None:
        updates["kg_co2_per_kwh"] = req.kg_co2_per_kwh
    else:
        updates["kg_co2_per_kwh"] = current.kg_co2_per_kwh
    if req.profile is not None:
        updates["profile"] = req.profile
    else:
        updates["profile"] = current.profile
    updates["standby_reduction"] = current.standby_reduction

    await _assumptions_col().update_one(
        {"homeId": home_id}, {"$set": updates}, upsert=True
    )
    return Assumptions(**{k: v for k, v in updates.items() if k != "homeId"})
