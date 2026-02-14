"""
=============================================================================
  AI Optimizer Agent — SmartGrid Home (SF Hacks 2026)
=============================================================================

Phase 2: Cost-minimization agent that proposes safe actions to reduce
annual electricity cost.  Uses a greedy ranking approach for hackathon
speed, with optional LLM-powered reasoning via Gemini.

Approach:
  For each device and each action option, compute estimated annual $
  savings and hardware cost.  Rank by savings/cost ratio.  Respect
  critical device flags and user constraints.

Action types:
  - smart_plug     : auto-off standby via smart plug
  - schedule       : schedule off during inactive/quiet hours
  - turn_off       : manually turn off when not in use
  - set_mode       : switch to eco/power-save mode
  - replace        : replace with energy-efficient model
  - suggest_manual : suggest manual action for critical devices
=============================================================================
"""

from __future__ import annotations

import logging
import os
import json
from typing import Optional

from models import (
    Assumptions,
    ActionProposal,
    ActionParameters,
    ProposeActionsRequest,
    PROFILE_ACTIVE_HOURS,
)

logger = logging.getLogger("optimizer")

# Average smart-plug cost
SMART_PLUG_COST = 15.0
# Typical eco-mode reduction factor
ECO_MODE_REDUCTION = 0.15


# ---------------------------------------------------------------------------
# Savings calculators for each action type
# ---------------------------------------------------------------------------

def _compute_smart_plug_saving(device: dict, assumptions: Assumptions) -> Optional[ActionProposal]:
    """Smart plug auto-off: cuts standby power by standby_reduction %."""
    power = device.get("power", {})
    standby_w = power.get("standby_watts_typical", 0)
    if standby_w < 0.5:
        return None  # not worth it

    active_hours = device.get("active_hours_per_day", PROFILE_ACTIVE_HOURS.get(assumptions.profile, 4.0))
    standby_hours = 24 - active_hours

    kwh_saved = standby_w * assumptions.standby_reduction * standby_hours * 365 / 1000
    dollars_saved = kwh_saved * assumptions.rate_per_kwh
    co2_saved = kwh_saved * assumptions.kg_co2_per_kwh
    cost = SMART_PLUG_COST
    payback = (cost / dollars_saved * 12) if dollars_saved > 0 else 999

    return ActionProposal(
        deviceId=device.get("id", ""),
        label=device.get("label", "Unknown"),
        action_type="smart_plug",
        parameters=ActionParameters(
            plug_model="generic_wifi",
            cost_usd=cost,
            standby_reduction=assumptions.standby_reduction,
        ),
        estimated_annual_kwh_saved=round(kwh_saved, 2),
        estimated_annual_dollars_saved=round(dollars_saved, 2),
        estimated_co2_kg_saved=round(co2_saved, 2),
        estimated_cost_usd=cost,
        payback_months=round(payback, 1),
        feasibility_score=0.9,
        rationale=f"Smart plug eliminates {assumptions.standby_reduction*100:.0f}% of {standby_w}W standby draw during {standby_hours:.0f}h idle time.",
        safety_flags=[],
    )


def _compute_schedule_saving(device: dict, assumptions: Assumptions, quiet_hours: list[str] = None) -> Optional[ActionProposal]:
    """Schedule off during quiet/inactive hours."""
    power = device.get("power", {})
    standby_w = power.get("standby_watts_typical", 0)
    active_w = power.get("active_watts_typical", 0)

    # Default quiet hours: 11 PM - 7 AM = 8 hours
    schedule_hours = 8
    if quiet_hours:
        # Parse first quiet range
        try:
            parts = quiet_hours[0].split("-")
            start_h = int(parts[0].split(":")[0])
            end_h = int(parts[1].split(":")[0])
            schedule_hours = (end_h - start_h) % 24
        except Exception:
            schedule_hours = 8

    # During scheduled-off hours, save both standby + any residual active
    kwh_saved = standby_w * schedule_hours * 365 / 1000
    dollars_saved = kwh_saved * assumptions.rate_per_kwh
    co2_saved = kwh_saved * assumptions.kg_co2_per_kwh

    if dollars_saved < 0.50:
        return None  # not worth it

    return ActionProposal(
        deviceId=device.get("id", ""),
        label=device.get("label", "Unknown"),
        action_type="schedule",
        parameters=ActionParameters(
            schedule_off_start=quiet_hours[0].split("-")[0] if quiet_hours else "23:00",
            schedule_off_end=quiet_hours[0].split("-")[1] if quiet_hours else "07:00",
            cost_usd=0,
        ),
        estimated_annual_kwh_saved=round(kwh_saved, 2),
        estimated_annual_dollars_saved=round(dollars_saved, 2),
        estimated_co2_kg_saved=round(co2_saved, 2),
        estimated_cost_usd=0,
        payback_months=0,
        feasibility_score=0.85,
        rationale=f"Scheduling {device.get('label', 'device')} off during quiet hours saves {kwh_saved:.1f} kWh/year from eliminated standby.",
        safety_flags=[],
    )


