# Cloudflare Tunnel — Restart Guide

When the Cloudflare tunnel dies (phone can't reach backend), follow these steps.

---

## Prerequisites

- Backend is running on `localhost:8001` (FastAPI server)
- Node.js installed (for `npx`)

---

## Step 1 — Kill Old Tunnel (if any)

Open Task Manager or run in PowerShell:

```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## Step 2 — Start New Tunnel

From the project root (`sfhacks2026/`):

```powershell
npx cloudflared tunnel --url http://127.0.0.1:8001
```

Wait until you see a line like:

```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
|  https://XXXX-XXXX-XXXX-XXXX.trycloudflare.com                                            |
+--------------------------------------------------------------------------------------------+
```

**Copy that `https://....trycloudflare.com` URL** — you'll need it next.

---

## Step 3 — Verify Tunnel Works

Open a browser or run:

```powershell
curl https://XXXX-XXXX-XXXX-XXXX.trycloudflare.com/api/v1/health
```

You should get `{"status":"ok"}`.

---

## Step 4 — Update 4 Files with New URL

Replace the old `TUNNEL_URL` value in these 4 files:

| # | File | Line |
|---|------|------|
| 1 | `app/src/services/apiClient.ts` | `const TUNNEL_URL = 'https://...';` (line ~9) |
| 2 | `app/src/services/apiService.ts` | `const TUNNEL_URL = 'https://...';` (line ~17) |
| 3 | `app/src/services/authApi.ts` | `const TUNNEL_URL = 'https://...';` (line ~6) |
| 4 | `app/src/screens/ChatScreen.tsx` | `const TUNNEL_URL = 'https://...';` (line ~29) |

In each file, find the line that looks like:

```typescript
const TUNNEL_URL = 'https://old-url.trycloudflare.com';
```

Replace it with:

```typescript
const TUNNEL_URL = 'https://XXXX-XXXX-XXXX-XXXX.trycloudflare.com';
```

### Quick Find & Replace (VS Code)

1. Press `Ctrl+Shift+H` (Find & Replace in Files)
2. Search: the old URL (e.g. `decor-kent-carrier-vienna.trycloudflare.com`)
3. Replace: the new URL from Step 2
4. Click **Replace All**

---

## Step 5 — Reload Expo

Shake phone → "Reload" or press `r` in Expo CLI terminal.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ERR_CONNECTION_REFUSED` | Backend not running. Start it: `cd be && python server.py` |
| Tunnel starts but phone can't connect | Wait 10-15 seconds for DNS propagation |
| `502 Bad Gateway` | Backend crashed. Check `python server.py` terminal for errors |
| Tunnel keeps dying | Cloudflare free tunnels expire after ~24h. Just restart from Step 2 |

---

## Quick One-Liner (if backend is already running)

```powershell
npx cloudflared tunnel --url http://127.0.0.1:8001
```

Then update the 4 files and reload Expo.
