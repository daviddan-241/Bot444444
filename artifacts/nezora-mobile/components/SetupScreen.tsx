import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
    if (!url.trim() || !token.trim()) {
      Alert.alert("Missing info", "Enter both the server URL and admin token.");
      return;
    }
    setTesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const clean = url.trim().replace(/\/$/, "");
      const res = await fetch(`${clean}/api/healthz`, {
        headers: { "x-nezora-admin-token": token.trim() },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error("Server returned " + res.status);
      await setCredentials(clean, token.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Connection failed", e.message ?? "Could not reach server.");
    } finally {
      setTesting(false);
    }
  };

  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0),
    },
    scroll: { flex: 1 },
    inner: { flex: 1, justifyContent: "center", padding: 24 },
    icon: {
      width: 72, height: 72, borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center", justifyContent: "center",
      alignSelf: "center", marginBottom: 24,
    },
    title: { fontSize: 28, fontWeight: "700", color: colors.foreground, textAlign: "center", fontFamily: "Inter_700Bold" },
    sub: { fontSize: 15, color: colors.mutedForeground, textAlign: "center", marginTop: 8, marginBottom: 36, fontFamily: "Inter_400Regular" },
    label: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground, marginBottom: 6, marginLeft: 2, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
    input: {
      backgroundColor: colors.card, borderRadius: colors.radius,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 15, color: colors.foreground,
      fontFamily: "Inter_400Regular",
      borderWidth: 1, borderColor: colors.border,
      marginBottom: 16,
    },
    btn: {
      backgroundColor: colors.primary, borderRadius: colors.radius,
      paddingVertical: 16, alignItems: "center", marginTop: 8,
      flexDirection: "row", justifyContent: "center", gap: 8,
    },
    btnText: { color: colors.primaryForeground, fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold" },
    hint: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginTop: 20, fontFamily: "Inter_400Regular" },
  });

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={s.scroll} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={s.inner}>
          <View style={s.icon}>
            <Feather name="cloud" size={36} color="#fff" />
          </View>
          <Text style={s.title}>Danny's Cloud OS</Text>
          <Text style={s.sub}>Enter your server URL and admin token to connect</Text>

          <Text style={s.label}>Server URL</Text>
          <TextInput
            style={s.input}
            value={url}
            onChangeText={setUrl}
            placeholder="http://your-server-ip:8080"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={s.label}>Admin Token</Text>
          <TextInput
            style={s.input}
            value={token}
            onChangeText={setToken}
            placeholder="your-admin-token"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <Pressable style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]} onPress={handleConnect} disabled={testing}>
            {testing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Feather name="zap" size={18} color="#fff" />
                <Text style={s.btnText}>Connect</Text>
              </>
            )}
          </Pressable>

          <Text style={s.hint}>You can change this later in Settings</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
