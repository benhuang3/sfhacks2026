# Website Version — SmartGrid Home

## Goal

Get the Expo web build working so users can access Dashboard, My Home, and AI Chat from a browser. Same backend, same MongoDB, same user accounts — a logged-in user sees the same home and devices on web and mobile.

---

## Current State

- **iOS app**: Working (React Native / Expo)
- **Backend**: FastAPI on Python, already serves all needed APIs
- **Web support**: Partially set up — `react-native-web@0.21.0` and `react-dom` are installed, `Scene3D.web.tsx` exists, but `npx expo start --web` likely fails due to missing config and incompatible native modules
- **Auth**: JWT-based, stored in `AuthContext` — works cross-platform

---

## Website Scope (3 tabs only)

| Tab | Screen | What it shows |
|-----|--------|---------------|
| **Dashboard** | `ChartDashboardScreen` | Energy charts, cost breakdown, device stats |
| **My Home** | `HomeManagerScreen` → `HomeSummaryScreen` → `HomeViewerScreen` | Room/device list, 3D house viewer, energy summary |
| **AI Chat** | `ChatScreen` | Gemini-powered energy advisor chatbot |

**NOT on web**: Scan tab (camera-dependent), device scanning flow, multi-angle capture

---

## Implementation Plan

### Step 1: Fix Expo Web build

**Goal**: `npx expo start --web` runs without crashes.

**Files to create/edit**:
- `app/babel.config.js` — create if missing, add `babel-preset-expo`
- `app/app.json` — ensure `"web": { "bundler": "metro" }` is set
- `app/metro.config.js` — verify web support enabled

**Key issues to fix**:
- `expo-camera` and `react-native-vision-camera` crash on web import — wrap with platform checks or lazy imports
- `@react-native-async-storage/async-storage` may need web polyfill
- `react-native-safe-area-context` should work on web but verify
- `expo-three` / Three.js should work in browser (Scene3D.web.tsx already exists)

**Pattern for camera guards**:
```typescript
// In any file that imports camera modules
import { Platform } from 'react-native';
const CameraView = Platform.OS === 'web' ? null : require('expo-camera').CameraView;
```

### Step 2: Web-only navigation layout

**Goal**: Website shows 3 tabs (Dashboard, My Home, AI Chat) with a top nav bar instead of bottom tabs.

**File**: `app/App.tsx` (edit)

- Detect `Platform.OS === 'web'`
- For web: render a horizontal top nav bar with 3 links (Dashboard, My Home, Chat)
- For native: keep existing bottom tab navigator unchanged
- Web nav bar should show app logo + user avatar + logout button

**Approach**:
```
if (Platform.OS === 'web') {
  return <WebLayout /> — top nav + content area
} else {
  return <MobileLayout /> — existing bottom tabs
}
```

**Web tab navigator options**:
- Option A: Use `@react-navigation/material-top-tabs` (simplest, already in RN ecosystem)
- Option B: Custom `<View>` with state-based tab switching (more control over styling)
- Option C: Use `createBrowserRouter` from react-router for real URL paths (`/dashboard`, `/home`, `/chat`)

**Recommended**: Option B — custom tab switching. Avoids extra deps and gives full control over the web layout. Use `window.location.hash` for basic URL routing.

### Step 3: Auth flow on web

**Goal**: Login/signup works in the browser, JWT persists across refreshes.

**Files to edit**:
- `app/src/context/AuthContext.tsx` — ensure token storage uses `localStorage` on web instead of `AsyncStorage` (or use `@react-native-async-storage/async-storage` which has web support)

**Check**:
- `AsyncStorage` web polyfill works, OR
- Add platform check: `Platform.OS === 'web' ? localStorage : AsyncStorage`

### Step 4: Fix 3D House Viewer for web

**Goal**: The 3D home view renders in the browser using Three.js.

**Files**:
- `app/src/components/Scene3D.web.tsx` — already exists, verify it works
- `app/src/components/House3DViewer.tsx` — check for native-only APIs
- `app/src/components/house3d/` — room configs, item configs should be pure JS (no issues)

**Potential issues**:
- `expo-gl` may not work on web — use raw Three.js `WebGLRenderer` instead
- `expo-three` has a web fallback but may need `<canvas>` element instead of `GLView`
- Touch handlers (`PanResponder`) → need to also handle mouse events on web

### Step 5: API URL configuration for web

**Goal**: Web app can reach the backend without a tunnel.

