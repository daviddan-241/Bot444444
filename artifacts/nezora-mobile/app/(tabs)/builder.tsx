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
}

const STATUS_COLOR: Record<string, string> = {
  running: "#30D158",
  crashed: "#FF453A",
  stopped: "#6B7DB3",
  starting: "#FF9F0A",
  restarting: "#FF9F0A",
};

const FRAMEWORK_ICON: Record<string, string> = {
  nextjs: "triangle",
  "react-vite": "zap",
  vue: "layers",
  "node-express": "server",
  python: "cpu",
  static: "globe",
};

export default function BuilderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { get, post } = useApi();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) { setRefreshing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    try {
      const data = await get("/projects").catch(() => ({ projects: [] }));
      setProjects(data?.projects ?? []);
    } catch {}
    setLoading(false);
    if (manual) setRefreshing(false);
  }, [get]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  const doAction = async (project: Project, action: "start" | "stop" | "restart" | "delete") => {
    if (action === "delete") {
      Alert.alert("Delete App", `Remove ${project.name}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive", onPress: async () => {
            setActionLoading(project.id + action);
            try { await post(`/projects/${project.id}/delete`, {}); await load(); } catch {}
            setActionLoading(null);
          }
        },
      ]);
      return;
    }
    setActionLoading(project.id + action);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await post(`/projects/${project.id}/${action}`, {});
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Action failed");
    }
    setActionLoading(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={["#0F1628", "#070B14"]}
          style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingHorizontal: 20, paddingBottom: 20 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <LinearGradient colors={["#0891B2", "#3B82F6"]} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
              <Feather name="tool" size={20} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Builder</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                {projects.length} app{projects.length !== 1 ? "s" : ""} deployed
              </Text>
            </View>
          </View>
        </LinearGradient>

        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : projects.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 }}>
            <LinearGradient colors={["#1D4ED8", "#7C3AED"]} style={{ width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
              <Feather name="package" size={32} color="#fff" />
            </LinearGradient>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 }}>No apps yet</Text>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 }}>
              Deploy your first app from the Deploy tab using a Git repo.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            {projects.map((p) => {
              const iconName = FRAMEWORK_ICON[p.framework ?? ""] ?? "box";
              const isActing = (action: string) => actionLoading === p.id + action;
              return (
                <View key={p.id} style={{ backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
                      {/* @ts-ignore */}
                      <Feather name={iconName} size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>{p.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_COLOR[p.status] ?? "#6B7DB3" }} />
                        <Text style={{ fontSize: 12, color: STATUS_COLOR[p.status] ?? colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{p.status}</Text>
                        {p.framework && <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>· {p.framework}</Text>}
                        {p.port && <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>· :{p.port}</Text>}
                      </View>
                    </View>
                  </View>

                  {p.url && (
                    <View style={{ backgroundColor: colors.background, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, color: "#3B82F6", fontFamily: "Inter_400Regular" }} numberOfLines={1}>{p.url}</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {p.status !== "running" && (
                      <Pressable
                        onPress={() => doAction(p, "start")}
                        disabled={!!actionLoading}
                        style={({ pressed }) => ({ flex: 1, backgroundColor: "#30D15818", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
                      >
                        {isActing("start") ? <ActivityIndicator size="small" color="#30D158" /> : <Feather name="play" size={15} color="#30D158" />}
                      </Pressable>
                    )}
                    {p.status === "running" && (
                      <Pressable
                        onPress={() => doAction(p, "stop")}
                        disabled={!!actionLoading}
                        style={({ pressed }) => ({ flex: 1, backgroundColor: "#FF9F0A18", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
                      >
                        {isActing("stop") ? <ActivityIndicator size="small" color="#FF9F0A" /> : <Feather name="square" size={15} color="#FF9F0A" />}
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => doAction(p, "restart")}
                      disabled={!!actionLoading}
                      style={({ pressed }) => ({ flex: 1, backgroundColor: "#3B82F618", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
                    >
                      {isActing("restart") ? <ActivityIndicator size="small" color="#3B82F6" /> : <Feather name="refresh-cw" size={15} color="#3B82F6" />}
                    </Pressable>
                    <Pressable
                      onPress={() => doAction(p, "delete")}
                      disabled={!!actionLoading}
                      style={({ pressed }) => ({ flex: 1, backgroundColor: "#FF453A18", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: pressed ? 0.7 : 1 })}
                    >
                      {isActing("delete") ? <ActivityIndicator size="small" color="#FF453A" /> : <Feather name="trash-2" size={15} color="#FF453A" />}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </View>
  );
}
