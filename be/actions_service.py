"""
=============================================================================
  Actions Service — SmartGrid Home (SF Hacks 2026)
=============================================================================

Handles action execution, audit logging, and revert functionality.
Integrates with smart-plug APIs (stub for hackathon, ready for
Home Assistant / Matter / brand APIs).
=============================================================================
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId

from agents import get_db
from db_fallback import is_db_available, MemCollection
from models import (
    ActionDoc,
    ActionProposal,
    ActionParameters,
    ActionStatus,
)

logger = logging.getLogger("actions")

_MEM_ACTIONS: dict[str, dict] = {}


def _actions_col():
    if not is_db_available():
        return MemCollection(_MEM_ACTIONS, "actions")
    return get_db()["actions"]


def _oid(s: str):
    if not is_db_available():
        return s
    try:
        return ObjectId(s)
    except Exception:
        raise ValueError(f"Invalid ObjectId: {s}")


def _serialize(doc: dict) -> dict:
    if doc is None:
        return {}
    out = {**doc}
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    for k, v in out.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


# ---------------------------------------------------------------------------
# Store proposals as action documents
# ---------------------------------------------------------------------------

async def store_proposals(home_id: str, proposals: list[ActionProposal]) -> list[str]:
    """Store proposed actions in the actions collection."""
    ids = []
    for p in proposals:
        doc = {
            "homeId": home_id,
            "deviceId": p.deviceId,
            "label": p.label,
            "action_type": p.action_type,
            "parameters": p.parameters.model_dump(),
            "status": "proposed",
            "agentId": "ai_agent_v1",
            "estimated_savings": {
                "dollars_per_year": p.estimated_annual_dollars_saved,
                "kwh_per_year": p.estimated_annual_kwh_saved,
                "co2_kg_per_year": p.estimated_co2_kg_saved,
                "cost_usd": p.estimated_cost_usd,
                "payback_months": p.payback_months,
            },
            "feasibility_score": p.feasibility_score,
            "rationale": p.rationale,
            "safety_flags": p.safety_flags,
            "createdAt": datetime.now(timezone.utc),
            "executedAt": None,
            "revertedAt": None,
        }
        result = await _actions_col().insert_one(doc)
        ids.append(str(result.inserted_id))
    logger.info("Stored %d proposals for home %s", len(ids), home_id)
    return ids


# ---------------------------------------------------------------------------
# Execute actions
# ---------------------------------------------------------------------------

async def execute_actions(action_ids: list[str]) -> list[dict]:
    """
    Execute selected actions.  For hackathon, this simulates execution.
    In production, call Home Assistant / Matter / vendor APIs.
    """
    results = []
    for aid in action_ids:
        doc = await _actions_col().find_one({"_id": _oid(aid)})
        if not doc:
            results.append({"id": aid, "status": "not_found", "error": "Action not found"})
            continue

        if doc["status"] not in ("proposed", "scheduled"):
            results.append({
                "id": aid,
                "status": doc["status"],
                "error": f"Cannot execute action in state '{doc['status']}'"
            })
            continue

        action_type = doc["action_type"]
        device_id = doc["deviceId"]

        # --- Simulate execution ---
        execution_result = await _execute_single_action(action_type, device_id, doc.get("parameters", {}))

        if execution_result["success"]:
            await _actions_col().update_one(
                {"_id": _oid(aid)},
                {"$set": {
                    "status": "executed",
                    "executedAt": datetime.now(timezone.utc),
                }},
            )
            results.append({
                "id": aid,
                "status": "executed",
                "details": execution_result,
            })
            logger.info("Executed action %s (type=%s, device=%s)", aid, action_type, device_id)
        else:
            await _actions_col().update_one(
                {"_id": _oid(aid)},
                {"$set": {"status": "failed"}},
            )
            results.append({
                "id": aid,
                "status": "failed",
                "error": execution_result.get("error", "Unknown error"),
            })
            logger.error("Action %s failed: %s", aid, execution_result.get("error"))

    return results


async def _execute_single_action(action_type: str, device_id: str, parameters: dict) -> dict:
    """
    Simulate action execution.  Replace with real API calls for production.

    Smart plug integration points:
      - Home Assistant: POST /api/services/switch/turn_off
      - TP-Link Kasa: via python-kasa library
      - Shelly: HTTP API
      - Matter: via matter-server
    """
    try:
        if action_type == "turn_off":
            # In production: call smart plug API to turn off
            logger.info("SIMULATED: Turning off device %s", device_id)
            return {"success": True, "action": "turn_off", "simulated": True}

        elif action_type == "schedule":
            # In production: set schedule via smart plug or Home Assistant automation
            start = parameters.get("schedule_off_start", "23:00")
            end = parameters.get("schedule_off_end", "07:00")
            logger.info("SIMULATED: Scheduling device %s off from %s to %s", device_id, start, end)
            return {"success": True, "action": "schedule", "schedule": f"{start}-{end}", "simulated": True}

        elif action_type == "smart_plug":
            # In production: configure smart plug auto-off
            logger.info("SIMULATED: Configuring smart plug for device %s", device_id)
            return {"success": True, "action": "smart_plug", "simulated": True}

        elif action_type == "set_mode":
            # In production: send eco-mode command to device API
            mode = parameters.get("eco_mode", "eco")
            logger.info("SIMULATED: Setting device %s to mode '%s'", device_id, mode)
            return {"success": True, "action": "set_mode", "mode": mode, "simulated": True}

        elif action_type == "replace":
            # This is informational — user replaces the device
            logger.info("SIMULATED: Marked device %s for replacement", device_id)
            return {"success": True, "action": "replace", "note": "User to replace device", "simulated": True}

        elif action_type == "suggest_manual":
            # Just a suggestion — no action taken
            return {"success": True, "action": "suggest_manual", "note": "Manual action suggested to user", "simulated": True}

        else:
            return {"success": False, "error": f"Unknown action type: {action_type}"}

    except Exception as exc:
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Revert actions
# ---------------------------------------------------------------------------

async def revert_action(action_id: str) -> dict:
    """Revert a previously executed action."""
    doc = await _actions_col().find_one({"_id": _oid(action_id)})
    if not doc:
        return {"success": False, "error": "Action not found"}

    if doc["status"] != "executed":
        return {"success": False, "error": f"Cannot revert action in state '{doc['status']}'"}

    # In production: call smart plug API to undo the action
    logger.info("SIMULATED: Reverting action %s (type=%s)", action_id, doc["action_type"])

    await _actions_col().update_one(
        {"_id": _oid(action_id)},
        {"$set": {
            "status": "reverted",
            "revertedAt": datetime.now(timezone.utc),
        }},
    )

    return {"success": True, "status": "reverted", "action_id": action_id}


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

async def list_actions(home_id: str, limit: int = 50) -> list[dict]:
    """List all actions for a home (audit log)."""
    cursor = _actions_col().find(
        {"homeId": home_id}
    ).sort("createdAt", -1).limit(limit)
    results = []
    async for doc in cursor:
        results.append(_serialize(doc))
    return results


async def get_action(action_id: str) -> Optional[dict]:
    doc = await _actions_col().find_one({"_id": _oid(action_id)})
    return _serialize(doc) if doc else None


# ---------------------------------------------------------------------------
# Summary: compute savings from executed actions
# ---------------------------------------------------------------------------

async def compute_action_savings(home_id: str) -> dict:
    """Compute total savings from executed actions for a home."""
    cursor = _actions_col().find({"homeId": home_id, "status": "executed"})
    total_kwh_saved = 0
    total_dollars_saved = 0
    total_co2_saved = 0
    executed_count = 0

    async for doc in cursor:
        savings = doc.get("estimated_savings", {})
        total_kwh_saved += savings.get("kwh_per_year", 0)
        total_dollars_saved += savings.get("dollars_per_year", 0)
        total_co2_saved += savings.get("co2_kg_per_year", 0)
        executed_count += 1

    return {
        "executed_actions": executed_count,
        "total_annual_kwh_saved": round(total_kwh_saved, 2),
        "total_annual_dollars_saved": round(total_dollars_saved, 2),
        "total_annual_co2_kg_saved": round(total_co2_saved, 2),
    }
