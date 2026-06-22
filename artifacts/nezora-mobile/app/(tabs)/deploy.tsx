import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

type DeployMode = "git" | "docker";

interface LogLine { text: string; type: "ok" | "err" | "info" | "plain"; }

function classifyLog(line: string): LogLine["type"] {
  if (line.includes("[ERR]") || line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")) return "err";
  if (line.includes("[DEPLOY]") || line.includes("✓") || line.toLowerCase().includes("success")) return "ok";
  if (line.includes("[DETECT]") || line.includes("[BUILD]") || line.includes("[INSTALL]")) return "info";
  return "plain";
}

export default function DeployScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { post } = useApi();

  const [mode, setMode] = useState<DeployMode>("git");
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [dockerImg, setDockerImg] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [result, setResult] = useState<{ ok: boolean; url?: string; error?: string } | null>(null);

  const deploy = async () => {
    const n = name.trim();
    if (!n) { Alert.alert("Missing name", "Enter an app name."); return; }

    if (mode === "git") {
      if (!gitUrl.trim()) { Alert.alert("Missing URL", "Enter a Git repository URL."); return; }
    } else {
      if (!dockerImg.trim()) { Alert.alert("Missing image", "Enter a Docker image name."); return; }
    }

    setDeploying(true);
    setResult(null);
    setLogs([{ text: mode === "git" ? "[DEPLOY] Starting Git deploy…" : "[DEPLOY] Starting Docker deploy…", type: "info" }]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      let data: any;
      if (mode === "git") {
        data = await post("/deploy/git", { name: n, url: gitUrl.trim(), branch: branch.trim() || "main" });
      } else {
        data = await post("/deploy/docker", { name: n, image: dockerImg.trim() });
      }

      const lines: LogLine[] = (data?.logs ?? []).map((l: string) => ({ text: l, type: classifyLog(l) }));
      setLogs(lines.length > 0 ? lines : [{ text: data?.ok ? "[DEPLOY] ✓ Deployed" : `[ERR] ${data?.error ?? "Unknown error"}`, type: data?.ok ? "ok" : "err" }]);
      setResult(data);

      if (data?.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      setLogs([{ text: "[ERR] Network error — is the API server reachable?", type: "err" }]);
      setResult({ ok: false, error: "Network error" });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setDeploying(false);
    }
  };

  const reset = () => {
    setResult(null);
    setLogs([]);
    setName("");
    setGitUrl("");
    setBranch("main");
    setDockerImg("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 20, paddingBottom: 8 },
    title: { fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    sub: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    section: { paddingHorizontal: 20, marginTop: 20 },
    label: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
    input: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      paddingHorizontal: 16, paddingVertical: 13,
      fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular",
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    },
    row: { flexDirection: "row", gap: 10 },
    segBtn: { flex: 1, paddingVertical: 10, borderRadius: colors.radius, alignItems: "center", borderWidth: 1.5 },
    deployBtn: {
      backgroundColor: colors.primary, borderRadius: colors.radius + 2,
      paddingVertical: 16, flexDirection: "row", alignItems: "center",
      justifyContent: "center", gap: 8,
    },
    deployBtnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
    logBox: { backgroundColor: "#0D0D0D", borderRadius: colors.radius, padding: 14, minHeight: 120, maxHeight: 280 },
    logLine: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 19 },
    resultBanner: {
      flexDirection: "row", alignItems: "center", gap: 10,
      padding: 14, borderRadius: colors.radius, marginTop: 12,
    },
    resultText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>Deploy</Text>
          <Text style={s.sub}>Launch a new app from Git or Docker</Text>
        </View>

        {/* Mode selector */}
        <View style={s.section}>
          <Text style={s.label}>Deploy Type</Text>
          <View style={s.row}>
            {(["git", "docker"] as DeployMode[]).map(m => (
              <Pressable
                key={m}
                style={[s.segBtn, {
                  backgroundColor: mode === m ? colors.primary : colors.card,
                  borderColor: mode === m ? colors.primary : colors.border,
                }]}
                onPress={() => { setMode(m); Haptics.selectionAsync(); }}
              >
                <Feather name={m === "git" ? "git-branch" : "package"} size={16} color={mode === m ? "#fff" : colors.mutedForeground} />
                <Text style={{ fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: mode === m ? "#fff" : colors.mutedForeground, marginTop: 3 }}>
                  {m === "git" ? "Git Repo" : "Docker Image"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* App name */}
        <View style={s.section}>
          <Text style={s.label}>App Name</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="my-awesome-app"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Git fields */}
        {mode === "git" && (
          <>
            <View style={s.section}>
              <Text style={s.label}>Repository URL</Text>
              <TextInput
                style={s.input}
                value={gitUrl}
                onChangeText={setGitUrl}
                placeholder="https://github.com/user/repo"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
            <View style={s.section}>
              <Text style={s.label}>Branch</Text>
              <TextInput
                style={s.input}
                value={branch}
                onChangeText={setBranch}
                placeholder="main"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </>
        )}

        {/* Docker fields */}
        {mode === "docker" && (
          <View style={s.section}>
            <Text style={s.label}>Docker Image</Text>
            <TextInput
              style={s.input}
              value={dockerImg}
              onChangeText={setDockerImg}
              placeholder="nginx:latest"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {/* Deploy button */}
        <View style={[s.section, { marginTop: 24 }]}>
          <Pressable
            style={({ pressed }) => [s.deployBtn, pressed && { opacity: 0.8 }, deploying && { opacity: 0.7 }]}
            onPress={deploy}
            disabled={deploying}
          >
            {deploying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="upload-cloud" size={18} color="#fff" />
                <Text style={s.deployBtnText}>Deploy App</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Result banner */}
        {result && (
          <View style={s.section}>
            <View style={[s.resultBanner, { backgroundColor: result.ok ? "#34C75918" : "#FF3B3018" }]}>
              <Feather name={result.ok ? "check-circle" : "x-circle"} size={20} color={result.ok ? "#34C759" : "#FF3B30"} />
              <Text style={[s.resultText, { color: result.ok ? "#34C759" : "#FF3B30" }]}>
                {result.ok ? `Deployed! ${result.url ? `→ ${result.url}` : ""}` : result.error ?? "Deploy failed"}
              </Text>
              <Pressable onPress={reset} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Feather name="rotate-ccw" size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <View style={s.section}>
            <Text style={s.label}>Build Output</Text>
            <View style={s.logBox}>
              {logs.map((l, i) => (
                <Text key={i} style={[s.logLine, {
                  color: l.type === "ok" ? "#34C759" : l.type === "err" ? "#FF453A" : l.type === "info" ? "#64D2FF" : "#EBEBF5AA"
                }]}>
                  {l.text}
                </Text>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
