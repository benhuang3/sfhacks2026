"""
=============================================================================
  SmartGrid Home — Consolidated FastAPI Server (SF Hacks 2026)
=============================================================================

Endpoints:
  GET  /api/v1/health                           → Health check
  POST /api/v1/power-profile                    → Power Agent
  POST /api/v1/seed-defaults                    → Seed category defaults
  POST /api/v1/scans                            → Insert scan
  POST /api/v1/scans/similar                    → Vector similarity search
  POST /api/v1/scans/resolve                    → Cache-aware resolve
  POST /api/v1/homes                            → Create home
  GET  /api/v1/homes?userId=X                   → List homes for user
  GET  /api/v1/homes/{homeId}                   → Get home
  POST /api/v1/homes/{homeId}/devices           → Add device
  GET  /api/v1/homes/{homeId}/devices           → List devices
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

from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware

from agents import (
    DeviceLookupRequest,
    PowerProfileResponse,
    lookup_power_profile,
    seed_category_defaults,
    get_motor_client,
)

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
    await check_auth_db()  # sets _db_available = True/False
    if not db_ok:
        logger.info("📝  Auth running in IN-MEMORY fallback mode (no MongoDB)")

    # Preload vision / OCR models to avoid long first-request latency
    app.state.models_loaded = False
    if VISION_AVAILABLE:
        try:
            logger.info("Preloading vision and OCR models (startup)...")
            # call the detector/ocr getters to load weights and models
            _get_detector()
            _get_ocr()
            app.state.models_loaded = True
            logger.info("Models preloaded ✅")
        except Exception as exc:
            logger.warning("Model preload failed: %s", exc)

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
            "models_loaded": getattr(app.state, "models_loaded", False),
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
    ext = image.filename.split(".")[-1] if image.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_path = UPLOAD_DIR / filename

    try:
        with open(file_path, "wb") as f:
            content = await image.read()
            f.write(content)
        logger.info("Saved uploaded image: %s (%d bytes)", file_path, len(content))
    except Exception as exc:
        logger.exception("Failed to save uploaded image")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": f"File save failed: {str(exc)}"},
        )

    # -------------------------------------------------------------------
    # Run vision ML if available, otherwise use Gemini fallback
    # -------------------------------------------------------------------
    vision_result = {"detections": [], "ocr_texts": [], "best_match": None, "candidates": [], "bbox": None}

    if VISION_AVAILABLE:
        try:
            vision_result = detect_appliance(str(file_path))
        except Exception as exc:
            logger.exception("Vision inference failed, using fallback")

    best = vision_result.get("best_match")
    candidates = vision_result.get("candidates", [])

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

    # If no profile was found, fall back to category defaults so frontend can calculate
    if power_profile is None:
        fallback_input = None
        if best:
            fallback_input = best.get("category") or best.get("label") or best.get("model")
        fallback_input = fallback_input or "Unknown"
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

    # If no candidates from vision, provide sensible defaults
    if not candidates:
        from vision_service import ALL_CATEGORIES, get_model_asset
        default_cats = ["Television", "Lamp", "Microwave"]
        candidates = [
            {"category": c, "confidence": round(1.0 / len(default_cats), 2), "modelAsset": get_model_asset(c)}
            for c in default_cats
        ]

    return {
        "success": True,
        "data": {
            "filename": filename,
            "size_bytes": len(content),
            "content_type": image.content_type,
            "candidates": candidates,
            "bbox": vision_result.get("bbox"),
            "detected_appliance": {
                "brand": best["brand"] if best else "Unknown",
                "model": best["model"] if best else "Unknown",
                "name": best["category"] if best else "Unidentified Appliance",
                "category": best["category"] if best else "Unknown",
                "confidence": best["score"] if best else 0.0,
            },
            "detections": vision_result.get("detections", []),
            "ocr_texts": vision_result.get("ocr_texts", []),
            "power_profile": power_profile,
            "all_categories": vision_result.get("all_categories", []),
        },
    }


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
