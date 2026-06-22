# Nezora — Deploy Guide

## Option 1: Render (free, easiest)

### One-click via Render Blueprint
1. Fork or push this repo to your GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Point to your repo — Render reads `render.yaml` automatically
4. Click **Apply** — it deploys in ~5 minutes
5. *(Optional)* Add a free Groq API key for better AI:
   - Sign up at [console.groq.com](https://console.groq.com) → API Keys
   - In Render dashboard → your service → Environment → add `GROQ_API_KEY`

Your app will be live at `https://nezora-XXXX.onrender.com`

**Free tier notes:**
- Service sleeps after 15 min of inactivity — the built-in keep-alive pinger
  wakes it automatically (reads `RENDER_EXTERNAL_URL`, no config needed)
- 512 MB RAM — fits the API + web dashboard easily
- Ollama (local AI) requires 4 GB RAM — use Groq free tier instead

### Manual Render deploy
```bash
# In Render dashboard → New Web Service → Docker
# Repo: your GitHub repo
# Dockerfile path: ./Dockerfile
# Health check: /api/ping
```

---

## Option 2: Docker anywhere (VPS, Hetzner, DigitalOcean)

Best option if you want Ollama (free local AI, unlimited).

```bash
git clone https://github.com/daviddan-241/Bot444444.git nezora
cd nezora
cp .env.example .env
# Edit .env — set NEZORA_ADMIN_TOKEN and NEZORA_ADMIN_PASSWORD
nano .env

# Start everything (api + web + ollama)
docker compose up -d

# Pull the AI model (once — ~2 GB)
docker compose exec ollama ollama pull llama3.2

# Open: http://your-server-ip:3000
```

Recommended VPS: **Hetzner CX22** (~€4/month, 4 GB RAM, runs Ollama + everything).

---

## Option 3: Railway

```bash
railway login
railway new --name nezora
railway up --dockerfile Dockerfile
```

Add env vars in Railway dashboard same as Render.

---

## Option 4: Fly.io

```bash
fly launch --dockerfile Dockerfile --name nezora
fly deploy
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEZORA_ADMIN_TOKEN` | Yes | API auth token — auto-generated on Render |
| `NEZORA_ADMIN_PASSWORD` | Yes | Dashboard password — auto-generated on Render |
| `NEZORA_ADMIN_USERNAME` | No | Dashboard username (default: admin) |
| `GROQ_API_KEY` | No | Free AI key from console.groq.com |
| `OLLAMA_HOST` | No | Ollama URL (Docker compose sets this automatically) |
| `OLLAMA_MODEL` | No | Model name (default: llama3.2) |
| `PUBLIC_URL` | No | Auto-detected from Render/Railway/Fly env vars |

---

## iOS Mobile App

The Expo app connects to your deployed Nezora server.

1. Install **Expo Go** on your iPhone (App Store — free)
2. Open the app → Settings tab
3. Enter your server URL: `https://nezora-XXXX.onrender.com`
4. Enter your admin token (from Render dashboard → Environment → `NEZORA_ADMIN_TOKEN`)

For a real iOS app on TestFlight (no Expo Go needed):
```bash
cd artifacts/nezora-mobile
npx eas build --platform ios --profile preview
```
Requires Apple Developer account ($99/year) and free EAS account.
