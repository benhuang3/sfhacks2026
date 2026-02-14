# SmartGrid Server — Scan API with MongoDB Atlas Vector Search

## Quick Start

```bash
cd server
npm install
# Edit .env with your MongoDB Atlas connection string
npm run dev
```

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start dev server (ts-node-dev, HMR)  |
| `npm run build` | Compile TypeScript to `dist/`        |
| `npm start`     | Run compiled JS from `dist/`         |

## Environment Variables

Create a `.env` file in `server/`:

```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DB_NAME=smartgrid
PORT=3000
```

---

## MongoDB Atlas Setup

### 1. Create Database & Collection

1. Go to **Atlas → Database → Browse Collections**
2. Click **Create Database**
   - Database name: `smartgrid`
   - Collection name: `scans`

### 2. Create Atlas Vector Search Index

1. Go to **Atlas → Database → Your Cluster → Atlas Search**
2. Click **Create Search Index**
3. Choose **JSON Editor**
4. Select database `smartgrid`, collection `scans`
5. Set index name to: `scanEmbeddingIndex`
6. Paste this JSON definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "userId"
    }
  ]
}
```

7. Click **Create Search Index**

> **Important**: The index includes a `filter` field on `userId` so that
> `$vectorSearch` can pre-filter by user before ranking by cosine similarity.

The index may take a few minutes to build. Status will change from
**Building** → **Active**.

---

## API Endpoints

### `GET /health`

```bash
curl http://localhost:3000/health
```

Response:
```json
{ "status": "ok", "dbConnected": true }
```

---

### `POST /scans` — Insert a scan

```bash
curl -X POST http://localhost:3000/scans \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_abc123",
    "imageUrl": "https://example.com/photo.jpg",
    "imageHash": "sha256_abc",
    "embedding": [REPLACE_WITH_768_FLOATS],
    "label": "Space Heater",
    "confidence": 0.92,
    "deviceSpecs": {
      "avgWatts": 1500,
      "standbyWatts": 3,
      "source": "energystar"
    }
  }'
```

Response:
```json
{ "success": true, "data": { "insertedId": "664f..." } }
```

> **Tip for testing**: Generate a dummy 768-dim embedding with Python:
> ```python
> import json, random
> print(json.dumps([round(random.uniform(-1,1),6) for _ in range(768)]))
> ```

---

### `POST /scans/similar` — Vector similarity search

```bash
curl -X POST http://localhost:3000/scans/similar \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_abc123",
    "embedding": [REPLACE_WITH_768_FLOATS],
    "k": 3
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "hit": true,
    "matches": [
      {
        "_id": "664f...",
        "label": "Space Heater",
        "confidence": 0.92,
        "deviceSpecs": { "avgWatts": 1500, "standbyWatts": 3, "source": "energystar" },
        "score": 0.97
      }
    ]
  }
}
```

- `hit` is `true` when the top match has `score >= 0.85`

---

### `POST /scans/resolve` — Cache-aware scan resolution

```bash
curl -X POST http://localhost:3000/scans/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_abc123",
    "imageUrl": "https://example.com/photo.jpg",
    "imageHash": "sha256_abc",
    "embedding": [REPLACE_WITH_768_FLOATS]
  }'
```

**Cache hit** response (score >= 0.85):
```json
{
  "success": true,
  "data": {
    "cacheHit": true,
    "result": { "_id": "664f...", "label": "Space Heater", "confidence": 0.92, ... }
  }
}
```

**Cache miss** response (no close match — runs recognition stub, inserts new scan):
```json
{
  "success": true,
  "data": {
    "cacheHit": false,
    "result": { "_id": "665a...", "label": "Unknown Appliance", "confidence": 0.5, ... }
  }
}
```

---

## Project Structure

```
server/
├── .env
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── server.ts          # Express app + error handler + startup
    ├── db.ts              # MongoDB client singleton
    ├── types/
    │   └── scan.ts        # TypeScript interfaces
    ├── validation/
    │   └── scan.ts        # Zod schemas
    ├── services/
    │   └── scan.ts        # DB operations, vector search, resolve logic
    ├── controllers/
    │   └── scan.ts        # Request handlers
    └── routes/
        ├── scan.ts        # /scans routes
        └── health.ts      # /health route
```

## Architecture Notes

- **Embedding dimension**: 768 (matches Meta on-device AI output)
- **Vector Search index**: `scanEmbeddingIndex` using cosine similarity
- **Cache threshold**: top score >= 0.85 counts as a cache hit
- **Fallback**: if Atlas Vector Search is unavailable, returns most recent scans for the user
- **Recognition stub**: `runRecognitionStub()` in `services/scan.ts` — replace with actual model call
