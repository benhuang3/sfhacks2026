# CLAUDE.md — WattVision (SF Hacks 2026)

## Project Overview

**WattVision** is a smart home energy management app built for SF Hacks 2026. Users can scan appliances with their phone camera (on-device AI detection), monitor energy usage, detect "ghost energy" waste, get ROI reports for smart alternatives, and visualize their home in 3D.

## Tech Stack (Actual)

- **Frontend**: React Native (Expo 54), TypeScript, React Navigation 7, Zustand
- **Backend**: Python FastAPI (`be/`), MongoDB (Motor async driver)
- **AI/LLM**: Google Gemini via LangChain (power profiles, brand identification, research, action proposals)
- **On-Device ML**: SSDLite320 MobileNetV3 via `react-native-executorch` for real-time object detection
- **3D**: Three.js + expo-three for home/appliance visualization
- **Tunneling**: Cloudflare tunnel (`cloudflared`) to expose local backend

## Project Structure

```
sfhacks2026/
├── CLAUDE.md
├── TODO.md
├── package.json              # Root — tunneling scripts
├── app/                      # React Native (Expo) frontend
│   ├── App.tsx               # Navigation: 5 bottom tabs (native), 3 tabs (web)
│   ├── app.json
│   ├── package.json
│   ├── .env                  # EXPO_PUBLIC_API_URL=<cloudflare tunnel URL>
│   └── src/
│       ├── screens/          # 19 screens (see below)
│       ├── components/       # UI components + scanner/ + house3d/
│       ├── hooks/            # useScannerPipeline, useObjectTracker, useSegmentationOverlay, useProductIdentifier
│       ├── services/         # apiClient.ts, apiService.ts, authApi.ts, imageProcessingService.ts, productLookupService.ts
│       ├── context/          # AuthContext, ThemeContext, ScanQueueContext
│       ├── store/            # scannerStore.ts (Zustand)
│       ├── utils/            # apiConfig, bboxUtils, scannerTypes, logger, energyConstants, geometry/
│       └── data/             # appliance_energy_db.json
├── be/                       # Python FastAPI backend
│   ├── server.py             # Main app — all API routes
│   ├── auth.py               # JWT auth + MongoDB users
│   ├── agents.py             # Gemini power profile lookup via LangChain
│   ├── research_agent.py     # Device research + alternatives
│   ├── models.py             # Pydantic request/response models
│   ├── homes_devices.py      # Home & device CRUD (MongoDB)
│   ├── scans.py              # Scan storage + similarity search
│   ├── aggregation.py        # Energy summary calculations
│   ├── actions_service.py    # AI action proposals + execution
│   ├── optimizer.py          # LLM-based action optimizer
│   ├── vision_service.py     # Vision model integration
│   ├── db_fallback.py        # In-memory fallback (no MongoDB)
│   └── requirements.txt
├── ai/                       # AI model configs
└── docs/                     # Architecture docs
```

## Navigation Structure (App.tsx)

### Auth Flow
- Not logged in → `AuthNavigator` (Login / Signup / ForgotPassword)
- Logged in → `MainTabs` (native) or `WebMainLayout` (web)

### Native: 5 Bottom Tabs

1. **Home** (LandingNavigator)
   - `LandingHome` → DashboardScreen (quick stats, energy cards, 3D home, device list)
   - `DeviceDetail` → DeviceDetailScreen (power specs, research, demo)

2. **Scan** (ScanNavigator, wrapped in `ScanQueueProvider`)
   - `ScanHome` → AdvancedScanScreen (camera with Basic/Scan Room modes)
   - `DeviceQueue` → DeviceQueueScreen (review queued devices)
   - `ScanConfirm` → ScanConfirmScreen (confirm + add device, batch support)
   - `UploadScan` → UploadScanScreen (image upload flow)
   - `MultiAngleReview` → MultiAngleReviewScreen
   - `CameraCapture` → CameraScanScreen (Expo Go fallback)

3. **Dashboard** → ChartDashboardScreen (energy charts)

4. **My Home** (HomeNavigator)
   - HomeManager → HomeSummary → Home3DView → HomeActions → HomeDeviceDetail

5. **Chat** → ChatScreen (Gemini AI chat)

## Key Screens

| Screen | File | Purpose |
|--------|------|---------|
| AdvancedScanScreen | `screens/AdvancedScanScreen.tsx` | Main scan entry. Two modes: **Basic** (tap bbox → manual 4-shot capture) and **Scan Room** (auto-capture). Uses ScanQueueContext. |
| ScanConfirmScreen | `screens/ScanConfirmScreen.tsx` | Confirm scanned device. Shows category, brand/model (from Gemini), power profile, research alternatives. Supports batch mode (`batchIndex`/`batchTotal`). |
| DeviceQueueScreen | `screens/DeviceQueueScreen.tsx` | Review queued devices before batch processing via `identifyBrand()`. |
| DeviceDetailScreen | `screens/DeviceDetailScreen.tsx` | Full device detail — power specs, live polling (smart devices), research auto-fetch, "Demo in my space" feature. |
| DashboardScreen | `screens/DashboardScreen.tsx` | Landing page with energy summary, device list, 3D home viewer. |
| HomeManagerScreen | `screens/HomeManagerScreen.tsx` | Create/manage homes and rooms. |

## Scanner Pipeline (On-Device ML)

The scan flow uses on-device ML for real-time appliance detection:

