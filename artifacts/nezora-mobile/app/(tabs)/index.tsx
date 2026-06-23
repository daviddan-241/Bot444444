import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useDeploy } from "@/contexts/DeployContext";

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

const STATUS_COLOR: Record<string, string> = {
  running: "#30D158",
  crashed: "#FF453A",
  stopped: "#6B7DB3",
  starting: "#FF9F0A",
  restarting: "#FF9F0A",
};

function GradientCard({ title, sub, iconName, gradientA, gradientB, onPress }: {
  title: string; sub: string; iconName: string;
  gradientA: string; gradientB: string; onPress?: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })} onPress={onPress}>
      <LinearGradient
        colors={[gradientA, gradientB]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ borderRadius: 22, padding: 20, minHeight: 120, justifyContent: "space-between" }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
            {/* @ts-ignore */}
            <Feather name={iconName} size={20} color="#fff" />
          </View>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
            <Feather name="arrow-right" size={14} color="#fff" />
          </View>
        </View>
        <View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>{title}</Text>
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular", marginTop: 2 }}>{sub}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, alignItems: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color, fontFamily: "Inter_700Bold" }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

function MiniBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_500Medium" }}>{label}</Text>
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{pct}%</Text>
      </View>
      <View style={{ height: 5, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ height: 5, width: `${Math.min(pct, 100)}%` as any, backgroundColor: pct > 85 ? "#FF453A" : color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { get } = useApi();
  const { jobs, activeCount } = useDeploy();

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
        get("/system/workers").catch(() => ({ workers: [] })),
        get("/projects").catch(() => ({ projects: [] })),
      ]);
      if (sr?.cpu !== undefined) setStats(sr);
      setWorkers((wr?.workers ?? []).slice(0, 6));
      setProjects((pr?.projects ?? []).slice(0, 5));
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
  const recentJobs = [...jobs].reverse().slice(0, 3);

  if (loading) {
    return (
      <LinearGradient colors={["#070B14", "#0F1628"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Connecting…</Text>
      </LinearGradient>
    );
  }

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
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <LinearGradient colors={["#3B82F6", "#8B5CF6"]} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
                <Feather name="cloud" size={20} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>DANNY'S</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Cloud</Text>
              </View>
            </View>
            <Pressable style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.5 : 1 })}>
              <Feather name="bell" size={17} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginTop: 20 }}>Dashboard</Text>
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
            {stats?.uptime?.pretty ? `Up ${stats.uptime.pretty}` : "Live monitoring active"}
          </Text>
        </LinearGradient>

        {/* Active deploy banner */}
        {activeCount > 0 && (
          <Pressable onPress={() => router.push("/(tabs)/deploy")} style={{ marginHorizontal: 20, marginTop: 16 }}>
            <LinearGradient colors={["#1D4ED8", "#7C3AED"]} style={{ borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#fff", fontFamily: "Inter_600SemiBold" }}>
                {activeCount} deploy{activeCount > 1 ? "s" : ""} running in background…
              </Text>
              <Feather name="arrow-right" size={16} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}

        {/* Stat pills */}
        <View style={{ paddingHorizontal: 20, marginTop: 16, flexDirection: "row", gap: 10 }}>
          <StatPill label="Running" value={String(running)} color={colors.primary} />
          <StatPill label="CPU" value={`${cpu}%`} color="#8B5CF6" />
          <StatPill label="RAM" value={`${ram}%`} color={ram > 80 ? "#FF9F0A" : "#30D158"} />
          <StatPill label="Workers" value={String(workers.length)} color="#06B6D4" />
        </View>

        {/* Feature tiles 2×2 — matching reference image */}
        <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <GradientCard
              title="AI Assistant"
              sub="Ask anything"
              iconName="sun"
              gradientA="#3B82F6"
              gradientB="#8B5CF6"
              onPress={() => router.push("/(tabs)/code")}
            />
            <GradientCard
              title="Collaboration"
              sub="Work together"
              iconName="users"
              gradientA="#1D4ED8"
              gradientB="#3B82F6"
              onPress={() => router.push("/(tabs)/builder")}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <GradientCard
              title="Analytics"
              sub={`CPU ${cpu}% · RAM ${ram}%`}
              iconName="bar-chart-2"
              gradientA="#7C3AED"
              gradientB="#3B82F6"
              onPress={() => {}}
            />
            <GradientCard
              title="Security"
              sub="All systems secure"
              iconName="shield"
              gradientA="#6D28D9"
              gradientB="#8B5CF6"
              onPress={() => router.push("/(tabs)/settings")}
            />
          </View>
        </View>

        {/* System resources */}
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 14 }}>System Resources</Text>
          <View style={{ backgroundColor: colors.card, borderRadius: 18, padding: 18 }}>
            <MiniBar label="CPU" pct={cpu} color="#3B82F6" />
            <MiniBar label="RAM" pct={ram} color={ram > 80 ? "#FF9F0A" : "#30D158"} />
            <MiniBar label="Disk" pct={disk} color="#8B5CF6" />
          </View>
        </View>

        {/* Recent deploys */}
        {recentJobs.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Recent Deploys</Text>
              <Pressable onPress={() => router.push("/(tabs)/deploy")} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_500Medium" }}>See all</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: colors.card, borderRadius: 18, overflow: "hidden" }}>
              {recentJobs.map((j, i) => (
                <View key={j.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < recentJobs.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: j.status === "success" ? "#30D15820" : j.status === "failed" ? "#FF453A20" : "#3B82F620", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                    {j.status === "deploying" ? <ActivityIndicator size="small" color="#3B82F6" /> : <Feather name={j.status === "success" ? "check" : "x"} size={15} color={j.status === "success" ? "#30D158" : "#FF453A"} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{j.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{j.mode} deploy</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: j.status === "success" ? "#30D158" : j.status === "failed" ? "#FF453A" : "#3B82F6" }}>{j.status}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Deployed apps */}
        {projects.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Live Apps</Text>
              <Pressable onPress={() => router.push("/(tabs)/builder")} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Text style={{ fontSize: 14, color: colors.primary, fontFamily: "Inter_500Medium" }}>See all</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: colors.card, borderRadius: 18, overflow: "hidden" }}>
              {projects.map((p, i) => (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < projects.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_COLOR[p.status] ?? "#6B7DB3", marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{p.framework ?? p.language ?? "app"}</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: STATUS_COLOR[p.status] ?? colors.mutedForeground }}>{p.status}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Workers */}
        {workers.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 12 }}>Background Workers</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 18, overflow: "hidden" }}>
              {workers.map((w, i) => (
                <View key={w.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < workers.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: w.status === "error" ? "#FF453A" : "#30D158", marginRight: 12 }} />
                  <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: "Inter_500Medium" }}>{w.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{w.runs ?? 0}×</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </View>
  );
}
