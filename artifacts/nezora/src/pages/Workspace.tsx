import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";

interface WorkspaceInfo {
  id: string; name: string; status: string; url?: string;
  framework?: string; language?: string; port?: number;
  restarts: number; cwd: string; files: string[]; recentLogs: string[];
}

interface ChatMsg {
  role: "user" | "assistant"; content: string;
  toolCalls?: { tool: string; params: any; result?: string }[];
}

const FILE_ICON: Record<string, string> = {
  ts: "🟦", tsx: "🟦", js: "🟨", jsx: "🟨", py: "🐍", go: "🐹",
  rs: "🦀", java: "☕", rb: "💎", php: "🐘", html: "🌐", css: "🎨",
  json: "📋", yaml: "📋", yml: "📋", md: "📝", sh: "⚙️", env: "🔑",
  toml: "📋", dockerfile: "🐳",
};

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (name.toLowerCase() === "dockerfile") return "🐳";
  return FILE_ICON[ext] ?? "📄";
}

function logColor(line: string): string {
  if (/error|fail|❌/i.test(line)) return "#ff4444";
  if (/warn|warning/i.test(line)) return "#ffaa00";
  if (/success|✅|done|started/i.test(line)) return "#44dd88";
  return "#8b9eba";
}

export default function Workspace() {
  const [, params] = useRoute("/workspace/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileLoading, setFileLoading] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [shellCmd, setShellCmd] = useState("");
  const [shellOutput, setShellOutput] = useState<Array<{ type: string; text: string }>>([]);
  const [shellRunning, setShellRunning] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);

  const [activePanel, setActivePanel] = useState<"files" | "logs" | "shell">("files");
  const [fileSearch, setFileSearch] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const shellBottomRef = useRef<HTMLDivElement>(null);

  const loadWorkspace = useCallback(async () => {
    try {
      const r = await fetch(`${base}/api/real/workspaces/${slug}`, { credentials: "include" });
      const d = await r.json();
      if (!d.ok) { setError(d.error ?? "Not found"); return; }
      setWorkspace(d.workspace);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [slug, base]);

  useEffect(() => {
    if (slug) loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openFile = async (filePath: string) => {
    setActiveFile(filePath);
    setFileLoading(true);
    setEditMode(false);
    try {
      const r = await fetch(`${base}/api/real/workspaces/${slug}/files/read`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
      const d = await r.json();
      if (d.ok) { setFileContent(d.content); setEditContent(d.content); }
      else setFileContent(`Error: ${d.error}`);
    } catch (e: any) { setFileContent(`Error: ${e.message}`); }
    setFileLoading(false);
  };

  const saveFile = async () => {
    if (!activeFile) return;
    setSaving(true);
    try {
      await fetch(`${base}/api/real/workspaces/${slug}/files/write`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeFile, content: editContent }),
      });
      setFileContent(editContent);
      setEditMode(false);
    } catch {}
    setSaving(false);
  };

  const runShell = async () => {
    if (!shellCmd.trim() || shellRunning) return;
    setShellRunning(true);
    setShellOutput(prev => [...prev, { type: "cmd", text: `$ ${shellCmd}` }]);
    const cmd = shellCmd;
    setShellCmd("");
    try {
      const r = await fetch(`${base}/api/real/workspaces/${slug}/shell`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (ev.type === "stdout" || ev.type === "stderr" || ev.type === "done") {
              setShellOutput(prev => [...prev, ev]);
            }
          } catch {}
        }
      }
    } catch (e: any) { setShellOutput(prev => [...prev, { type: "stderr", text: e.message }]); }
    setShellRunning(false);
    setTimeout(() => shellBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const sendAgentMessage = async () => {
    if (!agentInput.trim() || agentRunning) return;
    const userMsg = agentInput.trim();
    setAgentInput("");
    setAgentRunning(true);

    const userChatMsg: ChatMsg = { role: "user", content: userMsg };
    setMessages(prev => [...prev, userChatMsg]);

    const assistantMsg: ChatMsg = { role: "assistant", content: "", toolCalls: [] };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const historyForApi = messages.slice(-8).map(m => ({ role: m.role, content: m.content }));
      const r = await fetch(`${base}/api/real/workspaces/${slug}/agent`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: historyForApi }),
      });

      const reader = r.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            setMessages(prev => {
              const msgs = [...prev];
              const last = { ...msgs[msgs.length - 1] };

              if (ev.type === "token") {
                last.content += ev.text;
              } else if (ev.type === "tool_call") {
                last.toolCalls = [...(last.toolCalls ?? []), { tool: ev.tool, params: ev.params }];
              } else if (ev.type === "tool_result") {
                const tc = last.toolCalls ?? [];
                const idx = [...tc].reverse().findIndex(t => t.tool === ev.tool && !t.result);
                if (idx >= 0) {
                  const realIdx = tc.length - 1 - idx;
                  last.toolCalls = tc.map((t, i) => i === realIdx ? { ...t, result: ev.result } : t);
                }
              }
              msgs[msgs.length - 1] = last;
              return msgs;
            });
          } catch {}
        }
      }
    } catch (e: any) {
      setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Error: ${e.message}` };
        return msgs;
      });
    }
    setAgentRunning(false);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    loadWorkspace();
  };

  const redeploy = async () => {
    await fetch(`${base}/api/real/workspaces/${slug}/redeploy`, { method: "POST", credentials: "include" });
    setTimeout(loadWorkspace, 2000);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 32, height: 32, border: "3px solid var(--border)", borderTopColor: "#007AFF", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
        <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading workspace…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "var(--fg)", fontSize: 16, marginBottom: 8 }}>Workspace not found</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>{error}</div>
        <button onClick={() => navigate("/processes")} style={{ padding: "8px 16px", borderRadius: 8, background: "#007AFF", color: "#fff", border: "none", cursor: "pointer" }}>← Back to Processes</button>
      </div>
    </div>
  );

  const filteredFiles = (workspace?.files ?? []).filter(f => !fileSearch || f.toLowerCase().includes(fileSearch.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--fg)", fontFamily: "system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
        <button onClick={() => navigate("/processes")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18, padding: 4 }}>←</button>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: workspace?.status === "running" ? "#30d158" : workspace?.status === "crashed" ? "#ff453a" : "#6b7db3", flexShrink: 0 }} />
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{workspace?.name}</span>
          <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>{workspace?.framework} · {workspace?.language}</span>
        </div>
        {workspace?.url && (
          <a href={workspace.url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, color: "#007AFF", textDecoration: "none", background: "#007AFF18", padding: "4px 10px", borderRadius: 6 }}>
            🔗 Open App
          </a>
        )}
        <button onClick={redeploy} style={{ padding: "5px 12px", borderRadius: 7, background: "#22c55e18", border: "1px solid #22c55e40", color: "#22c55e", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↺ Redeploy</button>
        <button onClick={loadWorkspace} style={{ padding: "5px 12px", borderRadius: 7, background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>⟳ Refresh</button>
      </div>

      {/* Main content: 3 columns */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Left: file tree + logs + shell */}
        <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Panel tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border)" }}>
            {(["files", "logs", "shell"] as const).map(p => (
              <button key={p} onClick={() => setActivePanel(p)} style={{
                flex: 1, padding: "8px 4px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: 0.5,
                background: activePanel === p ? "var(--card)" : "transparent",
                color: activePanel === p ? "#007AFF" : "var(--muted)",
                borderBottom: activePanel === p ? "2px solid #007AFF" : "2px solid transparent",
              }}>{p}</button>
            ))}
          </div>

          {activePanel === "files" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                <input value={fileSearch} onChange={e => setFileSearch(e.target.value)} placeholder="Filter files…"
                  style={{ width: "100%", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "var(--fg)", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
                {filteredFiles.map(f => (
                  <button key={f} onClick={() => openFile(f)} title={f} style={{
                    display: "block", width: "100%", textAlign: "left", padding: "5px 12px",
                    border: "none", cursor: "pointer", fontSize: 12, fontFamily: "monospace",
                    background: activeFile === f ? "#007AFF20" : "transparent",
                    color: activeFile === f ? "#007AFF" : "var(--fg)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {fileIcon(f)} {f}
                  </button>
                ))}
                {filteredFiles.length === 0 && <div style={{ padding: 12, color: "var(--muted)", fontSize: 12 }}>No files</div>}
              </div>
            </div>
          )}

          {activePanel === "logs" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 10, fontFamily: "monospace", fontSize: 11, lineHeight: 1.6 }}>
              {(workspace?.recentLogs ?? []).map((l, i) => (
                <div key={i} style={{ color: logColor(l), wordBreak: "break-all" }}>{l}</div>
              ))}
              {(workspace?.recentLogs ?? []).length === 0 && <div style={{ color: "var(--muted)" }}>No logs yet</div>}
            </div>
          )}

          {activePanel === "shell" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: 10, fontFamily: "monospace", fontSize: 11, lineHeight: 1.6 }}>
                {shellOutput.map((o, i) => (
                  <div key={i} style={{ color: o.type === "cmd" ? "#60A5FA" : o.type === "stderr" ? "#ff4444" : o.type === "done" ? "#888" : "#8b9eba", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {o.text}
                  </div>
                ))}
                {shellRunning && <div style={{ color: "#60A5FA" }}>running…</div>}
                <div ref={shellBottomRef} />
              </div>
              <div style={{ borderTop: "1px solid var(--border)", padding: 8, display: "flex", gap: 6 }}>
                <input value={shellCmd} onChange={e => setShellCmd(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && runShell()}
                  placeholder="$ command" disabled={shellRunning}
                  style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "var(--fg)", fontFamily: "monospace" }} />
                <button onClick={runShell} disabled={shellRunning || !shellCmd.trim()}
                  style={{ padding: "6px 10px", borderRadius: 6, background: "#007AFF", border: "none", color: "#fff", cursor: shellRunning ? "not-allowed" : "pointer", fontSize: 12 }}>▶</button>
              </div>
            </div>
          )}
        </div>

        {/* Center: file viewer/editor */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {activeFile ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: "var(--fg)" }}>{fileIcon(activeFile)} {activeFile}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  {editMode ? (
                    <>
                      <button onClick={() => { setEditMode(false); setEditContent(fileContent); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                      <button onClick={saveFile} disabled={saving} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#22c55e", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>{saving ? "Saving…" : "Save"}</button>
                    </>
                  ) : (
                    <button onClick={() => setEditMode(true)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", color: "var(--fg)", cursor: "pointer", fontSize: 12 }}>✏️ Edit</button>
                  )}
                </div>
              </div>
              {fileLoading ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "#007AFF", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                </div>
              ) : editMode ? (
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                  style={{ flex: 1, background: "#0a0e16", color: "#cdd6f4", border: "none", padding: 16, fontFamily: "monospace", fontSize: 13, lineHeight: 1.7, resize: "none", outline: "none" }} />
              ) : (
                <pre style={{ flex: 1, overflow: "auto", margin: 0, padding: 16, background: "#0a0e16", color: "#cdd6f4", fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }}>
                  {fileContent}
                </pre>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 48 }}>📁</div>
              <div style={{ color: "var(--muted)", fontSize: 14 }}>Select a file to view</div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>{workspace?.files.length ?? 0} files in workspace</div>
            </div>
          )}
        </div>

        {/* Right: AI agent chat */}
        <div style={{ width: 380, flexShrink: 0, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>🤖 AI Agent</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Reads files · runs commands · fixes errors</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginTop: 24 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                <div>Ask the agent to:</div>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {["Fix all TypeScript errors", "Install missing dependencies", "Add a health check endpoint", "Review the codebase"].map(s => (
                    <button key={s} onClick={() => setAgentInput(s)}
                      style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--fg)", cursor: "pointer", fontSize: 12, textAlign: "left" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "90%", padding: "10px 14px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: m.role === "user" ? "#007AFF" : "var(--card)",
                  color: m.role === "user" ? "#fff" : "var(--fg)",
                  fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  border: m.role === "assistant" ? "1px solid var(--border)" : "none",
                }}>
                  {m.content || (agentRunning && i === messages.length - 1 ? "…" : "")}
                </div>

                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div style={{ width: "90%", display: "flex", flexDirection: "column", gap: 6 }}>
                    {m.toolCalls.map((tc, ti) => (
                      <div key={ti} style={{ background: "#0a0e16", borderRadius: 10, padding: "8px 12px", border: "1px solid #1e293b", fontSize: 11, fontFamily: "monospace" }}>
                        <div style={{ color: "#60A5FA", marginBottom: 4 }}>🔧 {tc.tool}({JSON.stringify(tc.params)})</div>
                        {tc.result && (
                          <div style={{ color: "#8b9eba", whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto" }}>{tc.result.slice(0, 600)}{tc.result.length > 600 ? "…" : ""}</div>
                        )}
                        {!tc.result && <div style={{ color: "#ffaa00" }}>running…</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <textarea value={agentInput} onChange={e => setAgentInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); } }}
              placeholder="Ask the agent… (Enter to send)" rows={2}
              style={{ flex: 1, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "var(--fg)", resize: "none", outline: "none", fontFamily: "inherit" }} />
            <button onClick={sendAgentMessage} disabled={agentRunning || !agentInput.trim()}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: agentRunning || !agentInput.trim() ? "var(--border)" : "#007AFF", color: "#fff", cursor: agentRunning || !agentInput.trim() ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14, alignSelf: "flex-end" }}>
              {agentRunning ? "…" : "→"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
