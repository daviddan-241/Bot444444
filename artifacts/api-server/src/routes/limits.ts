import { Router, type IRouter } from "express";
import { assertAdmin } from "../lib/auth-guard";

const router: IRouter = Router();

function stateFromRemaining(remaining?: number, limit?: number): string {
  if (remaining === undefined || limit === undefined || limit <= 0) return "unknown";
  const pct = remaining / limit;
  if (pct <= 0.05) return "critical";
  if (pct <= 0.2) return "watch";
  return "ok";
}

function ethicalLimitPolicy() {
  return {
    allowed: [
      "Show real quota/limit signals from connected providers.",
      "Warn before limits are exhausted.",
      "Pause non-essential deploys when a provider is critical.",
      "Fail over to another provider/account that you legitimately own and connected yourself.",
      "Suggest upgrades or cleanup when free tiers are not enough.",
    ],
    blocked: [
      "Automatically creating new third-party accounts to bypass free-tier limits.",
      "Rotating identities, emails, cards, IPs, or accounts to evade provider restrictions.",
      "Keeping apps alive by violating provider terms of service.",
    ],
  };
}

router.post("/real/limits", async (req, res) => {
  if (!assertAdmin(req, res)) return;
  const { githubToken } = req.body;
  const limits: object[] = [];
  if (githubToken) {
    try {
      const gh = await fetch("https://api.github.com/rate_limit", {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "User-Agent": "Nezora-Deploy" },
      });
      if (gh.ok) {
        const json = await gh.json() as any;
        const core = json.resources?.core;
        limits.push({
          provider: "GitHub",
          metric: "REST API core rate limit",
          used: core.used,
          limit: core.limit,
          remaining: core.remaining,
          resetAt: new Date(core.reset * 1000).toISOString(),
          state: stateFromRemaining(core.remaining, core.limit),
          note: "Real GitHub API rate-limit reading from your token.",
          action: core.remaining <= core.limit * 0.2 ? "Slow down deploys or wait until reset." : "Healthy.",
        });
      } else {
        limits.push({ provider: "GitHub", metric: "REST API core rate limit", state: "unknown", note: `GitHub returned ${gh.status}`, action: "Check token permissions." });
      }
    } catch {
      limits.push({ provider: "GitHub", metric: "REST API core rate limit", state: "unknown", note: "Failed to reach GitHub API.", action: "Check network connectivity." });
    }
  }
  res.json({ ok: true, limits, policy: ethicalLimitPolicy() });
});

export default router;
