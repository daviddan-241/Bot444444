import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
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
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const { serverUrl, token, setCredentials, clearCredentials } = useAuth();
  const { get } = useApi();

  const [editUrl, setEditUrl] = useState(serverUrl);
  const [editToken, setEditToken] = useState(token);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pingStatus, setPingStatus] = useState<"idle" | "pinging" | "ok" | "fail">("idle");

  useEffect(() => { setEditUrl(serverUrl); setEditToken(token); }, [serverUrl, token]);

  const ping = async () => {
    setPingStatus("pinging");
    try {
      const data = await get("/system/stats");
      if (data?.cpu !== undefined) {
        setPingStatus("ok");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setPingStatus("idle"), 3000);
      } else { setPingStatus("fail"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    } catch { setPingStatus("fail"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); }
    setTimeout(() => setPingStatus("idle"), 4000);
  };

  const save = async () => {
    if (!editUrl.trim() || !editToken.trim()) { Alert.alert("Missing info", "Both URL and token are required."); return; }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const clean = editUrl.trim().replace(/\/$/, "");
      const res = await fetch(`${clean}/api/healthz`, { headers: { "x-nezora-admin-token": editToken.trim() }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error("Status " + res.status);
      await setCredentials(clean, editToken.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "Connection updated.");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Failed", e.message ?? "Could not verify connection.");
    } finally { setSaving(false); }
  };

  const disconnect = () => {
    Alert.alert("Disconnect", "Removes your saved server and token.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: async () => { await clearCredentials(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
    ]);
  };

  const row = (label: string, value: string, iconName: string, last = false) => (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      {/* @ts-ignore */}
      <Feather name={iconName} size={15} color={colors.mutedForeground} style={{ marginRight: 12 }} />
      <Text style={{ flex: 1, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>{value}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <LinearGradient colors={isDark ? ["#0F1628", "#070B14"] : ["#FFFFFF", "#F2F2F7"]} style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingHorizontal: 20, paddingBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <LinearGradient colors={["#6B7DB3", "#3B82F6"]} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
              <Feather name="settings" size={20} color="#fff" />
            </LinearGradient>
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Settings</Text>
          </View>
        </LinearGradient>

        {/* Ping status */}
        {pingStatus === "ok" && (
          <View style={{ marginHorizontal: 20, marginTop: 16, backgroundColor: "#30D15818", borderRadius: 13, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="check-circle" size={16} color="#30D158" />
            <Text style={{ fontSize: 13, color: "#30D158", fontFamily: "Inter_500Medium" }}>Connected — server is responding</Text>
          </View>
        )}
        {pingStatus === "fail" && (
          <View style={{ marginHorizontal: 20, marginTop: 16, backgroundColor: "#FF453A18", borderRadius: 13, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="alert-circle" size={16} color="#FF453A" />
            <Text style={{ fontSize: 13, color: "#FF453A", fontFamily: "Inter_500Medium" }}>Could not reach server</Text>
          </View>
        )}

        {/* Connection */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 24, marginBottom: 8 }}>Connection</Text>
        <View style={{ backgroundColor: colors.card, borderRadius: 18, marginHorizontal: 20, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Feather name="server" size={15} color={colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput style={{ flex: 1, paddingVertical: 14, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }} value={editUrl} onChangeText={setEditUrl} placeholder="http://your-server:8080" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}>
            <Feather name="key" size={15} color={colors.mutedForeground} style={{ marginRight: 10 }} />
            <TextInput style={{ flex: 1, paddingVertical: 14, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular" }} value={editToken} onChangeText={setEditToken} placeholder="Admin token" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false} secureTextEntry={!showToken} />
            <Pressable onPress={() => setShowToken(v => !v)} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 6 })}>
              <Feather name={showToken ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <View style={{ marginTop: 12, paddingHorizontal: 20, gap: 10 }}>
          <Pressable onPress={save} disabled={saving} style={({ pressed }) => ({ opacity: pressed || saving ? 0.8 : 1 })}>
            <LinearGradient colors={["#1D4ED8", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 15, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={16} color="#fff" />}
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>Save & Reconnect</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={({ pressed }) => ({ backgroundColor: colors.card, borderRadius: 15, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}
            onPress={ping} disabled={pingStatus === "pinging"}
          >
            {pingStatus === "pinging" ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="wifi" size={16} color={colors.primary} />}
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Test Connection</Text>
          </Pressable>
        </View>

        {/* Current info */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 24, marginBottom: 8 }}>Current Server</Text>
        <View style={{ backgroundColor: colors.card, borderRadius: 18, marginHorizontal: 20, overflow: "hidden" }}>
          {row("URL", serverUrl || "—", "link")}
          {row("Token", token ? `${"•".repeat(8)}${token.slice(-4)}` : "—", "lock", true)}
        </View>

        {/* About */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, marginTop: 24, marginBottom: 8 }}>About</Text>
        <View style={{ backgroundColor: colors.card, borderRadius: 18, marginHorizontal: 20, overflow: "hidden" }}>
          {row("App", "Danny's Cloud OS", "cloud")}
          {row("Version", "2.0", "tag")}
          {row("Theme", `${isDark ? "Dark" : "Light"} (system)`, "moon")}
          {row("Platform", Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web", "smartphone", true)}
        </View>

        {/* Disconnect */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Pressable style={({ pressed }) => ({ borderRadius: 15, paddingVertical: 15, alignItems: "center", borderWidth: 1.5, borderColor: "#FF453A40", opacity: pressed ? 0.7 : 1 })} onPress={disconnect}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: "#FF453A", fontFamily: "Inter_600SemiBold" }}>Disconnect Server</Text>
          </Pressable>
        </View>

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
