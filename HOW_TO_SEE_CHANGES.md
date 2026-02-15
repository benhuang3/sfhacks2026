# How to See the Latest Changes

If you don’t see any difference after the updates, the app is likely still running an old bundle. Do this:

## 1. Force the app to reload

**Expo (recommended):**
- In the terminal where `npx expo start` is running, press **`r`** to reload.
- Or shake the device (or press `Ctrl+M` / `Cmd+D` in the simulator) and choose **Reload**.

**Full restart:**
- Stop the dev server (`Ctrl+C`), then run again:
  ```bash
  cd app
  npx expo start
  ```
- When the app opens, reload once (e.g. press `r` in the terminal).

## 2. Where to look for changes

### Home tab (first tab)
- **Scroll down** to the **“Your Home”** section.
- You should see the line:  
  **“Drag to rotate · Pinch to zoom · Tap a device for power & environmental impact”**  
  under the “Your Home” title.
- A **“Loading 3D house…”** spinner appears briefly, then the 3D house.
- **Tap a device** (or a room) in the 3D view to open the detail panel with **power** and **Environmental impact** (CO₂).

### Dashboard tab (third tab – chart icon)
- Open the **Dashboard** tab.
- Under the title you should see:  
  **“Cost by category · 7-day trend below”**.
- **Cost Breakdown by Category** uses a smaller center label so the “$” doesn’t overwrite the donut.
- **7-Day Energy Trend** is the inline graph (with real data if you have a home, or a sample trend if not).

### My Home tab
- Open **My Home** → choose a home → open the **3D / viewer** screen.
- There you get the **inline 7-day graph** and the same 3D house; tapping a device opens the detail panel with **Environmental impact**.

## 3. If the 3D house is still blank

- Wait a few seconds after “Loading 3D house…” (the WebView loads Three.js from the network).
- Ensure the device or emulator has **internet** (Three.js is loaded from cdnjs).
- If it stays blank, reload again (press `r` in the Expo terminal).

## 4. Backend / power data (no more “75W for everything”)

- Backend changes (e.g. category fallbacks, Gemini Vision) apply after you **restart the backend** (`be` server).
- New scans and new devices use the updated power logic; existing devices keep their stored values until you re-add or re-scan them.
