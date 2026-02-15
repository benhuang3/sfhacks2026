# Cloudflare Tunnel — Step-by-Step Rerun Instructions

When the app can’t reach the backend (“Cannot reach server”, “tunnel may be down”, or 3D/API features fail), follow these steps to bring the tunnel back up.

---

## Prerequisites

- **cloudflared** installed ([download](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/))
- Backend runs on **port 8001** (default for this project)

---

## Step 1: Start the backend

From the project root:

```bash
cd be
# If using venv:
# .\venv\Scripts\activate   (Windows)
# source venv/bin/activate  (macOS/Linux)
uvicorn server:app --host 0.0.0.0 --port 8001
```

Or use your usual backend start command. Leave this terminal open.

Verify: open **http://localhost:8001/api/v1/health** in a browser — you should see a JSON response.

---

## Step 2: Start the Cloudflare tunnel

Open a **second** terminal. Run:

```bash
cloudflared tunnel --url http://127.0.0.1:8001
```

- **Windows (PowerShell):**  
  `cloudflared tunnel --url http://127.0.0.1:8001`

- **macOS/Linux:**  
  `cloudflared tunnel --url http://127.0.0.1:8001`

---

## Step 3: Copy the new tunnel URL

In the tunnel terminal you’ll see something like:

```
Your quick Tunnel has been created! Visit it at:
https://SOME-NAME-SOME-WORDS.trycloudflare.com
```

Copy the full `https://...trycloudflare.com` URL (no path).

---

## Step 4: Update the app with the new URL

Each time you restart the tunnel, the URL changes. Update it in the app:

| File | What to change |
|------|-----------------|
| `app/src/services/apiClient.ts` | `const TUNNEL_URL = 'https://YOUR-NEW-URL.trycloudflare.com';` |
| `app/src/services/authApi.ts` | Same `TUNNEL_URL` |
| `app/src/services/apiService.ts` | Same `TUNNEL_URL` |
| `app/src/screens/ChatScreen.tsx` | Same `TUNNEL_URL` (if it has its own constant) |

Replace the old tunnel URL with the new one everywhere it appears.

---

## Step 5: Restart the app (if needed)

- **Expo:** stop the dev server (Ctrl+C) and run `npx expo start` again, or reload the app (e.g. shake device → Reload).
- **Web:** refresh the page.

---

## Quick checklist

1. [ ] Backend running on port 8001  
2. [ ] `cloudflared tunnel --url http://127.0.0.1:8001` running in a second terminal  
3. [ ] New tunnel URL copied  
4. [ ] `TUNNEL_URL` updated in `apiClient.ts`, `authApi.ts`, `apiService.ts`, and `ChatScreen.tsx` if used  
5. [ ] App restarted or reloaded  

---

## Troubleshooting

- **“No connection could be made”**  
  Backend isn’t running or isn’t on 8001. Start it (Step 1) and ensure nothing else is using port 8001.

- **Tunnel starts but app still can’t connect**  
  You’re still using the old URL. Update all `TUNNEL_URL` values to the **new** URL from the tunnel terminal (Step 4).

- **Tunnel closes after a while**  
  Quick Tunnels (no Cloudflare account) can drop. Run Step 2 again, copy the new URL, and repeat Step 4.

- **Using a fixed URL (optional)**  
  For a stable URL you can use a [named tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps) with a Cloudflare account and then point `TUNNEL_URL` to that fixed hostname.
