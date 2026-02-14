/**
 * Power Agent Service
 *
 * Estimates appliance power consumption using Google Gemini AI,
 * with MongoDB caching and category-based fallback defaults.
 *
 * Flow: 1. Check cache → 2. Call Gemini → 3. Validate → 4. Fallback → 5. Cache & return
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDB } from "../db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PowerProfile {
  category: string;
  standby_watts_range: [number, number];
  standby_watts_typical: number;
  active_watts_range: [number, number];
  active_watts_typical: number;
  confidence: number;
  source: string;
  notes: string[];
}

export interface DeviceLookupRequest {
  brand: string;
  model: string;
  name: string;
  region: string;
}

export interface PowerProfileResponse {
  brand: string;
  model: string;
  name: string;
  region: string;
  profile: PowerProfile;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Category Fallback Defaults
// ---------------------------------------------------------------------------

const CATEGORY_DEFAULTS: Record<string, PowerProfile> = {
  tv: {
    category: "Television", standby_watts_range: [0.5, 3], standby_watts_typical: 1,
    active_watts_range: [50, 200], active_watts_typical: 100, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic TV profile"],
  },
  television: {
    category: "Television", standby_watts_range: [0.5, 3], standby_watts_typical: 1,
    active_watts_range: [50, 200], active_watts_typical: 100, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic TV profile"],
  },
  refrigerator: {
    category: "Refrigerator", standby_watts_range: [1, 5], standby_watts_typical: 2,
    active_watts_range: [100, 400], active_watts_typical: 150, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic refrigerator profile"],
  },
  fridge: {
    category: "Refrigerator", standby_watts_range: [1, 5], standby_watts_typical: 2,
    active_watts_range: [100, 400], active_watts_typical: 150, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic refrigerator profile"],
  },
  washer: {
    category: "Washing Machine", standby_watts_range: [0.5, 3], standby_watts_typical: 1,
    active_watts_range: [300, 600], active_watts_typical: 500, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic washing machine profile"],
  },
  dryer: {
    category: "Dryer", standby_watts_range: [0.5, 5], standby_watts_typical: 2,
    active_watts_range: [1800, 5000], active_watts_typical: 3000, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic dryer profile"],
  },
  microwave: {
    category: "Microwave", standby_watts_range: [1, 5], standby_watts_typical: 3,
    active_watts_range: [600, 1200], active_watts_typical: 1000, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic microwave profile"],
  },
  laptop: {
    category: "Laptop", standby_watts_range: [0.5, 2], standby_watts_typical: 1,
    active_watts_range: [15, 65], active_watts_typical: 45, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic laptop profile"],
  },
  monitor: {
    category: "Monitor", standby_watts_range: [0.3, 1.5], standby_watts_typical: 0.5,
    active_watts_range: [15, 80], active_watts_typical: 30, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic monitor profile"],
  },
  heater: {
    category: "Space Heater", standby_watts_range: [0, 1], standby_watts_typical: 0.5,
    active_watts_range: [750, 1500], active_watts_typical: 1500, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic space heater profile"],
  },
  "air conditioner": {
    category: "Air Conditioner", standby_watts_range: [1, 5], standby_watts_typical: 2,
    active_watts_range: [500, 3500], active_watts_typical: 1500, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic air conditioner profile"],
  },
  light: {
    category: "Light Bulb", standby_watts_range: [0, 0.5], standby_watts_typical: 0.2,
    active_watts_range: [5, 100], active_watts_typical: 10, confidence: 0.4,
    source: "category_default", notes: ["Fallback: generic light profile"],
  },
};

const UNKNOWN_DEFAULT: PowerProfile = {
  category: "Unknown", standby_watts_range: [1, 5], standby_watts_typical: 3,
  active_watts_range: [50, 500], active_watts_typical: 150, confidence: 0.2,
  source: "category_default", notes: ["Fallback: no matching category — generic estimate"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveFallback(deviceName: string): PowerProfile {
  const lower = deviceName.toLowerCase();
  for (const [keyword, profile] of Object.entries(CATEGORY_DEFAULTS)) {
    if (lower.includes(keyword)) {
      console.log(`[powerAgent] Fallback matched keyword '${keyword}' for '${deviceName}'`);
      return { ...profile, notes: [...profile.notes] };
    }
  }
  console.warn(`[powerAgent] No category matched for '${deviceName}' — using unknown default`);
  return { ...UNKNOWN_DEFAULT, notes: [...UNKNOWN_DEFAULT.notes] };
}

function validateProfile(raw: Record<string, unknown>): PowerProfile | null {
  const p = raw as Record<string, unknown>;
  if (
    typeof p.category !== "string" ||
    !Array.isArray(p.standby_watts_range) || p.standby_watts_range.length !== 2 ||
    typeof p.standby_watts_typical !== "number" ||
    !Array.isArray(p.active_watts_range) || p.active_watts_range.length !== 2 ||
    typeof p.active_watts_typical !== "number" ||
    typeof p.confidence !== "number" ||
    typeof p.source !== "string"
  ) {
    return null;
  }
  // Safety caps (matching Python validators)
  if (p.standby_watts_typical > 50) return null;
  if (p.active_watts_typical > 5000) return null;

  return {
    category: p.category as string,
    standby_watts_range: p.standby_watts_range as [number, number],
    standby_watts_typical: p.standby_watts_typical as number,
    active_watts_range: p.active_watts_range as [number, number],
    active_watts_typical: p.active_watts_typical as number,
    confidence: p.confidence as number,
    source: p.source as string,
    notes: Array.isArray(p.notes) ? (p.notes as string[]) : [],
  };
}

function getCollection() {
  return getDB().collection("power_profiles");
}

// ---------------------------------------------------------------------------
// Gemini AI call
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  `You are an expert energy analyst. Given a home appliance, estimate its ` +
  `power consumption. Reply ONLY with valid JSON — no markdown, no explanation.\n\n` +
  `Return a JSON object with these exact fields:\n` +
  `  category (string), standby_watts_range ([min, max]), standby_watts_typical (number),\n` +
  `  active_watts_range ([min, max]), active_watts_typical (number),\n` +
  `  confidence (0-1), source (string), notes (string[])`;

async function callGemini(req: DeviceLookupRequest): Promise<PowerProfile | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("[powerAgent] GOOGLE_API_KEY not set");
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    });

    const userPrompt =
      `Estimate the power usage for this device:\n` +
      `  Brand : ${req.brand}\n` +
      `  Model : ${req.model}\n` +
      `  Name  : ${req.name}\n` +
      `  Region: ${req.region}\n\n` +
      `Use publicly available spec sheets and ENERGY STAR data when possible. ` +
      `If you are unsure, provide your best estimate and set confidence < 0.5. ` +
      `Return ONLY the JSON object.`;

    const result = await model.generateContent({
      systemInstruction: SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });

    const text = result.response.text().trim();
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const profile = validateProfile(parsed);

    if (profile) {
      console.log(`[powerAgent] Gemini returned valid profile (confidence=${profile.confidence})`);
    }
    return profile;
  } catch (err) {
    console.error("[powerAgent] Gemini call failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core Agent Logic
// ---------------------------------------------------------------------------

export async function lookupPowerProfile(req: DeviceLookupRequest): Promise<PowerProfileResponse> {
  const collection = getCollection();
  const brand = req.brand.trim();
  const model = req.model.trim();

  // Step 1: MongoDB cache lookup
  const cached = await collection.findOne(
    { brand, model },
    { projection: { _id: 0 } }
  );

  if (cached && cached.profile) {
    console.log(`[powerAgent] Cache HIT for ${brand} ${model}`);
    const profile = validateProfile(cached.profile as Record<string, unknown>);
    if (profile) {
      return { brand, model, name: req.name, region: req.region, profile, cached: true };
    }
    console.warn("[powerAgent] Cached doc invalid — will re-query Gemini");
  }

  // Step 2: Call Gemini
  console.log(`[powerAgent] Cache MISS for ${brand} ${model} — calling Gemini…`);
  let profile = await callGemini(req);

  // Step 3: Fallback to category defaults
  if (!profile) {
    console.warn(`[powerAgent] Using fallback defaults for '${req.name}'`);
    profile = resolveFallback(req.name);
    profile.notes.push(`AI estimation failed — used category default for '${req.name}'`);
  }

  // Step 4: Cache in MongoDB
  await collection.updateOne(
    { brand, model },
    {
      $set: {
        brand,
        model,
        name: req.name.trim(),
        region: req.region.trim(),
        profile,
      },
    },
    { upsert: true }
  );
  console.log(`[powerAgent] Cached profile for ${brand} ${model}`);

  return { brand, model, name: req.name, region: req.region, profile, cached: false };
}

// ---------------------------------------------------------------------------
// Convenience wrapper (used by /scans/resolve)
// ---------------------------------------------------------------------------

export async function fetchPowerProfile(
  deviceName: string,
  brand: string = "Generic",
  model: string = "unknown"
): Promise<PowerProfileResponse | null> {
  try {
    return await lookupPowerProfile({ brand, model, name: deviceName, region: "US" });
  } catch (err) {
    console.error("[powerAgent] Error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Seed category defaults into MongoDB (optional utility)
// ---------------------------------------------------------------------------

export async function seedCategoryDefaults(): Promise<number> {
  const coll = getDB().collection("category_defaults");
  let count = 0;
  for (const [keyword, profile] of Object.entries(CATEGORY_DEFAULTS)) {
    await coll.updateOne(
      { keyword },
      { $set: { keyword, profile } },
      { upsert: true }
    );
    count++;
  }
  console.log(`[powerAgent] Seeded ${count} category defaults`);
  return count;
}
