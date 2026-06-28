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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

interface Process {
  id: string;
  name: string;
  status: string;
  url?: string;
  framework?: string;
  language?: string;
  port?: number;
  restarts?: number;
  pid?: number;
  uptime?: number;
}

type FilterTab = "active" | "all";

const RUNTIME_LABEL: Record<string, string> = {
  python: "Python 3",
  python3: "Python 3",
  javascript: "Node",
  node: "Node",
  typescript: "Node",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  php: "PHP",
  java: "Java",
  deno: "Deno",
  bun: "Bun",
};

function runtimeLabel(p: Process): string {
  return (
    RUNTIME_LABEL[p.language ?? ""] ||
    RUNTIME_LABEL[p.framework ?? ""] ||
    (p.language ?? p.framework ?? "App")
  );
}

function timeAgo(ms: number | undefined): string {
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function statusBadge(status: string): { label: string; color: string; bg: string; dot: string } {
  switch (status) {
    case "running":
      return { label: "Deployed", color: "#16A34A", bg: "#DCFCE7", dot: "#22C55E" };
    case "starting":
    case "restarting":
      return { label: "Deploying", color: "#1D4ED8", bg: "#DBEAFE", dot: "#3B82F6" };
    case "crashed":
      return { label: "Failed deploy", color: "#DC2626", bg: "#FEE2E2", dot: "#EF4444" };
    case "stopped":
      return { label: "Suspended", color: "#6B7280", bg: "#F3F4F6", dot: "#9CA3AF" };
    default:
      return { label: status, color: "#6B7280", bg: "#F3F4F6", dot: "#9CA3AF" };
  }
}

function ServiceCard({ p, onRestart, onDelete }: {
  p: Process;
  onRestart: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = statusBadge(p.status);
  const runtime = runtimeLabel(p);
  const isRunning = p.status === "running";
  const isWorker = !p.url || p.port === 0;

  return (
    <View style={{ backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Pressable
        onPress={() => setMenuOpen(v => !v)}
        style={{ paddingHorizontal: 20, paddingVertical: 16 }}
      >
        {/* Service name row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text
            style={{ fontSize: 16, fontWeight: "600", color: "#5B21B6", fontFamily: "Inter_600SemiBold", flex: 1 }}
            numberOfLines={1}
          >
            {p.name}
          </Text>
          <Pressable
            onPress={() => setMenuOpen(v => !v)}
            style={{ padding: 6, marginLeft: 8 }}
          >
            <Feather name="more-horizontal" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Detail rows */}
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ width: 90, fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 }}>STATUS</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              {(p.status === "starting" || p.status === "restarting")
                ? <ActivityIndicator size="small" color={badge.dot} style={{ width: 14, height: 14 }} />
                : <Feather name={isRunning ? "check" : p.status === "crashed" ? "x" : "pause"} size={12} color={badge.color} />
              }
              <Text style={{ fontSize: 13, color: badge.color, fontFamily: "Inter_500Medium" }}>{badge.label}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ width: 90, fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 }}>RUNTIME</Text>
            <View style={{ backgroundColor: colors.muted, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_500Medium" }}>{runtime}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ width: 90, fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 }}>TYPE</Text>
            <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" }}>
              {isWorker ? "Background worker" : "Web service"}
              {p.restarts ? `  ·  ${p.restarts} restart${p.restarts !== 1 ? "s" : ""}` : ""}
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ width: 90, fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.3 }}>UPDATED</Text>
            <Text style={{ fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" }}>
              {timeAgo(p.uptime ? Date.now() - p.uptime * 1000 : undefined)}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Action menu */}
      {menuOpen && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          {p.url && (
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#5B21B620" }}
              onPress={() => { setMenuOpen(false); }}
            >
              <Feather name="external-link" size={14} color="#7C3AED" />
              <Text style={{ fontSize: 13, color: "#7C3AED", fontFamily: "Inter_500Medium" }}>Open</Text>
            </Pressable>
          )}
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#DBEAFE" }}
            onPress={() => { setMenuOpen(false); onRestart(); }}
          >
            <Feather name="refresh-cw" size={14} color="#1D4ED8" />
            <Text style={{ fontSize: 13, color: "#1D4ED8", fontFamily: "Inter_500Medium" }}>Restart</Text>
          </Pressable>
          <Pressable
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#FEE2E2" }}
            onPress={() => { setMenuOpen(false); onDelete(); }}
          >
            <Feather name="trash-2" size={14} color="#DC2626" />
            <Text style={{ fontSize: 13, color: "#DC2626", fontFamily: "Inter_500Medium" }}>Delete</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export default function ServicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { get, post, del } = useApi();
  const { serverUrl } = useAuth();

  const [filter, setFilter] = useState<FilterTab>("active");
  const [search, setSearch] = useState("");
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) { setRefreshing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    try {
      const r = await get("/real/processes");
      const list: Process[] = r?.processes ?? r?.data ?? [];
      setProcesses(list);
    } catch {}
    setLoading(false);
    if (manual) setRefreshing(false);
  }, [get]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const restartProcess = async (id: string) => {
    try {
      await post(`/real/processes/${id}/restart`, {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => load(), 1200);
    } catch { Alert.alert("Error", "Could not restart service."); }
  };

  const deleteProcess = (id: string, name: string) => {
    Alert.alert(
      `Delete "${name}"?`,
      "This will permanently stop the service and remove all its files.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await del(`/real/processes/${id}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setProcesses(prev => prev.filter(p => p.id !== id));
            } catch { Alert.alert("Error", "Could not delete service."); }
          },
        },
      ]
    );
  };

  const filtered = processes.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || (filter === "active" && p.status === "running");
    return matchSearch && matchFilter;
  });

  const activeCount = processes.filter(p => p.status === "running").length;
  const stoppedCount = processes.filter(p => p.status !== "running").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14),
        paddingHorizontal: 20,
        paddingBottom: 0,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Services</Text>
          <Pressable
            onPress={() => load(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1, padding: 6 })}
          >
            <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Filter tabs */}
        <View style={{ flexDirection: "row", gap: 0, marginBottom: 0 }}>
          {([
            ["active", `Active (${activeCount})`],
            ["all", `All (${processes.length})`],
          ] as const).map(([tab, label]) => (
            <Pressable
              key={tab}
              onPress={() => { setFilter(tab); Haptics.selectionAsync(); }}
              style={{
                paddingHorizontal: 16, paddingVertical: 10,
                borderBottomWidth: 2,
                borderBottomColor: filter === tab ? "#7C3AED" : "transparent",
                marginRight: 4,
              }}
            >
              <Text style={{
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
                color: filter === tab ? "#7C3AED" : colors.mutedForeground,
              }}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#7C3AED" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.muted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}
              placeholder="Search services"
              placeholderTextColor={colors.mutedForeground}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Feather name="x" size={15} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>
        </View>

        {loading ? (
          <View style={{ padding: 60, alignItems: "center", gap: 12 }}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>Loading services…</Text>
          </View>
        ) : !serverUrl ? (
          <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
            <Feather name="server" size={32} color={colors.mutedForeground} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>No server connected</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>Set your Nezora server URL in Settings to manage services.</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>
              {processes.length === 0 ? "No services yet" : "No services match your filter"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
              {processes.length === 0
                ? "Go to Deploy to launch your first service from a Git repo."
                : "Try changing the filter or search term."}
            </Text>
          </View>
        ) : (
          filtered.map(p => (
            <ServiceCard
              key={p.id}
              p={p}
              onRestart={() => restartProcess(p.id)}
              onDelete={() => deleteProcess(p.id, p.name)}
            />
          ))
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </View>
  );
}
