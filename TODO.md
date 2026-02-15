# Scanning Detection — Improvement Plan

Improvements to the device scanning pipeline for better appliance detection accuracy.

---

## Current Pipeline

**Frontend (on-device):** SSDLite320 MobileNetV3 (COCO 90-class) via ExecuTorch → filter to ~20 appliance classes → IOU tracking → multi-angle capture (4 frames)

**Backend:** Gemini Vision (primary) → power profile lookup

---

## Step 1 — Make Gemini Vision the primary backend detector [DONE]

**Files:** `be/server.py`

- Removed SSD MobileNet from the backend scan pipeline entirely
- Gemini Vision is now the primary (and only) detector in `POST /scan`
- Single Gemini call returns category + brand + model + confidence + top-3 candidates as JSON
- Removed `VISION_AVAILABLE`, `detect_appliance`, `_get_detector`, `_get_ocr` imports
- Removed SSD/OCR model preloading from server startup
- Cleaned up `list_categories` endpoint to use top-level imports
- `vision_service.py` still exists for `ALL_CATEGORIES` and `get_model_asset` (used by categories endpoint)

---



## Step 3 — Remove confidence normalization

**File:** `be/vision_service.py` (lines 284-292)

Confidences are normalized to sum to ~1.0, which distorts strong detections:
- `Laptop: 0.85, TV: 0.30` → `0.74, 0.26` after normalization

- Show raw model confidence scores instead
- Frontend confidence badges already handle display formatting

---


## Step 5 — Re-detect during multi-angle capture [DONE]

**File:** `app/src/screens/LiveScanScreen.tsx`

- Each multi-angle capture now runs `pipeline.detect()` on the frame before cropping
- Matches the re-detected object by label + IOU with the last known bbox
- Updates `selectedObjectRef` so subsequent captures track the new position
- Falls back to the previous bbox if re-detection misses or fails

---

## Step 6 — Increase detection image quality

**File:** `app/src/screens/LiveScanScreen.tsx` (line 110)

Detection photos are taken at `quality: 0.3`. This hurts accuracy for small or distant objects.

- Increase to `quality: 0.5` for the detection loop
- Monitor FPS impact — if too slow, use adaptive quality (0.5 for first 5 frames, then 0.3 for tracking)

---

## Files Summary

| File | Changes |
|------|---------|
| `be/server.py` | [DONE] Gemini Vision as primary detector, combined category+brand+model call |
| `be/vision_service.py` | Remove fake candidate padding, remove confidence normalization |
| `app/src/screens/LiveScanScreen.tsx` | Re-detect during multi-angle capture, increase detection image quality |

---

## Verification

1. Scan a washing machine (not in COCO) → should be detected via Gemini
2. Scan a laptop with visible brand logo → brand + model identified in one call
3. Scan with only 1 confident detection → only 1 candidate shown (no fake padding)
4. Check confidence badges show raw scores (85% not 74%)
5. Multi-angle crops stay centered on the object as user moves
