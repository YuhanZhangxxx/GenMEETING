import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/store/auth";
import { useEventsStore } from "@/store/events";
import { Colors } from "@/constants/colors";
import { api, type MeetingEvent, type AISuggestion } from "@/lib/api";
import CreateEventModal from "@/components/CreateEventModal";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function rsvpColor(status: string | null) {
  switch (status) {
    case "accepted": return Colors.green;
    case "declined": return Colors.red;
    case "tentative": return Colors.amber;
    default: return Colors.slate400;
  }
}

function EventChip({ event }: { event: MeetingEvent }) {
  const router = useRouter();
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);

  return (
    <TouchableOpacity
      style={styles.eventChip}
      onPress={() =>
        router.push({
          pathname: "/event/[id]",
          params: { id: event.googleEventId, data: JSON.stringify(event) },
        })
      }
    >
      <View
        style={[
          styles.eventChipBar,
          { backgroundColor: event.source === "outlook" ? Colors.microsoft : Colors.primary },
        ]}
      />
      <View style={styles.eventChipBody}>
        <Text style={styles.eventChipTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={styles.eventChipMeta}>
          <Text style={styles.eventChipTime}>
            {format(start, "h:mm")}–{format(end, "h:mm a")}
          </Text>
          {event.myResponseStatus && (
            <View
              style={[
                styles.rsvpDot,
                { backgroundColor: rsvpColor(event.myResponseStatus) },
              ]}
            />
          )}
          {event.meetingLink && (
            <Ionicons name="videocam-outline" size={12} color={Colors.primary} />
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={Colors.slate400} />
    </TouchableOpacity>
  );
}

const SUGGESTION_META: Record<
  AISuggestion["type"],
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; label: string }
> = {
  reschedule: { icon: "swap-horizontal-outline", color: Colors.primary, bg: Colors.primaryLight, label: "Reschedule" },
  rsvp: { icon: "mail-unread-outline", color: Colors.amber, bg: Colors.amberLight, label: "RSVP" },
  cancel: { icon: "close-circle-outline", color: Colors.red, bg: Colors.redLight, label: "Cancel" },
  conflict: { icon: "warning-outline", color: Colors.red, bg: Colors.redLight, label: "Conflict" },
  info: { icon: "information-circle-outline", color: Colors.purple, bg: Colors.purpleLight, label: "Tip" },
};

export default function HomeScreen() {
  const { user } = useAuth();
  const { events, loading, refresh } = useEventsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHasRun, setAiHasRun] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchAi = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await api.getAIAdvisor();
      setAiSuggestions(data.suggestions ?? []);
      setAiHasRun(true);
    } catch (e) {
      setAiError((e as Error).message);
      setAiHasRun(true);
    } finally {
      setAiLoading(false);
    }
  }, []);

  async function handleAiAction(s: AISuggestion, idx: number) {
    if (!s.eventId || !s.action) return;
    setActingId(`${idx}`);
    try {
      if (s.type === "rsvp" && s.action.response) {
        await api.respondToEvent(s.eventId, s.action.response);
      } else if (s.type === "reschedule" && s.action.newStartTime && s.action.newEndTime) {
        await api.rescheduleEvent(s.eventId, s.action.newStartTime, s.action.newEndTime);
      } else if (s.type === "cancel") {
        await api.cancelEvent(s.eventId);
      }
      await refresh();
      await fetchAi();
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setActingId(null);
    }
  }

  const now = new Date();
  const todayEvents = events.filter((e) => isToday(parseISO(e.startTime)));
  const tomorrowEvents = events.filter((e) =>
    isTomorrow(parseISO(e.startTime))
  );
  const pendingRSVPs = events.filter(
    (e) => !e.isOrganizer && e.myResponseStatus === "needsAction"
  );

  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreate(true)}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Quick stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{todayEvents.length}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{events.length}</Text>
            <Text style={styles.statLabel}>This week</Text>
          </View>
          <View
            style={[
              styles.statCard,
              pendingRSVPs.length > 0 && styles.statCardAlert,
            ]}
          >
            <Text
              style={[
                styles.statNum,
                pendingRSVPs.length > 0 && styles.statNumAlert,
              ]}
            >
              {pendingRSVPs.length}
            </Text>
            <Text style={styles.statLabel}>Pending RSVPs</Text>
          </View>
        </View>

        {/* AI Advisor */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="sparkles" size={14} color={Colors.purple} />
            <Text style={[styles.sectionTitle, { color: Colors.purple }]}>
              AI Advisor
            </Text>
          </View>

          {/* Initial CTA (never analyzed yet) */}
          {!aiHasRun && !aiLoading && (
            <TouchableOpacity
              style={styles.aiCTACard}
              onPress={fetchAi}
              activeOpacity={0.85}
            >
              <View style={styles.aiCTAIcon}>
                <Ionicons name="sparkles" size={22} color="#fff" />
              </View>
              <Text style={styles.aiCTATitle}>Analyze my schedule</Text>
              <Text style={styles.aiCTASub}>
                Get AI suggestions for conflicts, RSVPs, and scheduling
              </Text>
              <View style={styles.aiCTABtn}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.aiCTABtnText}>Run analysis</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Loading */}
          {aiLoading && (
            <View style={styles.aiLoadingCard}>
              <ActivityIndicator size="small" color={Colors.purple} />
              <Text style={styles.aiLoadingText}>
                Analyzing your calendar…
              </Text>
            </View>
          )}

          {/* Error */}
          {aiError && !aiLoading && (
            <View style={styles.aiErrorCard}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.red} />
              <Text style={styles.aiErrorText}>{aiError}</Text>
            </View>
          )}

          {/* Suggestions */}
          {aiSuggestions.map((s, i) => {
            const meta = SUGGESTION_META[s.type];
            const acting = actingId === `${i}`;
            return (
              <View key={i} style={styles.aiCard}>
                <View style={[styles.aiBadge, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={14} color={meta.color} />
                  <Text style={[styles.aiBadgeText, { color: meta.color }]}>
                    {meta.label}
                  </Text>
                </View>
                {s.eventTitle && (
                  <Text style={styles.aiEventTitle} numberOfLines={1}>
                    {s.eventTitle}
                  </Text>
                )}
                <Text style={styles.aiMessage}>{s.message}</Text>
                {s.action && (
                  <TouchableOpacity
                    style={[styles.aiActionBtn, { backgroundColor: meta.color }]}
                    onPress={() => handleAiAction(s, i)}
                    disabled={!!actingId}
                  >
                    <Text style={styles.aiActionText}>
                      {acting ? "Working…" : s.action.label}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Re-analyze (after results) */}
          {aiHasRun && !aiLoading && (
            <TouchableOpacity
              style={styles.aiReanalyzeBtn}
              onPress={fetchAi}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={14} color={Colors.purple} />
              <Text style={styles.aiReanalyzeText}>
                {aiSuggestions.length === 0 && !aiError
                  ? "Re-analyze"
                  : "Re-analyze"}
              </Text>
            </TouchableOpacity>
          )}

          {/* Empty after run */}
          {aiHasRun && !aiLoading && !aiError && aiSuggestions.length === 0 && (
            <View style={styles.aiEmptyCard}>
              <Text style={styles.aiEmptyEmoji}>✨</Text>
              <Text style={styles.aiEmptyText}>
                Your schedule looks good! No suggestions right now.
              </Text>
            </View>
          )}
        </View>

        {/* Today */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Today · {format(now, "MMM d")}
          </Text>
          {todayEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyText}>Free day ahead</Text>
            </View>
          ) : (
            todayEvents.map((e) => <EventChip key={e.googleEventId} event={e} />)
          )}
        </View>

        {/* Tomorrow */}
        {tomorrowEvents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tomorrow</Text>
            {tomorrowEvents.map((e) => (
              <EventChip key={e.googleEventId} event={e} />
            ))}
          </View>
        )}

        {/* Pending RSVPs */}
        {pendingRSVPs.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Needs your response</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingRSVPs.length}</Text>
              </View>
            </View>
            {pendingRSVPs.map((e) => (
              <EventChip key={e.googleEventId} event={e} />
            ))}
          </View>
        )}
      </ScrollView>

      {showCreate && (
        <CreateEventModal
          onClose={() => setShowCreate(false)}
          onSuccess={refresh}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.slate50 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 20 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: { fontSize: 15, color: Colors.slate500 },
  name: { fontSize: 24, fontWeight: "800", color: Colors.slate900 },
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },

  statsRow: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.slate200,
  },
  statCardAlert: {
    borderColor: Colors.amberLight,
    backgroundColor: Colors.amberLight,
  },
  statNum: { fontSize: 24, fontWeight: "800", color: Colors.slate900 },
  statNumAlert: { color: Colors.amber },
  statLabel: { fontSize: 11, color: Colors.slate500, marginTop: 2 },

  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: Colors.slate500, textTransform: "uppercase", letterSpacing: 0.5 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { backgroundColor: Colors.amber, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  eventChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.slate200,
    overflow: "hidden",
  },
  eventChipBar: { width: 4, alignSelf: "stretch" },
  eventChipBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 12, gap: 3 },
  eventChipTitle: { fontSize: 14, fontWeight: "600", color: Colors.slate900 },
  eventChipMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  eventChipTime: { fontSize: 12, color: Colors.slate500 },
  rsvpDot: { width: 6, height: 6, borderRadius: 3 },

  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.slate200,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyEmoji: { fontSize: 32 },
  emptyText: { fontSize: 14, color: Colors.slate500 },

  // AI Advisor
  aiCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.purpleLight,
    padding: 14,
    gap: 8,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiBadgeText: { fontSize: 11, fontWeight: "700" },
  aiEventTitle: { fontSize: 14, fontWeight: "700", color: Colors.slate900 },
  aiMessage: { fontSize: 13, color: Colors.slate700, lineHeight: 18 },
  aiActionBtn: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  aiActionText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  aiLoadingCard: {
    backgroundColor: Colors.purpleLight,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  aiLoadingText: { fontSize: 13, color: Colors.purple, fontWeight: "600" },

  aiErrorCard: {
    backgroundColor: Colors.redLight,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiErrorText: { fontSize: 12, color: Colors.red, flex: 1 },

  // Initial CTA
  aiCTACard: {
    backgroundColor: Colors.purple,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    gap: 8,
    shadowColor: Colors.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  aiCTAIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  aiCTATitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  aiCTASub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  aiCTABtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  aiCTABtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },

  // Re-analyze button
  aiReanalyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.purpleLight,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  aiReanalyzeText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.purple,
  },

  // Empty state
  aiEmptyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.slate100,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  aiEmptyEmoji: { fontSize: 28 },
  aiEmptyText: {
    fontSize: 13,
    color: Colors.slate500,
    textAlign: "center",
  },
});
