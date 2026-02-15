# WattVision — SF Hacks 2026 DevPost Submission

---

## Project Title
**WattVision**

---

## Elevator Pitch (140 chars)
AI-powered energy management app: scan appliances with your camera, visualize usage in 3D, and get smart savings recommendations instantly.

---

## Project Tracks
- **Best Hack for Climate Action** — WattVision directly reduces household energy waste by identifying ghost energy and recommending efficiency upgrades
- **Best Design Hack** — Interactive 3D house model with room-level device visualization, SaaS-quality charts, gamification, and dark mode
- **MLH: Best Use of Gemini API** — Gemini powers device power profiling, natural language home commands, and AI chat for energy optimization
- **MLH: Best Use of MongoDB Atlas** — All device profiles, homes, rooms, scan results, and power data stored in MongoDB with vector search support

---

## Full Description

### What it does

WattVision is a comprehensive smart home energy management platform that helps users understand and reduce their electricity consumption. The app combines AI-powered device detection with interactive 3D visualization to make energy management intuitive and engaging.

**Core Features:**

1. **AI Camera Scanner** — Point your phone camera at any appliance and WattVision identifies it using Google Gemini Vision. The app instantly pulls up energy specs including active wattage, standby (ghost) power draw, and estimated annual cost.

2. **Interactive 3D Home Viewer** — A fully rendered Three.js 3D house model displays your rooms and devices in an isometric view. Each room has unique furniture (beds, kitchen counters, bathtubs, sofas, dining tables) matching real floor plans. Tap any room to see its total power consumption, per-device wattage breakdown, and estimated monthly cost. Toggle the roof on/off to look inside. Full 360° rotation with pinch-to-zoom.

3. **Real-Data Energy Dashboard** — SaaS-quality charts showing cost breakdown by category (donut chart), 7-day usage trends, and 12-month billing projections — all calculated from actual device data with category-specific usage patterns (TVs peak on weekends, AC peaks in summer, heaters in winter).

4. **Ghost Energy Detection** — Identifies standby power waste across all scanned devices. Shows how much "vampire energy" costs you annually and recommends smart plugs to eliminate it.

5. **AI-Powered Actions** — Natural language commands via Gemini AI: "optimize my energy usage", "what devices use the most power?", "create a schedule to reduce my bill". The AI agent can suggest device schedules, replacement upgrades, and behavioral changes.

6. **Gamification** — Energy efficiency score (0-100), achievement badges (Scanner, Power Hunter, Eco Warrior, Vampire Slayer), neighborhood leaderboard comparison, and environmental impact tracking (trees equivalent, CO₂ saved).

7. **Home Management** — Create homes, add rooms, manage devices. Each device tracks active watts, standby watts, usage profiles, and control capabilities.

### How we built it

**Frontend:** React Native with Expo Go for cross-platform mobile development. Three.js rendered inside WebView for the 3D house visualization. Custom SVG components for isometric appliance illustrations (20+ unique device renderers). react-native-chart-kit for line charts, custom SVG donut charts. Full dark/light theme support.

**Backend:** Python FastAPI server with MongoDB Atlas for persistent storage. Google Gemini 2.0 Flash via LangChain for intelligent device power profiling — when a device isn't in our database, Gemini estimates its power consumption based on brand, model, and category knowledge. Pydantic models enforce strict validation on all AI outputs. 3-pass fuzzy matching with 100+ category aliases ensures accurate device classification.

**AI Integration:**
- **Gemini Vision** (gemini-2.0-flash) — Processes camera images to identify appliances in real-time during the scan flow
- **Gemini Power Agent** — Estimates device power profiles (active/standby watts) using structured JSON output with PydanticOutputParser
- **Gemini Chat Agent** — Natural language interface for energy optimization commands, device control, and personalized recommendations
- **Category Intelligence** — 25+ built-in power defaults with realistic ranges, plus AI lookup for unknown devices

**Infrastructure:** Cloudflare Tunnel for secure API access from mobile devices. MongoDB Atlas for cloud database with vector search capabilities.

### Challenges we ran into

- **3D Performance in WebView** — Rendering a detailed 3D house with furniture, devices, shadows, and particle effects inside a React Native WebView required careful optimization. We had to balance visual fidelity with mobile performance, managing draw calls, geometry complexity, and material count.

