"""
=============================================================================
  SmartGrid Home — Consolidated FastAPI Server (SF Hacks 2026)
=============================================================================

Endpoints:
  GET  /api/v1/health                           → Health check
  POST /api/v1/power-profile                    → Power Agent
  POST /api/v1/seed-defaults                    → Seed category defaults
  POST /api/v1/identify-brand                    → Multi-angle brand ID
  POST /api/v1/research-device                   → Research power specs + alternatives
  POST /api/v1/scans                            → Insert scan
  POST /api/v1/scans/similar                    → Vector similarity search
  POST /api/v1/scans/resolve                    → Cache-aware resolve
  POST /api/v1/homes                            → Create home
  GET  /api/v1/homes?userId=X                   → List homes for user
  GET  /api/v1/homes/{homeId}                   → Get home
  POST /api/v1/homes/{homeId}/devices           → Add device
  GET  /api/v1/homes/{homeId}/devices           → List devices
  PATCH /api/v1/devices/{deviceId}              → Update device
  DELETE /api/v1/devices/{deviceId}             → Delete device
  GET  /api/v1/homes/{homeId}/summary           → Aggregated totals
  POST /api/v1/homes/{homeId}/assumptions       → Set rate/CO₂/profile
  POST /api/v1/homes/{homeId}/actions/propose   → AI propose actions
  POST /api/v1/homes/{homeId}/actions/execute   → Execute selected actions
  GET  /api/v1/homes/{homeId}/actions           → Audit log
  POST /api/v1/homes/{homeId}/actions/{id}/revert → Revert action

Run:
  uvicorn server:app --reload --host 0.0.0.0 --port 8000
=============================================================================
"""

from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

import os
import logging
from contextlib import asynccontextmanager

import shutil
import uuid
from pathlib import Path

from typing import List, Optional
from fastapi import FastAPI, HTTPException, UploadFile, File, Depends, Body
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from agents import (
    DeviceLookupRequest,
    PowerProfileResponse,
    lookup_power_profile,
    seed_category_defaults,
    get_motor_client,
    _resolve_fallback,
)

from scans import (
    InsertScanRequest,
    SimilarSearchRequest,
    ResolveRequest,
    insert_scan,
    find_similar_scans,
    resolve_scan,
)

from models import (
    CreateHomeRequest,
    AddRoomRequest,
    AddDeviceRequest,
    SetAssumptionsRequest,
    ProposeActionsRequest,
    ExecuteActionsRequest,
)

from homes_devices import (
    create_home,
    list_homes,
    get_home,
    delete_home,
    add_room,
    remove_room,
    get_scene,
    add_device,
    list_devices,
    get_device,
    delete_device,
    update_device,
    set_assumptions,
    get_assumptions,
)

from aggregation import (
    compute_home_summary,
    save_snapshot,
    list_snapshots,
)

from optimizer import (
    propose_actions_with_llm,
)

from actions_service import (
    store_proposals,
    execute_actions,
    list_actions,
    revert_action,
    compute_action_savings,
)

try:
    from research_agent import research_device
    RESEARCH_AVAILABLE = True
except ImportError as _re:
    logger.warning("research_agent import failed: %s — endpoint will return empty", _re)
    RESEARCH_AVAILABLE = False
    async def research_device(brand: str, model: str, category: str):  # type: ignore[misc]
        return {"power_profile": None, "alternatives": []}

from auth import (
    SignupRequest,
    LoginRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    get_current_user,
    signup,
    login,
    forgot_password,
    reset_password,
    get_user_profile,
    _check_db,
    ensure_auth_indexes,
)

# Vision service imports — only used for category/model-asset lists now.
# SSD MobileNet detection has been replaced by Gemini Vision as primary detector.
try:
    from vision_service import ALL_CATEGORIES, get_model_asset
except ImportError:
    ALL_CATEGORIES = [
        "Television", "Laptop", "Monitor", "Microwave", "Oven", "Toaster",
        "Refrigerator", "Hair Dryer", "Phone Charger", "Washing Machine",
        "Dryer", "Light Bulb", "Lamp", "Air Conditioner", "Space Heater",
        "Gaming Console", "Router", "Fan", "Water Heater", "Dishwasher",
        "Computer Peripheral", "Clock",
    ]
    def get_model_asset(category: str) -> str:
        return f"models/{category.lower().replace(' ', '_')}.glb"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("server")
logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Lifespan — startup / shutdown hooks
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup  → verify MongoDB connection
    On shutdown → close Motor client
    """
    # ── startup ───────────────────────────────────────────────────────────
    client = get_motor_client()
    db_ok = False
    try:
        await client.admin.command("ping")
        logger.info("✅  Connected to MongoDB")
        db_ok = True
    except Exception as exc:
        logger.warning("⚠️  MongoDB not reachable at startup: %s", exc)

    # Set auth module's DB availability flag
    await _check_db()  # sets _db_available = True/False
    if not db_ok:
        logger.info("📝  Auth running in IN-MEMORY fallback mode (no MongoDB)")

    # Ensure auth indexes
    try:
        await ensure_auth_indexes()
    except Exception as exc:
        logger.warning("Auth index creation failed: %s", exc)

    yield  # ← app is running

    # ── shutdown ──────────────────────────────────────────────────────────
    client.close()
    logger.info("🛑  Motor client closed")


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SmartGrid Home API",
    version="0.1.0",
    description="Backend for SmartGrid Home — SF Hacks 2026",
    lifespan=lifespan,
)

# CORS — allow the React Native / Expo frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

# ===========================================================================
# AUTH
# ===========================================================================

@app.post("/api/v1/auth/signup")
async def signup_endpoint(request: SignupRequest):
    """Create a new user account."""
    result = await signup(request)
    return {"success": True, "data": result}


@app.post("/api/v1/auth/login")
async def login_endpoint(request: LoginRequest):
    """Log in and receive JWT."""
    result = await login(request)
    return {"success": True, "data": result}


@app.post("/api/v1/auth/forgot-password")
async def forgot_password_endpoint(request: ForgotPasswordRequest):
    """Request a password reset OTP."""
    result = await forgot_password(request)
    return {"success": True, "data": result}


@app.post("/api/v1/auth/reset-password")
async def reset_password_endpoint(request: ResetPasswordRequest):
    """Reset password with OTP."""
    result = await reset_password(request)
    return {"success": True, "data": result}


@app.get("/api/v1/auth/me")
async def me_endpoint(current_user: dict = Depends(get_current_user)):
    """Get current user profile."""
    profile = await get_user_profile(current_user["userId"])
    return {"success": True, "data": profile}


# ===========================================================================
# HEALTH
# ===========================================================================

@app.get("/api/v1/health")
async def health_check():
    """Simple health check — also pings MongoDB."""
    client = get_motor_client()
    try:
        await client.admin.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "unreachable"

    return {
        "success": True,
        "data": {
            "status": "ok",
            "database": db_status,
            "vision": "gemini",
        },
    }


@app.post("/api/v1/power-profile", response_model=PowerProfileResponse)
async def power_profile_endpoint(request: DeviceLookupRequest):
    """
    Power Agent endpoint.

    Accepts a device description, checks MongoDB cache, calls Gemini via
    LangChain if needed, validates/clamps the response, caches it, and
    returns a PowerProfileResponse.

    Example request body:
    {
        "brand": "Samsung",
        "model": "UN55TU8000",
        "name": "55-inch 4K TV",
        "region": "US"
    }
    """
    try:
        result = await lookup_power_profile(request)
        return result
    except Exception as exc:
        logger.exception("Power Agent failed")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": f"Power Agent error: {str(exc)}",
            },
        )


# ---------------------------------------------------------------------------
# Image Upload / Scan Endpoint
# ---------------------------------------------------------------------------

# Directory to save uploaded images
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@app.post("/scan")
async def scan_image(image: UploadFile = File(...)):
    """
    Receive an image from the mobile app camera.

    Accepts multipart/form-data with field name "image".
    Saves the file locally, then returns a placeholder response.
    In production, this would run image recognition to identify
    the appliance and call the Power Agent.

    Example:
      curl -X POST http://localhost:8000/scan \
        -F "image=@photo.jpg"
    """
    # Validate content type
    if image.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": f"Unsupported image type: {image.content_type}. Use JPEG, PNG, or WebP.",
            },
        )

    # Save uploaded file
    ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
    ext = (image.filename.split(".")[-1].lower() if image.filename else "jpg")
    if ext not in ALLOWED_EXTENSIONS:
        ext = "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = UPLOAD_DIR / filename

    try:
        content = await image.read()
        if len(content) == 0:
            raise HTTPException(
                status_code=400,
                detail={"success": False, "error": "Uploaded image is empty."},
            )
        with open(file_path, "wb") as f:
            f.write(content)
        logger.info("Saved uploaded image: %s (%d bytes)", file_path, len(content))
    except Exception as exc:
        logger.exception("Failed to save uploaded image")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": f"File save failed: {str(exc)}"},
        )

    # -------------------------------------------------------------------
    # Primary detection: Gemini Vision (identifies ALL appliance types)
    # SSD MobileNet removed — it only knew COCO classes and missed most
    # home appliances (washers, ACs, fans, routers, etc.).
    # -------------------------------------------------------------------
    best = None
    candidates = []
    ocr_texts = []

    api_key = os.environ.get("GOOGLE_API_KEY")
    if api_key:
        try:
            from google import genai
            from google.genai import types as genai_types
            import base64, json as _json

            with open(file_path, "rb") as f:
                img_bytes = f.read()
            img_b64 = base64.standard_b64encode(img_bytes).decode("utf-8")
            mime = "image/jpeg" if str(file_path).lower().endswith((".jpg", ".jpeg")) else "image/png"

            client = genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=genai_types.Content(
                    role="user",
                    parts=[
                        genai_types.Part.from_bytes(
                            data=base64.standard_b64decode(img_b64),
                            mime_type=mime,
                        ),
                        genai_types.Part.from_text(text=(
                            "Identify the main electrical appliance or device in this image.\n"
                            "Reply with ONLY valid JSON (no markdown fences):\n"
                            "{\n"
                            '  "category": "Television",\n'
                            '  "brand": "Samsung",\n'
                            '  "model": "UN55TU7000",\n'
                            '  "confidence": 0.85,\n'
                            '  "top_3": [\n'
                            '    {"category": "Television", "confidence": 0.85},\n'
                            '    {"category": "Monitor", "confidence": 0.10},\n'
                            '    {"category": "Laptop", "confidence": 0.05}\n'
                            "  ]\n"
                            "}\n\n"
                            "Rules:\n"
                            "- category must be one of: Television, Laptop, Monitor, Microwave, Oven, "
                            "Toaster, Refrigerator, Hair Dryer, Phone Charger, Clock, Computer Peripheral, "
                            "Washing Machine, Dryer, Air Conditioner, Space Heater, Light Bulb, Lamp, "
                            "Dishwasher, Gaming Console, Router, Fan, Water Heater, Coffee Maker, or Unknown.\n"
                            "- Look for logos, labels, model numbers, and design features to identify brand/model.\n"
                            "- If brand or model can't be determined, set them to \"Unknown\".\n"
                            "- confidence is 0.0-1.0 based on how certain you are.\n"
                            "- top_3 should list up to 3 possible categories, sorted by confidence."
                        )),
                    ],
                ),
                config=genai_types.GenerateContentConfig(temperature=0.1, max_output_tokens=256),
            )

            if resp and resp.text:
                text = resp.text.strip()
                # Strip markdown fences if present
                if text.startswith("```"):
                    text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                result = _json.loads(text)

                category = result.get("category", "Unknown")
                brand = result.get("brand", "Unknown")
                model_name = result.get("model", "Unknown")
                confidence = float(result.get("confidence", 0.7))
                top_3 = result.get("top_3", [])

                if category and category.lower() != "unknown":
                    best = {
                        "brand": brand,
                        "model": model_name,
                        "category": category,
                        "label": category.lower(),
                        "score": confidence,
                    }
                    # Build candidates from top_3
                    candidates = [
                        {
                            "category": c.get("category", category),
                            "confidence": float(c.get("confidence", confidence)),
                            "modelAsset": get_model_asset(c.get("category", category)),
                        }
                        for c in (top_3 if top_3 else [{"category": category, "confidence": confidence}])
                    ]
                    logger.info(
                        "Gemini Vision identified: %s (brand=%s, model=%s, conf=%.2f)",
                        category, brand, model_name, confidence,
                    )
                else:
                    logger.info("Gemini Vision returned Unknown for image %s", filename)

        except Exception as exc:
            logger.warning("Gemini Vision detection failed: %s", exc)

    # If we got a detection, fetch power profile from the Gemini agent
    power_profile = None
    if best and best.get("category") not in (None, "Unknown"):
        try:
            req = DeviceLookupRequest(
                brand=best.get("brand", "Unknown"),
                model=best.get("model", "Unknown"),
                name=best["category"],
                region="US",
            )
            profile_resp = await lookup_power_profile(req)
            power_profile = profile_resp.model_dump()
        except Exception as exc:
            logger.warning("Power profile lookup failed: %s", exc)

    # If no profile was found, fall back to category defaults (Berkeley Lab / research style)
    if power_profile is None:
        fallback_input = None
        if best:
            fallback_input = best.get("category") or best.get("label") or best.get("model")
        # Use first candidate category if best_match missing so we don't default to 75W
        if not fallback_input and candidates:
            fallback_input = candidates[0].get("category") or "Unknown"

        logger.info(f"DEBUG: fallback_input = '{fallback_input}', best = {best}")

        # If no meaningful detection or it's not an actual appliance, use a very low power default
        actual_appliances = {"Television", "Laptop", "Microwave", "Oven", "Toaster", "Refrigerator", "Hair Dryer", "Phone Charger", "Clock", "Remote / Standby Device", "Computer Peripheral", "Washing Machine", "Dryer", "Air Conditioner", "Space Heater", "Light Bulb", "Lamp", "Dishwasher", "Gaming Console", "Router", "Fan", "Water Heater"}

        if not fallback_input or fallback_input not in actual_appliances:
            # Non-appliance detected - use minimal power
            power_profile = {
                "brand": "Unknown",
                "model": "Unknown",
                "name": "Non-Appliance",
                "region": "US",
                "profile": {
                    "category": "Non-Appliance",
                    "standby_watts_range": [0, 0],
                    "standby_watts_typical": 0,
                    "active_watts_range": [0, 5],
                    "active_watts_typical": 0,
                    "confidence": 0.1,
                    "source": "Estimate",
                    "notes": ["This doesn't appear to be an electrical appliance"]
                },
                "cached": False,
            }
            logger.info("Using non-appliance power profile (0W) for non-appliance detection")
        else:
            try:
                fb = _resolve_fallback(fallback_input)
                power_profile = {
                    "brand": best.get("brand", "Unknown") if best else "Unknown",
                    "model": best.get("model", "Unknown") if best else "Unknown",
                    "name": fallback_input,
                    "region": "US",
                    "profile": fb.model_dump(),
                    "cached": False,
                }
                logger.info("Using local fallback power profile for '%s'", fallback_input)
            except Exception:
                power_profile = None

    return {
        "success": True,
        "data": {
            "filename": filename,
            "size_bytes": len(content),
            "content_type": image.content_type,
            "candidates": candidates,
            "bbox": None,  # Gemini Vision doesn't return bounding boxes
            "detected_appliance": {
                "brand": best["brand"] if best else "Unknown",
                "model": best["model"] if best else "Unknown",
                "name": best["category"] if best else "Unidentified Appliance",
                "category": best["category"] if best else "Unknown",
                "confidence": best["score"] if best else 0.0,
            },
            "detections": [],
            "ocr_texts": ocr_texts,
            "power_profile": power_profile,
            "all_categories": ALL_CATEGORIES,
        },
    }


# ---------------------------------------------------------------------------
# Multi-angle brand identification → POST /api/v1/identify-brand
# ---------------------------------------------------------------------------

class IdentifyBrandRequest(BaseModel):
    category: str
    image_uris: List[str]  # base64-encoded JPEG strings


@app.post("/api/v1/identify-brand")
async def identify_brand(req: IdentifyBrandRequest):
    """
    Send multiple angle images + basic category to Gemini to identify the
    brand and model of an appliance.
    """
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("identify-brand: GOOGLE_API_KEY not set, returning Unknown")
        return {"success": True, "data": {"brand": "Unknown", "model": "Unknown"}}

    logger.info("identify-brand: received %d images for category '%s'", len(req.image_uris), req.category)

    try:
        import base64
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=api_key)

        # Build image parts from base64 strings
        parts: list = []
        for i, img_b64 in enumerate(req.image_uris[:6]):
            # Strip data URI prefix if present
            raw_b64 = img_b64
            if "," in raw_b64:
                raw_b64 = raw_b64.split(",", 1)[1]
            img_bytes = base64.standard_b64decode(raw_b64)
            logger.info("identify-brand: image %d = %d bytes", i, len(img_bytes))
            parts.append(
                genai_types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg")
            )

        prompt = (
            f"These {len(req.image_uris)} images show the same home appliance "
            f"from different angles. The appliance category is: {req.category}.\n\n"
            "Based on the images, identify the BRAND and MODEL of this specific appliance. "
            "Look for logos, labels, model numbers, and distinctive design features.\n\n"
            "Reply with ONLY valid JSON, no markdown:\n"
            '{"brand": "BrandName", "model": "ModelNumber"}\n\n'
            "If you cannot determine the brand, use the most likely brand based on "
            "the design. If you cannot determine the model, set model to \"Unknown\"."
        )
        parts.append(
            genai_types.Part.from_text(text=prompt)
        )

        logger.info("identify-brand: calling Gemini...")
        resp = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=genai_types.Content(role="user", parts=parts),
            config=genai_types.GenerateContentConfig(
                temperature=0.1, max_output_tokens=128
            ),
        )

        logger.info("identify-brand: Gemini raw response: %s", resp.text if resp else "None")

        if resp and resp.text:
            import json
            text = resp.text.strip()
            # Strip markdown fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            result = json.loads(text)
            brand = result.get("brand", "Unknown")
            model = result.get("model", "Unknown")
            logger.info("Gemini brand identification: %s %s", brand, model)
            return {"success": True, "data": {"brand": brand, "model": model}}
        else:
            logger.warning("identify-brand: Gemini returned empty response")

    except Exception as exc:
        logger.warning("Brand identification failed: %s", exc, exc_info=True)

    return {"success": True, "data": {"brand": "Unknown", "model": "Unknown"}}


# ---------------------------------------------------------------------------
# Research Agent → POST /api/v1/research-device
# ---------------------------------------------------------------------------

class ResearchDeviceRequest(BaseModel):
    brand: str = "Unknown"
    model: str = "Unknown"
    category: str = "Unknown"


@app.post("/api/v1/research-device")
async def research_device_endpoint(req: ResearchDeviceRequest):
    """
    Look up real power specs and energy-efficient alternatives.
    Priority: MongoDB cache → ENERGY STAR API (free) → Gemini flash-lite.
    """
    logger.info("POST /api/v1/research-device — brand=%s model=%s category=%s", req.brand, req.model, req.category)
    try:
        result = await research_device(req.brand, req.model, req.category)
        has_profile = result.get("power_profile") is not None
        alt_count = len(result.get("alternatives", []))
        source = result.get("power_profile", {}).get("source", "none") if has_profile else "none"
        logger.info("POST /api/v1/research-device — done: hasProfile=%s source=%s alternatives=%d", has_profile, source, alt_count)
        return {"success": True, "data": result}
    except Exception as exc:
        logger.exception("Research device failed")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": str(exc)},
        )


@app.post("/api/v1/seed-defaults")
async def seed_defaults_endpoint():
    """Seed the category_defaults collection in MongoDB."""
    try:
        count = await seed_category_defaults()
        return {
            "success": True,
            "data": {"seeded": count},
        }
    except Exception as exc:
        logger.exception("Seed failed")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": str(exc),
            },
        )


# ---------------------------------------------------------------------------
# Scan Routes
# ---------------------------------------------------------------------------

@app.post("/api/v1/scans")
async def create_scan(request: InsertScanRequest):
    """Insert a new appliance scan document."""
    try:
        inserted_id = await insert_scan(request)
        return {"success": True, "data": {"insertedId": inserted_id}}
    except Exception as exc:
        logger.exception("Insert scan failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.post("/api/v1/scans/similar")
async def similar_search(request: SimilarSearchRequest):
    """Vector similarity search against the scans collection."""
    try:
        result = await find_similar_scans(request.userId, request.embedding, request.k)
        return {"success": True, "data": result}
    except Exception as exc:
        logger.exception("Similar search failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.post("/api/v1/scans/resolve")
async def resolve_scan_endpoint(request: ResolveRequest):
    """
    Cache-aware scan resolution.

    1. Vector search for similar scans (cache check)
    2. If hit (score >= 0.85) → return matched scan + power profile
    3. If miss → run recognition, insert new scan, fetch power profile
    """
    try:
        result = await resolve_scan(request)
        return {"success": True, "data": result}
    except Exception as exc:
        logger.exception("Resolve scan failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


# ---------------------------------------------------------------------------
# Dashboard aggregate
# ---------------------------------------------------------------------------

@app.get("/api/v1/dashboard")
async def dashboard():
    """Return aggregate stats for the dashboard."""
    db = get_motor_client()[os.getenv("MONGO_DB", "smartgrid_home")]
    scans_col = db["scans"]
    profiles_col = db["power_profiles"]

    total_scans = await scans_col.count_documents({})
    total_profiles = await profiles_col.count_documents({})

    # Get recent scans
    recent_cursor = scans_col.find({}, {"_id": 0}).sort("created_at", -1).limit(10)
    recent_scans = await recent_cursor.to_list(length=10)

    # Get all cached power profiles
    profiles_cursor = profiles_col.find({}, {"_id": 0}).limit(50)
    profiles = await profiles_cursor.to_list(length=50)

    return {
        "success": True,
        "data": {
            "total_scans": total_scans,
            "total_profiles": total_profiles,
            "recent_scans": recent_scans,
            "profiles": profiles,
        },
    }


# ===========================================================================
# HOMES
# ===========================================================================

@app.post("/api/v1/homes")
async def create_home_endpoint(request: CreateHomeRequest):
    """Create a new home."""
    try:
        home = await create_home(request)
        return {"success": True, "data": home}
    except Exception as exc:
        logger.exception("Create home failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.get("/api/v1/homes")
async def list_homes_endpoint(userId: str):
    """List all homes for a user."""
    try:
        homes = await list_homes(userId)
        return {"success": True, "data": homes}
    except Exception as exc:
        logger.exception("List homes failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.get("/api/v1/homes/{home_id}")
async def get_home_endpoint(home_id: str):
    """Get a single home by ID."""
    home = await get_home(home_id)
    if not home:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})
    return {"success": True, "data": home}


@app.delete("/api/v1/homes/{home_id}")
async def delete_home_endpoint(home_id: str):
    """Delete a home and all its devices."""
    deleted = await delete_home(home_id)
    if not deleted:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})
    return {"success": True, "data": {"deleted": True}}


# ===========================================================================
# ROOMS — add / remove rooms from a home
# ===========================================================================

@app.post("/api/v1/homes/{home_id}/rooms")
async def add_room_endpoint(home_id: str, request: AddRoomRequest):
    """Add a new room to a home."""
    try:
        updated = await add_room(home_id, request.name)
        if not updated:
            raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})
        return {"success": True, "data": updated}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Add room failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.delete("/api/v1/homes/{home_id}/rooms/{room_id}")
async def remove_room_endpoint(home_id: str, room_id: str):
    """Remove a room. Devices in it become 'unassigned'."""
    try:
        updated = await remove_room(home_id, room_id)
        if not updated:
            raise HTTPException(status_code=404, detail={"success": False, "error": "Home or room not found"})
        return {"success": True, "data": updated}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Remove room failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


# ===========================================================================
# SCENE — 3-D scene JSON for a home
# ===========================================================================

@app.get("/api/v1/homes/{home_id}/scene")
async def get_scene_endpoint(home_id: str):
    """Return the 3-D scene JSON for this home (rooms + placed objects)."""
    home = await get_home(home_id)
    if not home:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})
    scene = await get_scene(home_id)
    return {"success": True, "data": scene}


# ===========================================================================
# DEVICES
# ===========================================================================

@app.post("/api/v1/homes/{home_id}/devices")
async def add_device_endpoint(home_id: str, request: AddDeviceRequest):
    """Add a device to a home (from scan or manual entry)."""
    home = await get_home(home_id)
    if not home:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})
    try:
        device = await add_device(home_id, request)
        return {"success": True, "data": device}
    except Exception as exc:
        logger.exception("Add device failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.get("/api/v1/homes/{home_id}/devices")
async def list_devices_endpoint(home_id: str):
    """List all devices in a home."""
    try:
        devices = await list_devices(home_id)
        return {"success": True, "data": devices}
    except Exception as exc:
        logger.exception("List devices failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.get("/api/v1/devices/{device_id}")
async def get_device_endpoint(device_id: str):
    """Get a single device by ID."""
    device = await get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Device not found"})
    return {"success": True, "data": device}


@app.delete("/api/v1/devices/{device_id}")
async def delete_device_endpoint(device_id: str):
    """Delete a device."""
    deleted = await delete_device(device_id)
    if not deleted:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Device not found"})
    return {"success": True, "data": {"deleted": True}}


@app.patch("/api/v1/devices/{device_id}")
async def update_device_endpoint(device_id: str, body: dict = Body(...)):
    """Update a device (partial update)."""
    logger.info("PATCH /api/v1/devices/%s — fields: %s", device_id, list(body.keys()))
    updated = await update_device(device_id, body)
    if not updated:
        logger.warning("Update failed: device %s not found", device_id)
        raise HTTPException(status_code=404, detail={"success": False, "error": "Device not found"})
    logger.info("Device %s updated: %s", device_id, list(body.keys()))
    return {"success": True, "data": updated}


@app.post("/api/v1/devices/{device_id}/toggle")
async def toggle_device_endpoint(device_id: str):
    """Toggle a smart device on/off (simulated)."""
    logger.info("POST /api/v1/devices/%s/toggle", device_id)
    device = await get_device(device_id)
    if not device:
        logger.warning("Toggle failed: device %s not found", device_id)
        raise HTTPException(status_code=404, detail={"success": False, "error": "Device not found"})
    from datetime import datetime as _dt, timezone as _tz
    old_state = device.get("is_on", True)
    new_state = not old_state
    logger.info("Toggling device '%s' (id=%s): %s → %s",
                device.get("label", "?"), device_id,
                "on" if old_state else "off", "on" if new_state else "off")
    updated = await update_device(device_id, {
        "is_on": new_state,
        "last_toggled_at": _dt.now(_tz.utc).isoformat(),
    })
    logger.info("Toggle complete for device %s — now %s", device_id, "on" if new_state else "off")
    return {"success": True, "data": updated}


@app.get("/api/v1/devices/{device_id}/power")
async def get_device_power_endpoint(device_id: str):
    """Return simulated real-time power reading for a device."""
    device = await get_device(device_id)
    if not device:
        logger.warning("Power reading failed: device %s not found", device_id)
        raise HTTPException(status_code=404, detail={"success": False, "error": "Device not found"})
    import random
    power = device.get("power", {})
    is_on = device.get("is_on", True)
    if is_on:
        base = power.get("active_watts_typical", 75.0)
        noise = random.uniform(-0.05, 0.05) * base
    else:
        base = power.get("standby_watts_typical", 2.0)
        noise = random.uniform(-0.10, 0.10) * base
    current_watts = round(base + noise, 1)
    logger.debug("Power reading for '%s' (id=%s): %.1fW (%s)",
                 device.get("label", "?"), device_id, current_watts,
                 "active" if is_on else "standby")
    return {
        "success": True,
        "data": {
            "current_watts": current_watts,
            "is_on": is_on,
            "simulated": True,
        },
    }


# ===========================================================================
# SUMMARY & ASSUMPTIONS
# ===========================================================================

@app.get("/api/v1/homes/{home_id}/summary")
async def home_summary_endpoint(home_id: str):
    """
    Aggregated totals + per-device breakdown.
    Returns annual kWh, cost, CO₂ with min/typical/max ranges.
    """
    home = await get_home(home_id)
    if not home:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})
    try:
        summary = await compute_home_summary(home_id)
        # Also include savings from executed actions
        action_savings = await compute_action_savings(home_id)
        summary["action_savings"] = action_savings
        return {"success": True, "data": summary}
    except Exception as exc:
        logger.exception("Compute summary failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.post("/api/v1/homes/{home_id}/assumptions")
async def set_assumptions_endpoint(home_id: str, request: SetAssumptionsRequest):
    """Set energy rate, CO₂ factor, and usage profile for a home."""
    try:
        assumptions = await set_assumptions(home_id, request)
        return {"success": True, "data": assumptions.model_dump()}
    except Exception as exc:
        logger.exception("Set assumptions failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.get("/api/v1/homes/{home_id}/assumptions")
async def get_assumptions_endpoint(home_id: str):
    """Get current assumptions for a home."""
    assumptions = await get_assumptions(home_id)
    return {"success": True, "data": assumptions.model_dump()}


@app.get("/api/v1/homes/{home_id}/snapshots")
async def list_snapshots_endpoint(home_id: str, limit: int = 10):
    """List historical ROI snapshots."""
    try:
        snapshots = await list_snapshots(home_id, limit)
        return {"success": True, "data": snapshots}
    except Exception as exc:
        logger.exception("List snapshots failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


# ===========================================================================
# ACTIONS — PROPOSE, EXECUTE, AUDIT
# ===========================================================================

@app.post("/api/v1/homes/{home_id}/actions/propose")
async def propose_actions_endpoint(home_id: str, request: ProposeActionsRequest):
    """
    Ask the AI agent to propose cost-minimizing actions.
    Returns ranked list of proposals with savings estimates.
    """
    home = await get_home(home_id)
    if not home:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})

    try:
        devices = await list_devices(home_id)
        if not devices:
            return {"success": True, "data": {"proposals": [], "message": "No devices found in home"}}

        # Use provided assumptions or fetch stored ones
        assumptions = request.assumptions or await get_assumptions(home_id)

        # Try LLM-powered optimizer first, fall back to greedy
        proposals = await propose_actions_with_llm(
            devices, assumptions, request.constraints, request.top_n
        )

        # Store proposals in DB and return with IDs
        proposal_ids = await store_proposals(home_id, proposals)
        proposals_data = []
        for proposal, pid in zip(proposals, proposal_ids):
            pd = proposal.model_dump()
            pd["id"] = pid
            proposals_data.append(pd)

        return {"success": True, "data": {"proposals": proposals_data}}
    except Exception as exc:
        logger.exception("Propose actions failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.post("/api/v1/homes/{home_id}/actions/execute")
async def execute_actions_endpoint(home_id: str, request: ExecuteActionsRequest):
    """
    Execute selected actions (with user confirmation already done on frontend).
    Calls control APIs (simulated for demo), logs results.
    """
    try:
        results = await execute_actions(request.action_ids)

        # Recompute summary after executing actions
        summary = await compute_home_summary(home_id)
        action_savings = await compute_action_savings(home_id)

        # Save a snapshot for historical tracking
        await save_snapshot(home_id, summary)

        return {
            "success": True,
            "data": {
                "execution_results": results,
                "updated_summary": summary["totals"],
                "total_savings": action_savings,
            },
        }
    except Exception as exc:
        logger.exception("Execute actions failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.get("/api/v1/homes/{home_id}/actions")
async def list_actions_endpoint(home_id: str, limit: int = 50):
    """List the audit log of all actions for a home."""
    try:
        actions = await list_actions(home_id, limit)
        return {"success": True, "data": actions}
    except Exception as exc:
        logger.exception("List actions failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


@app.post("/api/v1/homes/{home_id}/actions/{action_id}/revert")
async def revert_action_endpoint(home_id: str, action_id: str):
    """Revert a previously executed action."""
    try:
        result = await revert_action(action_id)
        if not result["success"]:
            raise HTTPException(status_code=400, detail={"success": False, "error": result["error"]})
        return {"success": True, "data": result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Revert action failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


# ===========================================================================
# AGENT COMMAND — Natural Language Home Control
# ===========================================================================

from pydantic import BaseModel as _PydanticBase

class AgentCommandRequest(_PydanticBase):
    command: str = ""
    constraints: dict | None = None


@app.post("/api/v1/homes/{home_id}/agent")
async def agent_command_endpoint(home_id: str, request: AgentCommandRequest):
    """
    Accept a natural language command like "turn off things I'm not using"
    or "optimize energy". Uses the AI optimizer to propose actions, then
    optionally auto-executes safe ones.

    Returns proposals for the user to confirm or auto-executed results.
    """
    home = await get_home(home_id)
    if not home:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Home not found"})

    try:
        devices = await list_devices(home_id)
        if not devices:
            return {"success": True, "data": {
                "message": "No devices in this home yet. Scan some appliances first!",
                "proposals": [], "executed": [],
            }}

        assumptions_obj = await get_assumptions(home_id)

        # Merge user constraints with defaults
        constraints = request.constraints or {}
        if "quiet_hours" not in constraints:
            constraints["quiet_hours"] = ["23:00-07:00"]
        if "max_actions" not in constraints:
            constraints["max_actions"] = 5
        if "do_not_turn_off" not in constraints:
            constraints["do_not_turn_off"] = ["router", "fridge", "refrigerator"]

        # Determine intent from command text
        cmd_lower = request.command.lower().strip()
        auto_execute = False

        if any(kw in cmd_lower for kw in ["turn off", "shut down", "switch off", "power off"]):
            # Direct turn-off intent: auto-execute safe actions
            auto_execute = True
        # For "optimize" or general commands, just propose

        # Get AI proposals
        proposals = await propose_actions_with_llm(
            devices, assumptions_obj, constraints, constraints.get("max_actions", 5)
        )

        # Store proposals in DB
        proposal_ids = await store_proposals(home_id, proposals)
        proposals_data = []
        for proposal, pid in zip(proposals, proposal_ids):
            pd = proposal.model_dump()
            pd["id"] = pid
            proposals_data.append(pd)

        executed = []
        if auto_execute:
            # Auto-execute non-critical, safe proposals
            safe_ids = [
                p["id"] for p in proposals_data
                if "critical_device" not in p.get("safety_flags", [])
                and p["action_type"] in ("turn_off", "schedule", "set_mode", "suggest_manual")
            ]
            if safe_ids:
                executed = await execute_actions(safe_ids)
                # Recompute summary
                summary = await compute_home_summary(home_id)
                await save_snapshot(home_id, summary)

        return {
            "success": True,
            "data": {
                "intent": "turn_off" if auto_execute else "optimize",
                "message": f"{'Executed' if auto_execute else 'Proposed'} {len(proposals_data)} action(s) based on: \"{request.command}\"",
                "proposals": proposals_data,
                "executed": executed,
                "auto_executed": auto_execute,
            },
        }
    except Exception as exc:
        logger.exception("Agent command failed")
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


# ===========================================================================
# CATEGORIES LIST — for device search/confirm UI
# ===========================================================================

@app.get("/api/v1/categories")
async def list_categories():
    """Return all available device categories with model assets."""
    cats = [{"category": c, "modelAsset": get_model_asset(c)} for c in ALL_CATEGORIES]
    return {"success": True, "data": cats}


# ===========================================================================
# CHAT — Gemini-powered energy advisor
# ===========================================================================

class ChatRequest(_PydanticBase):
    message: str
    history: list[dict] = []  # [{role: "user"|"assistant", content: "..."}]

class ChatResponse(_PydanticBase):
    reply: str

@app.post("/api/v1/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Energy advisor chatbot powered by Gemini 2.0 Flash.
    Uses google.genai SDK directly (no langchain) for fast error handling.
    Falls back to curated responses when quota is exhausted.
    """
    import asyncio
    logger.info("Chat endpoint received message: %s", req.message[:50])
    
    try:
        from agents import GOOGLE_API_KEY as _GKEY
        if not _GKEY:
            raise ValueError("GOOGLE_API_KEY not configured")

        from google import genai
        from google.genai import types as genai_types

        system_msg = (
            "You are SmartGrid AI, a friendly and knowledgeable home energy advisor. "
            "Your role is to:\n"
            "- Help users understand their home energy consumption\n"
            "- Provide tips to reduce electricity bills\n"
            "- Explain how different appliances affect energy usage\n"
            "- Suggest energy-efficient alternatives\n"
            "- Answer questions about power ratings, kWh, standby power, and costs\n"
            "- Give personalized advice based on appliance categories\n\n"
            "Keep responses concise and practical. Use simple language. "
            "Include specific numbers when helpful (watts, kWh, costs at $0.30/kWh). "
            "Use emoji occasionally to keep it friendly. Max 3-4 paragraphs."
        )

        # Build conversation with history
        contents = []
        for msg in req.history[-10:]:
            role = "user" if msg.get("role") == "user" else "model"
            contents.append(genai_types.Content(role=role, parts=[genai_types.Part(text=msg["content"])]))
        contents.append(genai_types.Content(role="user", parts=[genai_types.Part(text=req.message)]))

        client = genai.Client(api_key=_GKEY)
        logger.info("Attempting Gemini call...")

        # Try models in order — use httpx timeout, no tenacity retries
        models = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"]
        last_err = None
        for model_name in models:
            try:
                logger.info("Trying model: %s", model_name)
                config = genai_types.GenerateContentConfig(
                    system_instruction=system_msg,
                    temperature=0.7,
                    http_options=genai_types.HttpOptions(timeout=15_000),  # 15s
                )
                # Run in thread with asyncio timeout
                result = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda m=model_name: client.models.generate_content(
                            model=m, contents=contents, config=config,
                        ),
                    ),
                    timeout=20,  # 20s total timeout
                )
                reply = result.text or "No response received."
                logger.info("Chat Gemini response from %s: %s", model_name, reply[:80])
                return {"success": True, "data": {"reply": reply}}
            except asyncio.TimeoutError:
                last_err = Exception(f"Model {model_name} timed out")
                logger.warning("Model %s timed out — trying next", model_name)
                continue
            except Exception as model_err:
                err_str = str(model_err)
                last_err = model_err
                # 429 / quota exhausted → skip remaining models, go to fallback
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                    logger.warning("Quota exhausted — using fallback")
                    break
                logger.warning("Model %s failed: %s — trying next", model_name, err_str[:120])
                continue

        raise last_err or Exception("All models failed")
    except Exception as exc:
        logger.warning("Chat endpoint using fallback: %s", str(exc)[:120])
        logger.info("Getting fallback response...")
        fallback = _get_energy_fallback(req.message)
        if fallback:
            logger.info("Returning fallback response")
            return {"success": True, "data": {"reply": fallback}}
        raise HTTPException(status_code=500, detail={"success": False, "error": str(exc)})


