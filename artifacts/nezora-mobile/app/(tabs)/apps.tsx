import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Project {
  id: string; name: string; status: string;
  url?: string; framework?: string; language?: string; port?: number;
}

interface AgentMsg {
  role: "user" | "assistant"; content: string;
  toolCalls?: { tool: string; params: any; result?: string }[];
}

const STATUS_COLOR: Record<string, string> = {
  running: "#30D158", crashed: "#FF453A",
  stopped: "#6B7DB3", starting: "#FF9F0A", restarting: "#FF9F0A",
};

function AgentModal({ project, onClose, serverUrl, token }: {
  project: Project; onClose: () => void;
  serverUrl: string; token: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<AgentMsg[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const SUGGESTIONS = [
    `Fix all errors in ${project.name}`,
    "Show me the file structure",
    "Run npm install and check for issues",
    "Read the main entry file",
    "Check recent logs",
  ];

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || running) return;
    setInput("");
    setRunning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: AgentMsg = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);

    const assistantMsg: AgentMsg = { role: "assistant", content: "", toolCalls: [] };
    setMessages(prev => [...prev, assistantMsg]);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${serverUrl}/api/real/workspaces/${project.id}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-nezora-admin-token": token },
        body: JSON.stringify({ message: content, history }),
      });

      const reader = res.body!.getReader();
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
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
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
    setRunning(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        {/* Header */}
        <LinearGradient colors={["#0F1628", "#070B14"]} style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <LinearGradient colors={["#8B5CF6", "#3B82F6"]} style={{ width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" }}>
              <Feather name="cpu" size={18} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>
                AI Agent — {project.name}
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                {project.framework} · reads files · runs commands · fixes errors
              </Text>
            </View>
            <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </LinearGradient>

        {/* Messages */}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator={false}>
          {messages.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 32 }}>
              <LinearGradient colors={["#8B5CF6", "#3B82F6"]} style={{ width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Feather name="cpu" size={26} color="#fff" />
              </LinearGradient>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 6 }}>
                Workspace Agent
              </Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 20, lineHeight: 19 }}>
                I can inspect your codebase, fix errors, run commands, and redeploy.
              </Text>
              <View style={{ width: "100%", gap: 8 }}>
                {SUGGESTIONS.map((s, i) => (
                  <Pressable key={i} onPress={() => sendMessage(s)} style={({ pressed }) => ({ backgroundColor: colors.card, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.7 : 1, borderWidth: 1, borderColor: colors.border })}>
                    <Feather name="arrow-right-circle" size={14} color={colors.primary} />
                    <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {messages.map((m, i) => (
            <View key={i} style={{ alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
              <View style={{
                maxWidth: "88%", padding: 12, borderRadius: m.role === "user" ? 16 : 14,
                backgroundColor: m.role === "user" ? "#1D4ED8" : colors.card,
                borderWidth: m.role === "assistant" ? 1 : 0,
                borderColor: colors.border,
              }}>
                <Text style={{ fontSize: 13, color: m.role === "user" ? "#fff" : colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 19 }}>
                  {m.content || (running && i === messages.length - 1 ? "…" : "")}
                </Text>
              </View>

              {m.toolCalls && m.toolCalls.length > 0 && (
                <View style={{ maxWidth: "95%", gap: 6 }}>
                  {m.toolCalls.map((tc, ti) => (
                    <View key={ti} style={{ backgroundColor: "#060B14", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#1e293b" }}>
                      <Text style={{ fontSize: 11, color: "#60A5FA", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginBottom: 4 }}>
                        🔧 {tc.tool}({JSON.stringify(tc.params)})
                      </Text>
                      {tc.result ? (
                        <Text style={{ fontSize: 11, color: "#8b9eba", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 16 }} numberOfLines={8}>
                          {tc.result.slice(0, 400)}{tc.result.length > 400 ? "…" : ""}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 11, color: "#FF9F0A" }}>running…</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + (Platform.OS === "ios" ? 0 : 16), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
          <TextInput
            style={{ flex: 1, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", maxHeight: 100, borderWidth: 1, borderColor: colors.border }}
            value={input} onChangeText={setInput}
            placeholder="Ask agent to fix, inspect, or build…"
            placeholderTextColor={colors.mutedForeground}
            multiline editable={!running}
          />
          <Pressable onPress={() => sendMessage()} disabled={running || !input.trim()}
            style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}>
            <LinearGradient colors={!running && input.trim() ? ["#3B82F6", "#8B5CF6"] : [colors.muted, colors.muted]}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
              {running
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="arrow-up" size={18} color={input.trim() ? "#fff" : colors.mutedForeground} />
              }
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AppCard({ project, onAction }: { project: Project; onAction: (id: string, action: string) => void }) {
  const colors = useColors();
  const dot = STATUS_COLOR[project.status] ?? "#6B7DB3";
  const isRunning = project.status === "running";

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <LinearGradient colors={["#3B82F6", "#8B5CF6"]} style={{ width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
          <Feather name="box" size={20} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }} numberOfLines={1}>{project.name}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: dot }} />
            <Text style={{ fontSize: 12, color: dot, fontFamily: "Inter_500Medium" }}>{project.status}</Text>
            {project.framework && <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>• {project.framework}</Text>}
          </View>
        </View>
      </View>

      {project.url && (
        <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular", marginTop: 10 }} numberOfLines={1}>{project.url}</Text>
      )}

      {/* Primary action: Agent */}
      <Pressable onPress={() => onAction(project.id, "agent")} style={({ pressed }) => ({ marginTop: 12, borderRadius: 12, overflow: "hidden", opacity: pressed ? 0.8 : 1 })}>
        <LinearGradient colors={["#6D28D9", "#3B82F6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10 }}>
          <Feather name="cpu" size={15} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>Open AI Agent Workspace</Text>
        </LinearGradient>
      </Pressable>

      {/* Secondary actions */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        {[
          { label: isRunning ? "Stop" : "Start", icon: isRunning ? "square" : "play", color: isRunning ? "#FF453A" : "#30D158", action: isRunning ? "stop" : "start" },
          { label: "Restart", icon: "refresh-cw", color: "#3B82F6", action: "restart" },
          { label: "Logs", icon: "terminal", color: "#8B5CF6", action: "logs" },
          { label: "Delete", icon: "trash-2", color: "#FF453A", action: "delete" },
        ].map(btn => (
          <Pressable
            key={btn.action}
            style={({ pressed }) => ({ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: btn.color + "18", opacity: pressed ? 0.6 : 1 })}
            onPress={() => onAction(project.id, btn.action)}
          >
            {/* @ts-ignore */}
            <Feather name={btn.icon} size={14} color={btn.color} />
            <Text style={{ fontSize: 11, color: btn.color, fontFamily: "Inter_500Medium", marginTop: 3 }}>{btn.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function AppsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const { get, post, del } = useApi();
  const { serverUrl, token } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<{ name: string; lines: string[] } | null>(null);
  const [agentProject, setAgentProject] = useState<Project | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) { setRefreshing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    try {
      const data = await get("/real/processes");
      const procs = data?.processes ?? [];
      setProjects(procs.map((p: any) => ({
        id: p.id, name: p.name, status: p.status,
        url: p.url, framework: p.framework, language: p.language, port: p.port,
      })));
    } catch {}
    try {
      if (projects.length === 0) {
        const data = await get("/projects");
        setProjects(data?.projects ?? []);
      }
    } catch {}
    setLoading(false);
    if (manual) setRefreshing(false);
  }, [get]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const handleAction = async (id: string, action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === "agent") {
      const p = projects.find(x => x.id === id);
      if (p) setAgentProject(p);
      return;
    }
    if (action === "delete") {
      Alert.alert("Delete app", "This permanently removes the app and its files.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: async () => {
          try { await del(`/projects/${id}`); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); load(); }
          catch { Alert.alert("Error", "Failed to delete."); }
        }},
      ]);
      return;
    }
    if (action === "logs") {
      try {
        const data = await get(`/real/processes/${id}/logs`).catch(() => get(`/projects/${id}/logs`));
        const p = projects.find(x => x.id === id);
        setLogs({ name: p?.name ?? id, lines: data?.logs ?? ["No logs available."] });
      } catch { Alert.alert("Error", "Failed to fetch logs."); }
      return;
    }
    try {
      await post(`/real/processes/${id}/${action}`).catch(() => post(`/projects/${id}/${action}`));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => load(), 1200);
    } catch { Alert.alert("Error", `Failed to ${action}.`); }
  };

  const filtered = projects.filter(p => !search.trim() || p.name.toLowerCase().includes(search.toLowerCase()));

  if (logs) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LinearGradient colors={isDark ? ["#0F1628", "#070B14"] : ["#FFFFFF", "#F2F2F7"]} style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => setLogs(null)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>{logs.name} — Logs</Text>
        </LinearGradient>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <View style={{ backgroundColor: "#080B12", borderRadius: 14, padding: 14 }}>
            {logs.lines.map((l, i) => <Text key={i} style={{ fontSize: 12, color: "#94A3B8", fontFamily: "Inter_400Regular", lineHeight: 18 }}>{l}</Text>)}
          </View>
          <View style={{ height: insets.bottom + 90 }} />
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {agentProject && (
        <AgentModal
          project={agentProject}
          onClose={() => setAgentProject(null)}
          serverUrl={serverUrl}
          token={token}
        />
      )}

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={isDark ? ["#0F1628", "#070B14"] : ["#FFFFFF", "#F2F2F7"]} style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingHorizontal: 20, paddingBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <LinearGradient colors={["#0891B2", "#7C3AED"]} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
              <Feather name="box" size={20} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Apps</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                {projects.filter(p => p.status === "running").length} running · {projects.length} total
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 13, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border }}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={{ flex: 1, paddingVertical: 13, paddingHorizontal: 10, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}
              value={search} onChangeText={setSearch}
              placeholder="Search apps…" placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none" autoCorrect={false} clearButtonMode="while-editing"
            />
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Feather name="box" size={28} color={colors.mutedForeground} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>{search ? "No matches" : "No apps yet"}</Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" }}>
                {search ? "Try a different name" : "Deploy your first app from the Deploy tab"}
              </Text>
            </View>
          ) : (
            filtered.map(p => <AppCard key={p.id} project={p} onAction={handleAction} />)
          )}
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </View>
  );
}
