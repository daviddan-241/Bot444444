import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

interface Message { id: string; role: "user" | "assistant"; content: string; ts: number; }

interface ServerJob {
  id: string;
  name: string;
  status: "queued" | "running" | "done" | "failed";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  logs: string[];
  result?: { url?: string };
  error?: string;
}

const SUGGESTIONS = [
  "Generate a Node.js Express server",
  "Write a Python Flask API with health check",
  "Create a Dockerfile for this project",
  "Review my deployment config",
  "How do I add a custom domain?",
  "Optimize my server for production",
];

function logColor(line: string) {
  if (/\[ERR\]|error|failed|❌/i.test(line)) return "#FF453A";
  if (/✅|✓|\[OK\]|success|live at|🚀/i.test(line)) return "#30D158";
  if (/🔧|auto-repair|💡/i.test(line)) return "#FF9F0A";
  if (/\[DETECT\]|\[BUILD\]|\[INSTALL\]|🔍|📦|Cloning|Detecting/i.test(line)) return "#60A5FA";
  return "#94A3B8";
}

function LiveLogPanel({ serverUrl, token }: { serverUrl: string; token: string }) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const [jobs, setJobs] = useState<ServerJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ServerJob | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const r = await fetch(`${serverUrl}/api/jobs`, {
        headers: { "x-nezora-admin-token": token },
      });
      if (!r.ok) return;
      const d = await r.json();
      if (d.ok && Array.isArray(d.jobs)) {
        setJobs(d.jobs.slice(0, 20));
        setSelectedJob(prev => {
          const updated = d.jobs.find((j: ServerJob) => j.id === prev?.id);
          return updated ?? (d.jobs[0] ?? null);
        });
      }
    } catch {}
  }, [serverUrl, token]);

  useEffect(() => {
    fetchJobs();
    pollingRef.current = setInterval(fetchJobs, 1000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchJobs]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
  }, [selectedJob?.logs?.length]);

  if (!serverUrl) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Feather name="server" size={36} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" }}>
          Set your server URL in Settings first.
        </Text>
      </View>
    );
  }

  if (jobs.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 }}>
        <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: "#1A2235", alignItems: "center", justifyContent: "center" }}>
          <Feather name="activity" size={28} color="#3B82F6" />
        </View>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 17 }}>No deploys yet</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 }}>
          Start a deploy from the Deploy tab. Logs stream here live, line by line.
        </Text>
        <Pressable onPress={fetchJobs} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="refresh-cw" size={14} color={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 13 }}>Refresh</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Job selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        {jobs.map(j => (
          <Pressable
            key={j.id}
            onPress={() => { setSelectedJob(j); Haptics.selectionAsync(); }}
            style={({ pressed }) => ({
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, opacity: pressed ? 0.7 : 1,
              backgroundColor: selectedJob?.id === j.id ? (j.status === "failed" ? "#FF453A22" : j.status === "done" ? "#30D15822" : "#3B82F622") : colors.card,
              borderWidth: 1.5,
              borderColor: selectedJob?.id === j.id ? (j.status === "failed" ? "#FF453A" : j.status === "done" ? "#30D158" : "#3B82F6") : colors.border,
              flexDirection: "row", alignItems: "center", gap: 6,
            })}
          >
            {j.status === "running" || j.status === "queued" ? (
              <ActivityIndicator size="small" color="#3B82F6" style={{ transform: [{ scale: 0.7 }] }} />
            ) : (
              <Feather
                name={j.status === "done" ? "check-circle" : "x-circle"}
                size={12}
                color={j.status === "done" ? "#30D158" : "#FF453A"}
              />
            )}
            <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: selectedJob?.id === j.id ? colors.foreground : colors.mutedForeground }} numberOfLines={1}>
              {j.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Log terminal */}
      <View style={{ flex: 1, margin: 12, backgroundColor: "#060B14", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#1A2235" }}>
        {/* Terminal header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1A2235", gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: selectedJob?.status === "failed" ? "#FF453A" : selectedJob?.status === "done" ? "#30D158" : "#FF9F0A" }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#94A3B8", fontFamily: "Inter_500Medium", fontSize: 12 }} numberOfLines={1}>
              {selectedJob?.name ?? "—"} · job:{selectedJob?.id?.slice(-8) ?? "—"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {(selectedJob?.status === "running" || selectedJob?.status === "queued") && (
              <ActivityIndicator size="small" color="#3B82F6" />
            )}
            <Text style={{
              fontSize: 11, fontFamily: "Inter_600SemiBold",
              color: selectedJob?.status === "failed" ? "#FF453A" : selectedJob?.status === "done" ? "#30D158" : "#3B82F6",
            }}>
              {selectedJob?.status ?? "—"}
            </Text>
          </View>
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }} showsVerticalScrollIndicator={false}>
          {(selectedJob?.logs ?? []).length === 0 ? (
            <View style={{ alignItems: "center", paddingTop: 24, gap: 8 }}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={{ color: "#475569", fontFamily: "Inter_400Regular", fontSize: 12 }}>Waiting for logs…</Text>
            </View>
          ) : (
            (selectedJob?.logs ?? []).map((line, i) => (
              <Text key={i} style={{ fontSize: 11.5, color: logColor(line), fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 19 }}>
                {line}
              </Text>
            ))
          )}
          {selectedJob?.status === "done" && selectedJob.result?.url && (
            <View style={{ marginTop: 12, backgroundColor: "#0D3321", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#30D15840" }}>
              <Text style={{ color: "#30D158", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>🚀 Live: {selectedJob.result.url}</Text>
            </View>
          )}
          {selectedJob?.status === "failed" && selectedJob.error && (
            <View style={{ marginTop: 12, backgroundColor: "#2D0A0A", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#FF453A40" }}>
              <Text style={{ color: "#FF453A", fontFamily: "Inter_500Medium", fontSize: 12 }}>✗ {selectedJob.error}</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

export default function CodeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { post } = useApi();
  const { serverUrl, token } = useAuth();

  const [tab, setTab] = useState<"ai" | "logs">("ai");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const data = await post("/ai/chat", {
        message: content,
        history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
        systemContext: "You are a coding assistant and DevOps expert for Danny's Cloud platform. Help with code generation, deployment configs, Dockerfiles, and server management. When there are errors in deploys, suggest concrete fixes.",
      });
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data?.reply ?? data?.response ?? data?.message ?? "Sorry, I couldn't process that.",
        ts: Date.now(),
      };
      setMessages(prev => [...prev, reply]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Couldn't reach the AI. Make sure the server URL is configured in Settings.",
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, post, messages]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={{ maxWidth: "85%", alignSelf: isUser ? "flex-end" : "flex-start", marginVertical: 4, marginHorizontal: 16 }}>
        {!isUser && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <LinearGradient colors={["#3B82F6", "#8B5CF6"]} style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" }}>
              <Feather name="code" size={11} color="#fff" />
            </LinearGradient>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cloud AI</Text>
          </View>
        )}
        {isUser ? (
          <LinearGradient colors={["#1D4ED8", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 15, color: "#fff", fontFamily: "Inter_400Regular", lineHeight: 22 }}>{item.content}</Text>
          </LinearGradient>
        ) : (
          <View style={{ backgroundColor: colors.card, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 22 }}>{item.content}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      {/* Header */}
      <LinearGradient
        colors={["#0F1628", "#070B14"]}
        style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingHorizontal: 20, paddingBottom: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <LinearGradient colors={["#8B5CF6", "#3B82F6"]} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
            <Feather name="code" size={20} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Code</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>AI Assistant · Live Deploy Logs</Text>
          </View>
          {tab === "ai" && messages.length > 0 && (
            <Pressable onPress={() => { setMessages([]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}>
              <Feather name="trash-2" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Tab switcher */}
        <View style={{ flexDirection: "row", backgroundColor: "#111827", borderRadius: 12, padding: 3 }}>
          {([["ai", "message-circle", "AI Chat"], ["logs", "activity", "Deploy Logs"]] as const).map(([key, icon, label]) => (
            <Pressable
              key={key}
              onPress={() => { setTab(key); Haptics.selectionAsync(); }}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: tab === key ? "#1E293B" : "transparent" }}
            >
              <Feather name={icon} size={14} color={tab === key ? "#fff" : colors.mutedForeground} />
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: tab === key ? "#fff" : colors.mutedForeground }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {/* AI Chat tab */}
      {tab === "ai" && (
        <>
          {messages.length === 0 ? (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
              <LinearGradient colors={["#8B5CF6", "#3B82F6"]} style={{ width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <Feather name="code" size={32} color="#fff" />
              </LinearGradient>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 }}>AI Coding Assistant</Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 24, lineHeight: 21 }}>
                Ask me to write code, fix errors, generate Dockerfiles, or debug deploys.
              </Text>
              <View style={{ width: "100%", gap: 8 }}>
                {SUGGESTIONS.map((s, i) => (
                  <Pressable key={i} style={({ pressed }) => ({ backgroundColor: colors.card, borderRadius: 12, padding: 13, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.7 : 1 })} onPress={() => send(s)}>
                    <Feather name="terminal" size={14} color={colors.primary} />
                    <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={m => m.id}
              renderItem={renderMessage}
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          {loading && (
            <View style={{ paddingHorizontal: 20, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Thinking…</Text>
            </View>
          )}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + (Platform.OS === "web" ? 84 : 16), backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TextInput
              style={{ flex: 1, backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular", maxHeight: 120, borderWidth: 1, borderColor: colors.border }}
              value={input}
              onChangeText={setInput}
              placeholder="Ask me to write code…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => send()}
              editable={!loading}
            />
            <Pressable
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
              onPress={() => send()}
              disabled={!input.trim() || loading}
            >
              <LinearGradient
                colors={input.trim() && !loading ? ["#3B82F6", "#8B5CF6"] : [colors.muted, colors.muted]}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
              >
                <Feather name="arrow-up" size={20} color={input.trim() && !loading ? "#fff" : colors.mutedForeground} />
              </LinearGradient>
            </Pressable>
          </View>
        </>
      )}

      {/* Deploy Logs tab */}
      {tab === "logs" && (
        <LiveLogPanel serverUrl={serverUrl} token={token} />
      )}
    </KeyboardAvoidingView>
  );
}
