"""
=============================================================================
  Data Models — SmartGrid Home (SF Hacks 2026)
=============================================================================

Pydantic models for all MongoDB collections:
  homes, devices, readings, roi_snapshots, actions
=============================================================================
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Homes
# ---------------------------------------------------------------------------

class CreateHomeRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, examples=["My Apartment"])
    rooms: list[str] = Field(default_factory=lambda: ["living-room"])


class HomeDoc(BaseModel):
    id: Optional[str] = None
    userId: str
    name: str
    rooms: list[str]
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

class DevicePower(BaseModel):
    standby_watts_typical: float = Field(default=2.0, ge=0)
    standby_watts_range: list[float] = Field(default=[0.5, 5.0], min_length=2, max_length=2)
    active_watts_typical: float = Field(default=75.0, ge=0)
    active_watts_range: list[float] = Field(default=[20, 200], min_length=2, max_length=2)
    source: Literal[
        "category_estimate", "ai_estimate", "measured", "energy_star", "user_input"
    ] = "category_estimate"
    confidence: float = Field(default=0.5, ge=0, le=1)


class DeviceControl(BaseModel):
    type: Literal["smart_plug", "smart_switch", "api", "manual"] = "manual"
    device_id: Optional[str] = None
    capabilities: list[str] = Field(default_factory=list)  # on_off, energy, dimmer


class AddDeviceRequest(BaseModel):
    roomId: str = Field(default="living-room")
    label: str = Field(..., min_length=1, examples=["Living Room TV"])
    brand: str = Field(default="Unknown")
    model: str = Field(default="Unknown")
    category: str = Field(..., min_length=1, examples=["TV"])
    power: Optional[DevicePower] = None
    is_critical: bool = False
    control: Optional[DeviceControl] = None
    # Usage profile
    active_hours_per_day: float = Field(default=4.0, ge=0, le=24)
    usage_profile: Literal["light", "typical", "heavy"] = "typical"


class DeviceDoc(BaseModel):
    id: Optional[str] = None
    homeId: str
    roomId: str
    label: str
    brand: str
    model: str
    category: str
    power: DevicePower
    is_critical: bool = False
    last_measured: Optional[str] = None
    control: DeviceControl = Field(default_factory=DeviceControl)
    active_hours_per_day: float = 4.0
    usage_profile: str = "typical"
    addedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Readings (time-series, optional)
# ---------------------------------------------------------------------------

class Reading(BaseModel):
    deviceId: str
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    watts: float = Field(..., ge=0)


# ---------------------------------------------------------------------------
# Assumptions & ROI Snapshots
# ---------------------------------------------------------------------------

class Assumptions(BaseModel):
    rate_per_kwh: float = Field(default=0.30, ge=0)
    kg_co2_per_kwh: float = Field(default=0.25, ge=0)
    profile: Literal["light", "typical", "heavy"] = "typical"
    standby_reduction: float = Field(default=0.8, ge=0, le=1)


PROFILE_ACTIVE_HOURS: dict[str, float] = {
    "light": 2.0,
    "typical": 4.0,
    "heavy": 8.0,
}


class DeviceBreakdown(BaseModel):
    deviceId: str
    label: str
    category: str
    annual_kwh: float
    annual_kwh_min: float
    annual_kwh_max: float
    annual_cost: float
    annual_co2_kg: float
    standby_annual_kwh: float
    standby_annual_cost: float


class ROISnapshot(BaseModel):
    id: Optional[str] = None
    homeId: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    assumptions: Assumptions
    totals: dict  # annual_kwh, annual_cost, annual_co2_kg, etc.
    by_device: list[DeviceBreakdown]


# ---------------------------------------------------------------------------
# Actions (audit log & scheduling)
# ---------------------------------------------------------------------------

ActionType = Literal["turn_off", "schedule", "smart_plug", "set_mode", "replace", "suggest_manual"]
ActionStatus = Literal["proposed", "scheduled", "executed", "reverted", "failed"]


class ActionParameters(BaseModel):
    when: Optional[str] = None                # ISO datetime
    plug_model: Optional[str] = None
    cost_usd: float = 0.0
    standby_reduction: float = 0.8
    schedule_off_start: Optional[str] = None  # e.g., "23:00"
    schedule_off_end: Optional[str] = None    # e.g., "07:00"
    eco_mode: Optional[str] = None
    replacement_model: Optional[str] = None
    replacement_cost_usd: float = 0.0


class ActionProposal(BaseModel):
    deviceId: str
    label: str
    action_type: ActionType
    parameters: ActionParameters
    estimated_annual_kwh_saved: float
    estimated_annual_dollars_saved: float
    estimated_co2_kg_saved: float
    estimated_cost_usd: float
    payback_months: float
    feasibility_score: float = Field(ge=0, le=1)
    rationale: str
    safety_flags: list[str] = Field(default_factory=list)


class ActionDoc(BaseModel):
    id: Optional[str] = None
    homeId: str
    deviceId: str
    action_type: ActionType
    parameters: ActionParameters
    status: ActionStatus = "proposed"
    agentId: str = "ai_agent_v1"
    estimated_savings: dict = Field(default_factory=dict)
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    executedAt: Optional[datetime] = None
    revertedAt: Optional[datetime] = None


class ProposeActionsRequest(BaseModel):
    assumptions: Optional[Assumptions] = None
    constraints: Optional[dict] = None  # max_actions, budget_usd, do_not_turn_off, quiet_hours
    top_n: int = Field(default=5, ge=1, le=20)


class ExecuteActionsRequest(BaseModel):
    action_ids: list[str] = Field(..., min_length=1)


class SetAssumptionsRequest(BaseModel):
    rate_per_kwh: Optional[float] = None
    kg_co2_per_kwh: Optional[float] = None
    profile: Optional[Literal["light", "typical", "heavy"]] = None
