import "dotenv/config";
import { connectDB, getDB, disconnectDB } from "./db";

// Generate a deterministic fake 768-dim embedding seeded by a string
function fakeEmbedding(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  const emb: number[] = [];
  for (let i = 0; i < 768; i++) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    emb.push(((hash / 0x7fffffff) * 2 - 1) * 0.5); // range [-0.5, 0.5]
  }
  return emb;
}

const SCANS = [
  {
    userId: "user_abc123",
    imageUrl: "https://example.com/space-heater.jpg",
    imageHash: "sha256_heater_001",
    embedding: fakeEmbedding("space-heater"),
    label: "Space Heater",
    confidence: 0.95,
    deviceSpecs: { avgWatts: 1500, standbyWatts: 3, source: "energystar" },
    createdAt: new Date("2026-02-10T10:00:00Z"),
  },
  {
    userId: "user_abc123",
    imageUrl: "https://example.com/mini-fridge.jpg",
    imageHash: "sha256_fridge_001",
    embedding: fakeEmbedding("mini-fridge"),
    label: "Mini Fridge",
    confidence: 0.91,
    deviceSpecs: { avgWatts: 80, standbyWatts: 60, source: "energystar" },
    createdAt: new Date("2026-02-11T14:30:00Z"),
  },
  {
    userId: "user_abc123",
    imageUrl: "https://example.com/gaming-pc.jpg",
    imageHash: "sha256_pc_001",
    embedding: fakeEmbedding("gaming-pc"),
    label: "Gaming PC",
    confidence: 0.88,
    deviceSpecs: { avgWatts: 450, standbyWatts: 10, source: "manufacturer" },
    createdAt: new Date("2026-02-12T09:15:00Z"),
  },
  {
    userId: "user_abc123",
    imageUrl: "https://example.com/microwave.jpg",
    imageHash: "sha256_micro_001",
    embedding: fakeEmbedding("microwave"),
    label: "Microwave Oven",
    confidence: 0.93,
    deviceSpecs: { avgWatts: 1100, standbyWatts: 2, source: "energystar" },
    createdAt: new Date("2026-02-13T08:00:00Z"),
  },
  {
    userId: "user_xyz789",
    imageUrl: "https://example.com/tv.jpg",
    imageHash: "sha256_tv_001",
    embedding: fakeEmbedding("led-tv"),
    label: "55\" LED TV",
    confidence: 0.90,
    deviceSpecs: { avgWatts: 120, standbyWatts: 1, source: "energystar" },
    createdAt: new Date("2026-02-13T11:00:00Z"),
  },
  {
    userId: "user_xyz789",
    imageUrl: "https://example.com/washer.jpg",
    imageHash: "sha256_wash_001",
    embedding: fakeEmbedding("washing-machine"),
    label: "Washing Machine",
    confidence: 0.87,
    deviceSpecs: { avgWatts: 500, standbyWatts: 2, source: "manufacturer" },
    createdAt: new Date("2026-02-13T12:30:00Z"),
  },
];

async function seed() {
  await connectDB();
  const col = getDB().collection("scans");

  // Clear existing data
  const deleted = await col.deleteMany({});
  console.log(`[seed] Cleared ${deleted.deletedCount} existing documents`);

  // Insert fake scans
  const result = await col.insertMany(SCANS);
  console.log(`[seed] Inserted ${result.insertedCount} scan documents`);

  // Show what was inserted
  for (const scan of SCANS) {
    console.log(`  - ${scan.label} (${scan.userId}) — ${scan.deviceSpecs.avgWatts}W`);
  }

  await disconnectDB();
  console.log("[seed] Done!");
}

seed().catch((err) => {
  console.error("[seed] Error:", err);
  process.exit(1);
});
