import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { api, type ScoredSlot } from "@/lib/api";
import { useEventsStore } from "@/store/events";
import { Colors } from "@/constants/colors";

const DURATIONS = [30, 45, 60] as const;
type Duration = (typeof DURATIONS)[number];

const REASON_ICONS: Record<string, string> = {
  "afternoon window": "☀️",
  "well-spaced": "📏",
  "light day": "😌",
  "one meeting today": "👍",
  "heavy day": "😰",
  "early morning": "🌅",
  "end of day": "🌆",
};

function reasonTag(r: string) {
  const icon = Object.entries(REASON_ICONS).find(([k]) => r.toLowerCase().includes(k.toLowerCase()))?.[1] ?? "•";
  return `${icon} ${r}`;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 70 ? Colors.green : pct >= 45 ? Colors.amber : Colors.red;
  return (
    <View style={styles.scoreBar}>
      <View style={[styles.scoreFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function SuggestionsScreen() {
  const { refresh: refreshEvents } = useEventsStore();
  const [duration, setDuration] = useState<Duration>(60);
  const [slots, setSlots] = useState<ScoredSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRecommendations(duration);
      setSlots(data.slots ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [duration]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  async function handleBook(slot: ScoredSlot) {
    const slotKey = slot.start;
    setBookingId(slotKey);
    try {
      await api.createEvent({
        title: "Meeting",
        startTime: slot.start,
        endTime: slot.end,
        addMeetLink: true,
      });
      await refreshEvents();
      Alert.alert("Booked!", `Meeting scheduled for ${format(parseISO(slot.start), "EEE MMM d 'at' h:mm a")}`);
      fetchSlots();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setBookingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Find Time</Text>
          <Text style={styles.headerSub}>AI-recommended slots</Text>
        </View>
        <TouchableOpacity onPress={fetchSlots} style={styles.refreshBtn} disabled={loading}>
          <Ionicons name="refresh-outline" size={20} color={loading ? Colors.slate400 : Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Duration picker */}
        <View style={styles.durationRow}>
          <Text style={styles.durationLabel}>Meeting length</Text>
          <View style={styles.durationPills}>
            {DURATIONS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setDuration(d)}
                style={[
                  styles.pill,
                  duration === d && styles.pillActive,
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    duration === d && styles.pillTextActive,
                  ]}
                >
                  {d} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Loading */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Analyzing your calendar…</Text>
          </View>
        )}

        {/* Error */}
        {error && !loading && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Slots */}
        {!loading && slots.map((slot, i) => {
          const start = parseISO(slot.start);
          const end = parseISO(slot.end);
          const isBooking = bookingId === slot.start;

          return (
            <View key={slot.start} style={styles.slotCard}>
              {/* Rank badge */}
              <View style={styles.slotHeader}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{i + 1}</Text>
                </View>
                <View style={styles.slotScore}>
                  <ScoreBar score={slot.score} />
                  <Text style={styles.scoreNum}>{Math.round(slot.score)}</Text>
                </View>
              </View>

              {/* Date/time */}
              <Text style={styles.slotDate}>
                {format(start, "EEEE, MMMM d")}
              </Text>
              <Text style={styles.slotTime}>
                {format(start, "h:mm")}–{format(end, "h:mm a")}
              </Text>

              {/* Reason tags */}
              <View style={styles.reasonsRow}>
                {slot.reasons.slice(0, 3).map((r) => (
                  <View key={r} style={styles.reasonTag}>
                    <Text style={styles.reasonTagText}>{reasonTag(r)}</Text>
                  </View>
                ))}
              </View>

              {/* Book button */}
              <TouchableOpacity
                style={[styles.bookBtn, isBooking && styles.bookBtnLoading]}
                onPress={() => handleBook(slot)}
                disabled={!!bookingId}
              >
                {isBooking ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="calendar-outline" size={14} color="#fff" />
                    <Text style={styles.bookBtnText}>Book this slot</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        {!loading && slots.length === 0 && !error && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🤔</Text>
            <Text style={styles.emptyTitle}>No slots found</Text>
            <Text style={styles.emptySubtitle}>
              Your calendar may be fully booked or preferences restrict availability.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.slate50 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate200,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.slate900 },
  headerSub: { fontSize: 12, color: Colors.slate500, marginTop: 1 },
  refreshBtn: { padding: 4 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },

  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  durationLabel: { fontSize: 14, fontWeight: "600", color: Colors.slate700 },
  durationPills: {
    flexDirection: "row",
    backgroundColor: Colors.slate100,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pillActive: { backgroundColor: Colors.primary },
  pillText: { fontSize: 13, fontWeight: "600", color: Colors.slate500 },
  pillTextActive: { color: "#fff" },

  loadingBox: { alignItems: "center", gap: 12, paddingVertical: 40 },
  loadingText: { fontSize: 14, color: Colors.slate500 },

  errorBox: {
    backgroundColor: Colors.redLight,
    borderRadius: 12,
    padding: 14,
  },
  errorText: { color: Colors.red, fontSize: 13, textAlign: "center" },

  slotCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.slate200,
    padding: 16,
    gap: 10,
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rankBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rankText: { fontSize: 12, fontWeight: "700", color: Colors.primary },
  slotScore: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end" },
  scoreBar: {
    width: 80,
    height: 6,
    backgroundColor: Colors.slate100,
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreFill: { height: "100%", borderRadius: 3 },
  scoreNum: { fontSize: 12, fontWeight: "600", color: Colors.slate500, width: 28, textAlign: "right" },

  slotDate: { fontSize: 16, fontWeight: "700", color: Colors.slate900 },
  slotTime: { fontSize: 14, color: Colors.slate500 },

  reasonsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reasonTag: {
    backgroundColor: Colors.slate100,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reasonTagText: { fontSize: 11, color: Colors.slate600 },

  bookBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  bookBtnLoading: { opacity: 0.7 },
  bookBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  empty: { alignItems: "center", gap: 8, paddingVertical: 40 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.slate700 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500, textAlign: "center", lineHeight: 20 },
});
