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
            _motor_client = AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
        except ImportError:
            _motor_client = AsyncIOMotorClient(MONGO_URI, tls=True, tlsAllowInvalidCertificates=True)
    return _motor_client


def get_db():
    """Shortcut → database handle."""
    return get_motor_client()[MONGO_DB]


def get_power_profiles_collection():
    """Shortcut → power_profiles collection."""
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
# Category Fallback Defaults
# ---------------------------------------------------------------------------
# If Gemini fails or returns garbage, we fall back to these safe defaults
# keyed by lowercased category keywords found in the device name.

CATEGORY_DEFAULTS: dict[str, PowerProfile] = {
    "tv": PowerProfile(
        category="Television",
        standby_watts_range=[0.5, 3.0],
        standby_watts_typical=1.0,
        active_watts_range=[50, 200],
        active_watts_typical=100.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic TV profile"],
    ),
    "television": PowerProfile(
        category="Television",
        standby_watts_range=[0.5, 3.0],
        standby_watts_typical=1.0,
        active_watts_range=[50, 200],
        active_watts_typical=100.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic TV profile"],
    ),
    "refrigerator": PowerProfile(
        category="Refrigerator",
        standby_watts_range=[1, 5],
        standby_watts_typical=2.0,
        active_watts_range=[100, 400],
        active_watts_typical=150.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic refrigerator profile"],
    ),
    "fridge": PowerProfile(
        category="Refrigerator",
        standby_watts_range=[1, 5],
        standby_watts_typical=2.0,
        active_watts_range=[100, 400],
        active_watts_typical=150.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic refrigerator profile"],
    ),
    "washer": PowerProfile(
        category="Washing Machine",
        standby_watts_range=[0.5, 3.0],
        standby_watts_typical=1.0,
        active_watts_range=[300, 600],
        active_watts_typical=500.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic washing machine profile"],
    ),
    "dryer": PowerProfile(
        category="Dryer",
        standby_watts_range=[0.5, 5.0],
        standby_watts_typical=2.0,
        active_watts_range=[1800, 5000],
        active_watts_typical=3000.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic dryer profile"],
    ),
    "microwave": PowerProfile(
        category="Microwave",
        standby_watts_range=[1.0, 5.0],
        standby_watts_typical=3.0,
        active_watts_range=[600, 1200],
        active_watts_typical=1000.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic microwave profile"],
    ),
    "laptop": PowerProfile(
        category="Laptop",
        standby_watts_range=[0.5, 2.0],
        standby_watts_typical=1.0,
        active_watts_range=[15, 65],
        active_watts_typical=45.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic laptop profile"],
    ),
    "monitor": PowerProfile(
        category="Monitor",
        standby_watts_range=[0.3, 1.5],
        standby_watts_typical=0.5,
        active_watts_range=[15, 80],
        active_watts_typical=30.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic monitor profile"],
    ),
    "heater": PowerProfile(
        category="Space Heater",
        standby_watts_range=[0, 1],
        standby_watts_typical=0.5,
        active_watts_range=[750, 1500],
        active_watts_typical=1500.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic space heater profile"],
    ),
    "air conditioner": PowerProfile(
        category="Air Conditioner",
        standby_watts_range=[1, 5],
        standby_watts_typical=2.0,
        active_watts_range=[500, 3500],
        active_watts_typical=1500.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic air conditioner profile"],
    ),
    "light": PowerProfile(
        category="Light Bulb",
        standby_watts_range=[0, 0.5],
        standby_watts_typical=0.2,
        active_watts_range=[5, 100],
        active_watts_typical=10.0,
        confidence=0.4,
        source="category_default",
        notes=["Fallback: generic light profile"],
    ),
}

# Catch-all unknown device
_UNKNOWN_DEFAULT = PowerProfile(
    category="Unknown",
    standby_watts_range=[1, 5],
    standby_watts_typical=3.0,
    active_watts_range=[50, 500],
    active_watts_typical=150.0,
    confidence=0.2,
    source="category_default",
    notes=["Fallback: no matching category — generic estimate"],
)


def _resolve_fallback(device_name: str) -> PowerProfile:
    """Pick the best fallback profile by scanning the device name for keywords."""
    name_lower = device_name.lower()
    for keyword, profile in CATEGORY_DEFAULTS.items():
        if keyword in name_lower:
            logger.info("Fallback matched keyword '%s' for device '%s'", keyword, device_name)
            return profile.model_copy()
    logger.warning("No category keyword matched for '%s' — using unknown default", device_name)
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

    1. Check cache  →  2. Call Gemini  →  3. Validate  →  4. Fallback  →  5. Cache & return
    """
    collection = get_power_profiles_collection()

    # ── Step 1: MongoDB cache lookup ──────────────────────────────────────
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
    logger.info("Cache MISS for %s %s — calling Gemini…", req.brand, req.model)
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
        logger.info("Gemini returned valid profile (confidence=%.2f)", profile.confidence)

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
