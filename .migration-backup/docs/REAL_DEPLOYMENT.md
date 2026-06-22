# Real Deployment Mode

Nezora now includes a real static deployment path that uses direct provider operations:

## 1. Host Nezora itself on Render

1. Push this repository to GitHub.
2. Go to https://dashboard.render.com/
3. New > Web Service > connect the Nezora repository.
4. Settings:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
   - Environment: Node
5. Add environment variables:
   - `ADMIN_TOKEN`: a private random string of at least 16 characters.
   - `NEZORA_BASE_DOMAIN`: optional. Use a real domain you control when ready.
   - `ALLOW_SHELL`: keep `false` unless you understand the risk.

## 2. Deploy a real free static site

Use `/real` in the Nezora app.

It deploys to GitHub Pages by doing real operations:

1. Clone your repo.
2. Detect framework.
3. Install dependencies.
4. Build static assets.
5. Auto-fix common Next.js static-export config when enabled.
6. Push files to the `gh-pages` branch.
7. Enable GitHub Pages using the GitHub API.
8. Return `https://OWNER.github.io/REPO/`.

## 3. GitHub token directions

Create a free fine-grained GitHub personal access token here:

https://github.com/settings/personal-access-tokens

Give it access only to the repository you want to deploy.

Required repository permissions:

- Contents: Read and write
- Pages: Read and write
- Metadata: Read-only

## 4. What can be truly free without a card/API?

- GitHub Pages: static sites, React/Vite static builds, exported Next.js.
- Cloudflare Pages: free, but reliable automation requires an API token.
- Vercel Hobby: free, automation requires a token.
- Render/Koyeb/etc.: good for APIs/services, but automation requires API keys and the free tiers can sleep or have limits.

There is no honest way to guarantee an API/bot is 24/7 forever on third-party free tiers with no credentials. Nezora can monitor, retry and fail over when you connect multiple providers, but provider limits still apply.

## 5. Linux operations

`/real` includes a private Linux operations panel backed by `/api/system/shell`.

Preset commands:

- `info`
- `doctor`
- `build`
- `typecheck`
- `audit`
- `files`

Custom shell is disabled by default. Set `ALLOW_SHELL=true` only on a private service protected by `ADMIN_TOKEN`.

## 6. ZIP Deployments

The `/real` screen now supports ZIP uploads.

### ZIP -> GitHub Pages

Use this for static projects. Nezora extracts the ZIP safely, detects the app, builds it, creates/uses your GitHub repo, pushes `gh-pages`, enables Pages, and returns the real GitHub Pages URL.

### ZIP -> Render

Use this for apps, APIs, bots and worker-style projects. Nezora extracts the ZIP, detects commands, writes a real `render.yaml`, pushes a GitHub repo, and returns the official Render deploy URL:

`https://render.com/deploy?repo=https://github.com/OWNER/REPO`

This path does not need the Render API. It uses Render's official deploy button flow. You still need to confirm deployment in Render because Render must connect to your account/workspace.

## 7. Direct links for free accounts and API tokens

- GitHub fine-grained token: https://github.com/settings/personal-access-tokens
- Render dashboard: https://dashboard.render.com/
- Render deploy button docs: https://render.com/docs/deploy-to-render
- Render API keys: https://dashboard.render.com/account/api-keys
- Cloudflare API tokens: https://dash.cloudflare.com/profile/api-tokens
- Vercel tokens: https://vercel.com/account/tokens
- Koyeb API tokens: https://app.koyeb.com/account/api
- Northflank API tokens: https://app.northflank.com/s/account/api-tokens
- UptimeRobot free monitors: https://uptimerobot.com/
- cron-job.org free scheduled pings: https://cron-job.org/

## 8. Linux operations command list

Preset commands in `/real`:

- `info` - OS, Node, disk and memory.
- `doctor` - Nezora production readiness check.
- `build` - Next.js production build.
- `typecheck` - TypeScript strict check.
- `audit` - npm production dependency audit.
- `repair` - npm install, typecheck and build.
- `envsafe` - environment variable names only, values hidden.
- `processes` - running processes.
- `network` - DNS/HTTPS connectivity check.
- `ports` - listening ports when available.
- `git` - safe git status.
- `render` - Render runtime environment summary.
- `clean` - delete `.next` and rebuild.
- `files` - list project files.

## 9. Bots/background workers reality

Render's free plan is best for web services and static sites. Background workers/cron jobs may require paid instances depending on Render's current pricing. To keep a bot on a free web service, the project usually needs to also expose a small HTTP health endpoint on `$PORT`. Nezora prepares a `render.yaml`, but your bot code still has to be compatible with the provider's runtime rules.
