import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
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
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface SystemStats {
  cpu: number;
  mem: { usedMb: number; totalMb: number; percent: number };
  disk: { usedMb: number; totalMb: number; percent: number };
  uptime: { pretty: string; seconds: number };
  processes: { total: number; running: number; crashed: number };
  workers: { total: number };
  platform: string;
  node: string;
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}>{label}</Text>
      <Text style={{ fontSize: 15, color: valueColor ?? colors.mutedForeground, fontFamily: "Inter_500Medium" }}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 10 }}>
      {title}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ marginHorizontal: 20, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden", paddingHorizontal: 16 }}>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { serverUrl, token, setCredentials, clearCredentials } = useAuth();
  const { get } = useApi();

  const [editUrl, setEditUrl] = useState(serverUrl ?? "");
  const [editToken, setEditToken] = useState(token ?? "");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pingStatus, setPingStatus] = useState<"idle" | "pinging" | "ok" | "fail">("idle");
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => { setEditUrl(serverUrl ?? ""); setEditToken(token ?? ""); }, [serverUrl, token]);

  const loadStats = useCallback(async () => {
    if (!serverUrl) return;
    setLoadingStats(true);
    try {
      const r = await get("/system/stats");
      if (r?.cpu !== undefined) setStats(r);
      const v = await get("/health").catch(() => null);
      if (v?.version) setVersion(v.version);
    } catch {}
    setLoadingStats(false);
  }, [get, serverUrl]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const ping = async () => {
    setPingStatus("pinging");
    try {
      const url = editUrl.trim().replace(/\/$/, "");
      const r = await fetch(`${url}/api/system/stats`, {
        headers: { "x-nezora-admin-token": editToken ?? "" },
      });
      if (r.ok) {
        const d = await r.json();
        if (d.cpu !== undefined) {
          setPingStatus("ok");
          setStats(d);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setPingStatus("fail");
        }
      } else {
        setPingStatus("fail");
      }
    } catch {
      setPingStatus("fail");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const save = async () => {
    setSaving(true);
    const url = editUrl.trim().replace(/\/$/, "");
    const tok = editToken.trim();
    // Test connection first
    try {
      const r = await fetch(`${url}/api/health`, { headers: { "x-nezora-admin-token": tok } });
      if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
      setCredentials(url, tok);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Connected", "Server credentials saved.");
    } catch (e: any) {
      // Save anyway even if ping fails (server might be starting)
      setCredentials(url, tok);
      Alert.alert("Saved", "Credentials saved. Server may be starting up — tap Test Connection to verify.");
    }
    setSaving(false);
  };

  const disconnect = () => {
    Alert.alert("Disconnect", "Remove saved server credentials?", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => { clearCredentials(); setStats(null); setVersion(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
    ]);
  };

  const cpu = Math.round(stats?.cpu ?? 0);
  const ram = Math.round(stats?.mem?.percent ?? 0);
  const disk = Math.round(stats?.disk?.percent ?? 0);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14), paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Settings</Text>
        </View>

        {/* Server connection */}
        <SectionHeader title="Server Connection" />
        <Card>
          {/* Server URL */}
          <View style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Nezora Server URL</Text>
            <TextInput
              style={{ fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}
              value={editUrl}
              onChangeText={setEditUrl}
              placeholder="https://yourserver.replit.dev"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none" autoCorrect={false} keyboardType="url"
            />
          </View>

          {/* Admin token */}
          <View style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Admin Token  <Text style={{ textTransform: "none" }}>(optional)</Text></Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TextInput
                style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}
                value={editUrl === serverUrl && !showToken && editToken ? "••••••••••••" : editToken}
                onChangeText={v => { setEditToken(v); }}
                onFocus={() => setShowToken(true)}
                placeholder="Leave blank for open mode"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none" autoCorrect={false}
                secureTextEntry={!showToken}
              />
              <Pressable onPress={() => setShowToken(v => !v)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Feather name={showToken ? "eye-off" : "eye"} size={17} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 10, paddingVertical: 14 }}>
            <Pressable
              onPress={ping}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center",
                backgroundColor: pingStatus === "ok" ? "#DCFCE7" : pingStatus === "fail" ? "#FEE2E2" : colors.muted,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {pingStatus === "pinging"
                ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                : <Text style={{ fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: pingStatus === "ok" ? "#16A34A" : pingStatus === "fail" ? "#DC2626" : colors.foreground }}>
                    {pingStatus === "ok" ? "✓ Connected" : pingStatus === "fail" ? "✗ Failed" : "Test Connection"}
                  </Text>
              }
            </Pressable>
            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center",
                backgroundColor: "#7C3AED",
                opacity: pressed || saving ? 0.7 : 1,
              })}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: "#fff" }}>Save</Text>
              }
            </Pressable>
          </View>
        </Card>

        {/* Live system stats */}
        {serverUrl && (
          <>
            <SectionHeader title="System Status" />
            <Card>
              {loadingStats && !stats ? (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#7C3AED" />
                </View>
              ) : stats ? (
                <>
                  <Row label="CPU Usage" value={`${cpu}%`} valueColor={cpu > 85 ? "#EF4444" : cpu > 60 ? "#F59E0B" : "#22C55E"} />
                  <Row label="Memory" value={`${stats.mem.usedMb.toFixed(0)} / ${stats.mem.totalMb.toFixed(0)} MB (${ram}%)`} valueColor={ram > 85 ? "#EF4444" : undefined} />
                  <Row label="Disk" value={`${disk}% used`} valueColor={disk > 85 ? "#EF4444" : undefined} />
                  <Row label="Uptime" value={stats.uptime?.pretty ?? "—"} />
                  <Row label="Running processes" value={`${stats.processes?.running ?? 0} / ${stats.processes?.total ?? 0}`} valueColor="#22C55E" />
                  {stats.processes?.crashed > 0 && <Row label="Crashed" value={String(stats.processes.crashed)} valueColor="#EF4444" />}
                  <Row label="Background workers" value={String(stats.workers?.total ?? 0)} />
                  {version && <Row label="Server version" value={version} />}
                  {stats.node && <Row label="Node.js" value={stats.node} />}
                  <View style={{ paddingVertical: 14 }}>
                    <Pressable onPress={loadStats} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, alignItems: "center" })}>
                      <Text style={{ fontSize: 14, color: "#7C3AED", fontFamily: "Inter_500Medium" }}>Refresh stats</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={{ paddingVertical: 20, alignItems: "center" }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>
                    Could not load stats. Check connection.
                  </Text>
                </View>
              )}
            </Card>
          </>
        )}

        {/* Danger zone */}
        {serverUrl && (
          <>
            <SectionHeader title="Danger Zone" />
            <Card>
              <Pressable
                onPress={disconnect}
                style={({ pressed }) => ({ paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.6 : 1 })}
              >
                <Feather name="log-out" size={18} color="#DC2626" />
                <Text style={{ fontSize: 15, color: "#DC2626", fontFamily: "Inter_500Medium" }}>Disconnect from server</Text>
              </Pressable>
            </Card>
          </>
        )}

        {/* About */}
        <SectionHeader title="About" />
        <Card>
          <Row label="App" value="Nezora Cloud" />
          <Row label="Version" value="2.0.0" />
          <Row label="Platform" value={Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"} />
        </Card>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
