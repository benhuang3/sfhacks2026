# Advanced Scan: Two-Mode Camera with Device Queue

## Requirements

Scan should start in the camera view, and has 2 selectable modes:
- **Basic** — shows bounding boxes, the user can then either:
  - Select an object from bounding boxes, crops to bounding boxes, manually take 4 shots
  - Press the take picture button, the camera will then not show bounding boxes, and the user manually take 4 shots
  - Afterward, the user previews the 4 shots and verifies that the device type is correct. After verifying, this adds it to a device queue.
- **Scan Room** — show bounding boxes
  - Any object that has a bounding box and stays on screen / has enough angles gets added to a queue

The user can then verify the device type and images of all objects they scanned, then send them to the current gemini backend to process each object one by one.

---

## Implementation Plan

### Step 1: Change scan entry point to camera view

**File:** `app/App.tsx`

Currently `ScanHome` maps to `UploadScanScreen`. Change it so the Scan tab opens directly into the camera.

- Rename `ScanHome` screen to render a new `AdvancedScanScreen` (the refactored camera view) instead of `UploadScanScreen`
- Keep `UploadScanScreen` accessible via a small "Upload" icon button on the camera UI (for users who want to upload from gallery)
- Update navigation: remove `LiveScan` route (it's now the home), keep `MultiAngleReview`, `ScanConfirm`, `CameraCapture`
- Add new routes: `DeviceQueue` (queue review screen)

---

### Step 2: Refactor LiveScanScreen into AdvancedScanScreen with mode toggle

**File:** `app/src/screens/AdvancedScanScreen.tsx` (new file, based on LiveScanScreen)

Create a new screen by copying and refactoring LiveScanScreen. This screen has a **mode toggle** at the top: `Basic` | `Scan Room`.

#### Shared foundation (from LiveScanScreen):
- Camera via `expo-camera` CameraView
- Detection loop via `useScannerPipeline` (SSDLite320) at 800ms intervals
- Object tracking via `useObjectTracker` (IoU-based)
- `OutlineOverlay` for bounding box rendering
- Same permission handling, model loading UI

#### Mode toggle UI:
- Two pill buttons at the top: **Basic** (default) and **Scan Room**
- Switching modes resets capture state

#### Props:
```typescript
interface AdvancedScanScreenProps {
  onBack?: () => void;
  onUpload?: () => void;       // navigate to UploadScanScreen
  onNavigateQueue?: () => void; // navigate to DeviceQueueScreen
}
```
Queue state is shared via `ScanQueueContext` (Step 7), not passed through props.

#### New type (shared, in `app/src/utils/scannerTypes.ts`):
```typescript
export interface QueuedDevice {
  id: string;
  label: string;               // detected category display name
  confidence: number;
  bbox: BBox;
  angleImages: string[];       // up to 4 cropped image URIs
  primaryImage: string;        // first angle or full-frame
  scanData: ScanDataFromDetections; // from detectionBridge.ts (matches ScanConfirmScreen's ScanData shape)
}
```

---

### Step 3: Implement Basic Mode

**File:** `app/src/screens/AdvancedScanScreen.tsx`

Basic mode shows bounding boxes. User has two sub-flows:

#### Sub-flow A: Tap a bounding box → manual 4-shot
1. User taps a detected object via `OutlineOverlay.onObjectPress`
2. Enter `manualCaptureMode` for that object (similar to current `multiAngleMode`)
3. Show overlay: object name, "Tap shutter to capture angles", 4 progress dots, cancel button
4. **Detection continues running** — bounding boxes still visible, selected object highlighted blue
5. User taps the **shutter button** to capture each angle manually
6. On each shutter tap:
   - Take photo, re-detect to update bbox (reuse existing re-detection logic from LiveScanScreen lines 286-322)
   - Crop to bbox + 15% padding via `cropToBoundingBox()`
   - Flash feedback, fill progress dot
7. After 4 shots: add to device queue (don't navigate away — show toast "Added to queue"), reset to scanning
8. User can tap another object or press "Done" to go to queue

#### Sub-flow B: Press shutter without selecting → manual 4-shot (no bbox)
1. User presses shutter button while no object is selected
2. **Snapshot the current `trackedObjects` list** before entering free capture (these provide the category picker options later)
3. Enter `freeCapture` mode — hide bounding boxes, stop detection loop, show "Take 4 photos of the appliance" instruction
4. User taps shutter 4 times, each takes a full-frame photo (no cropping)
5. After 4 shots: show a quick category picker (top-3 from snapshotted detections + search), then add to device queue
6. Reset to scanning (resume detection loop)

#### Bottom bar:
- Left: upload button (gallery icon)
- Center: shutter button (large circle)
- Right: queue badge showing count (e.g., "3" in green circle), tappable → goes to DeviceQueue

---

### Step 4: Implement Scan Room Mode

**File:** `app/src/screens/AdvancedScanScreen.tsx`

Scan Room mode auto-queues objects that have been detected across enough frames/angles.

#### Auto-queue logic:
- Track each object's angle progress in a `Map<trackId, { count: number, lastBbox: BBox, lastCaptureTime: number, images: string[] }>` (separate from the tracker, stored via `useRef`)
- Every ~2 seconds, **take ONE high-res photo** (quality 0.8), then for each currently-visible tracked object (`framesSinceLastSeen === 0`):
  - Check angle diversity (see heuristic below) — skip if not a new angle
  - Crop that single photo to the object's bbox + 15% padding via `cropToBoundingBox()`
  - Increment that object's `capturedAngleCount`
  - When an object reaches **4 captured angles** → auto-add to device queue, show brief toast
- **Camera contention**: The detection loop runs every 800ms at quality 0.3. The auto-capture (quality 0.8) must coordinate with it. Use `isCapturingRef` (already exists in LiveScanScreen) to prevent both from calling `takePictureAsync` simultaneously. Briefly pause detection during the high-res capture.
- Show a running count in the UI: "3 devices found" with a pulsing green dot

#### UI differences from Basic:
- No manual shutter button needed (auto-capture)
- Show a persistent bottom bar with: "Scanning room..." status, device count badge, "Done" button
- Each auto-queued device gets a brief toast animation (device name slides up and fades)

#### Angle diversity heuristic:
For each tracked object, store the last captured bbox. Only count a new angle if:
- `computeIoU(lastCapturedBbox, currentBbox) < 0.7` (object has shifted enough in frame)
- OR at least 3 seconds since last capture for that object

---

### Step 5: Create DeviceQueueScreen

**File:** `app/src/screens/DeviceQueueScreen.tsx` (new)

This screen shows all queued devices for user review before batch processing.

#### UI:
- Header: "Review Devices" with count (e.g., "4 devices")
- Scrollable list of queued devices, each card shows:
  - Thumbnail grid (2x2) of the 4 angle images (small)
  - Detected category label (editable — tap to change)
  - Confidence badge
  - Delete button (X) to remove from queue
- Bottom: "Process All" button (green, prominent)
- Back button → return to camera (queue preserved in state)

#### Processing flow (hackathon-friendly):
When "Process All" is tapped:
1. Show progress: "Processing 1 of 4..."
2. For each queued device, sequentially:
   a. Call `/api/v1/identify-brand` with the 4 angle images + category
   b. Merge brand/model into the device's `scanData.detected_appliance`
3. Store the enriched queue in context, then navigate to ScanConfirm for the first device
4. ScanConfirmScreen gets a new optional prop: `onNextDevice?: () => void`
   - When provided, the confirm button shows **"Add & Next"** instead of "Add to Home"
   - After adding the device, `onNextDevice()` is called, which navigates to ScanConfirm for the next queued device
   - On the **last device**, it falls back to the normal "Add to Home" behavior (navigates to Dashboard)

#### Props:
```typescript
interface DeviceQueueScreenProps {
  onBack: () => void;
  // Queue state comes from ScanQueueContext, not props
}
```

---

### Step 6: Update navigation in App.tsx

**File:** `app/App.tsx`

Update the ScanNavigator:

```
ScanStackNav:
  ScanHome       → AdvancedScanScreen (camera with Basic/Scan Room toggle)
  DeviceQueue    → DeviceQueueScreen (review + batch process)
  ScanConfirm    → ScanConfirmScreen (per-device confirm, unchanged)
  MultiAngleReview → (keep for compatibility)
  UploadScan     → UploadScanScreen (accessible from camera upload button)
  CameraCapture  → CameraScanScreen (keep for Expo Go fallback)
```

Navigation flow:
```
AdvancedScanScreen
  ├─ "Upload" button → UploadScan → ScanConfirm (existing flow, unchanged)
  ├─ Queue badge tap / "Done" button → DeviceQueue
  │   └─ "Process All" → ScanConfirm (first device, onNextDevice prop set)
  │       └─ "Add & Next" → ScanConfirm (next device) → ...
  │           └─ Last device: "Add to Home" → Dashboard
  └─ Back button → parent navigator (go back to previous tab)
```

Queue state is managed by `ScanQueueContext` (Step 7), shared across all scan screens.

---

### Step 7: Queue state management

**File:** `app/src/context/ScanQueueContext.tsx` (new)

Simple context to share queue state across scan screens:

```typescript
interface ScanQueueContextType {
  queue: QueuedDevice[];
  addToQueue: (device: QueuedDevice) => void;
  removeFromQueue: (id: string) => void;
  updateInQueue: (id: string, updates: Partial<QueuedDevice>) => void;
  clearQueue: () => void;
}
```

Wrap `ScanNavigator` with this provider so AdvancedScanScreen, DeviceQueueScreen, and ScanConfirmScreen can all access the queue.

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `app/src/screens/AdvancedScanScreen.tsx` | Create | Camera view with Basic/Scan Room modes, replaces LiveScanScreen as entry |
| `app/src/screens/DeviceQueueScreen.tsx` | Create | Queue review screen with batch processing |
| `app/src/context/ScanQueueContext.tsx` | Create | Shared queue state context |
| `app/src/utils/scannerTypes.ts` | Edit | Add `QueuedDevice` interface |
| `app/App.tsx` | Edit | Update ScanNavigator routes and entry point |
| `app/src/screens/LiveScanScreen.tsx` | Keep | Keep as reference / Expo Go fallback, but no longer primary entry |
| `app/src/screens/ScanConfirmScreen.tsx` | Edit | Add optional `onNextDevice` prop; show "Add & Next" button when set |
| `app/src/utils/detectionBridge.ts` | Edit | Export `ScanDataFromDetections` type (currently not exported) |

---

## Verification

1. Open Scan tab → camera view appears directly (not upload screen)
2. Basic mode: tap bounding box → manually capture 4 angles → device added to queue badge
3. Basic mode: tap shutter (no selection) → 4 free photos → pick category → added to queue
4. Scan Room mode: pan camera around room → objects auto-queue after enough angles
5. Tap queue badge → review screen shows all queued devices with thumbnails
6. "Process All" → brand identification runs → ScanConfirm flow for each device
7. Upload button on camera → goes to UploadScanScreen (existing flow still works)
