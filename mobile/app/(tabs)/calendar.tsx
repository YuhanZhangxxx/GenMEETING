import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { format, isToday, isTomorrow, isThisWeek, parseISO } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { useEventsStore } from "@/store/events";
import { Colors } from "@/constants/colors";
import { type MeetingEvent } from "@/lib/api";

function groupEventsByDate(events: MeetingEvent[]) {
  const groups: Record<string, MeetingEvent[]> = {};
  for (const e of events) {
    const key = format(parseISO(e.startTime), "yyyy-MM-dd");
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

function dayLabel(dateStr: string) {
  const d = parseISO(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isThisWeek(d)) return format(d, "EEEE");
  return format(d, "EEEE, MMM d");
}

function rsvpLabel(status: string | null) {
  switch (status) {
    case "accepted": return { label: "Accepted", color: Colors.green, bg: Colors.greenLight };
    case "declined": return { label: "Declined", color: Colors.red, bg: Colors.redLight };
    case "tentative": return { label: "Tentative", color: Colors.amber, bg: Colors.amberLight };
    case "needsAction": return { label: "Pending", color: Colors.amber, bg: Colors.amberLight };
    default: return null;
  }
}

function EventRow({ event }: { event: MeetingEvent }) {
  const router = useRouter();
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const rsvp = rsvpLabel(event.myResponseStatus);
  const sourceColor = event.source === "outlook" ? Colors.microsoft : Colors.primary;

  return (
    <TouchableOpacity
      style={styles.eventRow}
      onPress={() =>
        router.push({
          pathname: "/event/[id]",
          params: { id: event.googleEventId, data: JSON.stringify(event) },
        })
      }
    >
      <View style={[styles.sourceBar, { backgroundColor: sourceColor }]} />
      <View style={styles.eventRowBody}>
        <View style={styles.eventRowTop}>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {event.title}
          </Text>
          {rsvp && !event.isOrganizer && (
            <View style={[styles.rsvpChip, { backgroundColor: rsvp.bg }]}>
              <Text style={[styles.rsvpChipText, { color: rsvp.color }]}>
                {rsvp.label}
              </Text>
            </View>
          )}
          {event.isOrganizer && (
            <View style={styles.organizerChip}>
              <Text style={styles.organizerChipText}>Organizer</Text>
            </View>
          )}
        </View>
        <View style={styles.eventRowMeta}>
          <Ionicons name="time-outline" size={12} color={Colors.slate400} />
          <Text style={styles.eventTime}>
            {format(start, "h:mm")}–{format(end, "h:mm a")}
          </Text>
          {event.attendees.length > 0 && (
            <>
              <Ionicons name="people-outline" size={12} color={Colors.slate400} />
              <Text style={styles.eventTime}>{event.attendees.length}</Text>
            </>
          )}
          {event.meetingLink && (
            <>
              <Ionicons name="videocam-outline" size={12} color={Colors.primary} />
              <Text style={[styles.eventTime, { color: Colors.primary }]}>
                Video
              </Text>
            </>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.slate300} />
    </TouchableOpacity>
  );
}

export default function CalendarScreen() {
  const { events, loading, refresh } = useEventsStore();
  const grouped = groupEventsByDate(events);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity onPress={refresh} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

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
        {events.length === 0 && !loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>No upcoming events</Text>
            <Text style={styles.emptySubtitle}>
              Pull down to sync your calendar
            </Text>
          </View>
        )}

        {grouped.map(([dateKey, dayEvents]) => (
          <View key={dateKey} style={styles.dayGroup}>
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{dayLabel(dateKey)}</Text>
              <Text style={styles.dayDate}>
                {format(parseISO(dateKey + "T00:00:00"), "MMM d")}
              </Text>
            </View>
            {dayEvents.map((e) => (
              <EventRow key={e.googleEventId} event={e} />
            ))}
          </View>
        ))}
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
  refreshBtn: { padding: 4 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 20 },

  empty: { alignItems: "center", gap: 8, paddingVertical: 60 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: Colors.slate700 },
  emptySubtitle: { fontSize: 13, color: Colors.slate500 },

  dayGroup: { gap: 8 },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dayDate: { fontSize: 13, color: Colors.slate400 },

  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.slate200,
    overflow: "hidden",
    paddingRight: 12,
  },
  sourceBar: { width: 4, alignSelf: "stretch" },
  eventRowBody: { flex: 1, padding: 12, gap: 4 },
  eventRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.slate900,
  },
  rsvpChip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rsvpChipText: { fontSize: 11, fontWeight: "600" },
  organizerChip: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.primaryLight,
  },
  organizerChipText: { fontSize: 11, fontWeight: "600", color: Colors.primary },
  eventRowMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventTime: { fontSize: 12, color: Colors.slate500 },
});
