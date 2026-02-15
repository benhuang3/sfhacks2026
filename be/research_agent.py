"""
=============================================================================
  Research Agent — Post-Scan Power Lookup & Alternatives
=============================================================================

Looks up real power consumption specs for a scanned device and finds
energy-efficient alternatives.

Priority (to minimise API credits):
  1. MongoDB cache  (free — 30-day TTL)
  2. ENERGY STAR Socrata API  (free, no key needed)
  3. Gemini 2.0 Flash-Lite  (cheapest model, last resort)
=============================================================================
"""

from __future__ import annotations

import os
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional
from urllib.request import urlopen, Request
from urllib.parse import quote

from agents import get_db

logger = logging.getLogger("research_agent")

# ---------------------------------------------------------------------------
# ENERGY STAR Socrata dataset IDs per category
# Each entry: { dataset_id, brand_field, model_field, power_field, standby_field }
# ---------------------------------------------------------------------------

ENERGYSTAR_DATASETS: dict[str, dict] = {
    "Television": {
        "id": "wkhy-nym2",
        "brand": "brand_name",
        "model": "model_number",
        "power": "on_mode_power_w",
        "standby": "standby_passive_mode_power_w",
    },
    "TV": {
        "id": "wkhy-nym2",
        "brand": "brand_name",
        "model": "model_number",
        "power": "on_mode_power_w",
        "standby": "standby_passive_mode_power_w",
    },
}

ENERGYSTAR_BASE = "https://data.energystar.gov/resource"


# ---------------------------------------------------------------------------
# 1. MongoDB cache
# ---------------------------------------------------------------------------

def _research_col():
    return get_db()["research_cache"]


async def _check_cache(brand: str, model: str, category: str) -> Optional[dict]:
    """Return cached research result if fresh (< 30 days)."""
    try:
        doc = await _research_col().find_one({
            "brand": brand.lower().strip(),
            "model": model.lower().strip(),
            "category": category.lower().strip(),
        })
        if doc:
            cached_at = doc.get("cached_at")
            if cached_at:
                age = (datetime.now(timezone.utc) - cached_at).days
                if age < 30:
                    logger.info("Cache HIT for %s %s (%s) — %d days old", brand, model, category, age)
                    return doc.get("result")
            else:
                return doc.get("result")
    except Exception as e:
        logger.warning("Cache check failed: %s", e)
    return None


