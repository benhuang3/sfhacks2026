You are working in a React Native + Expo (prebuild/custom dev client) app that currently draws object outlines from segmentation masks.

CURRENT PIPELINE (already implemented):
1) Detection (SSDLite) gives bounding boxes every ~800ms.
2) Segmentation (DeepLabV3) runs every ~2s for 5 classes (tv, chair, couch, dining table, bottle) and returns a flat per-pixel probability mask (0..1) for the class.
3) contourExtractor.ts does: downsample 2x -> threshold 0.4 -> boundary pixels via 4-neighbor -> nearest-neighbor ordering -> RDP simplify -> bezier SVG path.
4) Scaling maps img pixels to screen via viewWidth/imgWidth and viewHeight/imgHeight.
5) OutlineOverlay.tsx renders SVG Paths over camera preview; rectangles fallback.

GOAL:
Refactor this pipeline so outlines are correct, stable, and aligned with the camera preview under aspect-fill cropping and rotation, and so DeepLabV3 (semantic seg) produces per-object outlines for each detection. Keep runtime ~5 FPS for outline updates (seg is still ~2s OK) and keep detection ~800ms.

DO NOT CHANGE:
- The overall app structure, camera preview, or model choices (still SSDLite + DeepLabV3).
- Keep SVG overlay rendering in OutlineOverlay.tsx.
- Keep rectangle fallbacks for unsupported classes or low confidence.

MAKE THESE FIXES (in priority order):

A) Replace nearest-neighbor boundary ordering with a real contour tracing algorithm.
   - Implement marching squares OR Moore-neighbor tracing OR Suzuki-Abe style contour tracing.
   - Must return ordered contours per connected component, not an unordered edge-point set.
   - Support selecting the largest external contour (ignore holes for v1).
   - Output: polyline points in mask-pixel coordinates, ordered and closed.

B) Convert semantic DeepLab masks into per-detection “instance-like” masks.
   - For each detected box of a supported class:
     - Either run segmentation on an ROI crop (preferred if already feasible), OR
     - Intersect the global class mask with the detection box region and run connected-components inside the box, picking the component with highest overlap with the box center.
   - This must prevent “two chairs become one merged outline”. Each detection gets its own mask/contour.

C) Fix coordinate mapping from mask space to screen space.
   - The current scale-only mapping is wrong when the camera preview uses aspect-fill (“cover”) and when rotation differs.
   - Implement a single canonical transform that accounts for:
     - the exact resize/letterbox/crop used for model input
     - the aspect-fill crop used by the preview
     - device orientation (portrait) and any sensor rotation
   - Implement functions:
     - computeImageToViewTransform(imageW, imageH, viewW, viewH, previewResizeMode='cover') -> {scale, offsetX, offsetY}
     - mapMaskPointToView(x, y, transform, maybeRotation) -> {xView, yView}
   - Add unit tests (or a small debug mode) to verify mapping by drawing the detection boxes and ensuring they match the preview.

D) Improve mask stability and outline quality.
   - Replace single hard threshold with either:
     - hysteresis threshold (enter=0.5, stay=0.35), OR
     - adaptive threshold per class, OR
     - keep 0.4 but add denoising + temporal smoothing (below).
   - Add simple morphology on the binary mask before contouring:
     - closing then opening with a small radius (e.g., 1–2 pixels in mask space).
     - If you can’t add morphology dependencies, implement a small binary dilation/erosion in TS for small kernels.

E) Add temporal smoothing / tracking so 2s segmentation doesn’t “teleport”.
   - Maintain per-object state keyed by detection track id (create a stable id via IOU tracking on boxes).
   - Between segmentation updates:
     - reuse last contour
     - optionally transform it according to the latest box motion (simple affine: scale + translate from old box to new box).
   - When a new contour arrives:
     - blend old/new contour geometry via a low-pass filter on points (or on a contour bounding box transform) to reduce jitter.

IMPLEMENTATION DETAILS:
1) Locate and modify:
   - contourExtractor.ts (replace boundary ordering logic; add contour tracing + morphology + hysteresis).
   - OutlineOverlay.tsx (accept multiple per-object paths; draw debug overlays toggles).
   - The code where DeepLabV3 results are handled (create per-detection mask logic).
   - The scaling/mapping logic (replace scale-only with cover-aware transform).

2) Create new files/modules as needed:
   - geometry/contours.ts: contour tracing (marching squares or Moore tracing), RDP simplification, polyline utilities.
   - geometry/morphology.ts: binary open/close for small kernels.
   - geometry/transforms.ts: image<->view mapping (cover/contain), rotation helpers.
   - tracking/boxTracker.ts: IOU-based tracker that assigns stable ids to detections.

3) Data format:
   - Represent a contour as an array of points [{x,y}, ...] closed.
   - Represent an outline as:
     {
       id: string,
       className: string,
       confidence: number,
       contour: Point[],
       pathSvg: string,
       sourceImageSize: {w,h},
       modelInputSize: {w,h},
       box: {x,y,w,h} // in image space
     }

4) Performance constraints:
   - Cap the number of contour points after simplification (e.g., <= 200 points).
   - Only process top N detections per frame (e.g., N=5).
   - Avoid transferring full masks over the JS bridge (keep mask ops in native if applicable; if everything is already JS, keep operations ROI-limited).

ACCEPTANCE CRITERIA:
- Outlines no longer self-intersect or “jump across gaps” (no nearest-neighbor artifacts).
- Two objects of same class produce two outlines, not one merged outline.
- Outlines and boxes align with the camera preview even in aspect-fill.
- Visual jitter is reduced (contours stable when camera/object is still).
- When segmentation updates every ~2s, outline stays reasonably attached using tracking.

DELIVERABLES:
- Code changes across the specified files.
- A short README section describing:
  - contour algorithm used
  - coordinate mapping approach
  - how to enable debug overlay mode
  - how tracking ids are computed
- Add a small debug toggle to overlay:
  - original detection boxes
  - segmentation ROI boxes
  - final contours

Start by scanning the repo for the referenced files (contourExtractor.ts, OutlineOverlay.tsx, model inference code) and propose a concrete patch plan, then implement it. Do not rewrite unrelated app code.