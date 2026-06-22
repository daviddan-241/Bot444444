import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface Stats {
  cpu: number;
  mem: { usedMb: number; totalMb: number; percent: number };
  disk: { usedMb: number; totalMb: number; percent: number };
  uptime: { pretty: string };
  processes: { total: number; running: number; crashed: number };
  containers: { available: boolean; total: number; running: number };
  workers: { total: number };
}

interface Worker { id: string; name: string; status: string; runs: number; }
interface Project { id: string; name: string; status: string; framework?: string; language?: string; }

function MiniStatCard({ label, value, sub, iconName, color }: { label: string; value: string; sub: string; iconName: string; color: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: colors.radius + 2, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + "20", alignItems: "center", justifyContent: "center" }}>
          {/* @ts-ignore */}
          <Feather name={iconName} size={14} color={color} />
        </View>
      </View>
      <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", lineHeight: 28 }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

function ResourceBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_500Medium" }}>{label}</Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ height: 6, width: `${Math.min(pct, 100)}%` as any, backgroundColor: pct > 85 ? colors.destructive : color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { get } = useApi();

  const [stats, setStats] = useState<Stats | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) { setRefreshing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    try {
      const [sr, wr, pr] = await Promise.all([
        get("/system/stats").catch(() => null),
        get("/system/workers").catch(() => ({ ok: false, workers: [] })),
        get("/projects").catch(() => ({ ok: false, projects: [] })),
      ]);
      if (sr?.cpu !== undefined) setStats(sr);
      setWorkers((wr?.workers ?? []).slice(0, 6));
      setProjects((pr?.projects ?? []).slice(0, 6));
    } catch {}
    setLoading(false);
    if (manual) setRefreshing(false);
  }, [get]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const cpu = Math.round(stats?.cpu ?? 0);
  const ram = Math.round(stats?.mem?.percent ?? 0);
  const disk = Math.round(stats?.disk?.percent ?? 0);
  const running = (stats?.processes?.running ?? 0) + (stats?.containers?.running ?? 0);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Connecting…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 20, paddingBottom: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Dashboard</Text>
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                {stats?.uptime?.pretty ? `Up ${stats.uptime.pretty}` : "Fetching data…"}
              </Text>
            </View>
            <Pressable onPress={() => load(true)} style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1, padding: 8 })}>
              <Feather name="refresh-cw" size={20} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        {/* Stat Cards */}
        <View style={{ paddingHorizontal: 20, marginTop: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStatCard label="Running" value={String(running)} sub={`${stats?.processes?.total ?? 0} total`} iconName="activity" color={colors.primary} />
            <MiniStatCard label="CPU" value={`${cpu}%`} sub="Live reading" iconName="cpu" color="#5856D6" />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <MiniStatCard label="RAM" value={`${ram}%`} sub={`${stats?.mem?.usedMb ?? 0} / ${stats?.mem?.totalMb ?? 0} MB`} iconName="database" color="#FF9500" />
            <MiniStatCard label="Workers" value={String(stats?.workers?.total ?? workers.length)} sub="Background" iconName="zap" color="#34C759" />
          </View>
        </View>

        {/* System Resources */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 14 }}>System Resources</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: colors.radius + 2, padding: 16 }}>
            <ResourceBar label="CPU" pct={cpu} color={colors.primary} />
            <ResourceBar label="RAM" pct={ram} color="#FF9500" />
            <ResourceBar label="Disk" pct={disk} color="#34C759" />
          </View>
        </View>

        {/* Workers */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 12 }}>Background Workers</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: colors.radius + 2 }}>
            {workers.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 24 }}>No workers running</Text>
            ) : (
              workers.map((w, i) => (
                <View key={w.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < workers.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: w.status === "error" ? colors.destructive : "#34C759" }} />
                  <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium", marginLeft: 10 }}>{w.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{w.runs ?? 0}×</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Recent Apps */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Deployed Apps</Text>
            <Pressable onPress={() => router.push("/(tabs)/apps")} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_500Medium" }}>See all</Text>
            </Pressable>
          </View>
          <View style={{ backgroundColor: colors.card, borderRadius: colors.radius + 2 }}>
            {projects.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 24 }}>No apps deployed yet</Text>
            ) : (
              projects.map((p, i) => {
                const statusColor: Record<string, string> = { running: "#34C759", crashed: "#FF3B30", stopped: "#8E8E93", starting: "#FF9500", restarting: "#FF9500" };
                return (
                  <View key={p.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < projects.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor[p.status] ?? "#8E8E93" }} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{p.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{p.framework ?? p.language ?? "app"}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: statusColor[p.status] ?? colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{p.status}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </View>
  );
}