def _compute_eco_mode_saving(device: dict, assumptions: Assumptions) -> Optional[ActionProposal]:
    """Set eco/power-save mode to reduce active power consumption."""
    power = device.get("power", {})
    active_w = power.get("active_watts_typical", 0)

    # Eco mode typically reduces active power by 15%
    active_hours = device.get("active_hours_per_day", PROFILE_ACTIVE_HOURS.get(assumptions.profile, 4.0))
    watts_saved = active_w * ECO_MODE_REDUCTION
    kwh_saved = watts_saved * active_hours * 365 / 1000
    dollars_saved = kwh_saved * assumptions.rate_per_kwh
    co2_saved = kwh_saved * assumptions.kg_co2_per_kwh

    if dollars_saved < 1.0:
        return None

    # Only applicable to certain categories
    eco_categories = {"Television", "TV", "Monitor", "Laptop", "Air Conditioner", "Washing Machine", "Dryer", "Refrigerator"}
    if device.get("category", "") not in eco_categories:
        return None

    return ActionProposal(
        deviceId=device.get("id", ""),
        label=device.get("label", "Unknown"),
        action_type="set_mode",
        parameters=ActionParameters(eco_mode="eco", cost_usd=0),
        estimated_annual_kwh_saved=round(kwh_saved, 2),
        estimated_annual_dollars_saved=round(dollars_saved, 2),
        estimated_co2_kg_saved=round(co2_saved, 2),
        estimated_cost_usd=0,
        payback_months=0,
        feasibility_score=0.75,
        rationale=f"Eco mode reduces active power by ~{ECO_MODE_REDUCTION*100:.0f}%, saving {kwh_saved:.1f} kWh/year during {active_hours:.0f}h daily use.",
        safety_flags=[],
    )


def _compute_turn_off_saving(device: dict, assumptions: Assumptions) -> Optional[ActionProposal]:
    """Turn off device completely when not in use (manual action)."""
    power = device.get("power", {})
    standby_w = power.get("standby_watts_typical", 0)
    if standby_w < 1.0:
        return None

    active_hours = device.get("active_hours_per_day", PROFILE_ACTIVE_HOURS.get(assumptions.profile, 4.0))
    standby_hours = 24 - active_hours

    kwh_saved = standby_w * standby_hours * 365 / 1000
    dollars_saved = kwh_saved * assumptions.rate_per_kwh
    co2_saved = kwh_saved * assumptions.kg_co2_per_kwh

    return ActionProposal(
        deviceId=device.get("id", ""),
        label=device.get("label", "Unknown"),
        action_type="turn_off",
        parameters=ActionParameters(cost_usd=0),
        estimated_annual_kwh_saved=round(kwh_saved, 2),
        estimated_annual_dollars_saved=round(dollars_saved, 2),
        estimated_co2_kg_saved=round(co2_saved, 2),
        estimated_cost_usd=0,
        payback_months=0,
        feasibility_score=0.7,
        rationale=f"Manually unplugging when not in use eliminates {standby_w}W standby for {standby_hours:.0f}h/day.",
        safety_flags=["requires_manual_action"],
    )


