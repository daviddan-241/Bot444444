# Nezora — Deploy Anywhere

## Docker (Render, Railway, Fly.io, any VPS)

### Quick start (CPU)
```bash
git clone https://github.com/daviddan-241/Bot444444.git nezora
cd nezora
cp .env.example .env   # edit NEZORA_ADMIN_TOKEN and NEZORA_ADMIN_PASSWORD
docker compose up -d
# Pull the AI model (once — ~2 GB download)
docker compose exec ollama ollama pull llama3.2
```

Open: http://localhost:3000

### Environment variables (`.env`)
| Variable | Default | Description |
|---|---|---|
| `NEZORA_ADMIN_TOKEN` | `changeme` | API auth token — **change this** |
| `NEZORA_ADMIN_PASSWORD` | `changeme` | Dashboard password — **change this** |
| `OLLAMA_MODEL` | `llama3.2` | Ollama model (llama3.2, llama3.2:1b, mistral) |
| `GROQ_API_KEY` | — | Optional: Groq API key for cloud fallback |
| `PUBLIC_URL` | auto-detected | Your public domain (e.g. https://nezora.example.com) |
| `WEB_PORT` | `3000` | Web dashboard port |
| `API_PORT` | `8080` | API server port |

### GPU acceleration (Nvidia)
Uncomment the `deploy.resources` block in `docker-compose.yml` and install the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).

---

## Render
1. Create a new **Web Service** → connect your GitHub repo
2. Set **Build Command**: `docker compose build api`
3. Set **Start Command**: `docker compose up api ollama`
4. Add env vars in the Render dashboard

## Railway
```bash
railway login
railway new
railway up
```
Set `OLLAMA_HOST` to your Ollama service URL if running separately.

## Fly.io
```bash
flyctl launch --dockerfile artifacts/api-server/Dockerfile
flyctl deploy
```

## iOS (TestFlight / App Store)
```bash
cd artifacts/nezora-mobile
npx eas build --platform ios --profile preview
```
Requires an Apple Developer account ($99/year) and EAS account (free tier available).

For local iOS Simulator testing:
```bash
pnpm --filter @workspace/nezora-mobile run dev
# Scan the QR with Expo Go on your iPhone
```