- **Accurate Power Estimation** — Getting reliable wattage data for thousands of appliance models is challenging. We built a multi-tier system: cached MongoDB lookups → Gemini AI estimation → category-based defaults, with Pydantic validation and clamping to catch unrealistic AI outputs.

- **Room-Device Mapping** — Matching user's room names to appropriate furniture builders required fuzzy string matching. A "Master Bedroom" needs a bed, while a "Kitchen/Dining Combo" needs both kitchen and dining furniture.

- **Real-time Camera Detection** — Achieving smooth camera scanning with bounding box overlays while running inference required debouncing, tracking algorithms (IoU-based), and careful state management.

- **Cross-platform Consistency** — Making the 3D viewer, charts, and UI look polished on both iOS and Android with Expo Go constraints (no native modules) pushed us to creative solutions like WebView-based Three.js rendering.

### Accomplishments we're proud of

- The 3D house viewer with room-specific furniture, roof toggle, device placement, and room-tap electricity information panels
- Real device data driving all charts — no synthetic data, actual category-specific daily and seasonal patterns
- 20+ unique isometric SVG appliance illustrations with fuzzy matching
- The gamification system with meaningful badges tied to actual energy metrics
- Clean architecture: shared energy constants, typed API client, proper error handling

### What we learned

- Three.js can run smoothly in a React Native WebView with proper optimization
- Gemini's structured output with Pydantic parsing is incredibly reliable for getting JSON from AI
- Energy consumption patterns vary dramatically by device category and season — a flat multiplier doesn't reflect reality
- Gamification significantly increases user engagement with otherwise dry energy data
- MongoDB's flexible schema is perfect for storing heterogeneous device profiles

### What's next for WattVision

- Real smart plug integration (TP-Link Kasa, Shelly) for live wattage monitoring
- Utility bill OCR — snap a photo of your electricity bill for automatic rate detection
- Community energy challenges with real leaderboards
- Apple HomeKit and Google Home integration
- Machine learning on historical usage data for predictive energy budgeting

---

## Table Number
_(Fill in at event)_

---

## .Tech Domain
_(If claimed at event)_

---

## School / University
San Francisco State University

---

## GenAI Tools Used
- **Google Gemini 2.0 Flash** — Device power profiling, appliance image recognition, natural language energy assistant, structured JSON output for reliable AI responses

---

## Gemini API Implementation Details

WattVision uses the Gemini API in three distinct ways:

1. **Power Profiling Agent** (`be/agents.py`): Uses `gemini-2.0-flash` via LangChain's `ChatGoogleGenerativeAI` with `PydanticOutputParser` to estimate device power consumption. When a user scans an appliance not in our database, the agent sends a structured prompt with brand, model, and category to Gemini, which returns a validated JSON response with active/standby wattage ranges, energy star rating, and usage profile.

2. **Vision Scanner** (`be/vision_service.py`): Processes camera images through Gemini Vision to identify appliances, extracting device category, brand, model, and condition from photos.

3. **Chat & Command Agent** (`be/server.py`): Natural language interface where users can ask questions about their energy usage or give commands like "optimize my home" — Gemini generates actionable energy-saving recommendations and device schedules.

**Gemini API Key Project Number:** _(Fill in your project number)_

---

## Tags
`React Native` · `Expo` · `Three.js` · `FastAPI` · `MongoDB Atlas` · `Google Gemini` · `LangChain` · `Energy Management` · `Smart Home` · `Climate Tech` · `AI/ML` · `3D Visualization` · `Computer Vision` · `TypeScript` · `Python`

---

## Links

- **GitHub Repository:** _(Add your GitHub repo URL)_
- **Demo Video:** _(Add YouTube/Loom link)_
- **Website / Live Demo:** _(Add if deployed)_

---

## Team Members
_(Add team member names and roles)_

---

## Built With
- React Native (Expo Go)
- TypeScript
- Three.js (WebView)
- Python FastAPI
- MongoDB Atlas
- Google Gemini 2.0 Flash API
- LangChain
- Pydantic
- Cloudflare Tunnel
- react-native-chart-kit
- react-native-svg
