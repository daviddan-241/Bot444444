---
name: Per-project workspace agent
description: Each deployed app has a real AI coding agent workspace with file browser, terminal, and agent chat.
---

**Backend route**: `artifacts/api-server/src/routes/workspace.ts`

Endpoints:
- `GET /api/real/workspaces` — list all app workspaces (from processManager)
- `GET /api/real/workspaces/:slug` — file tree + process info + recent logs
- `POST /api/real/workspaces/:slug/files/list` — list directory contents
- `POST /api/real/workspaces/:slug/files/read` — read a file (200KB max)
- `POST /api/real/workspaces/:slug/files/write` — write a file
- `POST /api/real/workspaces/:slug/shell` — SSE streaming shell in workspace dir
- `POST /api/real/workspaces/:slug/agent` — SSE AI agent loop with tool-calling
- `POST /api/real/workspaces/:slug/redeploy` — kill + respawn the process

**Agent tool loop (ReAct pattern)**:
Tools: `list_files`, `read_file`, `write_file`, `run_command`, `get_logs`
Format: `<tool:name>{"param": "value"}</tool>` parsed from LLM output.
Up to 8 rounds per message. Works with any AI provider (OpenRouter/Groq/Together).

**Security**: All file paths are resolved via `safePath()` which checks `path.resolve(wsDir, rel).startsWith(wsDir)`. Prevents path traversal.

**App directory**: `process.env.NEZORA_APPS_DIR ?? path.join(process.cwd(), ".nezora-apps")` — same as APP_ROOT from app-deploy.ts.

**Frontend**: `artifacts/nezora/src/pages/Workspace.tsx` — 3-panel layout (file tree | file viewer/editor | agent chat). Route: `/workspace/:slug`. Linked from Processes page via "Workspace" button on each process card.

**Mobile**: `artifacts/nezora-mobile/app/(tabs)/apps.tsx` — "Open AI Agent Workspace" button on each AppCard opens a full-screen Modal with streaming agent chat, real-time tool call display, and suggestion prompts.

**Why:** Users need to inspect, debug, and fix their deployed apps without leaving the platform. The agent can read files, run commands, write fixes, and verify them — closing the deploy→debug→fix loop.

**How to apply:** When adding new agent tools, add the case to `executeTool()` in workspace.ts. The system prompt in `agentSystemPrompt()` lists all available tools — keep it in sync.
