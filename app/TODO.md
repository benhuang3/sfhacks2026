## Goal and constraints

### Target behavior

1. The app shows a live camera preview.
2. At roughly 5 FPS, it produces segmentation masks for visible objects. This should create a preliminary prediction on what the object is (bottle, lamp, etc)
3. It draws “outline” overlays (polylines) on top of the camera view.
4. Optionally, it uses LiDAR depth to stabilize/refine the outline boundary and reduce jitter.
5. It sends 3-5 cropped images of the object at different angles to the backend, which uses Gemini to predict the brand of the object.

### Engineering constraints

* ExecuTorch and ARKit are native; you will not stay in pure Expo managed JS.
* Use Expo “prebuild” / custom dev client so you can add native modules.

## Architectural overview

### Dataflow

1. ARKit session produces:

   * RGB frames (camera image)
   * Depth map (LiDAR depth, aligned or alignable)
   * Camera intrinsics + pose
2. Preprocessing produces model input tensors from RGB (and optionally depth).
3. ExecuTorch runs inference:

   * Outputs segmentation (semantic or instance segmentation).
4. Postprocessing:

   * Threshold masks
   * Extract contours (outlines) from masks
   * Optionally refine using depth edges
5. Bridge results to JS:

   * Polylines + labels + confidence
6. RN overlay renderer:

   * Draw polylines on top of the camera preview at UI frame rate.


## Phase 1: LiDAR + RGB capture via ARKit

### Design decision

Use ARKit’s ARSession with a configuration that supports scene depth.

### Deliverables

* Native iOS component that streams:

  * RGB frame buffer (or a resized RGB tensor)
  * Depth map (float depth)
  * Intrinsics/extrinsics metadata per frame
* A throttling mechanism to export frames at 5 FPS to the ML pipeline

1. Initialize ARSession with world tracking and scene depth enabled.
2. Implement an ARSession delegate to receive each frame.
3. Extract:

   * Captured image (CVPixelBuffer)
   * Scene depth (CVPixelBuffer)
   * Camera intrinsics matrix (3×3)
   * Camera transform (4×4)
4. Downsample:

   * Convert RGB to the model’s required size (e.g., 320×320 or 512×512).
   * Keep depth either aligned to RGB or separately downsampled.
5. Add a frame gate:

   * Only run the segmentation pipeline every 200 ms (≈ 5 FPS).
   * Cache the latest output for rendering.

Acceptance criteria:

* You can display a debug overlay in JS showing you are receiving timestamps and frame dimensions.
* Depth exists and updates (non-null) on LiDAR devices.

## Phase 2: ExecuTorch integration for segmentation

### Model choice (pragmatic)

Start with semantic segmentation (one mask per class) or a single “foreground objectness” mask. Instance segmentation is a later upgrade.

You need:

* A PyTorch segmentation model exportable to ExecuTorch.
* A known preprocessing spec (input normalization and resizing).

### Deliverables

* An ExecuTorch runtime loaded on-device.
* A native function: `segment(rgbTensor) -> maskTensor` (and optional `labels`).

1. Add ExecuTorch iOS library dependency to the native project.
2. Bundle the exported `.pte` / ExecuTorch program artifact into the iOS app.
3. Write a native wrapper:

   * Load model once at startup.
   * Prepare input tensors from resized RGB buffers.
   * Run inference and return output tensors.
4. Implement minimal postprocessing in native:

   * Argmax for semantic segmentation or thresholding for binary segmentation.
   * Produce a 2D mask (H×W) in a compact format.

Acceptance criteria:

* On a static test image, the model returns a reasonable mask.
* On live camera frames, you get a mask at ~5 FPS without crashing.

## Phase 3: Outline extraction (mask → polylines)

### What outlines are

An outline is a contour of a binary region: the boundary pixels separating “object” and “not object.”

### Deliverables

* Convert mask(s) into one or more polylines suitable for overlay rendering.

1. Threshold the mask into binary regions.
2. Extract contours:

   * Use a standard contour-finding algorithm (marching squares is common).
3. Simplify polylines:

   * Reduce vertex count (Douglas–Peucker simplification) so you are not sending huge arrays to JS.
4. Transform contour coordinates back to screen space:

   * Track the resize/letterbox mapping used in preprocessing.
   * Map mask pixel coordinates to preview coordinates.

Acceptance criteria:

* The overlay outline aligns with the visible object boundaries (approximately).
* Performance: contour extraction completes comfortably under 200 ms per frame.

## Phase 4: LiDAR refinement 

### Why add depth

Depth edges often correspond to object boundaries. Depth can reduce flicker and suppress texture-driven segmentation mistakes.

### Deliverables

* Refined contours that are more stable and less noisy.

### Depth refinement strategies (start simple)

1. Depth-edge snapping:

   * Compute depth gradients and identify strong depth discontinuities.
   * For contour points, nudge them toward nearby depth edges.
2. Depth-consistency filtering:

   * For a segmented region, estimate median depth.
   * Remove contour segments whose local depth differs too much from the region depth.

Acceptance criteria:

* Less jitter across frames when the camera moves slightly.
* Fewer “outline leaks” into background textures.

## Phase 5: React Native rendering layer

### Deliverables

* A camera preview and an outline overlay that updates smoothly.

1. Choose a camera preview approach:

   * Either a native preview view exposed to RN, or an existing RN camera component for display while ARKit runs separately.
2. Render outlines:

   * Use an overlay drawing method that can handle polylines efficiently:

     * Skia (good for vector drawing), or
     * A GL overlay, or
     * Native overlay view on iOS.
3. Update policy:

   * JS receives new polylines at 5 FPS.
   * UI renders last-known polylines at screen refresh rate.

Acceptance criteria:

* Outlines appear stable and do not block UI interactivity.

## Phase 6: Performance, stability, and productization

### Deliverables

* Smooth 5 FPS segmentation with low battery impact and graceful failure handling.

1. Add backpressure:

   * Never run inference concurrently; drop frames if busy.
2. Add telemetry:

   * Log per-stage timing: capture, preprocess, inference, contour, bridge, render.
3. Add error handling:

   * If depth is missing, run segmentation-only path.
   * If inference fails, reuse last good contours.
4. Add configuration flags:

   * Toggle depth refinement.
   * Adjust model input resolution.
   * Adjust mask threshold.

Acceptance criteria:

* No memory growth over time.
* Stable behavior across lighting changes and movement.


