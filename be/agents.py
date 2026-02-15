"""
=============================================================================
  Power Agent — SmartGrid Home (SF Hacks 2026)
=============================================================================

FLOW:
  1. Receive device lookup request (brand, model, name, region)
  2. Check MongoDB `power_profiles` collection for cached {brand, model}
  3. If cached → return immediately (fast path)
  4. If not cached → invoke LangChain agent with Google Gemini to estimate
     power usage, forcing strict JSON output
  5. Validate Gemini response with Pydantic
  6. Clamp unrealistic values (standby > 50W, active > 5000W → fallback)
  7. On any AI failure → fallback to built-in category defaults
  8. Cache result in MongoDB for future lookups
  9. Return validated JSON

DEPENDENCIES:
  pip install langchain langchain-google-genai motor pydantic
=============================================================================
"""

from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

import os
import json
import logging
from typing import Optional

from pydantic import BaseModel, Field, field_validator
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from motor.motor_asyncio import AsyncIOMotorClient

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("power_agent")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "smartgrid_home")

# ---------------------------------------------------------------------------
# MongoDB (Motor async) — singleton client
# ---------------------------------------------------------------------------
_motor_client: Optional[AsyncIOMotorClient] = None


def get_motor_client() -> AsyncIOMotorClient:
    """Return a reusable Motor async client (singleton)."""
    global _motor_client
    if _motor_client is None:
        logger.info("Creating Motor client with URI: %s...", MONGO_URI[:40])
        try:
            import certifi
            _motor_client = AsyncIOMotorClient(
                MONGO_URI,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=10_000,
                connectTimeoutMS=10_000,
                socketTimeoutMS=20_000,
            )
        except Exception:
            # Fallback: skip cert verification (dev / hackathon only)
            _motor_client = AsyncIOMotorClient(
                MONGO_URI,
                tls=True,
                tlsAllowInvalidCertificates=True,
                serverSelectionTimeoutMS=10_000,
                connectTimeoutMS=10_000,
                socketTimeoutMS=20_000,
            )
    return _motor_client


def get_db():
    """Shortcut → database handle."""
    return get_motor_client()[MONGO_DB]


def get_power_profiles_collection():
    """Shortcut → power_profiles collection."""
    from db_fallback import is_db_available, MemCollection
    if not is_db_available():
        if not hasattr(get_power_profiles_collection, "_mem"):
            get_power_profiles_collection._mem = {}
        return MemCollection(get_power_profiles_collection._mem, "profiles")
    return get_db()["power_profiles"]


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class DeviceLookupRequest(BaseModel):
    """Incoming request from the frontend / scanner."""
    brand: str = Field(..., min_length=1, examples=["Samsung"])
    model: str = Field(..., min_length=1, examples=["UN55TU8000"])
    name: str = Field(..., min_length=1, examples=["55-inch 4K TV"])
    region: str = Field(default="US", examples=["US", "EU", "UK"])


class PowerProfile(BaseModel):
    """
    Strict schema that Gemini must return.
    Also used for MongoDB documents and API responses.
    """
    category: str = Field(..., description="Device category, e.g. 'Television', 'Refrigerator'")
    standby_watts_range: list[float] = Field(..., min_length=2, max_length=2,
                                              description="[min, max] standby watts")
    standby_watts_typical: float = Field(..., ge=0, description="Typical standby draw in watts")
    active_watts_range: list[float] = Field(..., min_length=2, max_length=2,
                                             description="[min, max] active watts")
    active_watts_typical: float = Field(..., ge=0, description="Typical active draw in watts")
    confidence: float = Field(..., ge=0, le=1, description="Confidence 0-1")
    source: str = Field(..., description="Where the estimate comes from")
    notes: list[str] = Field(default_factory=list, description="Extra notes")

    # --- validators to clamp unrealistic values ---
    @field_validator("standby_watts_typical")
    @classmethod
    def clamp_standby(cls, v: float) -> float:
        if v > 50:
            raise ValueError(f"Standby {v}W exceeds 50W safety cap → rejecting")
        return v

    @field_validator("active_watts_typical")
    @classmethod
    def clamp_active(cls, v: float) -> float:
        if v > 5000:
            raise ValueError(f"Active {v}W exceeds 5000W safety cap → rejecting")
        return v


