import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface ServerJob {
  id: string;
  name: string;
  slug: string;
  status: "queued" | "running" | "done" | "failed";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  logs?: string[];
  result?: { url?: string; type?: string };
  error?: string;
}

function logColor(line: string): string {
  if (/error|failed|✗|❌/i.test(line)) return "#EF4444";
  if (/✅|live at|success|deployed|complete/i.test(line)) return "#22C55E";
  if (/warning|warn/i.test(line)) return "#F59E0B";
  if (/cloning|detecting|installing|building|starting/i.test(line)) return "#60A5FA";
  return "#94A3B8";
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

interface EnvEntry { key: string; value: string; }

export default function DeployScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { serverUrl, token } = useAuth();

  // Form state
  const [appName, setAppName] = useState("");
  const [slug, setSlug] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [repoToken, setRepoToken] = useState("");
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>([{ key: "", value: "" }]);

  // Deploy state
  const [deploying, setDeploying] = useState(false);
  const [activeJob, setActiveJob] = useState<ServerJob | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);

  // History state
  const [jobs, setJobs] = useState<ServerJob[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const logScrollRef = useRef<ScrollView>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobId = useRef<string | null>(null);

  const headers = { "Content-Type": "application/json", "x-nezora-admin-token": token ?? "" };

  const fetchJobs = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const r = await fetch(`${serverUrl}/api/real/deploy-jobs`, { headers });
      if (!r.ok) return;
      const d = await r.json();
      if (d.jobs) setJobs(d.jobs);
    } catch {}
  }, [serverUrl, token]);

  const fetchActiveJob = useCallback(async () => {
    const id = activeJobId.current;
    if (!id || !serverUrl) return;
    try {
      const r = await fetch(`${serverUrl}/api/real/deploy-jobs/${id}`, { headers });
      if (!r.ok) return;
      const d = await r.json();
      if (d.job) {
        setActiveJob(d.job);
        if (d.job.logs) setLiveLogs(d.job.logs);
        if (d.job.status === "done" || d.job.status === "failed") {
          activeJobId.current = null;
          setDeploying(false);
          if (d.job.status === "done") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        }
      }
    } catch {}
  }, [serverUrl, token]);

  useEffect(() => {
    fetchJobs();
    pollRef.current = setInterval(() => {
      fetchJobs();
      if (activeJobId.current) fetchActiveJob();
    }, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchJobs, fetchActiveJob]);

  // Auto-scroll logs
  useEffect(() => {
    if (liveLogs.length > 0) {
      setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [liveLogs]);

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  const deploy = async () => {
    const name = appName.trim() || repoUrl.split("/").pop()?.replace(/\.git$/, "") || "app";
    if (!repoUrl.trim()) { Alert.alert("Missing URL", "Enter a Git repository URL."); return; }
    if (!serverUrl) { Alert.alert("No server", "Set your server URL in Settings first."); return; }

    const customSlug = slug.trim() || autoSlug(name);
    const envObj: Record<string, string> = {};
    for (const e of envEntries) {
      if (e.key.trim()) envObj[e.key.trim()] = e.value.trim();
    }

    setDeploying(true);
    setActiveJob(null);
    setLiveLogs([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await fetch(`${serverUrl}/api/real/app-deploy/git`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          slug: customSlug,
          url: repoUrl.trim(),
          branch: branch.trim() || "main",
          token: repoToken.trim() || undefined,
          env: Object.keys(envObj).length > 0 ? envObj : undefined,
        }),
      });
      const data = await res.json();

      if (data.ok && data.jobId) {
        activeJobId.current = data.jobId;
        setExpandedId(null);
        // Clear form
        setAppName(""); setSlug(""); setRepoUrl(""); setBranch("main");
        setRepoToken(""); setEnvEntries([{ key: "", value: "" }]);
        await fetchActiveJob();
      } else {
        setDeploying(false);
        Alert.alert("Deploy failed", data.error ?? data.message ?? "Unknown error");
      }
    } catch (e: any) {
      setDeploying(false);
      Alert.alert("Network error", e.message ?? "Could not reach server");
    }
  };

  const inputStyle = {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.foreground,
    fontFamily: "Inter_400Regular" as const,
    borderWidth: 1,
    borderColor: colors.border,
  };
  const labelStyle = {
    fontSize: 12, fontWeight: "600" as const, color: colors.mutedForeground,
    fontFamily: "Inter_600SemiBold" as const, textTransform: "uppercase" as const,
    letterSpacing: 0.5, marginBottom: 7,
  };

  const validEnvCount = envEntries.filter(e => e.key.trim()).length;
  const activeCount = jobs.filter(j => j.status === "running" || j.status === "queued").length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{
          paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14),
          paddingHorizontal: 20,
          paddingBottom: 16,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Deploy</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                Git repo → live service · auto-detect stack
              </Text>
            </View>
            {activeCount > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: "#DBEAFE" }}>
                <ActivityIndicator size="small" color="#1D4ED8" />
                <Text style={{ fontSize: 12, color: "#1D4ED8", fontFamily: "Inter_600SemiBold" }}>{activeCount} running</Text>
              </View>
            )}
          </View>
        </View>

        {/* Form */}
        <View style={{ paddingHorizontal: 20, paddingTop: 22, gap: 16 }}>
          {/* App Name */}
          <View>
            <Text style={labelStyle}>App Name  <Text style={{ color: colors.mutedForeground, fontWeight: "400", textTransform: "none", letterSpacing: 0 }}>(optional)</Text></Text>
            <TextInput
              style={inputStyle}
              value={appName}
              onChangeText={v => { setAppName(v); if (!slug) {} }}
              placeholder="auto-detected from repo"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none" autoCorrect={false}
            />
          </View>

          {/* Slug */}
          <View>
            <Text style={labelStyle}>Custom URL Slug  <Text style={{ color: colors.mutedForeground, fontWeight: "400", textTransform: "none", letterSpacing: 0 }}>(optional)</Text></Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" }}>
                <Text style={{ paddingLeft: 14, fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>/app/</Text>
                <TextInput
                  style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular", paddingVertical: 13, paddingRight: 14 }}
                  value={slug}
                  onChangeText={v => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder={appName ? autoSlug(appName) : "my-app"}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none" autoCorrect={false}
                />
              </View>
            </View>
          </View>

          {/* Repo URL */}
          <View>
            <Text style={labelStyle}>Repository URL</Text>
            <TextInput
              style={inputStyle}
              value={repoUrl}
              onChangeText={setRepoUrl}
              placeholder="https://github.com/user/repo"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none" autoCorrect={false} keyboardType="url"
            />
          </View>

          {/* Branch + Token */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Branch</Text>
              <TextInput
                style={inputStyle}
                value={branch}
                onChangeText={setBranch}
                placeholder="main"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none" autoCorrect={false}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Token  <Text style={{ color: colors.mutedForeground, fontWeight: "400", textTransform: "none", letterSpacing: 0 }}>(private repos)</Text></Text>
              <TextInput
                style={inputStyle}
                value={repoToken}
                onChangeText={setRepoToken}
                placeholder="ghp_..."
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none" autoCorrect={false}
                secureTextEntry
              />
            </View>
          </View>

          {/* Env Vars accordion */}
          <View>
            <Pressable
              onPress={() => { setShowEnvVars(v => !v); Haptics.selectionAsync(); }}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={labelStyle}>Environment Variables</Text>
                {validEnvCount > 0 && (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: "#7C3AED20" }}>
                    <Text style={{ fontSize: 11, color: "#7C3AED", fontFamily: "Inter_600SemiBold" }}>{validEnvCount}</Text>
                  </View>
                )}
              </View>
              <Feather name={showEnvVars ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </Pressable>

            {showEnvVars && (
              <View style={{ backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
                {envEntries.map((entry, i) => (
                  <View key={i} style={{ flexDirection: "row", borderBottomWidth: i < envEntries.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <TextInput
                      style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: colors.foreground, fontFamily: "Inter_500Medium" }}
                      value={entry.key}
                      onChangeText={v => {
                        const n = [...envEntries];
                        n[i] = { ...n[i], key: v };
                        setEnvEntries(n);
                        if (i === n.length - 1 && v) setEnvEntries([...n, { key: "", value: "" }]);
                      }}
                      placeholder="KEY"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="characters" autoCorrect={false}
                    />
                    <View style={{ width: 1, backgroundColor: colors.border }} />
                    <TextInput
                      style={{ flex: 1.5, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" }}
                      value={entry.value}
                      onChangeText={v => {
                        const n = [...envEntries];
                        n[i] = { ...n[i], value: v };
                        setEnvEntries(n);
                      }}
                      placeholder="value"
                      placeholderTextColor={colors.mutedForeground}
                      autoCapitalize="none" autoCorrect={false}
                    />
                    {i < envEntries.length - 1 && (
                      <Pressable
                        onPress={() => setEnvEntries(envEntries.filter((_, j) => j !== i))}
                        style={{ padding: 12, alignItems: "center", justifyContent: "center" }}
                      >
                        <Feather name="x" size={14} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Deploy button */}
          <Pressable
            onPress={deploy}
            disabled={deploying || !repoUrl.trim()}
            style={({ pressed }) => ({ opacity: pressed || deploying || !repoUrl.trim() ? 0.7 : 1, marginTop: 4 })}
          >
            <LinearGradient
              colors={["#7C3AED", "#5B21B6"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ borderRadius: 14, paddingVertical: 17, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              {deploying
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="zap" size={20} color="#fff" />
              }
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>
                {deploying ? "Deploying…" : "Deploy Now"}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Live deploy log */}
        {(deploying || activeJob) && (
          <View style={{ marginHorizontal: 20, marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {deploying && <ActivityIndicator size="small" color="#7C3AED" />}
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>
                {activeJob?.status === "done"
                  ? "✅ Deployed successfully"
                  : activeJob?.status === "failed"
                  ? "❌ Deploy failed"
                  : "Live Deploy Log"}
              </Text>
            </View>

            {activeJob?.status === "done" && activeJob.result?.url && (
              <View style={{ backgroundColor: "#0D3321", borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="external-link" size={16} color="#30D158" />
                <Text style={{ flex: 1, fontSize: 13, color: "#30D158", fontFamily: "Inter_500Medium" }} numberOfLines={2}>
                  {activeJob.result.url}
                </Text>
              </View>
            )}

            {activeJob?.error && (
              <View style={{ backgroundColor: "#2D0A0A", borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <Text style={{ fontSize: 13, color: "#EF4444", fontFamily: "Inter_500Medium" }}>{activeJob.error}</Text>
              </View>
            )}

            <View style={{ backgroundColor: "#060B14", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#1E293B" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1E293B" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: deploying ? "#3B82F6" : activeJob?.status === "done" ? "#22C55E" : "#EF4444" }} />
                <Text style={{ fontSize: 12, color: "#64748B", fontFamily: "Inter_500Medium" }}>
                  {deploying ? "deploying" : activeJob?.status ?? ""}
                  {activeJob?.startedAt ? `  ·  ${Math.round((Date.now() - activeJob.startedAt) / 1000)}s` : ""}
                </Text>
              </View>
              <ScrollView
                ref={logScrollRef}
                style={{ maxHeight: 300 }}
                showsVerticalScrollIndicator={false}
              >
                <View style={{ padding: 14 }}>
                  {liveLogs.length === 0
                    ? <Text style={{ color: "#4B5563", fontSize: 12, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>Waiting for output…</Text>
                    : liveLogs.map((l, i) => (
                      <Text key={i} style={{ fontSize: 11, color: logColor(l), fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 18 }}>
                        {l}
                      </Text>
                    ))
                  }
                </View>
              </ScrollView>
            </View>
          </View>
        )}

        {/* Deploy history */}
        <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Deploy History</Text>
            {jobs.length > 0 && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: colors.muted }}>
                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{jobs.length}</Text>
              </View>
            )}
          </View>

          {jobs.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 24, alignItems: "center", gap: 10 }}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" }}>
                {serverUrl ? "No deploys yet." : "Set server URL in Settings to see history."}
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: colors.card, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
              {jobs.slice(0, 20).map((j, i) => {
                const badge = j.status === "done"
                  ? { color: "#16A34A", bg: "#DCFCE7", icon: "check-circle" as const }
                  : j.status === "failed"
                  ? { color: "#DC2626", bg: "#FEE2E2", icon: "x-circle" as const }
                  : { color: "#1D4ED8", bg: "#DBEAFE", icon: "upload-cloud" as const };
                const isActive = j.status === "running" || j.status === "queued";
                const expanded = expandedId === j.id;
                const elapsed = j.finishedAt && j.startedAt
                  ? `${Math.round((j.finishedAt - j.startedAt) / 1000)}s`
                  : j.startedAt ? `${Math.round((Date.now() - j.startedAt) / 1000)}s` : "";

                return (
                  <View key={j.id} style={{ borderBottomWidth: i < jobs.slice(0, 20).length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                    <Pressable
                      onPress={() => { setExpandedId(prev => prev === j.id ? null : j.id); Haptics.selectionAsync(); }}
                      style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: badge.bg, alignItems: "center", justifyContent: "center" }}>
                        {isActive
                          ? <ActivityIndicator size="small" color={badge.color} />
                          : <Feather name={badge.icon} size={16} color={badge.color} />
                        }
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                          {j.name ?? j.slug}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                          {isActive ? "deploying…" : j.status}  {elapsed ? `· ${elapsed}` : ""}  · {timeAgo(j.createdAt)} ago
                        </Text>
                      </View>
                      <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                    </Pressable>

                    {expanded && (
                      <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                        {j.result?.url && (
                          <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#0D3321" }}>
                            <Text style={{ fontSize: 12, color: "#30D158", fontFamily: "Inter_500Medium" }}>🚀 {j.result.url}</Text>
                          </View>
                        )}
                        {j.error && (
                          <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#2D0A0A" }}>
                            <Text style={{ fontSize: 12, color: "#EF4444", fontFamily: "Inter_500Medium" }}>✗ {j.error}</Text>
                          </View>
                        )}
                        {j.logs && j.logs.length > 0 && (
                          <View style={{ backgroundColor: "#060B14", padding: 12, maxHeight: 200 }}>
                            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                              {j.logs.slice(-50).map((l, li) => (
                                <Text key={li} style={{ fontSize: 11, color: logColor(l), fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 18 }}>{l}</Text>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
