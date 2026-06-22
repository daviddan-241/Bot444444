import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
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

type DeployMode = "git" | "docker";

function classifyColor(line: string) {
  if (line.includes("[ERR]") || line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")) return "#FF453A";
  if (line.includes("✓") || line.toLowerCase().includes("success") || line.includes("[DEPLOY]")) return "#30D158";
  if (line.includes("[DETECT]") || line.includes("[BUILD]") || line.includes("[INSTALL]")) return "#60A5FA";
  return "#94A3B8";
}

function JobRow({ job }: { job: DeployJob }) {
  const colors = useColors();
  const elapsed = job.finishedAt
    ? `${Math.round((job.finishedAt - job.startedAt) / 1000)}s`
    : `${Math.round((Date.now() - job.startedAt) / 1000)}s ago`;

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{
          width: 34, height: 34, borderRadius: 10,
          backgroundColor: job.status === "success" ? "#30D15818" : job.status === "failed" ? "#FF453A18" : "#3B82F618",
          alignItems: "center", justifyContent: "center",
        }}>
          <Feather
            name={job.status === "success" ? "check-circle" : job.status === "failed" ? "x-circle" : "loader"}
            size={18}
            color={job.status === "success" ? "#30D158" : job.status === "failed" ? "#FF453A" : "#3B82F6"}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{job.name}</Text>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{job.mode} · {elapsed}</Text>
        </View>
        <Text style={{ fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: job.status === "success" ? "#30D158" : job.status === "failed" ? "#FF453A" : "#3B82F6" }}>
          {job.status}
        </Text>
      </View>
      {job.status === "failed" && job.error && (
        <Text style={{ fontSize: 12, color: "#FF453A", fontFamily: "Inter_400Regular", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          {job.error}
        </Text>
      )}
      {job.status === "success" && job.url && (
        <Text style={{ fontSize: 12, color: "#3B82F6", fontFamily: "Inter_400Regular", marginTop: 8 }} numberOfLines={1}>{job.url}</Text>
      )}
      {job.logs && job.logs.length > 0 && (
        <View style={{ backgroundColor: "#080B12", borderRadius: 8, padding: 10, marginTop: 10, maxHeight: 120 }}>
          {job.logs.slice(-8).map((l, i) => (
            <Text key={i} style={{ fontSize: 11, color: classifyColor(l), fontFamily: "Inter_400Regular", lineHeight: 17 }}>{l}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function DeployScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const { serverUrl, token } = useAuth();
  const { jobs, addJob, updateJob, clearFinished, activeCount } = useDeploy();

  const [mode, setMode] = useState<DeployMode>("git");
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [dockerImg, setDockerImg] = useState("");

  const fireAndForget = async () => {
    const n = name.trim();
    if (!n) { Alert.alert("Missing name", "Enter an app name."); return; }
    if (mode === "git" && !gitUrl.trim()) { Alert.alert("Missing URL", "Enter a Git repository URL."); return; }
    if (mode === "docker" && !dockerImg.trim()) { Alert.alert("Missing image", "Enter a Docker image name."); return; }

    const jobId = `job_${Date.now()}`;
    const job: Omit<DeployJob, "startedAt"> = {
      id: jobId,
      name: n,
      mode,
      status: "deploying",
    };

    await addJob(job);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Clear form so user can start another deploy
    setName("");
    setGitUrl("");
    setBranch("main");
    setDockerImg("");

    // Fire request — doesn't block the UI at all
    const doFetch = async () => {
      try {
        let endpoint = "";
        let body = "";

        if (mode === "git") {
          endpoint = "/api/real/git-instant";
          body = JSON.stringify({ name: n, url: gitUrl.trim(), branch: branch.trim() || "main" });
        } else {
          // Docker: not supported without Docker daemon — inform user
          await updateJob(jobId, {
            status: "failed",
            error: "Docker deploy requires Docker on the server. Use Git deploy for public repos.",
            finishedAt: Date.now(),
          });
          return;
        }

        const res = await fetch(`${serverUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-nezora-admin-token": token },
          body,
        });
        const data = await res.json();
        await updateJob(jobId, {
          status: data?.ok ? "success" : "failed",
          url: data?.url,
          error: data?.ok ? undefined : (data?.message ?? data?.error ?? "Deploy failed"),
          logs: data?.commands?.map((c: any) => `[${c.code === 0 ? "OK" : "ERR"}] ${c.command}`) ?? data?.logs,
          finishedAt: Date.now(),
        });
      } catch (e: any) {
        await updateJob(jobId, {
          status: "failed",
          error: e.message ?? "Network error",
          finishedAt: Date.now(),
        });
      }
    };

    // Intentional fire-and-forget: no await
    doFetch();
  };

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
            <View>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Deploy</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Tap deploy, leave — it runs on your server</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Active jobs pill */}
        {activeCount > 0 && (
          <View style={{ marginHorizontal: 20, marginTop: 16 }}>
            <LinearGradient colors={["#FF3C00", "#FF6B35"]} style={{ borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" }}>
                {activeCount} deploy{activeCount > 1 ? "s" : ""} running on your server
              </Text>
            </LinearGradient>
          </View>
        )}

        {/* Mode selector */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Text style={labelStyle}>Deploy Type</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {(["git", "docker"] as DeployMode[]).map(m => (
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
                {/* @ts-ignore */}
                <Feather name={m === "git" ? "git-branch" : "package"} size={18} color={mode === m ? colors.primary : colors.mutedForeground} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: mode === m ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold", marginTop: 4 }}>
                  {m === "git" ? "Git Repo" : "Docker"}
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

          {mode === "docker" && (
            <>
              <Text style={labelStyle}>Docker Image</Text>
              <TextInput style={[inputStyle, { marginBottom: 16 }]} value={dockerImg} onChangeText={setDockerImg} placeholder="nginx:latest" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} />
            </>
          )}
        </View>

        {/* Deploy button */}
        <View style={{ paddingHorizontal: 20, marginTop: 4 }}>
          <Pressable onPress={fireAndForget} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <LinearGradient colors={["#FF3C00", "#FF6B35"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Feather name="zap" size={20} color="#fff" />
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>Deploy Now</Text>
            </LinearGradient>
          </Pressable>
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 10 }}>
            Runs on your server — safe to close this screen
          </Text>
        </View>

        {/* Job history */}
        {jobs.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Deploy History</Text>
              <Pressable onPress={clearFinished} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Clear done</Text>
              </Pressable>
            </View>
            {[...jobs].reverse().map(j => <JobRow key={j.id} job={j} />)}
          </View>
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
