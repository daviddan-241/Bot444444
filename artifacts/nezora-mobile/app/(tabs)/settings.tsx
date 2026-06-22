import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface ServerInfo { version?: string; uptime?: string; cpu?: number; mem?: { percent: number }; }

function Row({ label, value, icon }: { label: string; value: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      {/* @ts-ignore */}
      <Feather name={icon} size={16} color={colors.mutedForeground} style={{ marginRight: 12 }} />
      <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { serverUrl, token, setCredentials, clearCredentials } = useAuth();
  const { get } = useApi();

  const [editUrl, setEditUrl] = useState(serverUrl);
  const [editToken, setEditToken] = useState(token);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    setEditUrl(serverUrl);
    setEditToken(token);
  }, [serverUrl, token]);

  const ping = async () => {
    setPinging(true);
    try {
      const data = await get("/system/stats");
      if (data?.cpu !== undefined) {
        setServerInfo({ cpu: Math.round(data.cpu), mem: { percent: Math.round(data.mem?.percent ?? 0) } });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("Ping failed", "Server responded but returned unexpected data.");
      }
    } catch {
      Alert.alert("Unreachable", "Could not reach the server with current settings.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPinging(false);
    }
  };

  const save = async () => {
    if (!editUrl.trim() || !editToken.trim()) {
      Alert.alert("Missing info", "Both server URL and token are required.");
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const clean = editUrl.trim().replace(/\/$/, "");
      const res = await fetch(`${clean}/api/healthz`, {
        headers: { "x-nezora-admin-token": editToken.trim() },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error("Status " + res.status);
      await setCredentials(clean, editToken.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Connection settings updated.");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Save failed", e.message ?? "Could not verify connection.");
    } finally {
      setSaving(false);
    }
  };

  const disconnect = () => {
    Alert.alert("Disconnect", "This will remove your saved server and token.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect", style: "destructive",
        onPress: async () => {
          await clearCredentials();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16), paddingHorizontal: 20, paddingBottom: 8 },
    title: { fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" },
    sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 24, marginBottom: 8 },
    card: { backgroundColor: colors.card, borderRadius: colors.radius + 2, marginHorizontal: 20, overflow: "hidden" },
    inputRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, paddingVertical: 13, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" },
    saveBtn: { backgroundColor: colors.primary, borderRadius: colors.radius + 2, marginHorizontal: 20, paddingVertical: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
    pingBtn: { backgroundColor: colors.accent, borderRadius: colors.radius + 2, marginHorizontal: 20, paddingVertical: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
    disconnectBtn: { borderRadius: colors.radius + 2, marginHorizontal: 20, paddingVertical: 14, alignItems: "center", borderWidth: 1.5, borderColor: colors.destructive + "60" },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>Settings</Text>
        </View>

        {/* Server info */}
        {serverInfo && (
          <View style={{ marginHorizontal: 20, marginTop: 16, backgroundColor: "#34C75918", borderRadius: colors.radius, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="check-circle" size={16} color="#34C759" />
            <Text style={{ fontSize: 13, color: "#34C759", fontFamily: "Inter_500Medium" }}>
              Connected — CPU {serverInfo.cpu}%, RAM {serverInfo.mem?.percent}%
            </Text>
          </View>
        )}

        {/* Connection */}
        <Text style={s.sectionLabel}>Connection</Text>
        <View style={s.card}>
          <View style={s.inputRow}>
            <Feather name="server" size={16} color={colors.mutedForeground} style={s.inputIcon} />
            <TextInput
              style={s.input}
              value={editUrl}
              onChangeText={setEditUrl}
              placeholder="http://your-server:8080"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <View style={[s.inputRow, { borderBottomWidth: 0 }]}>
            <Feather name="key" size={16} color={colors.mutedForeground} style={s.inputIcon} />
            <TextInput
              style={s.input}
              value={editToken}
              onChangeText={setEditToken}
              placeholder="Admin token"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showToken}
            />
            <Pressable onPress={() => setShowToken(v => !v)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
              <Feather name={showToken ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <Pressable
            style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.8 }, saving && { opacity: 0.7 }]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="save" size={16} color="#fff" />
                <Text style={s.saveBtnText}>Save & Reconnect</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={{ marginTop: 10 }}>
          <Pressable
            style={({ pressed }) => [s.pingBtn, pressed && { opacity: 0.7 }]}
            onPress={ping}
            disabled={pinging}
          >
            {pinging ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <>
                <Feather name="wifi" size={16} color={colors.primary} />
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Test Connection</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Current connection info */}
        <Text style={s.sectionLabel}>Current Server</Text>
        <View style={s.card}>
          <Row label="URL" value={serverUrl || "—"} icon="link" />
          <Row label="Token" value={token ? `${"•".repeat(8)}${token.slice(-4)}` : "—"} icon="lock" />
        </View>

        {/* Appearance */}
        <Text style={s.sectionLabel}>Appearance</Text>
        <View style={s.card}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13 }}>
            <Feather name="moon" size={16} color={colors.mutedForeground} style={{ marginRight: 12 }} />
            <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}>Theme</Text>
            <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {scheme === "dark" ? "Dark" : "Light"} (system)
            </Text>
          </View>
        </View>

        {/* About */}
        <Text style={s.sectionLabel}>About</Text>
        <View style={s.card}>
          <Row label="App" value="Cloud OS Mobile" icon="cloud" />
          <Row label="Version" value="2.0" icon="tag" />
          <Row label="Platform" value={Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"} icon="smartphone" />
        </View>

        {/* Disconnect */}
        <View style={{ marginTop: 24 }}>
          <Pressable
            style={({ pressed }) => [s.disconnectBtn, pressed && { opacity: 0.7 }]}
            onPress={disconnect}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.destructive, fontFamily: "Inter_600SemiBold" }}>Disconnect Server</Text>
          </Pressable>
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
