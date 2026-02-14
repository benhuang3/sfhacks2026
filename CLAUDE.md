# CLAUDE.md — SmartGrid Home (SF Hacks 2026)

## Project Overview

**SmartGrid Home** is a smart home energy management app built for SF Hacks 2026. It lets users control smart devices/outlets, monitor real-time energy usage, scan existing appliances to detect "ghost energy" waste, and generate ROI reports showing savings from upgrading to smart/energy-efficient alternatives.

## Core Features

### 1. Smart Device Dashboard
- Connect and control smart plugs, smart outlets, and smart devices
- Real-time energy monitoring (watts, kWh, cost) per device
- On/off toggle, scheduling, and automation rules
- Device grouping by room

### 2. Device Scanner
- Camera-based scanning: point phone at any appliance to identify it (using Meta's on-device AI for image recognition)
- Pull up energy specs for identified devices (average wattage, standby/ghost energy draw)
- Detect "ghost energy" — power consumed while devices are off/standby
- Suggest smart plug or smart device alternatives with links and pricing

### 3. ROI Report Generator
- Calculate annual energy cost of current devices vs. smart alternatives
- Show money saved ($/year), energy saved (kWh/year), and carbon reduction (kg CO2/year)
- Factor in upfront cost of smart devices to compute payback period
- Exportable/shareable report card

### 4. Meta On-Device AI Integration
- Use Meta's on-device AI models (e.g., MobileLLM, on-device Llama) for:
  - Appliance image recognition in the scanner
  - Natural language device control ("turn off the living room lights")
  - Personalized energy-saving recommendations
- All AI inference runs locally on-device — no cloud dependency for core AI features

## Tech Stack

### Frontend (Mobile-First PWA / React Native)
- **Framework**: React Native (Expo) for cross-platform mobile app
- **UI**: React Native Paper or Tamagui for component library
- **State Management**: Zustand
- **Charts**: Victory Native or react-native-chart-kit for energy visualizations

### Backend
- **Runtime**: Node.js with Express or Fastify
- **Database**: PostgreSQL (device registry, energy logs, user data)
- **Real-time**: WebSocket (Socket.io) for live energy data streaming
- **API Style**: REST for CRUD, WebSocket for real-time telemetry

### AI / ML
- **Meta On-Device AI**: MobileLLM / Llama 3.2 on-device for inference
- **Image Recognition**: On-device model for appliance identification
- **Energy Data**: Curated dataset of appliance energy profiles (EPA ENERGY STAR data, manufacturer specs)

### Smart Home Integration
- **Protocols**: Support for MQTT, Zigbee (via bridge), Wi-Fi smart plugs
- **Supported Devices**: TP-Link Kasa/Tapo, Shelly, Tuya-compatible smart plugs
- **Energy Monitoring**: Read wattage data from smart plugs with energy metering (e.g., Kasa KP115, Shelly Plug S)

## Project Structure

```
sfhacks2026/
├── CLAUDE.md
├── app/                    # React Native (Expo) mobile app
│   ├── src/
│   │   ├── screens/        # Dashboard, Scanner, ROI Report, Settings
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom hooks (useDevices, useEnergy, useAI)
│   │   ├── services/       # API client, device communication, AI service
│   │   ├── store/          # Zustand stores
│   │   ├── utils/          # Energy calculations, formatters
│   │   └── assets/         # Icons, images
│   ├── app.json
│   └── package.json
├── server/                 # Backend API
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── controllers/    # Business logic
│   │   ├── models/         # Database models
│   │   ├── services/       # Device integration, energy calculations
│   │   ├── middleware/
│   │   └── config/
│   └── package.json
├── ai/                     # AI model configs and energy dataset
│   ├── models/             # On-device model configs
│   └── data/               # Appliance energy profiles dataset
└── docs/                   # Architecture diagrams, API docs
```

## Development Commands

```bash
# Frontend (from app/)
npx expo start              # Start Expo dev server
npx expo start --ios        # Run on iOS simulator
npx expo start --android    # Run on Android emulator

# Backend (from server/)
npm run dev                 # Start dev server with hot reload
npm run db:migrate          # Run database migrations
npm run db:seed             # Seed appliance energy data

# Full stack
npm run dev                 # If using a root-level script to run both
```

## Key Conventions

- **TypeScript** everywhere (frontend and backend)
- **ESLint + Prettier** for formatting — run before committing
- Use `async/await` over raw promises
- Energy values stored in **watts (W)** internally, displayed as W/kW contextually
- Cost calculations use a configurable electricity rate (default: $0.15/kWh, adjustable per user's utility rate)
- Carbon factor: default 0.42 kg CO2/kWh (US average), configurable by region
- All API responses follow `{ success: boolean, data?: T, error?: string }` shape
- Device IDs use UUIDs
- Timestamps in ISO 8601 / UTC

## Environment Variables

```
# server/.env
DATABASE_URL=postgresql://...
PORT=3000
MQTT_BROKER_URL=mqtt://localhost:1883
ELECTRICITY_RATE_DEFAULT=0.15
CARBON_FACTOR_DEFAULT=0.42

# app/.env
API_URL=http://localhost:3000
```

## Energy Calculation Reference

```
Ghost Energy ($/year) = standby_watts * 24 * 365 / 1000 * rate_per_kwh
Annual Cost           = avg_watts * daily_hours * 365 / 1000 * rate_per_kwh
ROI Payback (months)  = smart_device_cost / (monthly_savings)
Carbon Saved (kg/yr)  = energy_saved_kwh * carbon_factor
```

## Hackathon Demo Flow

1. Open app → Dashboard shows connected smart plugs with live energy data
2. Tap "Scan" → Camera identifies an appliance (e.g., old space heater)
3. App shows ghost energy cost, annual usage, and suggests a smart alternative
4. Tap "Generate Report" → ROI card shows payback period, annual savings, carbon impact
5. Voice/text command via Meta AI: "Turn off all devices in the bedroom"

## Notes for Claude

- This is a hackathon project — prioritize working demos over production polish
- Prefer simple, readable code over clever abstractions
- Mock external device APIs when real hardware isn't available
- Use placeholder data for the appliance energy database if needed
- Keep the Meta on-device AI integration modular so it can be swapped/stubbed during dev
- Focus on the happy path first, add error handling incrementally