async def _save_cache(brand: str, model: str, category: str, result: dict):
    """Upsert research result into cache."""
    try:
        await _research_col().update_one(
            {
                "brand": brand.lower().strip(),
                "model": model.lower().strip(),
                "category": category.lower().strip(),
            },
            {"$set": {"result": result, "cached_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    except Exception as e:
        logger.warning("Cache save failed: %s", e)


# ---------------------------------------------------------------------------
# 2. ENERGY STAR Socrata API (free)
# ---------------------------------------------------------------------------

def _energystar_get(url: str) -> Optional[list]:
    """Synchronous GET — run via asyncio.to_thread."""
    try:
        req = Request(url, headers={"Accept": "application/json"})
        with urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode())
    except Exception as e:
        logger.warning("ENERGY STAR request failed: %s", e)
    return None


async def _query_energystar(brand: str, model: str, category: str) -> Optional[dict]:
    """Query ENERGY STAR for the device + find efficient alternatives."""
    ds = ENERGYSTAR_DATASETS.get(category)
    if not ds:
        logger.info("  ENERGY STAR: no dataset mapping for category '%s'", category)
        return None

    dataset_id = ds["id"]
    bf = ds["brand"]
    mf = ds["model"]
    pf = ds["power"]
    sf = ds["standby"]
    logger.info("  ENERGY STAR: using dataset %s for '%s'", dataset_id, category)

    # Build queries: try brand+model first, then brand-only
    queries = []
    if model and model.lower() != "unknown":
        where = f"upper({bf}) like '%25{quote(brand.upper())}%25' AND upper({mf}) like '%25{quote(model.upper())}%25'"
        queries.append(where)
    if brand and brand.lower() != "unknown":
        where = f"upper({bf}) like '%25{quote(brand.upper())}%25'"
        queries.append(where)

    device_data = None
    for i, where_clause in enumerate(queries):
        url = f"{ENERGYSTAR_BASE}/{dataset_id}.json?$where={where_clause}&$limit=5"
        logger.info("  ENERGY STAR: query %d → %s", i + 1, url[:120])
        rows = await asyncio.to_thread(_energystar_get, url)
        if rows:
            logger.info("  ENERGY STAR: query %d returned %d rows", i + 1, len(rows))
            device_data = rows
            break
        logger.info("  ENERGY STAR: query %d returned 0 rows", i + 1)

    if not device_data:
        return None

    # Parse the best match
    first = device_data[0]
    active_w = _safe_float(first.get(pf))
    standby_w = _safe_float(first.get(sf))

    if active_w <= 0:
        return None

    power_profile = {
        "active_watts_typical": active_w,
        "standby_watts_typical": standby_w,
        "active_watts_range": [round(active_w * 0.8, 1), round(active_w * 1.2, 1)],
        "standby_watts_range": [round(max(0, standby_w * 0.7), 2), round(max(standby_w * 1.3, 0.5), 2)],
        "source": "energystar_api",
        "confidence": 0.92,
        "sources_used": ["energystar.gov"],
    }

    # Find alternatives: query same category sorted by lowest power
    alternatives = await _find_energystar_alternatives(
        dataset_id, bf, mf, pf, sf, category, active_w, brand
    )

    return {"power_profile": power_profile, "alternatives": alternatives}


async def _find_energystar_alternatives(
    dataset_id: str, bf: str, mf: str, pf: str, sf: str,
    category: str, current_watts: float, exclude_brand: str,
) -> list[dict]:
    """Find more efficient ENERGY STAR products in the same category."""
    url = (
        f"{ENERGYSTAR_BASE}/{dataset_id}.json"
        f"?$where={pf} IS NOT NULL AND {pf} < {current_watts}"
        f"&$order={pf} ASC&$limit=5"
    )
    rows = await asyncio.to_thread(_energystar_get, url)
    if not rows:
        return []

    alternatives = []
    seen = set()
    for row in rows:
        alt_brand = row.get(bf, "Unknown")
        alt_model = row.get(mf, "Unknown")
        key = f"{alt_brand}_{alt_model}".lower()
        if key in seen:
            continue
        seen.add(key)

        alt_watts = _safe_float(row.get(pf))
        alt_standby = _safe_float(row.get(sf))
        if alt_watts <= 0 or alt_watts >= current_watts:
            continue

        savings_kwh = (current_watts - alt_watts) * 4 * 365 / 1000  # 4 hrs/day
        alternatives.append({
            "brand": alt_brand,
            "model": alt_model,
            "category": category,
            "active_watts_typical": alt_watts,
            "standby_watts_typical": alt_standby,
            "annual_savings_kwh": round(savings_kwh, 1),
            "annual_savings_dollars": round(savings_kwh * 0.30, 2),
            "energy_star_certified": True,
            "source_url": "https://www.energystar.gov",
        })
        if len(alternatives) >= 3:
            break

    return alternatives


# ---------------------------------------------------------------------------
# 3. Gemini Flash-Lite fallback (cheap, last resort)
# ---------------------------------------------------------------------------

async def _query_gemini(brand: str, model: str, category: str) -> Optional[dict]:
    """Single Gemini call to get power specs + 2-3 alternatives."""
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        logger.info("  Gemini: GOOGLE_API_KEY not set, skipping")
        return None

    try:
        from google import genai
        from google.genai import types as genai_types

        prompt = (
            f"Power consumption of {brand} {model} ({category}). "
            "Also suggest 2-3 more energy-efficient alternatives in the same category. "
            "Reply ONLY valid JSON, no markdown:\n"
            '{"active_watts":<num>,"standby_watts":<num>,'
            '"alternatives":[{"brand":"<str>","model":"<str>","watts":<num>},'
            '{"brand":"<str>","model":"<str>","watts":<num>}]}'
        )

        logger.info("  Gemini: sending prompt (%d chars) to gemini-2.0-flash-lite", len(prompt))
        client = genai.Client(api_key=api_key)

        resp = await asyncio.to_thread(
            lambda: client.models.generate_content(
                model="gemini-2.0-flash-lite",
                contents=genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=prompt)],
                ),
                config=genai_types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=400,
                ),
            )
        )

        if not resp or not resp.text:
            logger.info("  Gemini: empty response")
            return None

        text = resp.text.strip()
        logger.info("  Gemini: raw response: %s", text[:300])
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        data = json.loads(text)
        active_w = float(data.get("active_watts", 0))
        standby_w = float(data.get("standby_watts", 0))

        # Sanity checks
        if active_w <= 0 or active_w > 10000:
            return None
        if standby_w < 0 or standby_w > 50:
            standby_w = min(max(standby_w, 0), 50)

        power_profile = {
            "active_watts_typical": active_w,
            "standby_watts_typical": standby_w,
            "active_watts_range": [round(active_w * 0.7, 1), round(active_w * 1.3, 1)],
            "standby_watts_range": [round(max(0, standby_w * 0.5), 2), round(max(standby_w * 1.5, 1.0), 2)],
            "source": "gemini_lookup",
            "confidence": 0.6,
            "sources_used": ["gemini_ai"],
        }

        alternatives = []
        alt_list = data.get("alternatives", [])
        for alt_data in alt_list[:3]:
            alt_brand = alt_data.get("brand")
            alt_watts = _safe_float(alt_data.get("watts"))
            alt_model = alt_data.get("model", "Unknown")
            if alt_brand and alt_watts > 0 and alt_watts < active_w:
                savings_kwh = (active_w - alt_watts) * 4 * 365 / 1000
                alternatives.append({
                    "brand": alt_brand,
                    "model": alt_model,
                    "category": category,
                    "active_watts_typical": alt_watts,
                    "standby_watts_typical": round(standby_w * 0.5, 2),
                    "annual_savings_kwh": round(savings_kwh, 1),
                    "annual_savings_dollars": round(savings_kwh * 0.30, 2),
                    "energy_star_certified": False,
                    "source_url": "",
                })

        return {"power_profile": power_profile, "alternatives": alternatives}

    except Exception as e:
        logger.warning("Gemini research failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Product image generation
# ---------------------------------------------------------------------------

async def _generate_product_image(brand: str, model: str, category: str) -> Optional[str]:
    """Generate a product photo using Gemini image generation. Returns base64 PNG or None."""
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        import base64
        from google import genai
        from google.genai import types as genai_types

        client = genai.Client(api_key=api_key)
        prompt = (
            f"Generate a clean product photo of a {brand} {model} {category} "
            f"on a plain white background. The image should look like an "
            f"e-commerce product listing photo. No text overlays."
        )

        resp = await asyncio.to_thread(
            lambda: client.models.generate_content(
                model="gemini-2.5-flash-image",
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                ),
            )
        )

        if resp and resp.candidates:
            for part in resp.candidates[0].content.parts:
                if hasattr(part, "inline_data") and part.inline_data and \
                   part.inline_data.mime_type.startswith("image/"):
                    return base64.standard_b64encode(part.inline_data.data).decode("utf-8")
        return None
    except Exception as e:
        logger.warning("Product image generation failed for %s %s: %s", brand, model, e)
        return None