def _compute_replace_saving(device: dict, assumptions: Assumptions) -> Optional[ActionProposal]:
    """Replace with energy-efficient ENERGY STAR model."""
    power = device.get("power", {})
    active_w = power.get("active_watts_typical", 0)
    active_hours = device.get("active_hours_per_day", PROFILE_ACTIVE_HOURS.get(assumptions.profile, 4.0))

    # Assume ENERGY STAR model uses 30% less power
    reduction = 0.30
    watts_saved = active_w * reduction
    standby_w = power.get("standby_watts_typical", 0)
    new_standby = max(0.3, standby_w * 0.5)
    standby_saved = standby_w - new_standby
    standby_hours = 24 - active_hours

    kwh_saved = (watts_saved * active_hours + standby_saved * standby_hours) * 365 / 1000
    dollars_saved = kwh_saved * assumptions.rate_per_kwh
    co2_saved = kwh_saved * assumptions.kg_co2_per_kwh

    # Estimate replacement cost based on category
    replacement_costs = {
        "Television": 400, "TV": 400, "Refrigerator": 800, "Washing Machine": 600,
        "Dryer": 700, "Microwave": 150, "Air Conditioner": 500,
        "Space Heater": 80, "Oven": 1200, "Monitor": 250, "Laptop": 800,
        "Light Bulb": 8, "Toaster": 40, "Hair Dryer": 40, "Phone Charger": 20,
    }
    cost = replacement_costs.get(device.get("category", ""), 200)
    payback = (cost / dollars_saved * 12) if dollars_saved > 0 else 999

    if payback > 120:  # > 10 years payback = not worth suggesting
        return None

    return ActionProposal(
        deviceId=device.get("id", ""),
        label=device.get("label", "Unknown"),
        action_type="replace",
        parameters=ActionParameters(
            replacement_model="ENERGY STAR equivalent",
            replacement_cost_usd=cost,
            cost_usd=cost,
        ),
        estimated_annual_kwh_saved=round(kwh_saved, 2),
        estimated_annual_dollars_saved=round(dollars_saved, 2),
        estimated_co2_kg_saved=round(co2_saved, 2),
        estimated_cost_usd=cost,
        payback_months=round(payback, 1),
        feasibility_score=0.5,
        rationale=f"Replacing with ENERGY STAR model saves ~{reduction*100:.0f}% active power ({watts_saved:.0f}W). Payback in {payback:.0f} months.",
        safety_flags=["requires_purchase"],
    )


# ---------------------------------------------------------------------------
# Main optimizer: greedy ranking
# ---------------------------------------------------------------------------

def propose_actions(
    devices: list[dict],
    assumptions: Assumptions,
    constraints: Optional[dict] = None,
    top_n: int = 5,
) -> list[ActionProposal]:
    """
    Greedy optimizer: for each device × action, compute savings,
    rank by savings/cost ratio, respect constraints, return top N.
    """
    constraints = constraints or {}
    max_actions = constraints.get("max_actions", top_n)
    budget = constraints.get("budget_usd", 999999)
    do_not_turn_off = [x.lower() for x in constraints.get("do_not_turn_off", [])]
    quiet_hours = constraints.get("quiet_hours", ["23:00-07:00"])

    candidates: list[ActionProposal] = []

    for device in devices:
        device_label_lower = device.get("label", "").lower()
        device_category_lower = device.get("category", "").lower()
        is_critical = device.get("is_critical", False)

        # Check do-not-turn-off list
        is_protected = any(
            name in device_label_lower or name in device_category_lower
            for name in do_not_turn_off
        )

        # Smart plug
        proposal = _compute_smart_plug_saving(device, assumptions)
        if proposal and not (is_critical and is_protected):
            candidates.append(proposal)
        elif proposal and is_critical:
            # For critical devices, suggest manual review
            proposal.action_type = "suggest_manual"
            proposal.feasibility_score = 0.4
            proposal.safety_flags.append("critical_device")
            proposal.rationale = f"[Critical] {proposal.rationale} — requires manual approval."
            candidates.append(proposal)

        # Schedule
        if not is_protected:
            proposal = _compute_schedule_saving(device, assumptions, quiet_hours)
            if proposal:
                if is_critical:
                    proposal.action_type = "suggest_manual"
                    proposal.safety_flags.append("critical_device")
                candidates.append(proposal)

        # Eco mode
        proposal = _compute_eco_mode_saving(device, assumptions)
        if proposal:
            candidates.append(proposal)

        # Turn off (skip for critical/protected)
        if not is_critical and not is_protected:
            proposal = _compute_turn_off_saving(device, assumptions)
            if proposal:
                candidates.append(proposal)

        # Replace
        proposal = _compute_replace_saving(device, assumptions)
        if proposal:
            candidates.append(proposal)

    # Rank by savings per dollar of cost (free actions = very high ratio)
    candidates.sort(
        key=lambda c: c.estimated_annual_dollars_saved / max(0.1, c.estimated_cost_usd),
        reverse=True,
    )

    # Respect budget constraint
    selected: list[ActionProposal] = []
    remaining_budget = budget
    for c in candidates:
        if len(selected) >= max_actions:
            break
        if c.estimated_cost_usd <= remaining_budget:
            selected.append(c)
            remaining_budget -= c.estimated_cost_usd

    return selected[:top_n]


