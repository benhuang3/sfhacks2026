"""
=============================================================================
  SmartGrid Home — Consolidated FastAPI Server (SF Hacks 2026)
=============================================================================

Endpoints:
  GET  /api/v1/health             → Health check
  POST /api/v1/power-profile      → Power Agent (estimate device power usage)
  POST /api/v1/seed-defaults      → Seed category defaults into MongoDB
  POST /api/v1/scans              → Insert a new appliance scan
  POST /api/v1/scans/similar      → Vector similarity search
  POST /api/v1/scans/resolve      → Cache-aware resolve (+ power profile)

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

import base64
import shutil
import uuid
from pathlib import Path
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

from agents import (
    DeviceLookupRequest,
    PowerProfileResponse,
    lookup_power_profile,
    seed_category_defaults,
    get_motor_client,
)

from scans import (
    InsertScanRequest,
    SimilarSearchRequest,
    ResolveRequest,
    insert_scan,
    find_similar_scans,
    resolve_scan,
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
    try:
        await client.admin.command("ping")
        logger.info("✅  Connected to MongoDB")
    except Exception as exc:
        logger.warning("⚠️  MongoDB not reachable at startup: %s", exc)

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
        content = await image.read()
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
    # Store the image in MongoDB so it persists in the database
    # -------------------------------------------------------------------
    try:
        db = get_motor_client()[os.getenv("MONGO_DB", "smartgrid_home")]
        image_b64 = base64.b64encode(content).decode("utf-8")
        doc = {
            "filename": filename,
            "contentType": image.content_type,
            "sizeBytes": len(content),
            "imageBase64": image_b64,
            "status": "pending",          # awaiting AI recognition
            "createdAt": datetime.now(timezone.utc),
        }
        result = await db["scans"].insert_one(doc)
        inserted_id = str(result.inserted_id)
        logger.info("Inserted scan image into MongoDB: %s", inserted_id)
    except Exception as exc:
        logger.exception("Failed to insert scan image into MongoDB")
        raise HTTPException(
            status_code=500,
            detail={"success": False, "error": f"Database insert failed: {str(exc)}"},
        )

    # -------------------------------------------------------------------
    # TODO: Run image recognition here (Meta on-device AI / Gemini Vision)
    # For now, return a placeholder response so the frontend flow works.
    # -------------------------------------------------------------------
    return {
        "success": True,
        "data": {
            "scanId": inserted_id,
            "filename": filename,
            "size_bytes": len(content),
            "content_type": image.content_type,
            "detected_appliance": {
                "brand": "Unknown",
                "model": "Unknown",
                "name": "Unidentified Appliance",
                "category": "Unknown",
                "confidence": 0.0,
            },
            "message": "Image received and saved to database.",
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