def _get_energy_fallback(question: str) -> str:
    """Provide offline energy advice when Gemini is unavailable."""
    q = question.lower()
    if any(w in q for w in ["reduce", "save", "lower", "bill", "cut", "cheap"]):
        return ("💡 Here are top ways to reduce your energy bill:\n\n"
                "1. **Unplug standby devices** — they can cost $100+/year\n"
                "2. **Use LED bulbs** — 75% less energy than incandescent\n"
                "3. **Set AC to 78°F / Heat to 68°F** — saves ~10% on HVAC\n"
                "4. **Run full loads** in washer/dishwasher\n"
                "5. **Use smart power strips** to cut phantom loads\n\n"
                "⚡ At $0.30/kWh, even small changes add up!")
    elif any(w in q for w in ["standby", "phantom", "vampire", "ghost"]):
        return ("👻 **Standby (phantom) power** is electricity used by devices when \"off\" but still plugged in.\n\n"
                "Common offenders:\n"
                "• TV: 5-15W standby → ~$13-39/year\n"
                "• Gaming console: 2-10W → ~$5-26/year\n"
                "• Phone charger: 0.1-0.5W → ~$0.26-1.30/year\n"
                "• Microwave (clock): 3-5W → ~$8-13/year\n\n"
                "💡 **Tip:** Use smart power strips or unplug when not in use. Standby can account for 5-10% of your total bill!")
    elif any(w in q for w in ["most energy", "highest", "biggest", "appliance", "consume", "power hungry"]):
        return ("⚡ **Top energy-consuming home appliances** (typical US home):\n\n"
                "1. 🌡️ **HVAC** — 2,000-5,000W → ~$600-1500/year\n"
                "2. 🚿 **Water Heater** — 4,500W → ~$400-600/year\n"
                "3. 👕 **Dryer** — 2,000-5,000W → ~$80-120/year\n"
                "4. 🧊 **Refrigerator** — 100-400W (runs 24/7) → ~$50-150/year\n"
                "5. 🍽️ **Dishwasher** — 1,200-2,400W → ~$35-65/year\n\n"
                "💡 Focus on HVAC efficiency and water heating for the biggest savings!")
    elif any(w in q for w in ["solar", "panel", "renewable", "green"]):
        return ("☀️ **Solar Energy Facts:**\n\n"
                "• A typical 6kW residential solar system produces ~7,200-9,000 kWh/year\n"
                "• Average payback period: 6-10 years (depending on location & incentives)\n"
                "• Can reduce electricity bill by 50-100%\n"
                "• Federal tax credit (ITC): 30% of installation cost\n"
                "• Most panels last 25-30 years with minimal maintenance\n\n"
                "💡 **Tip:** Start by calculating your daily kWh usage from the Dashboard to size a solar system!")
    elif any(w in q for w in ["tv", "television", "screen", "monitor", "display"]):
        return ("📺 **TV & Monitor Energy Guide:**\n\n"
                "• LED TV (55\"): ~60-80W active, 0.5-3W standby\n"
                "• OLED TV (65\"): ~80-120W active\n"
                "• Computer Monitor (27\"): ~25-50W\n"
                "• Gaming Monitor (144Hz): ~40-70W\n\n"
                "💡 **Tips to save:**\n"
                "1. Enable auto-brightness / eco mode\n"
                "2. Turn off (don't just sleep) when not watching\n"
                "3. Reduce backlight brightness by 25% — saves ~15% energy\n"
                "4. Use a smart plug to cut standby power completely\n\n"
                "⚡ A TV left on standby 20hrs/day costs ~$5-13/year!")
    elif any(w in q for w in ["fridge", "refrigerator", "freezer"]):
        return ("🧊 **Refrigerator Energy Guide:**\n\n"
                "• Modern fridge: 100-400W, uses ~400-800 kWh/year\n"
                "• Old fridge (15+ years): can use 2x more energy\n"
                "• Mini fridge: 50-100W, ~200-400 kWh/year\n\n"
                "💡 **Tips to save:**\n"
                "1. Set temp to 37°F (fridge) / 0°F (freezer)\n"
                "2. Keep it full (thermal mass helps efficiency)\n"
                "3. Clean coils every 6 months\n"
                "4. Check door seals — place a dollar bill, if it slides out, replace seals\n"
                "5. Keep away from heat sources (oven, direct sunlight)\n\n"
                "⚡ An ENERGY STAR fridge saves ~$35-70/year vs. a 10-year-old model!")
    elif any(w in q for w in ["ac", "air condition", "hvac", "heat", "cool", "thermostat"]):
        return ("🌡️ **HVAC Energy Guide:**\n\n"
                "• Central AC: 2,000-5,000W → biggest home energy user\n"
                "• Window AC: 500-1,400W\n"
                "• Space heater: 750-1,500W\n"
                "• Smart thermostat savings: 10-15% on HVAC bill\n\n"
                "💡 **Tips to save:**\n"
                "1. Set to 78°F cooling / 68°F heating\n"
                "2. Each degree saves ~3% on energy\n"
                "3. Change filters every 1-3 months\n"
                "4. Use ceiling fans (counterclockwise in summer)\n"
                "5. Seal windows & doors — drafts waste 25-30% of HVAC energy\n\n"
                "⚡ A smart thermostat can save ~$140-200/year!")
    elif any(w in q for w in ["wash", "laundry", "dryer", "clothes"]):
        return ("👕 **Laundry Energy Guide:**\n\n"
                "• Washing machine: 400-1,300W per cycle\n"
                "• Dryer: 2,000-5,000W per cycle (~$0.45-1.00/load)\n"
                "• Dryer is one of the most expensive appliances to run!\n\n"
                "💡 **Tips to save:**\n"
                "1. **Wash in cold water** — 90% of energy goes to heating water\n"
                "2. Run full loads only\n"
                "3. Air dry when possible (saves ~$100/year)\n"
                "4. Clean dryer lint trap every load (improves efficiency 30%)\n"
                "5. Use dryer balls to reduce drying time\n\n"
                "⚡ Switching to cold water saves ~$60-100/year!")
    elif any(w in q for w in ["led", "bulb", "light", "lamp", "lighting"]):
        return ("💡 **Lighting Energy Guide:**\n\n"
                "• LED: 8-12W (lasts 25,000 hrs) → ~$1/year each\n"
                "• CFL: 13-15W (lasts 8,000 hrs) → ~$1.50/year\n"
                "• Incandescent: 60W (lasts 1,000 hrs) → ~$7/year\n\n"
                "**Switching 20 bulbs from incandescent to LED:**\n"
                "• Saves ~1,000 kWh/year ≈ **$300/year** at $0.30/kWh!\n\n"
                "💡 **Tips:**\n"
                "1. Use dimmers — dimming 25% saves 20% energy\n"
                "2. Install motion sensors in low-traffic areas\n"
                "3. Use warm white (2700K) for bedrooms, daylight (5000K) for workspaces\n"
                "4. Smart bulbs can schedule on/off automatically")
    elif any(w in q for w in ["hello", "hi ", "hey", "howdy", "what can you", "who are", "help"]):
        return ("👋 **Hello! I'm SmartGrid AI, your home energy advisor!**\n\n"
                "I can help you with:\n"
                "• 📊 Understanding your energy consumption\n"
                "• 💰 Tips to reduce your electricity bill\n"
                "• 🔌 Appliance-specific energy advice\n"
                "• ☀️ Renewable energy suggestions\n"
                "• 📷 Analyzing scanned appliance energy profiles\n\n"
                "**Try asking:**\n"
                "• \"How can I reduce my energy bill?\"\n"
                "• \"How much energy does my TV use?\"\n"
                "• \"What are the biggest energy consumers?\"\n"
                "• \"Tips for AC efficiency\"\n\n"
                "⚡ Let's make your home smarter and greener!")
    elif any(w in q for w in ["kwh", "watt", "kilowatt", "unit", "how much", "cost", "calculate"]):
        return ("🔢 **Energy Calculation Quick Guide:**\n\n"
                "**Formula:** kWh = (Watts × Hours used) ÷ 1,000\n"
                "**Cost:** kWh × rate (avg $0.30/kWh)\n\n"
                "**Examples:**\n"
                "• 100W light bulb × 10 hrs = 1 kWh = **$0.30**\n"
                "• 1500W space heater × 8 hrs = 12 kWh = **$3.60/day**\n"
                "• 150W fridge × 24 hrs × 0.3 duty cycle = 1.08 kWh = **$0.32/day**\n\n"
                "💡 Check your Dashboard to see real usage data for your scanned devices!")
    else:
        return ("⚡ **SmartGrid AI Energy Tips:**\n\n"
                "Here are some quick energy facts:\n\n"
                "• Average US home uses ~10,500 kWh/year (~$3,150 at $0.30/kWh)\n"
                "• Standby power wastes 5-10% of your total bill\n"
                "• LED bulbs use 75% less energy than incandescent\n"
                "• ENERGY STAR appliances can save 10-50% vs standard models\n"
                "• A smart thermostat saves ~$140-200/year\n\n"
                "📷 **Try asking about specific topics** like TVs, fridges, AC, solar panels, or how to reduce your bill!")


# ---------------------------------------------------------------------------
# Serve Expo Web build (static files) — mount LAST so API routes take priority
# ---------------------------------------------------------------------------
_web_dist = os.path.join(os.path.dirname(__file__), "..", "app", "dist")
if os.path.isdir(_web_dist):
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_web_dist, html=True), name="web")
    logger.info("Serving web build from %s", os.path.abspath(_web_dist))


# ---------------------------------------------------------------------------
# Run directly: python server.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
