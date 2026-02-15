"""
Vision Service — SSD MobileNet V3 Large + EasyOCR (backend ML)
Same model architecture as react-native-executorch, running server-side.

Returns top-3 category candidates with confidence scores so the user
can confirm in 1 tap (human-in-the-loop).
"""

from __future__ import annotations
import logging
import re
from pathlib import Path

import torch
import torchvision
from torchvision import transforms
from PIL import Image
import easyocr

logger = logging.getLogger("vision_service")

# ── COCO labels (tech / electrical devices only) ──────────────────────────
COCO_LABELS = {
    72: "tv", 73: "laptop",
    74: "mouse", 75: "remote", 76: "keyboard", 77: "cell phone",
    78: "microwave", 79: "oven", 80: "toaster",
    82: "refrigerator", 85: "clock", 89: "hair drier",
}

APPLIANCE_LABELS = {
    "tv", "laptop", "microwave", "oven", "toaster",
    "refrigerator", "hair drier", "cell phone", "clock",
    "remote", "keyboard", "mouse",
}

LABEL_TO_CATEGORY = {
    "tv": "Television", "laptop": "Laptop", "microwave": "Microwave",
    "oven": "Oven", "toaster": "Toaster", "refrigerator": "Refrigerator",
    "hair drier": "Hair Dryer", "cell phone": "Phone Charger",
    "clock": "Clock", "remote": "Remote / Standby Device",
    "keyboard": "Computer Peripheral", "mouse": "Computer Peripheral",
}

# ── Category → 3D model asset mapping ────────────────────────────────────
CATEGORY_MODEL_ASSETS: dict[str, str] = {
    "Television": "models/tv.glb",
    "TV": "models/tv.glb",
    "Laptop": "models/laptop.glb",
    "Monitor": "models/monitor.glb",
    "Microwave": "models/microwave.glb",
    "Oven": "models/oven.glb",
    "Toaster": "models/toaster.glb",
    "Refrigerator": "models/fridge.glb",
    "Hair Dryer": "models/hairdryer.glb",
    "Phone Charger": "models/charger.glb",
    "Clock": "models/clock.glb",
    "Computer Peripheral": "models/peripheral.glb",
    "Washing Machine": "models/washer.glb",
    "Dryer": "models/dryer.glb",
    "Air Conditioner": "models/ac.glb",
    "Space Heater": "models/heater.glb",
    "Light Bulb": "models/lamp.glb",
    "Lamp": "models/lamp.glb",
    "Dishwasher": "models/dishwasher.glb",
    "Gaming Console": "models/console.glb",
    "Router": "models/router.glb",
    "Fan": "models/fan.glb",
    "Water Heater": "models/waterheater.glb",
}

# ── All selectable categories (for search fallback) ───────────────────────
ALL_CATEGORIES = sorted(set(CATEGORY_MODEL_ASSETS.keys()) | {
    "Television", "Laptop", "Monitor", "Microwave", "Oven", "Toaster",
    "Refrigerator", "Hair Dryer", "Phone Charger", "Clock",
    "Washing Machine", "Dryer", "Air Conditioner", "Space Heater",
    "Light Bulb", "Lamp", "Dishwasher", "Gaming Console", "Router",
    "Fan", "Water Heater", "Computer Peripheral",
})

# ── Model singletons ──────────────────────────────────────────────────────
_detector = None
_ocr_reader = None

# Check if vision dependencies are available
try:
    import torch
    import torchvision
    import easyocr
    from PIL import Image
    VISION_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Vision dependencies not available: {e}")
    VISION_AVAILABLE = False


def _get_detector():
    global _detector
    if _detector is None:
        logger.info("Loading SSD-Lite 320 MobileNet V3 Large…")
        weights = torchvision.models.detection.SSDLite320_MobileNet_V3_Large_Weights.DEFAULT
        _detector = torchvision.models.detection.ssdlite320_mobilenet_v3_large(weights=weights)
        _detector.eval()
        logger.info("SSD-Lite model loaded ✅")
    return _detector


def _get_ocr():
    global _ocr_reader
    if _ocr_reader is None:
        logger.info("Loading EasyOCR (English)…")
        _ocr_reader = easyocr.Reader(["en"], gpu=torch.cuda.is_available())
        logger.info("EasyOCR loaded ✅")
    return _ocr_reader


# ── Known brands for OCR matching ─────────────────────────────────────────
KNOWN_BRANDS = [
    "samsung", "lg", "whirlpool", "ge", "general electric", "bosch",
    "panasonic", "sony", "toshiba", "sharp", "frigidaire", "kenmore",
    "maytag", "kitchenaid", "electrolux", "haier", "hisense", "tcl",
    "vizio", "philips", "dyson", "keurig", "cuisinart", "breville",
    "dell", "hp", "apple", "lenovo", "asus", "acer", "microsoft",
    "honeywell", "nest", "carrier", "lennox", "trane",
]


def _parse_brand_model(ocr_texts: list[str]) -> tuple[str, str]:
    brand = "Unknown"
    model_name = "Unknown"
    all_text = " ".join(ocr_texts).lower()
    for b in KNOWN_BRANDS:
        if b in all_text:
            brand = b.title()
            break
    for text in ocr_texts:
        match = re.search(r'\b([A-Z]{1,4}[\d]{2,}[A-Z0-9]*)\b', text.upper())
        if match:
            model_name = match.group(1)
            break
    return brand, model_name


def get_model_asset(category: str) -> str:
    """Return the 3D model asset path for a category."""
    return CATEGORY_MODEL_ASSETS.get(category, "models/generic.glb")


