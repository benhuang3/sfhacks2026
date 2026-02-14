import dns from "dns";
import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Convert a mongodb+srv:// URI to a standard mongodb:// URI by resolving
 * the SRV records using Google Public DNS (fixes Windows IPv6 DNS issues).
 */
async function resolveSrvUri(srvUri: string): Promise<string> {
  const match = srvUri.match(/^mongodb\+srv:\/\/([^/]+)\/?(.*)/);
  if (!match) return srvUri; // not an SRV URI, return as-is

  const [, authority, rest] = match;
  // authority = "user:pass@hostname" or just "hostname"
  const atIdx = authority.lastIndexOf("@");
  const credentials = atIdx >= 0 ? authority.slice(0, atIdx + 1) : "";
  const hostname = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;

  // Resolve SRV records using Google DNS
  const resolver = new dns.promises.Resolver();
  resolver.setServers(["8.8.8.8", "8.8.4.4"]);

  const records = await resolver.resolveSrv(`_mongodb._tcp.${hostname}`);
  const hosts = records.map((r) => `${r.name}:${r.port}`).join(",");

  // Resolve TXT record for options (replicaSet, authSource, etc.)
  let txtOpts = "";
  try {
    const txtRecords = await resolver.resolveTxt(hostname);
    txtOpts = txtRecords.map((r) => r.join("")).join("&");
  } catch { /* TXT is optional */ }

  const sep = rest || txtOpts ? "?" : "";
  const allOpts = [txtOpts, rest].filter(Boolean).join("&");

  return `mongodb://${credentials}${hosts}/${sep}${allOpts}&tls=true`;
}

export async function connectDB(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || "smartgrid";

  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  if (db) return db;

  // Resolve SRV if needed (works around Windows DNS issues)
  let resolvedUri = uri;
  if (uri.startsWith("mongodb+srv://")) {
    try {
      resolvedUri = await resolveSrvUri(uri);
      console.log("[db] Resolved SRV → direct connection string");
    } catch (err) {
      console.warn("[db] SRV resolution failed, trying original URI…", err);
    }
  }

  client = new MongoClient(resolvedUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
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