1. **useScannerPipeline** — Downloads & runs SSDLite320 MobileNetV3 via ExecuTorch. Detection loop at ~800ms intervals.
2. **useObjectTracker** — IoU-based frame-to-frame tracking (threshold 0.3). Assigns stable IDs to detected objects.
3. **useSegmentationOverlay** — DeepLabV3 segmentation. API: `requestSegmentation(imageUri, trackedObjects, imgW, imgH, viewW, viewH)`.
4. **OutlineOverlay** (`components/scanner/OutlineOverlay.tsx`) — SVG bounding boxes + contour outlines. Tappable targets with min 44pt touch area.

### Camera Contention

expo-camera's `takePictureAsync` cannot be called concurrently. Two mutex refs prevent overlap:
- `isDetectingRef` — set during detection loop captures
- `isCapturingRef` — set during manual/shutter captures

Both must be checked before any `takePictureAsync` call.

## Scan Queue System

`ScanQueueContext` (`context/ScanQueueContext.tsx`) provides shared state across scan screens:
- `queue: QueuedDevice[]`, `addToQueue()`, `removeFromQueue()`, `clearQueue()`
- `QueuedDevice` type in `utils/scannerTypes.ts`: id, label, confidence, bbox, angleImages (4 URIs), primaryImage, scanData

### Scan Flow
1. AdvancedScanScreen: detect objects → user captures 4 angles → add to queue
2. DeviceQueueScreen: review queue → "Process All" calls `identifyBrand()` per device
3. ScanConfirmScreen: confirm each device → batch navigation via `navigation.replace()`

## Backend API Endpoints (be/server.py)

All under `/api/v1/`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/signup`, `/auth/login` | POST | Authentication (JWT) |
| `/auth/me` | GET | Current user profile |
| `/health` | GET | Health check + MongoDB + vision status |
| `/power-profile` | POST | Lookup power specs via Gemini |
| `/identify-brand` | POST | Multi-angle brand ID (sends images to Gemini) |
| `/research-device` | POST | Research specs + smart alternatives |
| `/demo-product` | POST | Generate "demo in my space" image (Gemini) |
| `/scans` | POST | Insert scan record |
| `/scans/similar` | POST | Vector similarity search |
| `/homes` | GET/POST | List/create homes |
| `/homes/{id}/devices` | GET/POST | List/add devices |
| `/devices/{id}` | PATCH/DELETE | Update/delete device |
| `/homes/{id}/summary` | GET | Aggregated energy totals |
| `/homes/{id}/assumptions` | GET/POST | Electricity rate, CO2 factor |
| `/homes/{id}/actions/propose` | POST | AI action proposals |
| `/homes/{id}/actions/execute` | POST | Execute actions |
| `/homes/{id}/scene` | GET | 3D scene data |
| `/categories` | GET | List appliance categories |

## API Client (app/src/services/apiClient.ts)

- `API_BASE_URL` from `utils/apiConfig.ts` — reads `EXPO_PUBLIC_API_URL` env var
- `post()` helper: 20s timeout via AbortController, JSON request/response
- `get()` helper: 10s timeout
- All responses: `{ success: boolean, data?: T, error?: string }`

Key exports: `listHomes`, `addDevice`, `updateDevice`, `deleteDevice`, `researchDevice`, `identifyBrand`, `demoProduct`, `getHomeSummary`, `getDevicePower`, `toggleDevice`

## Environment & Tunnel

```bash
# app/.env
EXPO_PUBLIC_API_URL=https://<random>.trycloudflare.com  # Changes on every tunnel restart

# Start tunnel (from root):
cloudflared tunnel --url http://localhost:8000

# Start backend (from be/):
uvicorn server:app --reload --port 8000

# Start frontend (from app/):
npx expo start --clear
```

The tunnel URL is dynamic — update `app/.env` whenever `cloudflared` restarts.

## Energy Calculation Reference

```
Ghost Energy ($/year) = standby_watts * 24 * 365 / 1000 * rate_per_kwh
Annual Cost           = avg_watts * daily_hours * 365 / 1000 * rate_per_kwh
ROI Payback (months)  = smart_device_cost / monthly_savings
Carbon Saved (kg/yr)  = energy_saved_kwh * carbon_factor
```

Defaults: electricity rate = $0.15/kWh, carbon factor = 0.42 kg CO2/kWh.

## Key Patterns & Conventions

- **TypeScript** on frontend, **Python** on backend
- Use `async/await` over raw promises
- Energy values stored in **watts (W)** internally
- All API responses: `{ success: boolean, data?: T, error?: string }`
- Device IDs: MongoDB ObjectIds (strings)
- Navigation params passed via `route.params as any` (hackathon pattern)
- `useIsFocused()` gates effects that poll/fetch (prevents stale requests on unmounted screens)
- `log` utility (`utils/logger.ts`) with namespaces: `scan`, `api`, `home`, `action`, `auth`, `nav`

## Notes for Claude

- This is a hackathon project — prioritize working demos over production polish
- Prefer simple, readable code over clever abstractions
- The backend is Python/FastAPI with MongoDB — NOT Node.js/PostgreSQL
- The "Demo in my space" feature uses `DemoCaptureModal` (camera + detection) NOT the camera roll
- When editing scan-related code, always check camera mutex refs (`isDetectingRef`/`isCapturingRef`)
- Cloudflare tunnel URL changes on restart — if API calls fail with "Aborted", the tunnel URL in `app/.env` is likely stale
- Focus on the happy path first, add error handling incrementally
