import { Collection, ObjectId } from "mongodb";
import { getDB } from "../db";
import { ScanDocument, SimilarMatch, DeviceSpecs } from "../types/scan";

const COLLECTION = "scans";
const VECTOR_INDEX = "scanEmbeddingIndex";
const CACHE_THRESHOLD = 0.85;

function scans(): Collection<ScanDocument> {
  return getDB().collection<ScanDocument>(COLLECTION);
}

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

export async function insertScan(doc: Omit<ScanDocument, "_id" | "createdAt">): Promise<ObjectId> {
  const result = await scans().insertOne({
    ...doc,
    createdAt: new Date(),
  } as ScanDocument);
  return result.insertedId;
}

// ---------------------------------------------------------------------------
// Atlas Vector Search — similarity search
// ---------------------------------------------------------------------------

export async function findSimilarScans(
  userId: string,
  embedding: number[], // 768-dim vector passed from the mobile app
  k: number = 3
): Promise<{ hit: boolean; matches: SimilarMatch[] }> {
  try {
    const pipeline = [
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector: embedding,
          numCandidates: 50,
          limit: k,
          filter: { userId },
        },
      },
      {
        $project: {
          _id: 1,
          label: 1,
          confidence: 1,
          deviceSpecs: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const matches = await scans().aggregate<SimilarMatch>(pipeline).toArray();
    const hit = matches.length > 0 && matches[0].score >= CACHE_THRESHOLD;
    return { hit, matches };
  } catch (err) {
    console.error("[vectorSearch] Atlas Vector Search failed, falling back to recency:", err);
    return fallbackRecentScans(userId, k);
  }
}

// ---------------------------------------------------------------------------
// Fallback: return most recent scans for user when vector search is unavailable
// ---------------------------------------------------------------------------

async function fallbackRecentScans(
  userId: string,
  k: number
): Promise<{ hit: boolean; matches: SimilarMatch[] }> {
  const docs = await scans()
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(k)
    .project<SimilarMatch>({
      _id: 1,
      label: 1,
      confidence: 1,
      deviceSpecs: 1,
    })
    .toArray();

  // No vector score available in fallback — mark score as 0
  const matches: SimilarMatch[] = docs.map((d) => ({ ...d, score: 0 }));
  return { hit: false, matches };
}

// ---------------------------------------------------------------------------
// Recognition stub — replace with real on-device / cloud model call
// ---------------------------------------------------------------------------

async function runRecognitionStub(): Promise<{
  label: string;
  confidence: number;
  deviceSpecs: DeviceSpecs;
}> {
  // TODO: Replace with actual Meta on-device AI or cloud recognition call
  return {
    label: "Unknown Appliance",
    confidence: 0.5,
    deviceSpecs: {
      avgWatts: 100,
      standbyWatts: 5,
      source: "stub",
    },
  };
}

// ---------------------------------------------------------------------------
// Resolve — cache-aware scan endpoint
// ---------------------------------------------------------------------------

export async function resolveScan(params: {
  userId: string;
  imageUrl?: string;
  imageHash?: string;
  embedding: number[]; // 768-dim vector from mobile app
}): Promise<{ cacheHit: boolean; result: ScanDocument }> {
  const { userId, imageUrl, imageHash, embedding } = params;

  // Step 1 — vector similarity search
  const { hit, matches } = await findSimilarScans(userId, embedding, 1);

  // Step 2 — cache hit
  if (hit && matches.length > 0) {
    const top = matches[0];
    const cached: ScanDocument = {
      _id: top._id,
      userId,
      embedding,
      label: top.label,
      confidence: top.confidence,
      deviceSpecs: top.deviceSpecs,
      createdAt: new Date(),
    };
    return { cacheHit: true, result: cached };
  }

  // Step 3 — cache miss: run recognition and persist
  const recognised = await runRecognitionStub();
  const newDoc: Omit<ScanDocument, "_id" | "createdAt"> = {
    userId,
    imageUrl,
    imageHash,
    embedding,
    label: recognised.label,
    confidence: recognised.confidence,
    deviceSpecs: recognised.deviceSpecs,
  };

  const insertedId = await insertScan(newDoc);
  return {
    cacheHit: false,
    result: { ...newDoc, _id: insertedId, createdAt: new Date() },
  };
}
