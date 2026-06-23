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
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useDeploy, DeployJob } from "@/contexts/DeployContext";
import { useColors } from "@/hooks/useColors";

type DeployMode = "git" | "zip_static";

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

function logColor(line: string) {
  if (/\[ERR\]|error|failed|❌/i.test(line)) return "#FF453A";
  if (/✅|✓|\[OK\]|success|live at|🚀/i.test(line)) return "#30D158";
  if (/🔧|auto-repair|💡/i.test(line)) return "#FF9F0A";
  if (/\[DETECT\]|\[BUILD\]|\[INSTALL\]|🔍|📦|Cloning|Detecting/i.test(line)) return "#60A5FA";
  return "#94A3B8";
}

function ServerJobRow({ job, isExpanded, onToggle }: { job: ServerJob; isExpanded: boolean; onToggle: () => void }) {
  const colors = useColors();
  const elapsed = job.finishedAt && job.startedAt
    ? `${Math.round((job.finishedAt - job.startedAt) / 1000)}s`
    : job.startedAt
      ? `${Math.round((Date.now() - job.startedAt) / 1000)}s`
      : "";

  const isActive = job.status === "running" || job.status === "queued";
  const statusColor = job.status === "done" ? "#30D158" : job.status === "failed" ? "#FF453A" : "#3B82F6";

  return (
    <Pressable onPress={onToggle} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <View style={{ backgroundColor: colors.card, borderRadius: 14, marginBottom: 10, overflow: "hidden", borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? "#3B82F640" : colors.border }}>
        <View style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${statusColor}18`, alignItems: "center", justifyContent: "center" }}>
            {isActive
              ? <ActivityIndicator size="small" color={statusColor} />
              : <Feather name={job.status === "done" ? "check-circle" : "x-circle"} size={18} color={statusColor} />
            }
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>{job.name}</Text>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {isActive ? "deploying…" : job.status} {elapsed ? `· ${elapsed}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: statusColor }}>{job.status}</Text>
            <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
          </View>
        </View>

        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
            {job.result?.url && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#0D3321" }}>
                <Text style={{ fontSize: 12, color: "#30D158", fontFamily: "Inter_500Medium" }}>🚀 {job.result.url}</Text>
              </View>
            )}
            {job.error && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#2D0A0A" }}>
                <Text style={{ fontSize: 12, color: "#FF453A", fontFamily: "Inter_500Medium" }}>✗ {job.error}</Text>
              </View>
            )}
            {job.logs && job.logs.length > 0 && (
              <View style={{ backgroundColor: "#060B14", padding: 12, maxHeight: 180 }}>
                <ScrollView nestedScrollEnabled>
                  {job.logs.map((l, i) => (
                    <Text key={i} style={{ fontSize: 11, color: logColor(l), fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 18 }}>{l}</Text>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function DeployScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const { serverUrl, token } = useAuth();
  const { jobs: localJobs, addJob, updateJob } = useDeploy();

  const [mode, setMode] = useState<DeployMode>("git");
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [deploying, setDeploying] = useState(false);

  const [serverJobs, setServerJobs] = useState<ServerJob[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobId = useRef<string | null>(null);

  const fetchServerJobs = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const r = await fetch(`${serverUrl}/api/jobs`, { headers: { "x-nezora-admin-token": token } });
      if (!r.ok) return;
      const d = await r.json();
      if (d.ok && Array.isArray(d.jobs)) {
        setServerJobs(d.jobs.slice(0, 30));
        // Auto-expand the active job
        const active = d.jobs.find((j: ServerJob) => j.status === "running" || j.status === "queued");
        if (active && expandedId === null) setExpandedId(active.id);
      }
    } catch {}
  }, [serverUrl, token]);

  useEffect(() => {
    fetchServerJobs();
    pollingRef.current = setInterval(fetchServerJobs, 1500);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [fetchServerJobs]);

  const deploy = async () => {
    const n = name.trim();
    if (!n) { Alert.alert("Missing name", "Enter an app name."); return; }
    if (mode === "git" && !gitUrl.trim()) { Alert.alert("Missing URL", "Enter a Git repository URL."); return; }
    if (!serverUrl) { Alert.alert("No server", "Set your server URL in Settings first."); return; }

    setDeploying(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      let endpoint = "";
      let body = "";

      if (mode === "git") {
        endpoint = "/api/jobs/git";
        body = JSON.stringify({ name: n, url: gitUrl.trim(), branch: branch.trim() || "main" });
      } else {
        Alert.alert("ZIP Deploy", "ZIP deploy — use the web dashboard to upload a ZIP file.");
        setDeploying(false);
        return;
      }

      const res = await fetch(`${serverUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-nezora-admin-token": token },
        body,
      });
      const data = await res.json();

      if (data.ok && data.jobId) {
        activeJobId.current = data.jobId;
        setExpandedId(data.jobId);
        // Refresh immediately to show the new job
        await fetchServerJobs();
        // Clear form
        setName(""); setGitUrl(""); setBranch("main");
        Alert.alert("Deploy started", `Job ${data.jobId} is running. Watch logs live in the Code tab.`, [{ text: "OK" }]);
      } else {
        Alert.alert("Deploy failed", data.error ?? data.message ?? "Unknown error");
      }
    } catch (e: any) {
      Alert.alert("Network error", e.message ?? "Could not reach server");
    } finally {
      setDeploying(false);
    }
  };

  const activeServerCount = serverJobs.filter(j => j.status === "running" || j.status === "queued").length;

  const inputStyle = {
    backgroundColor: colors.card, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" as const,
    borderWidth: 1, borderColor: colors.border,
  };
  const labelStyle = {
    fontSize: 12, fontWeight: "600" as const, color: colors.mutedForeground,
    fontFamily: "Inter_600SemiBold" as const, textTransform: "uppercase" as const,
    letterSpacing: 0.5, marginBottom: 7, marginLeft: 2,
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient
          colors={isDark ? ["#0F1628", "#070B14"] : ["#FFFFFF", "#F2F2F7"]}
          style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingHorizontal: 20, paddingBottom: 20 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <LinearGradient colors={["#FF3C00", "#FF6B35"]} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
              <Feather name="upload-cloud" size={20} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Deploy Center</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Real deploys · Live logs · Auto-repair</Text>
            </View>
            <Pressable onPress={fetchServerJobs} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}>
              <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </LinearGradient>

        {/* Live active banner */}
        {activeServerCount > 0 && (
          <View style={{ marginHorizontal: 20, marginTop: 16 }}>
            <LinearGradient colors={["#1D4ED8", "#7C3AED"]} style={{ borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" }}>
                {activeServerCount} deploy{activeServerCount > 1 ? "s" : ""} running on server — watch in Code tab
              </Text>
            </LinearGradient>
          </View>
        )}

        {/* Mode selector */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Text style={labelStyle}>Deploy Type</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {([["git", "git-branch", "Git Repo"], ["zip_static", "archive", "ZIP File"]] as const).map(([m, icon, label]) => (
              <Pressable
                key={m}
                style={({ pressed }) => ({
                  flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center",
                  borderWidth: 2, opacity: pressed ? 0.8 : 1,
                  backgroundColor: mode === m ? colors.primary + "18" : colors.card,
                  borderColor: mode === m ? colors.primary : colors.border,
                })}
                onPress={() => { setMode(m); Haptics.selectionAsync(); }}
              >
                <Feather name={icon} size={18} color={mode === m ? colors.primary : colors.mutedForeground} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: mode === m ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: 4 }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Form */}
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <Text style={labelStyle}>App Name</Text>
          <TextInput style={[inputStyle, { marginBottom: 16 }]} value={name} onChangeText={setName} placeholder="my-app" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} />

          {mode === "git" && (
            <>
              <Text style={labelStyle}>Repository URL</Text>
              <TextInput style={[inputStyle, { marginBottom: 16 }]} value={gitUrl} onChangeText={setGitUrl} placeholder="https://github.com/user/repo" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <Text style={labelStyle}>Branch</Text>
              <TextInput style={[inputStyle, { marginBottom: 16 }]} value={branch} onChangeText={setBranch} placeholder="main" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} />
            </>
          )}

          {mode === "zip_static" && (
            <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border, alignItems: "center", gap: 8 }}>
              <Feather name="archive" size={28} color={colors.mutedForeground} />
              <Text style={{ fontSize: 14, color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>Upload ZIP via web dashboard</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                Open your server URL in a browser, then use the Deploy page to upload a ZIP. Logs will appear here in real time.
              </Text>
            </View>
          )}
        </View>

        {/* Deploy button */}
        {mode === "git" && (
          <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
            <Pressable onPress={deploy} disabled={deploying} style={({ pressed }) => ({ opacity: pressed || deploying ? 0.8 : 1 })}>
              <LinearGradient colors={["#FF3C00", "#FF6B35"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
                {deploying ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="zap" size={20} color="#fff" />}
                <Text style={{ fontSize: 17, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>
                  {deploying ? "Starting deploy…" : "Deploy Now"}
                </Text>
              </LinearGradient>
            </Pressable>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 10 }}>
              Returns instantly · watch logs live in Code tab · auto-repair on errors
            </Text>
          </View>
        )}

        {/* Server deploy history */}
        <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Deploy History</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {serverJobs.length > 0 && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: "#1E293B" }}>
                  <Text style={{ fontSize: 11, color: "#94A3B8", fontFamily: "Inter_500Medium" }}>{serverJobs.length} jobs</Text>
                </View>
              )}
            </View>
          </View>

          {serverJobs.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 24, alignItems: "center", gap: 10 }}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" }}>
                {serverUrl ? "No deploys yet. Start one above!" : "Set server URL in Settings to see deploy history."}
              </Text>
            </View>
          ) : (
            serverJobs.map(j => (
              <ServerJobRow
                key={j.id}
                job={j}
                isExpanded={expandedId === j.id}
                onToggle={() => {
                  setExpandedId(prev => prev === j.id ? null : j.id);
                  Haptics.selectionAsync();
                }}
              />
            ))
          )}
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