# ---------------------------------------------------------------------------
# LLM-powered optimizer (Phase 2 enhancement, uses Gemini)
# ---------------------------------------------------------------------------

async def propose_actions_with_llm(
    devices: list[dict],
    assumptions: Assumptions,
    constraints: Optional[dict] = None,
    top_n: int = 5,
) -> list[ActionProposal]:
    """
    Use LLM (Gemini) to generate more nuanced proposals.
    Falls back to greedy if LLM fails.
    """
    google_api_key = os.getenv("GOOGLE_API_KEY", "")
    if not google_api_key:
        logger.warning("No GOOGLE_API_KEY — falling back to greedy optimizer")
        return propose_actions(devices, assumptions, constraints, top_n)

    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langchain_core.messages import SystemMessage, HumanMessage

        system_prompt = """You are an Energy Optimization Agent for a smart-home app. You receive a home's inventory of devices (each with power estimates, control capabilities, and user constraints). Your job is to propose a ranked list of safe, feasible actions that minimize annual electricity cost under given user constraints.

REQUIREMENTS:
- RETURN JSON ONLY. No markdown, no explanation.
- For each proposed action include: deviceId, label, action_type (turn_off|schedule|smart_plug|set_mode|replace), parameters (cost_usd, standby_reduction, schedule_off_start, schedule_off_end), estimated_annual_kwh_saved, estimated_annual_dollars_saved, estimated_co2_kg_saved, estimated_cost_usd, payback_months, feasibility_score (0-1), rationale (1-2 sentences), safety_flags (list).
- Never propose turning off devices marked as is_critical:true unless user explicitly allowed; instead propose "suggest_manual" for these.
- Respect user comfort constraints.
- Use the provided assumptions.
- Output top N proposals."""

        # Sanitize device data for LLM
        sanitized_devices = []
        for d in devices:
            sanitized_devices.append({
                "deviceId": d.get("id", ""),
                "label": d.get("label", "Unknown"),
                "category": d.get("category", "Unknown"),
                "power": d.get("power", {}),
                "is_critical": d.get("is_critical", False),
                "control": d.get("control", {}),
                "active_hours_per_day": d.get("active_hours_per_day", 4),
            })

        input_data = {
            "assumptions": assumptions.model_dump(),
            "devices": sanitized_devices,
            "constraints": constraints or {},
            "top_n": top_n,
        }

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=google_api_key,
            temperature=0.1,
            max_output_tokens=4096,
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=json.dumps(input_data, default=str)),
        ]

        response = await llm.ainvoke(messages)
        content = response.content.strip()

        # Parse JSON from response
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content)

        proposals_raw = parsed.get("proposals", parsed) if isinstance(parsed, dict) else parsed
        if not isinstance(proposals_raw, list):
            proposals_raw = [proposals_raw]

        proposals = []
        for p in proposals_raw[:top_n]:
            try:
                params = p.get("parameters", {})
                proposal = ActionProposal(
                    deviceId=p["deviceId"],
                    label=p.get("label", "Unknown"),
                    action_type=p["action_type"],
                    parameters=ActionParameters(
                        cost_usd=params.get("cost_usd", 0),
                        standby_reduction=params.get("standby_reduction", 0.8),
                        schedule_off_start=params.get("schedule_off_start"),
                        schedule_off_end=params.get("schedule_off_end"),
                        plug_model=params.get("plug_model"),
                        eco_mode=params.get("eco_mode"),
                        replacement_model=params.get("replacement_model"),
                        replacement_cost_usd=params.get("replacement_cost_usd", 0),
                    ),
                    estimated_annual_kwh_saved=p.get("estimated_annual_kwh_saved", 0),
                    estimated_annual_dollars_saved=p.get("estimated_annual_dollars_saved", 0),
                    estimated_co2_kg_saved=p.get("estimated_co2_kg_saved", 0),
                    estimated_cost_usd=p.get("estimated_cost_usd", 0),
                    payback_months=p.get("payback_months", 0),
                    feasibility_score=p.get("feasibility_score", 0.5),
                    rationale=p.get("rationale", ""),
                    safety_flags=p.get("safety_flags", []),
                )
                proposals.append(proposal)
            except Exception as exc:
                logger.warning("Skipping invalid LLM proposal: %s", exc)
                continue

        if proposals:
            logger.info("LLM optimizer returned %d proposals", len(proposals))
            return proposals

    except Exception as exc:
        logger.error("LLM optimizer failed: %s — falling back to greedy", exc)

    return propose_actions(devices, assumptions, constraints, top_n)
