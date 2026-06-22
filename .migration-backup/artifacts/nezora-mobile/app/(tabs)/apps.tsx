import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useColors } from "@/hooks/useColors";

interface Project {
  id: string; name: string; status: string;
  url?: string; framework?: string; language?: string; port?: number;
}

const STATUS_COLOR: Record<string, string> = {
  running: "#30D158", crashed: "#FF453A",
  stopped: "#6B7DB3", starting: "#FF9F0A", restarting: "#FF9F0A",
};

function AppCard({ project, onAction }: { project: Project; onAction: (id: string, action: string) => void }) {
  const colors = useColors();
  const dot = STATUS_COLOR[project.status] ?? "#6B7DB3";
  const isRunning = project.status === "running";

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12 }}>
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
        <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular", marginTop: 10, marginLeft: 0 }} numberOfLines={1}>{project.url}</Text>
      )}

      <View style={{ flexDirection: "row", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
        {[
          { label: isRunning ? "Stop" : "Start", icon: isRunning ? "square" : "play", color: isRunning ? "#FF453A" : "#30D158", action: isRunning ? "stop" : "start" },
          { label: "Restart", icon: "refresh-cw", color: "#3B82F6", action: "restart" },
          { label: "Logs", icon: "terminal", color: "#8B5CF6", action: "logs" },
          { label: "Delete", icon: "trash-2", color: "#FF453A", action: "delete" },
        ].map(btn => (
          <Pressable
            key={btn.action}
            style={({ pressed }) => ({ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12, backgroundColor: btn.color + "18", opacity: pressed ? 0.6 : 1 })}
            onPress={() => onAction(project.id, btn.action)}
          >
            {/* @ts-ignore */}
            <Feather name={btn.icon} size={15} color={btn.color} />
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

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<{ name: string; lines: string[] } | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) { setRefreshing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    try {
      const data = await get("/projects");
      setProjects(data?.projects ?? []);
    } catch {}
    setLoading(false);
    if (manual) setRefreshing(false);
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        const data = await get(`/projects/${id}/logs`);
        const p = projects.find(x => x.id === id);
        setLogs({ name: p?.name ?? id, lines: data?.logs ?? ["No logs available."] });
      } catch { Alert.alert("Error", "Failed to fetch logs."); }
      return;
    }
    try {
      await post(`/projects/${id}/${action}`);
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
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{projects.length} deployed</Text>
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