class PowerProfileResponse(BaseModel):
    """Final API response shape."""
    brand: str
    model: str
    name: str
    region: str
    profile: PowerProfile
    cached: bool = Field(default=False, description="True if served from MongoDB cache")


# ---------------------------------------------------------------------------
# Category Fallback Defaults — Berkeley Lab / ENERGY STAR Data
# ---------------------------------------------------------------------------
# Based on Lawrence Berkeley National Laboratory standby power studies
# and ENERGY STAR program data. These are research-backed estimates.
# Source: https://standby.lbl.gov/ and energystar.gov

CATEGORY_DEFAULTS: dict[str, PowerProfile] = {
    "tv": PowerProfile(
        category="Television",
        standby_watts_range=[0.5, 3.0],
        standby_watts_typical=1.3,  # Berkeley Lab avg for modern TVs
        active_watts_range=[30, 200],
        active_watts_typical=80.0,  # ENERGY STAR certified avg
        confidence=0.8,
        source="Berkeley Lab / ENERGY STAR",
        notes=["Based on Berkeley Lab standby studies", "Active power varies by screen size"],
    ),
    "television": PowerProfile(
        category="Television",
        standby_watts_range=[0.5, 3.0],
        standby_watts_typical=1.3,
        active_watts_range=[30, 200],
        active_watts_typical=80.0,
        confidence=0.8,
        source="Berkeley Lab / ENERGY STAR",
        notes=["Based on Berkeley Lab standby studies"],
    ),
    "refrigerator": PowerProfile(
        category="Refrigerator",
        standby_watts_range=[1, 3],
        standby_watts_typical=1.5,  # Compressor off state
        active_watts_range=[100, 250],
        active_watts_typical=150.0,  # Avg cycling power
        confidence=0.8,
        source="ENERGY STAR",
        notes=["ENERGY STAR certified models use ~400-500 kWh/year", "Runs ~8h/day on average"],
    ),
    "fridge": PowerProfile(
        category="Refrigerator",
        standby_watts_range=[1, 3],
        standby_watts_typical=1.5,
        active_watts_range=[100, 250],
        active_watts_typical=150.0,
        confidence=0.8,
        source="ENERGY STAR",
        notes=["ENERGY STAR certified models"],
    ),
    "washer": PowerProfile(
        category="Washing Machine",
        standby_watts_range=[0.3, 2.0],
        standby_watts_typical=0.8,  # Berkeley Lab measurement
        active_watts_range=[300, 500],
        active_watts_typical=400.0,
        confidence=0.8,
        source="Berkeley Lab / ENERGY STAR",
        notes=["Front-loaders typically more efficient", "Standby from digital displays"],
    ),
    "dryer": PowerProfile(
        category="Dryer",
        standby_watts_range=[0.5, 3.0],
        standby_watts_typical=1.5,
        active_watts_range=[1800, 5000],
        active_watts_typical=2500.0,  # Electric dryer avg
        confidence=0.75,
        source="ENERGY STAR",
        notes=["Electric dryers use significantly more than gas", "Heat pump dryers are most efficient"],
    ),
    "microwave": PowerProfile(
        category="Microwave",
        standby_watts_range=[1.0, 4.0],
        standby_watts_typical=2.1,  # Berkeley Lab avg with clock display
        active_watts_range=[600, 1200],
        active_watts_typical=1000.0,
        confidence=0.8,
        source="Berkeley Lab",
        notes=["Clock display contributes to standby", "~27 kWh/year in standby alone"],
    ),
    "laptop": PowerProfile(
        category="Laptop",
        standby_watts_range=[0.5, 2.0],
        standby_watts_typical=0.8,  # Berkeley Lab sleep mode
        active_watts_range=[15, 65],
        active_watts_typical=35.0,  # ENERGY STAR avg
        confidence=0.8,
        source="Berkeley Lab / ENERGY STAR",
        notes=["Gaming laptops can exceed 100W", "Chargers draw power when plugged in without laptop"],
    ),
    "monitor": PowerProfile(
        category="Monitor",
        standby_watts_range=[0.3, 1.5],
        standby_watts_typical=0.5,  # Berkeley Lab
        active_watts_range=[15, 80],
        active_watts_typical=25.0,  # ENERGY STAR 24" avg
        confidence=0.8,
        source="Berkeley Lab / ENERGY STAR",
        notes=["Power scales with screen size", "LED/LCD more efficient than older CRT"],
    ),
    "heater": PowerProfile(
        category="Space Heater",
        standby_watts_range=[0, 1],
        standby_watts_typical=0.3,
        active_watts_range=[750, 1500],
        active_watts_typical=1500.0,  # Standard rating
        confidence=0.9,
        source="DOE",
        notes=["Most space heaters are 1500W max (safety limit)", "No efficiency ratings - 100% conversion"],
    ),
    "air conditioner": PowerProfile(
        category="Air Conditioner",
        standby_watts_range=[1, 5],
        standby_watts_typical=2.0,
        active_watts_range=[500, 1500],
        active_watts_typical=1000.0,  # Window unit avg
        confidence=0.75,
        source="ENERGY STAR",
        notes=["Central AC: 3000-5000W", "Window units: 500-1500W", "Varies greatly by BTU rating"],
    ),
    "light": PowerProfile(
        category="Light Bulb",
        standby_watts_range=[0, 0.5],
        standby_watts_typical=0.1,  # Smart bulbs only
        active_watts_range=[4, 100],
        active_watts_typical=10.0,  # LED equivalent to 60W incandescent
        confidence=0.9,
        source="ENERGY STAR",
        notes=["LED: 4-15W", "CFL: 9-15W", "Incandescent: 40-100W"],
    ),
    "toaster": PowerProfile(
        category="Toaster",
        standby_watts_range=[0, 1],
        standby_watts_typical=0.3,
        active_watts_range=[800, 1500],
        active_watts_typical=1100.0,
        confidence=0.8,
        source="Berkeley Lab",
        notes=["Short usage time offsets high wattage", "~0.03 kWh per use"],
    ),
    "oven": PowerProfile(
        category="Oven",
        standby_watts_range=[1, 5],
        standby_watts_typical=2.5,  # Digital clock/display
        active_watts_range=[2000, 5000],
        active_watts_typical=2500.0,  # Electric oven avg
        confidence=0.75,
        source="DOE",
        notes=["Electric ovens: 2000-5000W", "Gas ovens use ~300W for ignition/fan"],
    ),
    "hair dryer": PowerProfile(
        category="Hair Dryer",
        standby_watts_range=[0, 0],
        standby_watts_typical=0.0,  # Typically no standby
        active_watts_range=[800, 1875],
        active_watts_typical=1500.0,
        confidence=0.9,
        source="DOE",
        notes=["1875W is standard max for US outlets", "Low setting ~750W"],
    ),
    "phone charger": PowerProfile(
        category="Phone Charger",
        standby_watts_range=[0.1, 0.5],
        standby_watts_typical=0.26,  # Berkeley Lab vampire load study
        active_watts_range=[5, 25],
        active_watts_typical=12.0,  # Fast charger avg
        confidence=0.85,
        source="Berkeley Lab",
        notes=["No-load (vampire) power is small but adds up", "Fast chargers draw more"],
    ),
    # Extra keywords so category names like "Washing Machine" match
    "washing machine": PowerProfile(
        category="Washing Machine",
        standby_watts_range=[0.3, 2.0],
        standby_watts_typical=0.8,
        active_watts_range=[300, 500],
        active_watts_typical=400.0,
        confidence=0.8,
        source="Berkeley Lab / ENERGY STAR",
        notes=["Front-loaders typically more efficient"],
    ),
    "washing": PowerProfile(
        category="Washing Machine",
        standby_watts_range=[0.3, 2.0],
        standby_watts_typical=0.8,
        active_watts_range=[300, 500],
        active_watts_typical=400.0,
        confidence=0.8,
        source="Berkeley Lab / ENERGY STAR",
        notes=[],
    ),
    "space heater": PowerProfile(
        category="Space Heater",
        standby_watts_range=[0, 1],
        standby_watts_typical=0.3,
        active_watts_range=[750, 1500],
        active_watts_typical=1500.0,
        confidence=0.9,
        source="DOE",
        notes=[],
    ),
    "gaming console": PowerProfile(
        category="Gaming Console",
        standby_watts_range=[1, 15],
        standby_watts_typical=5.0,
        active_watts_range=[50, 200],
        active_watts_typical=120.0,
        confidence=0.7,
        source="Estimate",
        notes=[],
    ),
    "gaming": PowerProfile(
        category="Gaming Console",
        standby_watts_range=[1, 15],
        standby_watts_typical=5.0,
        active_watts_range=[50, 200],
        active_watts_typical=120.0,
        confidence=0.7,
        source="Estimate",
        notes=[],
    ),
    "router": PowerProfile(
        category="Router",
        standby_watts_range=[2, 10],
        standby_watts_typical=5.0,
        active_watts_range=[3, 15],
        active_watts_typical=6.0,
        confidence=0.75,
        source="Berkeley Lab",
        notes=[],
    ),
    "fan": PowerProfile(
        category="Fan",
        standby_watts_range=[0, 1],
        standby_watts_typical=0.2,
        active_watts_range=[30, 75],
        active_watts_typical=50.0,
        confidence=0.8,
        source="ENERGY STAR",
        notes=[],
    ),
    "lamp": PowerProfile(
        category="Lamp",
        standby_watts_range=[0, 0.5],
        standby_watts_typical=0.1,
        active_watts_range=[4, 100],
        active_watts_typical=10.0,
        confidence=0.85,
        source="ENERGY STAR",
        notes=[],
    ),
    "dishwasher": PowerProfile(
        category="Dishwasher",
        standby_watts_range=[0.5, 3],
        standby_watts_typical=1.5,
        active_watts_range=[300, 600],
        active_watts_typical=180.0,
        confidence=0.75,
        source="ENERGY STAR",
        notes=[],
    ),
    "blender": PowerProfile(
        category="Blender",
        standby_watts_range=[0, 0.5],
        standby_watts_typical=0.0,
        active_watts_range=[300, 1000],
        active_watts_typical=400.0,
        confidence=0.8,
        source="Estimate",
        notes=[],
    ),
    "coffee maker": PowerProfile(
        category="Coffee Maker",
        standby_watts_range=[0.5, 5],
        standby_watts_typical=2.0,
        active_watts_range=[200, 1500],
        active_watts_typical=800.0,
        confidence=0.75,
        source="Berkeley Lab",
        notes=[],
    ),
    "coffee": PowerProfile(
        category="Coffee Maker",
        standby_watts_range=[0.5, 5],
        standby_watts_typical=2.0,
        active_watts_range=[200, 1500],
        active_watts_typical=800.0,
        confidence=0.75,
        source="Berkeley Lab",
        notes=[],
    ),
    # Furniture / non-appliances (from floor plan) — use minimal or 0 so not 75W
    "couch": PowerProfile(category="Couch", standby_watts_range=[0, 2], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.9, source="N/A (furniture)", notes=[]),
    "sofa": PowerProfile(category="Sofa", standby_watts_range=[0, 2], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.9, source="N/A (furniture)", notes=[]),
    "bed": PowerProfile(category="Bed", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (furniture)", notes=[]),
    "chair": PowerProfile(category="Chair", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (furniture)", notes=[]),
    "table": PowerProfile(category="Table", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (furniture)", notes=[]),
    "dining table": PowerProfile(category="Dining Table", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (furniture)", notes=[]),
    "main table": PowerProfile(category="Table", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (furniture)", notes=[]),
    "sink": PowerProfile(category="Sink", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (plumbing)", notes=[]),
    "toilet": PowerProfile(category="Toilet", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (plumbing)", notes=[]),
    "bathtub": PowerProfile(category="Bathtub", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (plumbing)", notes=[]),
    "bath-tub": PowerProfile(category="Bathtub", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (plumbing)", notes=[]),
    "cupboard": PowerProfile(category="Cupboard", standby_watts_range=[0, 0], standby_watts_typical=0.0, active_watts_range=[0, 0], active_watts_typical=0.0, confidence=0.95, source="N/A (furniture)", notes=[]),
    "cooking": PowerProfile(category="Stove", standby_watts_range=[1, 5], standby_watts_typical=2.0, active_watts_range=[1000, 3000], active_watts_typical=1500.0, confidence=0.8, source="Berkeley Lab / DOE", notes=[]),
    "stove": PowerProfile(category="Stove", standby_watts_range=[1, 5], standby_watts_typical=2.0, active_watts_range=[1000, 3000], active_watts_typical=1500.0, confidence=0.8, source="Berkeley Lab / DOE", notes=[]),
}

# Catch-all unknown device — intentionally conservative
_UNKNOWN_DEFAULT = PowerProfile(
    category="Unknown Device",
    standby_watts_range=[0.5, 5],
    standby_watts_typical=2.0,
    active_watts_range=[20, 200],
    active_watts_typical=50.0,  # Lowered from 75W — less biased default
    confidence=0.2,
    source="Conservative Estimate",
    notes=["Unknown device type — using conservative estimate", "Consider re-scanning with clearer photo"],
)

# Additional fuzzy keyword aliases → CATEGORY_DEFAULTS key
_FUZZY_ALIASES: dict[str, str] = {
    "smart tv": "tv", "flatscreen": "tv", "flat screen": "tv", "led tv": "tv",
    "samsung tv": "tv", "lg tv": "tv", "sony tv": "tv", "vizio": "tv",
    "tcl tv": "tv", "roku": "tv", "fire stick": "tv",
    "ice box": "fridge", "freezer": "fridge", "mini fridge": "fridge",
    "cooler": "fridge", "wine cooler": "fridge",
    "micro wave": "microwave", "microoven": "microwave",
    "notebook": "laptop", "macbook": "laptop", "chromebook": "laptop",
    "desktop": "monitor", "imac": "monitor", "pc": "monitor",
    "computer": "monitor", "screen": "monitor",
    "ceiling fan": "fan", "stand fan": "fan", "box fan": "fan",
    "exhaust fan": "fan", "pedestal fan": "fan",
    "wifi": "router", "modem": "router", "mesh": "router",
    "access point": "router", "extender": "router",
    "playstation": "gaming console", "xbox": "gaming console",
    "switch": "gaming console", "nintendo": "gaming console",
    "ps5": "gaming console", "ps4": "gaming console",
    "clothes dryer": "dryer", "tumble dryer": "dryer",
    "laundry": "washing machine", "front loader": "washing machine",
    "top loader": "washing machine", "wash machine": "washing machine",
    "iron": "hair dryer",  # similar wattage
    "flat iron": "hair dryer",
    "curling iron": "hair dryer",
    "straightener": "hair dryer",
    "space heater": "heater", "electric heater": "heater",
    "radiator": "heater", "baseboard": "heater",
    "portable heater": "heater", "central heat": "heater",
    "ac": "air conditioner", "hvac": "air conditioner",
    "window unit": "air conditioner", "mini split": "air conditioner",
    "central air": "air conditioner", "portable ac": "air conditioner",
    "floor lamp": "light bulb", "desk lamp": "light bulb",
    "led bulb": "light bulb", "cfl": "light bulb",
    "smart light": "light bulb", "hue": "light bulb",
    "pendant": "light bulb", "chandelier": "light bulb",
    "sconce": "light bulb", "night light": "light bulb",
    "espresso": "coffee maker", "keurig": "coffee maker",
    "nespresso": "coffee maker", "drip coffee": "coffee maker",
    "bread maker": "toaster", "toaster oven": "toaster",
    "electric kettle": "toaster",  # similar wattage
    "kettle": "toaster",
    "food processor": "blender", "mixer": "blender",
    "juicer": "blender", "immersion blender": "blender",
    "dish washer": "dishwasher",
    "usb": "phone charger", "wireless charger": "phone charger",
    "charging pad": "phone charger", "power bank": "phone charger",
    "alexa": "router", "echo": "router", "google home": "router",
    "speaker": "router",  # smart speakers ~5-10W, closer to router than 75W
    "printer": "monitor",  # ~25W typical
    "vacuum": "hair dryer",  # ~1000-1500W
    "robot vacuum": "phone charger",  # ~30W charging
    "roomba": "phone charger",
    "dehumidifier": "fan",  # ~30-50W
    "humidifier": "fan",
    "air purifier": "fan",
    "water heater": "heater",
    "instant pot": "microwave",  # ~1000W
    "pressure cooker": "microwave",
    "slow cooker": "coffee maker",  # ~200-300W
    "crock pot": "coffee maker",
    "rice cooker": "coffee maker",
    "electric grill": "oven",
    "deep fryer": "microwave",
    "air fryer": "microwave",
    "induction": "stove",
    "hot plate": "stove",
    "electric stove": "stove",
    "gas stove": "stove",
    "range hood": "fan",
    "garbage disposal": "blender",
    "desk": "table", "shelf": "cupboard", "bookshelf": "cupboard",
    "dresser": "cupboard", "cabinet": "cupboard",
    "couch": "sofa", "loveseat": "sofa", "ottoman": "sofa",
    "armchair": "chair", "recliner": "chair", "stool": "chair",
    "nightstand": "table", "end table": "table", "coffee table": "table",
    "mirror": "table",  # 0W furniture
    "rug": "table", "carpet": "table", "curtain": "table",
    "pillow": "bed", "mattress": "bed", "blanket": "bed",
    "shower": "bathtub", "tub": "bathtub",
    "faucet": "sink", "tap": "sink",
}


def _resolve_fallback(device_name: str) -> PowerProfile:
    """Pick the best fallback profile by scanning the device name for keywords.
    Uses a two-pass approach: exact keyword match, then fuzzy alias match.
    """
    name_lower = device_name.lower().strip()

    # Pass 1: Direct match against CATEGORY_DEFAULTS keys
    for keyword, profile in CATEGORY_DEFAULTS.items():
        if keyword in name_lower:
            logger.info("Fallback matched keyword '%s' for device '%s'", keyword, device_name)
            return profile.model_copy()

    # Pass 2: Fuzzy alias → CATEGORY_DEFAULTS lookup
    for alias, cat_key in _FUZZY_ALIASES.items():
        if alias in name_lower:
            profile = CATEGORY_DEFAULTS.get(cat_key)
            if profile:
                logger.info("Fuzzy alias '%s' → '%s' for device '%s'", alias, cat_key, device_name)
                result = profile.model_copy()
                result.confidence = max(0.2, result.confidence - 0.1)  # slightly lower confidence
                result.notes = result.notes + [f"Matched via alias: {alias}"]
                return result

    # Pass 3: Check individual words for partial matches
    words = name_lower.replace("-", " ").replace("_", " ").split()
    for word in words:
        if len(word) < 3:
            continue
        for keyword, profile in CATEGORY_DEFAULTS.items():
            if word in keyword or keyword in word:
                logger.info("Word '%s' partial-matched keyword '%s' for '%s'", word, keyword, device_name)
                result = profile.model_copy()
                result.confidence = max(0.15, result.confidence - 0.15)
                return result

    logger.warning("No category keyword matched for '%s' — using unknown default (50W)", device_name)
    return _UNKNOWN_DEFAULT.model_copy()


# ---------------------------------------------------------------------------
# LangChain + Gemini Agent
# ---------------------------------------------------------------------------

# Pydantic output parser gives Gemini the exact schema instructions
_output_parser = PydanticOutputParser(pydantic_object=PowerProfile)

_PROMPT_TEMPLATE = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are an expert energy analyst. Given a home appliance, estimate its "
        "power consumption. Reply ONLY with valid JSON — no markdown, no explanation."
        "\n\n{format_instructions}",
    ),
    (
        "human",
        "Estimate the power usage for this device:\n"
        "  Brand : {brand}\n"
        "  Model : {model}\n"
        "  Name  : {name}\n"
        "  Region: {region}\n\n"
        "Use publicly available spec sheets and ENERGY STAR data when possible. "
        "If you are unsure, provide your best estimate and set confidence < 0.5. "
        "Return ONLY the JSON object.",
    ),
])


def _build_chain():
    """Construct a LangChain runnable: Prompt → Gemini → Pydantic parser."""
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=GOOGLE_API_KEY,
        temperature=0.1,            # low temp for deterministic factual output
        max_output_tokens=1024,
    )
    chain = _PROMPT_TEMPLATE | llm | _output_parser
    return chain


# ---------------------------------------------------------------------------
# Core Agent Logic (async)
# ---------------------------------------------------------------------------

async def lookup_power_profile(req: DeviceLookupRequest) -> PowerProfileResponse:
    """
    Main entry point for the Power Agent.

    1. Check if it's a non-appliance → return 0W
    2. Check cache  →  3. Call Gemini  →  4. Validate  →  5. Fallback  →  6. Cache & return
    """
    # List of actual appliances we care about
    actual_appliances = {"Television", "Laptop", "Microwave", "Oven", "Toaster", "Refrigerator", "Hair Dryer", "Phone Charger", "Clock", "Remote / Standby Device", "Computer Peripheral", "Washing Machine", "Dryer", "Air Conditioner", "Space Heater", "Light Bulb", "Lamp", "Dishwasher", "Gaming Console", "Router", "Fan", "Water Heater"}
    
    # If it's not an actual appliance, return 0W immediately
    if req.name not in actual_appliances:
        logger.info(f"Non-appliance detected: '{req.name}' - returning 0W")
        zero_w_profile = PowerProfile(
            category="Non-Appliance",
            standby_watts_range=[0, 0],
            standby_watts_typical=0,
            active_watts_range=[0, 5],
            active_watts_typical=0,
            confidence=0.1,
            source="Estimate",
            notes=["This doesn't appear to be an electrical appliance"]
        )
        return PowerProfileResponse(
            brand=req.brand,
            model=req.model,
            name=req.name,
            region=req.region,
            profile=zero_w_profile,
            cached=False,
        )

    collection = get_power_profiles_collection()

    # ── Step 1: MongoDB cache lookup ──────────────────────────────────────
    # Only check cache if we have meaningful brand/model info
    cached_doc = None
    if req.brand != "Unknown" or req.model != "Unknown":
        cached_doc = await collection.find_one(
            {"brand": req.brand.strip(), "model": req.model.strip()},
            {"_id": 0},  # exclude Mongo ObjectId from result
        )

    if cached_doc and "profile" in cached_doc:
        logger.info("Cache HIT for %s %s", req.brand, req.model)
        try:
            profile = PowerProfile(**cached_doc["profile"])
            return PowerProfileResponse(
                brand=req.brand,
                model=req.model,
                name=req.name,
                region=req.region,
                profile=profile,
                cached=True,
            )
        except Exception:
            logger.warning("Cached document invalid — will re-query Gemini")

    # ── Step 2: Call Gemini via LangChain ──────────────────────────────────
    logger.info("Cache MISS for %s %s ('%s') — calling Gemini…", req.brand, req.model, req.name)
    profile: Optional[PowerProfile] = None

    try:
        chain = _build_chain()
        profile = await chain.ainvoke({
            "brand": req.brand,
            "model": req.model,
            "name": req.name,
            "region": req.region,
            "format_instructions": _output_parser.get_format_instructions(),
        })
        logger.info("Gemini returned valid profile (confidence=%.2f): %sW active, %sW standby", 
                   profile.confidence, profile.active_watts_typical, profile.standby_watts_typical)

    except Exception as exc:
        logger.error("Gemini call failed: %s", exc)
        profile = None

    # ── Step 3: Validate & clamp (Pydantic validators handle clamping) ────
    # If the Pydantic parser already validated above, `profile` is good.
    # If it raised in the validator (standby > 50W, active > 5000W), profile is None.

    # ── Step 4: Fallback to category defaults ─────────────────────────────
    if profile is None:
        logger.warning("Using fallback defaults for '%s'", req.name)
        profile = _resolve_fallback(req.name)
        profile.notes.append(f"AI estimation failed — used category default for '{req.name}'")

    # ── Step 5: Cache in MongoDB ──────────────────────────────────────────
    cache_doc = {
        "brand": req.brand.strip(),
        "model": req.model.strip(),
        "name": req.name.strip(),
        "region": req.region.strip(),
        "profile": profile.model_dump(),
    }
    await collection.update_one(
        {"brand": req.brand.strip(), "model": req.model.strip()},
        {"$set": cache_doc},
        upsert=True,
    )
    logger.info("Cached profile for %s %s", req.brand, req.model)

    # ── Step 6: Return ────────────────────────────────────────────────────
    return PowerProfileResponse(
        brand=req.brand,
        model=req.model,
        name=req.name,
        region=req.region,
        profile=profile,
        cached=False,
    )


# ---------------------------------------------------------------------------
# Utility: Seed category defaults into MongoDB (optional)
# ---------------------------------------------------------------------------

async def seed_category_defaults() -> int:
    """
    Insert all CATEGORY_DEFAULTS into a `category_defaults` collection.
    Useful for debugging or letting the frontend show available categories.
    Returns the number of documents upserted.
    """
    db = get_db()
    coll = db["category_defaults"]
    count = 0
    for keyword, profile in CATEGORY_DEFAULTS.items():
        await coll.update_one(
            {"keyword": keyword},
            {"$set": {"keyword": keyword, "profile": profile.model_dump()}},
            upsert=True,
        )
        count += 1
    logger.info("Seeded %d category defaults", count)
    return count
