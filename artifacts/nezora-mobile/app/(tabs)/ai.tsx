import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface Message { id: string; role: "user" | "assistant"; content: string; ts: number; }

const SUGGESTIONS = [
  "Analyze my server CPU usage",
  "Generate a Dockerfile for Node.js",
  "How do I deploy a Python app?",
  "Which apps are using most memory?",
];

export default function AIScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const { post } = useApi();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const data = await post("/ai/chat", { message: content, history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })) });
      const reply: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: data?.reply ?? data?.response ?? data?.message ?? "Sorry, I couldn't process that.", ts: Date.now() };
      setMessages(prev => [...prev, reply]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: "I couldn't reach the API. Make sure the server is running.", ts: Date.now() }]);
    } finally {
      setLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, loading, post]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={{ maxWidth: "82%", alignSelf: isUser ? "flex-end" : "flex-start", marginVertical: 4, marginHorizontal: 16 }}>
        {!isUser && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <LinearGradient colors={["#3B82F6", "#8B5CF6"]} style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" }}>
              <Feather name="cpu" size={11} color="#fff" />
            </LinearGradient>
            <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Cloud OS AI</Text>
          </View>
        )}
        {isUser ? (
          <LinearGradient colors={["#1D4ED8", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 15, color: "#fff", fontFamily: "Inter_400Regular", lineHeight: 22 }}>{item.content}</Text>
          </LinearGradient>
        ) : (
          <View style={{ backgroundColor: colors.card, borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 22 }}>{item.content}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      {/* Header */}
      <LinearGradient colors={isDark ? ["#0F1628", "#070B14"] : ["#FFFFFF", "#F2F2F7"]} style={{ paddingTop: insets.top + (Platform.OS === "web" ? 67 : 20), paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <LinearGradient colors={["#8B5CF6", "#3B82F6"]} style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
            <Feather name="cpu" size={20} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>AI Assistant</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Ollama · Free AI</Text>
          </View>
        </View>
        {messages.length > 0 && (
          <Pressable onPress={() => { setMessages([]); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}>
            <Feather name="trash-2" size={18} color={colors.mutedForeground} />
          </Pressable>
        )}
      </LinearGradient>

      {/* Empty state */}
      {messages.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
          <LinearGradient colors={["#8B5CF6", "#3B82F6"]} style={{ width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <Feather name="cpu" size={32} color="#fff" />
          </LinearGradient>
          <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 }}>How can I help?</Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 28, lineHeight: 21 }}>
            Ask about your deployments, server health, or get help with configs and Dockerfiles.
          </Text>
          <View style={{ width: "100%", gap: 10 }}>
            {SUGGESTIONS.map((s, i) => (
              <Pressable key={i} style={({ pressed }) => ({ backgroundColor: colors.card, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 10, opacity: pressed ? 0.7 : 1 })} onPress={() => send(s)}>
                <Feather name="arrow-right-circle" size={16} color={colors.primary} />
                <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular" }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList ref={listRef} data={messages} keyExtractor={m => m.id} renderItem={renderMessage} contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} />
      )}

      {loading && (
        <View style={{ paddingHorizontal: 20, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Thinking…</Text>
        </View>
      )}

      {/* Input */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0) + (Platform.OS === "web" ? 84 : 16), backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
        <TextInput
          style={{ flex: 1, backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular", maxHeight: 120, borderWidth: 1, borderColor: colors.border }}
          value={input} onChangeText={setInput}
          placeholder="Ask about your cloud…" placeholderTextColor={colors.mutedForeground}
          multiline returnKeyType="send" onSubmitEditing={() => send()} editable={!loading}
        />
        <Pressable
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.8 : 1 })}
          onPress={() => send()} disabled={!input.trim() || loading}
        >
          <LinearGradient colors={input.trim() && !loading ? ["#3B82F6", "#8B5CF6"] : [colors.muted, colors.muted]} style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}>
            <Feather name="arrow-up" size={20} color={input.trim() && !loading ? "#fff" : colors.mutedForeground} />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
