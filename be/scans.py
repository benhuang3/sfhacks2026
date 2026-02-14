"""
=============================================================================
  Scan Service — SmartGrid Home (SF Hacks 2026)
=============================================================================

Handles appliance scan CRUD, MongoDB Atlas Vector Search (768-dim embeddings),
and cache-aware scan resolution with power profile integration.

Collections used:
  - smartgrid_home.scans  (scan documents + embeddings)

Vector Search index: scanEmbeddingIndex
  - embedding field: "embedding" (768 dims, cosine)
  - filter field: "userId"
=============================================================================
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field

from agents import get_db, lookup_power_profile, DeviceLookupRequest

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("scans")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
EMBEDDING_DIM = 768
CACHE_THRESHOLD = 0.85  # vector score >= this counts as a cache hit

# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class DeviceSpecs(BaseModel):
    avgWatts: float = Field(..., ge=0)
    standbyWatts: float = Field(..., ge=0)
    source: str = Field(default="unknown")


class InsertScanRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    imageUrl: str = Field(..., min_length=1)
    imageHash: str = Field(default="")
    embedding: list[float] = Field(..., min_length=EMBEDDING_DIM, max_length=EMBEDDING_DIM)
    label: str = Field(default="Unknown Appliance")
    confidence: float = Field(default=0.5, ge=0, le=1)
    deviceSpecs: Optional[DeviceSpecs] = None


class SimilarSearchRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    embedding: list[float] = Field(..., min_length=EMBEDDING_DIM, max_length=EMBEDDING_DIM)
    k: int = Field(default=3, ge=1, le=20)


class ResolveRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    imageUrl: str = Field(..., min_length=1)
    imageHash: str = Field(default="")
    embedding: list[float] = Field(..., min_length=EMBEDDING_DIM, max_length=EMBEDDING_DIM)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _scans_collection():
    return get_db()["scans"]


def _serialize_doc(doc: dict) -> dict:
    """Convert ObjectId to string and strip embedding for responses."""
    if doc is None:
        return {}
    out = {**doc}
    if "_id" in out:
        out["_id"] = str(out["_id"])
    # Don't send the full 768-dim embedding back in responses
    out.pop("embedding", None)
    return out


# ---------------------------------------------------------------------------
# Insert Scan
# ---------------------------------------------------------------------------

async def insert_scan(req: InsertScanRequest) -> str:
    """Insert a new scan document. Returns the inserted document ID."""
    doc = {
        "userId": req.userId,
        "imageUrl": req.imageUrl,
        "imageHash": req.imageHash,
        "embedding": req.embedding,
        "label": req.label,
        "confidence": req.confidence,
        "deviceSpecs": req.deviceSpecs.model_dump() if req.deviceSpecs else None,
        "createdAt": datetime.now(timezone.utc),
    }
    result = await _scans_collection().insert_one(doc)
    logger.info("Inserted scan %s for user %s", result.inserted_id, req.userId)
    return str(result.inserted_id)


# ---------------------------------------------------------------------------
# Vector Similarity Search
# ---------------------------------------------------------------------------

async def find_similar_scans(
    user_id: str,
    embedding: list[float],
    k: int = 3,
) -> dict:
    """
    Run $vectorSearch against the scanEmbeddingIndex.
    Falls back to returning most recent scans if vector search is unavailable.
    """
    collection = _scans_collection()

    try:
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "scanEmbeddingIndex",
                    "path": "embedding",
                    "queryVector": embedding,
                    "numCandidates": k * 10,
                    "limit": k,
                    "filter": {"userId": user_id},
                }
            },
            {
                "$addFields": {
                    "score": {"$meta": "vectorSearchScore"},
                }
            },
            {
                "$project": {"embedding": 0}
            },
        ]

        matches = []
        async for doc in collection.aggregate(pipeline):
            doc["_id"] = str(doc["_id"])
            matches.append(doc)

        hit = len(matches) > 0 and matches[0].get("score", 0) >= CACHE_THRESHOLD
        return {"hit": hit, "matches": matches}

    except Exception as exc:
        logger.warning("Vector search failed, using fallback: %s", exc)
        return await _fallback_recent_scans(user_id, k)


async def _fallback_recent_scans(user_id: str, k: int) -> dict:
    """Fallback: return most recent scans for the user (no vector ranking)."""
    collection = _scans_collection()
    cursor = collection.find(
        {"userId": user_id},
        {"embedding": 0},
    ).sort("createdAt", -1).limit(k)

    matches = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        doc["score"] = 0  # no vector score available
        matches.append(doc)

    return {"hit": False, "matches": matches}


# ---------------------------------------------------------------------------
# Recognition Stub
# ---------------------------------------------------------------------------

def _run_recognition_stub(embedding: list[float]) -> dict:
    """
    Placeholder for actual on-device AI recognition.
    Replace with real model inference when ready.
    """
    return {
        "label": "Unknown Appliance",
        "confidence": 0.5,
        "deviceSpecs": {
            "avgWatts": 100,
            "standbyWatts": 5,
            "source": "stub",
        },
    }


# ---------------------------------------------------------------------------
# Cache-Aware Resolve
# ---------------------------------------------------------------------------

async def resolve_scan(req: ResolveRequest) -> dict:
    """
    1. Vector search for similar scans (cache check)
    2. If cache hit (score >= 0.85) → return matched scan + power profile
    3. If miss → run recognition stub, insert new scan, fetch power profile
    """
    similar = await find_similar_scans(req.userId, req.embedding, k=1)

    if similar["hit"] and len(similar["matches"]) > 0:
        match = similar["matches"][0]
        logger.info("Cache HIT (score=%.3f) for user %s", match.get("score", 0), req.userId)

        # Fetch power profile for the matched device
        power = await _fetch_power_for_label(match.get("label", "Unknown"))

        return {
            "cacheHit": True,
            "result": match,
            "powerProfile": power,
        }

    # Cache miss — run recognition and insert new scan
    logger.info("Cache MISS for user %s — running recognition", req.userId)
    recognition = _run_recognition_stub(req.embedding)

    insert_req = InsertScanRequest(
        userId=req.userId,
        imageUrl=req.imageUrl,
        imageHash=req.imageHash,
        embedding=req.embedding,
        label=recognition["label"],
        confidence=recognition["confidence"],
        deviceSpecs=DeviceSpecs(**recognition["deviceSpecs"]),
    )
    inserted_id = await insert_scan(insert_req)

    result = {
        "_id": inserted_id,
        "userId": req.userId,
        "imageUrl": req.imageUrl,
        "label": recognition["label"],
        "confidence": recognition["confidence"],
        "deviceSpecs": recognition["deviceSpecs"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    # Fetch power profile for the new device
    power = await _fetch_power_for_label(recognition["label"])

    return {
        "cacheHit": False,
        "result": result,
        "powerProfile": power,
    }


async def _fetch_power_for_label(label: str) -> Optional[dict]:
    """Call the Power Agent for a given device label."""
    try:
        req = DeviceLookupRequest(brand="Generic", model="unknown", name=label, region="US")
        response = await lookup_power_profile(req)
        return response.model_dump()
    except Exception as exc:
        logger.error("Power profile fetch failed for '%s': %s", label, exc)
        return None
