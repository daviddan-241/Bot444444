import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApi } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

interface DeployJob {
  id: string;
  name: string;
  slug: string;
  status: "queued" | "running" | "done" | "failed";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  logs?: string[];
  result?: { url?: string; type?: string };
  error?: string;
}

interface Event {
  id: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  sub: string;
  ts: number;
  logs?: string[];
  url?: string;
  error?: string;
  isActive?: boolean;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function logColor(line: string): string {
  if (/error|failed|✗|❌/i.test(line)) return "#EF4444";
  if (/✅|live at|success|deployed|complete/i.test(line)) return "#22C55E";
  if (/warning|warn/i.test(line)) return "#F59E0B";
  if (/cloning|detecting|installing|building|starting/i.test(line)) return "#60A5FA";
  return "#94A3B8";
}

function jobToEvents(job: DeployJob): Event[] {
  const events: Event[] = [];

  if (job.status === "done" && job.result?.url) {
    events.push({
      id: `${job.id}-live`,
      icon: "check-circle",
      iconColor: "#16A34A",
      iconBg: "#DCFCE7",
      title: `Deploy live for ${job.slug ?? job.name}`,
      sub: `Manually triggered · ${timeAgo(job.finishedAt ?? job.createdAt)}`,
      ts: job.finishedAt ?? job.createdAt,
      url: job.result.url,
      logs: job.logs,
    });
  }

  if (job.status === "failed") {
    events.push({
      id: `${job.id}-fail`,
      icon: "x-circle",
      iconColor: "#DC2626",
      iconBg: "#FEE2E2",
      title: `Deploy failed for ${job.slug ?? job.name}`,
      sub: timeAgo(job.finishedAt ?? job.createdAt),
      ts: job.finishedAt ?? job.createdAt,
      error: job.error,
      logs: job.logs,
    });
  }

  if (job.status === "running" || job.status === "queued") {
    events.push({
      id: `${job.id}-running`,
      icon: "upload-cloud",
      iconColor: "#1D4ED8",
      iconBg: "#DBEAFE",
      title: `Deploy in progress: ${job.slug ?? job.name}`,
      sub: `Started ${timeAgo(job.startedAt ?? job.createdAt)}`,
      ts: job.startedAt ?? job.createdAt,
      logs: job.logs,
      isActive: true,
    });
  }

  if (job.createdAt && job.status !== "queued") {
    events.push({
      id: `${job.id}-start`,
      icon: "upload",
      iconColor: "#6B7280",
      iconBg: "#F3F4F6",
      title: `Deploy started for ${job.slug ?? job.name}`,
      sub: `Manually triggered via Dashboard · ${timeAgo(job.createdAt)}`,
      ts: job.createdAt,
    });
  }

  return events;
}

function EventCard({ ev, expanded, onToggle }: { ev: Event; expanded: boolean; onToggle: () => void }) {
  const colors = useColors();

  return (
    <Pressable onPress={onToggle} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
          {/* Icon */}
          <View style={{
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: ev.iconBg,
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {ev.isActive
              ? <ActivityIndicator size="small" color={ev.iconColor} />
              : <Feather name={ev.icon as any} size={18} color={ev.iconColor} />
            }
          </View>

          {/* Content */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", marginBottom: 3 }}>
              {ev.title}
            </Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
              {ev.sub}
            </Text>
            {ev.url && !expanded && (
              <Text style={{ fontSize: 12, color: "#7C3AED", fontFamily: "Inter_400Regular", marginTop: 4 }} numberOfLines={1}>
                {ev.url}
              </Text>
            )}
          </View>

          {(ev.logs?.length || ev.error || ev.url) ? (
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} style={{ marginTop: 4 }} />
          ) : null}
        </View>

        {/* Expanded detail */}
        {expanded && (
          <View style={{ marginTop: 12, marginLeft: 52 }}>
            {ev.url && (
              <View style={{ backgroundColor: "#0D3321", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: "#30D158", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                  🚀 Live at {ev.url}
                </Text>
              </View>
            )}
            {ev.error && (
              <View style={{ backgroundColor: "#2D0A0A", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: "#EF4444", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                  ✗ {ev.error}
                </Text>
              </View>
            )}
            {ev.logs && ev.logs.length > 0 && (
              <View style={{ backgroundColor: "#060B14", borderRadius: 10, padding: 12, maxHeight: 240 }}>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {ev.logs.slice(-60).map((l, i) => (
                    <Text
                      key={i}
                      style={{ fontSize: 11, color: logColor(l), fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", lineHeight: 18 }}
                    >
                      {l}
                    </Text>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function EventsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { get } = useApi();
  const { serverUrl } = useAuth();

  const [jobs, setJobs] = useState<DeployJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) { setRefreshing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    try {
      const r = await get("/real/deploy-jobs");
      if (r?.jobs) setJobs(r.jobs);
    } catch {}
    setLoading(false);
    if (manual) setRefreshing(false);
  }, [get]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  // Build flat event list from jobs
  const events: Event[] = jobs
    .flatMap(j => jobToEvents(j as any))
    .sort((a, b) => b.ts - a.ts);

  const activeCount = jobs.filter(j => j.status === "running" || j.status === "queued").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14),
        paddingHorizontal: 20,
        paddingBottom: 14,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold" }}>Events</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
              Deploy history · live log streaming
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {activeCount > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: "#DBEAFE" }}>
                <ActivityIndicator size="small" color="#1D4ED8" />
                <Text style={{ fontSize: 12, color: "#1D4ED8", fontFamily: "Inter_600SemiBold" }}>{activeCount} live</Text>
              </View>
            )}
            <Pressable onPress={() => load(true)} style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1, padding: 6 })}>
              <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ padding: 60, alignItems: "center", gap: 12 }}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }}>Loading events…</Text>
          </View>
        ) : !serverUrl ? (
          <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
            <Feather name="activity" size={32} color={colors.mutedForeground} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>No server connected</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
              Set your Nezora server URL in Settings to see deploy events.
            </Text>
          </View>
        ) : events.length === 0 ? (
          <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
            <Feather name="inbox" size={32} color={colors.mutedForeground} />
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground, fontFamily: "Inter_600SemiBold", textAlign: "center" }}>No events yet</Text>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" }}>
              Deploy a service to see events appear here.
            </Text>
          </View>
        ) : (
          events.map(ev => (
            <EventCard
              key={ev.id}
              ev={ev}
              expanded={expandedId === ev.id}
              onToggle={() => {
                setExpandedId(prev => prev === ev.id ? null : ev.id);
                Haptics.selectionAsync();
              }}
            />
          ))
        )}

        <View style={{ height: insets.bottom + (Platform.OS === "web" ? 34 : 0) + 90 }} />
      </ScrollView>
    </View>
  );
}
