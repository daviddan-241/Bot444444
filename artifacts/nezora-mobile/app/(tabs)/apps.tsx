import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface Project {
  id: string;
  name: string;
  status: string;
  url?: string;
  framework?: string;
  language?: string;
  port?: number;
  createdAt?: string;
}

const STATUS_COLOR: Record<string, string> = {
  running: "#34C759",
  crashed: "#FF3B30",
  stopped: "#8E8E93",
  starting: "#FF9500",
  restarting: "#FF9500",
};

function ProjectCard({ project, onAction }: { project: Project; onAction: (id: string, action: string) => void }) {
  const colors = useColors();
  const dot = STATUS_COLOR[project.status] ?? "#8E8E93";
  const isRunning = project.status === "running";

  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      padding: 16,
      marginBottom: 12,
    }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        {/* Icon */}
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + "18", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
          <Feather name="box" size={20} color={colors.primary} />
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }} numberOfLines={1}>
              {project.name}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: dot }} />
            <Text style={{ fontSize: 13, color: dot, fontFamily: "Inter_500Medium" }}>{project.status}</Text>
            {project.framework && (
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>• {project.framework}</Text>
            )}
          </View>
          {project.url && (
            <Text style={{ fontSize: 12, color: colors.primary, fontFamily: "Inter_400Regular", marginTop: 4 }} numberOfLines={1}>{project.url}</Text>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
        <ActionBtn label={isRunning ? "Stop" : "Start"} icon={isRunning ? "square" : "play"} color={isRunning ? colors.destructive : "#34C759"} onPress={() => onAction(project.id, isRunning ? "stop" : "start")} />
        <ActionBtn label="Restart" icon="refresh-cw" color={colors.primary} onPress={() => onAction(project.id, "restart")} />
        <ActionBtn label="Logs" icon="terminal" color="#8E8E93" onPress={() => onAction(project.id, "logs")} />
        <ActionBtn label="Delete" icon="trash-2" color={colors.destructive} onPress={() => onAction(project.id, "delete")} />
      </View>
    </View>
  );
}

function ActionBtn({ label, icon, color, onPress }: { label: string; icon: string; color: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      style={({ pressed }) => ({
        flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: colors.radius,
        backgroundColor: color + "14", opacity: pressed ? 0.6 : 1,
      })}
      onPress={onPress}
    >
      {/* @ts-ignore */}
      <Feather name={icon} size={16} color={color} />
      <Text style={{ fontSize: 11, color, fontFamily: "Inter_500Medium", marginTop: 3 }}>{label}</Text>
    </Pressable>
  );
}

export default function AppsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { get, post, del } = useApi();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<{ id: string; lines: string[] } | null>(null);

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
      Alert.alert("Delete app", "This will permanently remove the app and its files.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await del(`/projects/${id}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              load();
            } catch { Alert.alert("Error", "Failed to delete app."); }
          },
        },
      ]);
      return;
    }

    if (action === "logs") {
      try {
        const data = await get(`/projects/${id}/logs`);
        setLogs({ id, lines: data?.logs ?? ["No logs available."] });
      } catch { Alert.alert("Error", "Failed to fetch logs."); }
      return;
    }

    try {
      await post(`/projects/${id}/${action}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => load(), 1200);
    } catch { Alert.alert("Error", `Failed to ${action} app.`); }
  };

  const filtered = projects.filter(p =>
    !search.trim() || p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Log viewer modal
  if (logs) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => setLogs(null)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginRight: 12, padding: 4 })}>
            <Feather name="arrow-left" size={22} color={colors.primary} />
          </Pressable>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Logs</Text>
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <View style={{ backgroundColor: "#0D0D0D", borderRadius: colors.radius, padding: 14 }}>
            {logs.lines.map((l, i) => (
              <Text key={i} style={{ fontSize: 12, color: "#EBEBF599", fontFamily: "Inter_400Regular", lineHeight: 18 }}>{l}</Text>
            ))}
          </View>
          <View style={{ height: insets.bottom + 90 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 20, paddingBottom: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Apps</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                {projects.length} app{projects.length !== 1 ? "s" : ""} deployed
              </Text>
            </View>
          </View>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: colors.radius, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}
              value={search}
              onChangeText={setSearch}
              placeholder="Search apps…"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* App list */}
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 48 }}>
              <Feather name="box" size={40} color={colors.mutedForeground} />
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", marginTop: 16 }}>
                {search ? "No matching apps" : "No apps yet"}
              </Text>
              <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 6 }}>
                {search ? "Try a different search term" : "Deploy your first app from the Deploy tab"}
              </Text>
            </View>
          ) : (
            filtered.map(p => <ProjectCard key={p.id} project={p} onAction={handleAction} />)
          )}
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </View>
  );
}