def get_default_position(category: str, index: int = 0) -> dict:
    """Return a sensible default 3D position for a device category."""
    # Spread devices around the room based on index
    positions = [
        {"x": -2.0, "y": 0, "z": -2.0},
        {"x": 2.0, "y": 0, "z": -2.0},
        {"x": -2.0, "y": 0, "z": 2.0},
        {"x": 2.0, "y": 0, "z": 2.0},
        {"x": 0, "y": 0, "z": -2.5},
        {"x": 0, "y": 0, "z": 2.5},
        {"x": -2.5, "y": 0, "z": 0},
        {"x": 2.5, "y": 0, "z": 0},
    ]
    # Some categories have preferred positions (e.g., TV on wall, fridge in corner)
    category_positions = {
        "Television": {"x": 0, "y": 1.0, "z": -3.0},
        "TV": {"x": 0, "y": 1.0, "z": -3.0},
        "Refrigerator": {"x": -2.5, "y": 0, "z": -2.5},
        "Oven": {"x": -2.0, "y": 0, "z": -2.5},
        "Microwave": {"x": -1.5, "y": 1.0, "z": -2.5},
        "Washing Machine": {"x": 2.5, "y": 0, "z": 2.0},
        "Router": {"x": 2.0, "y": 1.5, "z": -2.5},
    }
    if category in category_positions:
        pos = category_positions[category].copy()
        pos["x"] += index * 0.3  # offset if multiple of same type
        return pos
    return positions[index % len(positions)]


# ── Main detection pipeline ───────────────────────────────────────────────

def detect_appliance(image_path: str, confidence_threshold: float = 0.25) -> dict:
    """
    Run SSD MobileNet V3 + EasyOCR on an image.

    Returns:
      - candidates: top-3 category guesses with confidence
      - bbox: bounding box of best detection (normalized 0-1)
      - detections: all raw detections
      - ocr_texts: extracted text
      - best_match: legacy single-best for backward compat
    """
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception as exc:
        logger.error("Failed to open image %s: %s", image_path, exc)
        return {
            "candidates": [], "bbox": None, "detections": [],
            "ocr_texts": [], "best_match": None,
            "brand": "Unknown", "model_name": "Unknown",
            "all_categories": ALL_CATEGORIES,
        }
    img_w, img_h = img.size

    # Object Detection
    detector = _get_detector()
    img_tensor = transforms.ToTensor()(img)
    with torch.no_grad():
        predictions = detector([img_tensor])

    pred = predictions[0]
    detections = []
    for box, label_id, score in zip(
        pred["boxes"].tolist(), pred["labels"].tolist(), pred["scores"].tolist()
    ):
        if score < confidence_threshold:
            continue
        label_name = COCO_LABELS.get(label_id, f"class_{label_id}")
        category = LABEL_TO_CATEGORY.get(label_name, label_name.title())
        # Normalize bbox to 0-1
        norm_bbox = [
            round(box[0] / img_w, 4),
            round(box[1] / img_h, 4),
            round(box[2] / img_w, 4),
            round(box[3] / img_h, 4),
        ]
        detections.append({
            "label": label_name,
            "category": category,
            "score": round(score, 3),
            "bbox": norm_bbox,
            "bbox_pixel": [round(c, 1) for c in box],
        })

    detections.sort(key=lambda d: d["score"], reverse=True)
    appliance_detections = [d for d in detections if d["label"] in APPLIANCE_LABELS]

    # OCR
    ocr = _get_ocr()
    try:
        ocr_results = ocr.readtext(image_path)
        ocr_texts = [text for (_, text, conf) in ocr_results if conf > 0.3]
    except Exception as exc:
        logger.warning("OCR failed for %s: %s", image_path, exc)
        ocr_results = []
        ocr_texts = []
    brand, model_name = _parse_brand_model(ocr_texts)

    # Build top-3 candidates (deduplicate by category)
    seen_categories: set[str] = set()
    candidates: list[dict] = []
    source_dets = appliance_detections if appliance_detections else detections

    for det in source_dets:
        cat = det["category"]
        if cat in seen_categories or cat in ("Person", "person"):
            continue
        seen_categories.add(cat)
        candidates.append({
            "category": cat,
            "confidence": det["score"],
            "modelAsset": get_model_asset(cat),
        })
        if len(candidates) >= 3:
            break

    # If we have fewer than 3 candidates, pad with common appliances
    if len(candidates) < 3:
        common_fallbacks = ["Television", "Lamp", "Monitor", "Microwave", "Laptop"]
        for fb in common_fallbacks:
            if fb not in seen_categories and len(candidates) < 3:
                seen_categories.add(fb)
                candidates.append({
                    "category": fb,
                    "confidence": round(max(0.05, 0.15 - len(candidates) * 0.05), 2),
                    "modelAsset": get_model_asset(fb),
                })

    # Normalize confidences so they sum to ~1.0
    total_conf = sum(c["confidence"] for c in candidates)
    if total_conf > 0:
        for c in candidates:
            c["confidence"] = round(c["confidence"] / total_conf, 3)
    elif candidates:
        equal_share = round(1.0 / len(candidates), 3)
        for c in candidates:
            c["confidence"] = equal_share

    # Best detection bbox (normalized)
    best_bbox = None
    best_det = appliance_detections[0] if appliance_detections else (
        detections[0] if detections else None
    )
    if best_det:
        best_bbox = best_det["bbox"]

    # Legacy best_match
    best_match = None
    if best_det:
        best_match = {
            "label": best_det["label"],
            "category": best_det["category"],
            "score": best_det["score"],
            "brand": brand,
            "model": model_name,
        }

    return {
        "candidates": candidates,
        "bbox": best_bbox,
        "detections": appliance_detections if appliance_detections else detections[:5],
        "ocr_texts": ocr_texts,
        "best_match": best_match,
        "brand": brand,
        "model_name": model_name,
        "all_categories": ALL_CATEGORIES,
    }
