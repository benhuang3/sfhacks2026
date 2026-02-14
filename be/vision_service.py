"""
Vision Service — SSD MobileNet V3 Large + EasyOCR (backend ML)
Same model architecture as react-native-executorch, running server-side.
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

# ── COCO labels (subset relevant to home appliances) ──────────────────────
COCO_LABELS = {
    1: "person", 44: "bottle", 46: "wine glass", 47: "cup",
    62: "chair", 63: "couch", 64: "potted plant", 65: "bed",
    67: "dining table", 70: "toilet", 72: "tv", 73: "laptop",
    74: "mouse", 75: "remote", 76: "keyboard", 77: "cell phone",
    78: "microwave", 79: "oven", 80: "toaster", 81: "sink",
    82: "refrigerator", 84: "book", 85: "clock", 86: "vase",
    87: "scissors", 88: "teddy bear", 89: "hair drier", 90: "toothbrush",
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

# ── Model singletons ──────────────────────────────────────────────────────
_detector = None
_ocr_reader = None


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


# ── Main detection pipeline ───────────────────────────────────────────────

def detect_appliance(image_path: str, confidence_threshold: float = 0.3) -> dict:
    """Run SSD MobileNet V3 + EasyOCR on an image. Returns detections + OCR."""
    img = Image.open(image_path).convert("RGB")

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
        detections.append({
            "label": label_name,
            "category": category,
            "score": round(score, 3),
            "bbox": [round(c, 1) for c in box],
        })

    detections.sort(key=lambda d: d["score"], reverse=True)
    appliance_detections = [d for d in detections if d["label"] in APPLIANCE_LABELS]

    # OCR
    ocr = _get_ocr()
    ocr_results = ocr.readtext(image_path)
    ocr_texts = [text for (_, text, conf) in ocr_results if conf > 0.3]
    brand, model_name = _parse_brand_model(ocr_texts)

    best = appliance_detections[0] if appliance_detections else (
        detections[0] if detections else None
    )

    best_match = None
    if best:
        best_match = {
            "label": best["label"],
            "category": best["category"],
            "score": best["score"],
            "brand": brand,
            "model": model_name,
        }

    return {
        "detections": appliance_detections if appliance_detections else detections[:5],
        "ocr_texts": ocr_texts,
        "best_match": best_match,
    }
