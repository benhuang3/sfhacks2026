import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDB(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || "smartgrid";

  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  if (db) return db;

  client = new MongoClient(uri);
  await client.connect();

  // Verify connectivity
  await client.db(dbName).command({ ping: 1 });
  console.log("[db] Connected to MongoDB Atlas");

  db = client.db(dbName);
  return db;
}

export function getDB(): Db {
  if (!db) {
    throw new Error("Database not initialized — call connectDB() first");
  }
  return db;
}

export async function isDBConnected(): Promise<boolean> {
  try {
    if (!client || !db) return false;
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("[db] Disconnected from MongoDB Atlas");
  }
}
