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

from fastapi import FastAPI, HTTPException
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
