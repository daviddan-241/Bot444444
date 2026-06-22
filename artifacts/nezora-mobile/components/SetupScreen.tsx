import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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
import { useColors } from "@/hooks/useColors";

export default function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setCredentials } = useAuth();

  const [url, setUrl] = useState("http://");
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);

  const handleConnect = async () => {
    if (!url.trim() || !token.trim()) { Alert.alert("Missing info", "Enter both the server URL and admin token."); return; }
    setTesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const clean = url.trim().replace(/\/$/, "");
      const res = await fetch(`${clean}/api/healthz`, { headers: { "x-nezora-admin-token": token.trim() }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error("Server returned " + res.status);
      await setCredentials(clean, token.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Connection failed", e.message ?? "Could not reach server.");
    } finally { setTesting(false); }
  };

  return (
    <LinearGradient colors={["#070B14", "#0F1628"]} style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ flex: 1, justifyContent: "center", padding: 28, paddingTop: insets.top + 40 }}>

            {/* Logo */}
            <View style={{ alignItems: "center", marginBottom: 36 }}>
              <LinearGradient colors={["#3B82F6", "#8B5CF6"]} style={{ width: 88, height: 88, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <Feather name="cloud" size={44} color="#fff" />
              </LinearGradient>
              <Text style={{ fontSize: 30, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold" }}>DANNY'S</Text>
              <Text style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", fontFamily: "Inter_400Regular", marginTop: 4 }}>Cloud OS</Text>
            </View>

            <Text style={{ fontSize: 22, fontWeight: "700", color: "#fff", fontFamily: "Inter_700Bold", marginBottom: 6 }}>Connect your server</Text>
            <Text style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", fontFamily: "Inter_400Regular", marginBottom: 28, lineHeight: 22 }}>
              Enter your server URL and admin token to get started.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Server URL</Text>
            <TextInput
              style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15, color: "#fff", fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginBottom: 18 }}
              value={url} onChangeText={setUrl}
              placeholder="http://your-server-ip:8080" placeholderTextColor="rgba(255,255,255,0.25)"
              autoCapitalize="none" autoCorrect={false} keyboardType="url"
            />

            <Text style={{ fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.4)", fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Admin Token</Text>
            <TextInput
              style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 15, color: "#fff", fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", marginBottom: 28 }}
              value={token} onChangeText={setToken}
              placeholder="your-admin-token" placeholderTextColor="rgba(255,255,255,0.25)"
              autoCapitalize="none" autoCorrect={false} secureTextEntry
            />

            <Pressable onPress={handleConnect} disabled={testing} style={({ pressed }) => ({ opacity: pressed || testing ? 0.8 : 1 })}>
              <LinearGradient colors={["#1D4ED8", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16, paddingVertical: 18, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 10 }}>
                {testing ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="zap" size={20} color="#fff" />}
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700", fontFamily: "Inter_700Bold" }}>Connect</Text>
              </LinearGradient>
            </Pressable>

            <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center", marginTop: 20, fontFamily: "Inter_400Regular" }}>
              You can change this later in Settings
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
