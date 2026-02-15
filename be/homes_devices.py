"""
=============================================================================
  Homes & Devices Service — SmartGrid Home (SF Hacks 2026)
=============================================================================

CRUD for homes and devices collections in MongoDB.
Falls back to in-memory storage when MongoDB is unavailable.
=============================================================================
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from agents import get_db, _resolve_fallback
from db_fallback import is_db_available, MemCollection
from models import (
    CreateHomeRequest,
    HomeDoc,
    AddDeviceRequest,
    DeviceDoc,
    DevicePower,
    DeviceControl,
    Assumptions,
    SetAssumptionsRequest,
    RoomModel,
    SceneObject,
    SceneRoom,
    HomeScene,
    AddRoomRequest,
)

logger = logging.getLogger("homes_devices")


# In-memory stores
_MEM_HOMES: dict[str, dict] = {}
_MEM_DEVICES: dict[str, dict] = {}
_MEM_ASSUMPTIONS: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _oid(s: str):
    """Convert string to ObjectId, or return as-is in memory mode."""
    if not is_db_available():
        return s
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
    if not is_db_available():
        return MemCollection(_MEM_HOMES, "homes")
    return get_db()["homes"]


def _assumptions_col():
    if not is_db_available():
        return MemCollection(_MEM_ASSUMPTIONS, "assumptions")
    return get_db()["assumptions"]


async def create_home(req: CreateHomeRequest) -> dict:
    # Build scene from room list
    scene_rooms = [
        SceneRoom(roomId=r.roomId, name=r.name).model_dump()
        for r in req.rooms
    ]
    scene = HomeScene(
        rooms=[SceneRoom(**sr) for sr in scene_rooms],
        objects=[],
    )
    doc = {
        "userId": req.userId,
        "name": req.name,
        "rooms": [r.model_dump() for r in req.rooms],
        "scene": scene.model_dump(),
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


async def update_home_rooms(home_id: str, rooms: list[dict]) -> dict:
    """Legacy helper — overwrites entire rooms list. Prefer add_room/remove_room."""
    result = await _homes_col().find_one_and_update(
        {"_id": _oid(home_id)},
        {"$set": {"rooms": rooms}},
        return_document=True,
    )
    return _serialize(result) if result else {}


async def add_room(home_id: str, name: str) -> dict:
    """Add a new room to the home; auto-assign roomId and update scene."""
    home = await _homes_col().find_one({"_id": _oid(home_id)})
    if not home:
        return {}
    existing_rooms = home.get("rooms", [])
    max_num = 0
    for r in existing_rooms:
        rid = r.get("roomId", "")
        if rid.startswith("r"):
            try:
                max_num = max(max_num, int(rid[1:]))
            except ValueError:
                pass
    new_id = f"r{max_num + 1}"
    new_room = {"roomId": new_id, "name": name}
    new_scene_room = SceneRoom(roomId=new_id, name=name).model_dump()
    result = await _homes_col().find_one_and_update(
        {"_id": _oid(home_id)},
        {
            "$push": {
                "rooms": new_room,
                "scene.rooms": new_scene_room,
            }
        },
        return_document=True,
    )
    return _serialize(result) if result else {}


async def remove_room(home_id: str, room_id: str) -> dict:
    """Remove a room. Devices in that room get roomId='unassigned'."""
    # Move devices to unassigned
    await _devices_col().update_many(
        {"homeId": home_id, "roomId": room_id},
        {"$set": {"roomId": "unassigned"}},
    )
    # Pull room from home.rooms and home.scene.rooms
    result = await _homes_col().find_one_and_update(
        {"_id": _oid(home_id)},
        {
            "$pull": {
                "rooms": {"roomId": room_id},
                "scene.rooms": {"roomId": room_id},
            }
        },
        return_document=True,
    )
    # Also update scene objects referencing this room
    if result:
        await _homes_col().update_one(
            {"_id": _oid(home_id)},
            {"$set": {"scene.objects.$[elem].roomId": "unassigned"}},
            array_filters=[{"elem.roomId": room_id}],
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
    if not is_db_available():
        return MemCollection(_MEM_DEVICES, "devices")
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
    device_id = str(result.inserted_id)

    # ── Append scene object with auto-placement ───────────────────────
    try:
        home = await _homes_col().find_one({"_id": _oid(home_id)})
        existing_objects = home.get("scene", {}).get("objects", []) if home else []
        n = len(existing_objects)
        # Grid-based auto-placement: spread objects along x-axis
        position = [1.0 + n * 0.7, 0.0, 1.0]

        # Category → asset key mapping
        asset_key = _category_to_asset(req.category)

        scene_obj = SceneObject(
            objectId=f"obj_{device_id}",
            deviceId=device_id,
            roomId=req.roomId,
            category=req.category,
            assetKey=asset_key,
            position=position,
            rotation=[0.0, 0.0, 0.0],
            scale=[1.0, 1.0, 1.0],
        ).model_dump()

        await _homes_col().update_one(
            {"_id": _oid(home_id)},
            {"$push": {"scene.objects": scene_obj}},
        )
        logger.info("Appended scene object for device '%s' in home %s", req.label, home_id)
    except Exception as e:
        logger.warning("Scene object append failed (non-fatal): %s", e)

    logger.info("Added device '%s' to home %s", req.label, home_id)
    return _serialize(doc)


def _category_to_asset(category: str) -> str:
    """Map a device category to a 3-D asset key."""
    _map = {
        "television": "models/television.glb",
        "tv": "models/television.glb",
        "laptop": "models/laptop.glb",
        "monitor": "models/monitor.glb",
        "microwave": "models/microwave.glb",
        "oven": "models/oven.glb",
        "toaster": "models/toaster.glb",
        "refrigerator": "models/refrigerator.glb",
        "fridge": "models/refrigerator.glb",
        "hair dryer": "models/hair_dryer.glb",
        "phone charger": "models/phone_charger.glb",
        "washing machine": "models/washing_machine.glb",
        "dryer": "models/dryer.glb",
        "light bulb": "models/light_bulb.glb",
        "lamp": "models/lamp.glb",
        "air conditioner": "models/air_conditioner.glb",
        "space heater": "models/space_heater.glb",
        "gaming console": "models/gaming_console.glb",
        "router": "models/router.glb",
        "fan": "models/fan.glb",
        "water heater": "models/water_heater.glb",
        "dishwasher": "models/dishwasher.glb",
        "coffee maker": "models/coffee_maker.glb",
        "vacuum": "models/vacuum.glb",
        "iron": "models/iron.glb",
        "desktop computer": "models/desktop_computer.glb",
        "printer": "models/printer.glb",
        "speaker": "models/speaker.glb",
    }
    return _map.get(category.lower().strip(), f"models/{category.lower().replace(' ', '_')}.glb")


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
    # Also remove matching scene object from the home
    device = await _devices_col().find_one({"_id": _oid(device_id)})
    if device:
        home_id = device.get("homeId")
        if home_id:
            try:
                await _homes_col().update_one(
                    {"_id": _oid(home_id)},
                    {"$pull": {"scene.objects": {"deviceId": device_id}}},
                )
            except Exception:
                pass
    result = await _devices_col().delete_one({"_id": _oid(device_id)})
    return result.deleted_count > 0


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

async def get_scene(home_id: str) -> dict:
    """Return the scene JSON for a home."""
    home = await _homes_col().find_one({"_id": _oid(home_id)}, {"scene": 1})
    if not home:
        return {"rooms": [], "objects": []}
    return home.get("scene", {"rooms": [], "objects": []})


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
