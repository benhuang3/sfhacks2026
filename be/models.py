"""
=============================================================================
  Data Models — WattVision (SF Hacks 2026)
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
# Rooms & Scene (structured)
# ---------------------------------------------------------------------------

class RoomModel(BaseModel):
    """A room within a home — stored as structured object, not a bare string."""
    roomId: str = Field(..., min_length=1, examples=["r1"])
    name: str = Field(..., min_length=1, examples=["Living Room"])


class SceneObject(BaseModel):
    """One 3-D object placed in the home scene (tied to a device doc)."""
    objectId: str = Field(..., min_length=1)
    deviceId: str = Field(..., min_length=1)
    roomId: str = Field(default="r1")
    category: str = Field(default="Unknown")
    assetKey: str = Field(default="models/default.glb")
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0], min_length=3, max_length=3)
    rotation: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0], min_length=3, max_length=3)
    scale: list[float] = Field(default_factory=lambda: [1.0, 1.0, 1.0], min_length=3, max_length=3)


class SceneRoom(BaseModel):
    """Per-room geometry metadata for the 3-D renderer."""
    roomId: str
    name: str = ""
    size: list[float] = Field(default_factory=lambda: [5.0, 3.0, 4.0], min_length=3, max_length=3)


class HomeScene(BaseModel):
    """The full 3-D scene stored on a home document."""
    rooms: list[SceneRoom] = Field(default_factory=list)
    objects: list[SceneObject] = Field(default_factory=list)


# Default rooms created on signup
DEFAULT_ROOMS: list[RoomModel] = [
    RoomModel(roomId="r1", name="Living Room"),
    RoomModel(roomId="r2", name="Bedroom"),
    RoomModel(roomId="r3", name="Kitchen"),
    RoomModel(roomId="r4", name="Bathroom"),
    RoomModel(roomId="r5", name="Office"),
]


# ---------------------------------------------------------------------------
# Homes
# ---------------------------------------------------------------------------

class CreateHomeRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, examples=["My Apartment"])
    rooms: list[RoomModel] = Field(default_factory=lambda: [r.model_copy() for r in DEFAULT_ROOMS])


class HomeDoc(BaseModel):
    id: Optional[str] = None
    userId: str
    name: str
    rooms: list[RoomModel] = Field(default_factory=list)
    scene: HomeScene = Field(default_factory=HomeScene)
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AddRoomRequest(BaseModel):
    name: str = Field(..., min_length=1, examples=["Garage"])


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

class DevicePower(BaseModel):
    standby_watts_typical: float = Field(default=2.0, ge=0)
    standby_watts_range: list[float] = Field(default=[0.5, 5.0], min_length=2, max_length=2)
    active_watts_typical: float = Field(default=75.0, ge=0)
    active_watts_range: list[float] = Field(default=[20, 200], min_length=2, max_length=2)
    source: str = "category_estimate"  # e.g. category_estimate, ai_estimate, measured, energy_star, user_input
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
    # Smart monitoring
    is_smart: bool = False
    schedule_on: Optional[str] = None   # e.g. "07:00"
    schedule_off: Optional[str] = None  # e.g. "23:00"
    idle_timeout_minutes: Optional[int] = None


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
    # Smart monitoring state
    is_smart: bool = False
    is_on: bool = True
    schedule_on: Optional[str] = None
    schedule_off: Optional[str] = None
    idle_timeout_minutes: Optional[int] = None
    last_toggled_at: Optional[str] = None
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
    kg_co2_per_kwh: float = Field(default=0.42, ge=0)
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