async def _add_product_images(result: dict, category: str) -> None:
    """Generate product images for alternatives in parallel."""
    alts = result.get("alternatives", [])
    if not alts:
        return

    tasks = [
        _generate_product_image(
            alt.get("brand", "Unknown"),
            alt.get("model", "Unknown"),
            alt.get("category", category),
        )
        for alt in alts
    ]

    try:
        images = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=20.0,
        )
        for alt, img in zip(alts, images):
            alt["image_base64"] = img if isinstance(img, str) else None
    except asyncio.TimeoutError:
        logger.warning("Product image generation timed out")
        for alt in alts:
            alt.setdefault("image_base64", None)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def research_device(brand: str, model: str, category: str) -> dict:
    """
    Look up real power specs for a device.

    Returns:
        {
            "power_profile": { ... } | None,
            "alternatives": [ ... ]
        }
    """
    logger.info("research_device called: brand=%s, model=%s, category=%s", brand, model, category)

    # Skip research for unknown or non-appliance devices
    if category.lower() in ("unknown", "non-appliance", ""):
        logger.info("Skipping research — category is '%s'", category)
        return {"power_profile": None, "alternatives": []}

    both_unknown = (
        (not brand or brand.lower() == "unknown")
        and (not model or model.lower() == "unknown")
    )
    if both_unknown:
        logger.info("Skipping research — both brand and model are unknown")
        return {"power_profile": None, "alternatives": []}

    # 1. Check cache (free)
    logger.info("Step 1: Checking MongoDB cache...")
    cached = await _check_cache(brand, model, category)
    if cached:
        logger.info("Step 1 result: CACHE HIT — returning cached data")
        return _enforce_alt_count(cached)
    logger.info("Step 1 result: cache miss")

    # 2. Try ENERGY STAR API (free)
    logger.info("Step 2: Querying ENERGY STAR API...")
    result = await _query_energystar(brand, model, category)
    if result:
        alts = len(result.get("alternatives", []))
        watts = result.get("power_profile", {}).get("active_watts_typical", "?")
        logger.info("Step 2 result: ENERGY STAR HIT — %sW active, %d alternatives", watts, alts)
        _enforce_alt_count(result)
        await _add_product_images(result, category)
        await _save_cache(brand, model, category, result)
        return result
    logger.info("Step 2 result: no ENERGY STAR data (category '%s' %s mapped)",
                category, "is" if category in ENERGYSTAR_DATASETS else "is NOT")

    # 3. Gemini flash-lite (cheap, only if we have brand/model)
    logger.info("Step 3: Calling Gemini 2.0 Flash-Lite (last resort)...")
    result = await _query_gemini(brand, model, category)
    if result:
        alts = len(result.get("alternatives", []))
        watts = result.get("power_profile", {}).get("active_watts_typical", "?")
        logger.info("Step 3 result: GEMINI HIT — %sW active, %d alternatives", watts, alts)
        _enforce_alt_count(result)
        await _add_product_images(result, category)
        await _save_cache(brand, model, category, result)
        return result
    logger.info("Step 3 result: Gemini returned no usable data")

    # Nothing found
    logger.info("Research complete: NO DATA FOUND for %s %s (%s)", brand, model, category)
    return {"power_profile": None, "alternatives": []}


def _enforce_alt_count(result: dict) -> dict:
    """Enforce 0 or 2-3 alternatives (never exactly 1)."""
    alts = result.get("alternatives", [])
    if len(alts) == 1:
        logger.info("Dropping single alternative (must be 0 or 2-3)")
        result["alternatives"] = []
    elif len(alts) > 3:
        result["alternatives"] = alts[:3]
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(val) -> float:
    """Convert a value to float, returning 0 on failure."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0