**File**: `app/src/utils/apiConfig.ts` (edit)

- On mobile: API_URL points to the tunnel (e.g. ngrok/cloudflare)
- On web: API_URL should point to the backend directly (same origin or CORS-allowed origin)
- If deploying on same domain: use relative URLs (`/api/v1/...`)
- If separate domains: backend CORS already allows `*`

**Pattern**:
```typescript
export const API_V1_URL = Platform.OS === 'web'
  ? '/api/v1'  // same-origin (if behind reverse proxy)
  : 'https://your-tunnel.trycloudflare.com/api/v1';
```

### Step 6: Hide scan-related UI on web

**Goal**: No broken camera buttons on the website.

**Files to edit**:
- `app/App.tsx` — don't render the Scan tab when `Platform.OS === 'web'`
- `app/src/screens/LandingScreen` (inside App.tsx) — hide "Scan" button on web, or replace with "Add Device Manually"
- Any component that links to scan flow — add `Platform.OS !== 'web'` guards

### Step 7: Responsive layout / styling

**Goal**: App looks good on desktop-width screens (not just 375px mobile).

**Key changes**:
- Add `maxWidth: 1200` container on web to prevent full-screen stretch
- Cards should flow in a grid (2-3 columns) on wide screens
- Chat screen should have a centered, max-width conversation area
- Use `Dimensions.get('window').width` or CSS media queries via `Platform.OS === 'web'`

**Pattern**:
```typescript
const isWeb = Platform.OS === 'web';
const containerStyle = isWeb ? { maxWidth: 900, alignSelf: 'center', width: '100%' } : {};
```

### Step 8: Deployment

**Goal**: Website accessible at a public URL.

**Options** (pick one):
- **Vercel**: `npx expo export --platform web` → deploy `dist/` to Vercel
- **Netlify**: Same export, drag-and-drop deploy
- **GitHub Pages**: Export + push to `gh-pages` branch
- **Same server as backend**: Serve static files from FastAPI with `StaticFiles`

**For hackathon demo**: FastAPI serving static files is simplest:
```python
# In server.py
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../app/dist", html=True), name="web")
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/babel.config.js` | **Create** — add `babel-preset-expo` |
| `app/App.tsx` | **Edit** — web layout with top nav, hide scan tab on web |
| `app/src/utils/apiConfig.ts` | **Edit** — platform-aware API URL |
| `app/src/context/AuthContext.tsx` | **Edit** — verify web token storage |
| `app/src/components/Scene3D.web.tsx` | **Edit** — verify/fix Three.js web rendering |
| `app/src/components/House3DViewer.tsx` | **Edit** — web-compatible touch/mouse handlers |
| `app/src/screens/ChatScreen.tsx` | **Edit** — responsive width for desktop |
| `app/src/screens/ChartDashboardScreen.tsx` | **Edit** — grid layout for wide screens |
| `be/server.py` | **Edit** — optionally serve web static files |

---

## Build & Run Commands

```bash
# Development
cd app && npx expo start --web

# Production export
cd app && npx expo export --platform web
# Output: app/dist/

# Serve from backend (optional)
# Add StaticFiles mount to server.py, then:
cd be && uvicorn server:app --host 0.0.0.0 --port 8000
# Website at http://localhost:8000, API at http://localhost:8000/api/v1/
```

---

## Edge Cases

- Camera imports crash on web → lazy import behind `Platform.OS` check
- `expo-gl` / `GLView` not available on web → use `<canvas>` + Three.js `WebGLRenderer`
- `AsyncStorage` on web → uses localStorage adapter (built-in to the package)
- `SafeAreaView` on web → renders as plain `<div>`, no issues
- `react-native-reanimated` on web → works but verify animations compile
- Keyboard handling (`KeyboardAvoidingView`) → not needed on web, skip with platform check
- Touch vs mouse events in 3D viewer → handle both `onTouchStart` and `onMouseDown`
- Web URLs: no deep linking for now (hash routing is fine for hackathon)

---

## Priority Order

1. **Step 1** — Get `expo start --web` to not crash (fix imports)
2. **Step 2** — Web navigation with 3 tabs
3. **Step 3** — Auth working in browser
4. **Step 5** — API URL config so web can talk to backend
5. **Step 6** — Hide scan UI on web
6. **Step 4** — 3D house viewer on web
7. **Step 7** — Responsive styling
8. **Step 8** — Deploy
