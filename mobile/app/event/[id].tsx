import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { api, type MeetingEvent } from "@/lib/api";
import { useEventsStore } from "@/store/events";
import { Colors } from "@/constants/colors";

const RESPONSE_LABELS = {
  accepted: { label: "Accepted", color: Colors.green, bg: Colors.greenLight, icon: "checkmark-circle" as const },
  declined: { label: "Declined", color: Colors.red, bg: Colors.redLight, icon: "close-circle" as const },
  tentative: { label: "Tentative", color: Colors.amber, bg: Colors.amberLight, icon: "help-circle" as const },
  needsAction: { label: "Awaiting", color: Colors.slate400, bg: Colors.slate100, icon: "time-outline" as const },
};

export default function EventDetailScreen() {
  const { data } = useLocalSearchParams<{ id: string; data: string }>();
  const router = useRouter();
  const { refresh } = useEventsStore();

  const [event, setEvent] = useState<MeetingEvent>(JSON.parse(data ?? "{}"));
  const [responding, setResponding] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const durationMin = differenceInMinutes(end, start);
  const statusInfo = RESPONSE_LABELS[event.myResponseStatus as keyof typeof RESPONSE_LABELS] ?? RESPONSE_LABELS.needsAction;

  async function handleRespond(response: "accepted" | "declined" | "tentative") {
    setResponding(response);
    try {
      await api.respondToEvent(event.googleEventId, response);
      const updated = { ...event, myResponseStatus: response };
      setEvent(updated);
      await refresh();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setResponding(null);
    }
  }

  async function handleCancel() {
    Alert.alert(
      "Cancel Meeting",
      "This will cancel the meeting and notify attendees.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Meeting",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              await api.cancelEvent(event.googleEventId);
              await refresh();
              router.back();
            } catch (e) {
              Alert.alert("Error", (e as Error).message);
              setCancelling(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {/* Title & meta */}
      <Text style={styles.title}>{event.title}</Text>

      <View style={styles.metaRow}>
        <View
          style={[
            styles.sourceBadge,
            {
              backgroundColor:
                event.source === "outlook" ? Colors.microsoft + "20" : Colors.primaryLight,
            },
          ]}
        >
          <Ionicons
            name={event.source === "outlook" ? "mail-outline" : "logo-google"}
            size={12}
            color={event.source === "outlook" ? Colors.microsoft : Colors.primary}
          />
          <Text
            style={[
              styles.sourceBadgeText,
              {
                color:
                  event.source === "outlook" ? Colors.microsoft : Colors.primary,
              },
            ]}
          >
            {event.source === "outlook" ? "Outlook" : "Google Calendar"}
          </Text>
        </View>

        {event.isOrganizer && (
          <View style={styles.organizerBadge}>
            <Text style={styles.organizerBadgeText}>Organizer</Text>
          </View>
        )}
      </View>

      {/* Date & time */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
          <View>
            <Text style={styles.cardRowLabel}>Date</Text>
            <Text style={styles.cardRowValue}>
              {format(start, "EEEE, MMMM d, yyyy")}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.cardRow}>
          <Ionicons name="time-outline" size={18} color={Colors.primary} />
          <View>
            <Text style={styles.cardRowLabel}>Time</Text>
            <Text style={styles.cardRowValue}>
              {format(start, "h:mm a")} – {format(end, "h:mm a")}
              {"  "}
              <Text style={styles.duration}>
                ({durationMin < 60
                  ? `${durationMin} min`
                  : `${durationMin / 60} hr${durationMin > 60 ? "s" : ""}`})
              </Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Meet link */}
      {event.meetingLink && (
        <TouchableOpacity
          style={styles.meetBtn}
          onPress={() => Linking.openURL(event.meetingLink!)}
        >
          <Ionicons name="videocam-outline" size={18} color="#fff" />
          <Text style={styles.meetBtnText}>Join Meeting</Text>
        </TouchableOpacity>
      )}

      {/* My RSVP status */}
      {!event.isOrganizer && event.myResponseStatus && (
        <View style={[styles.statusBar, { backgroundColor: statusInfo.bg }]}>
          <Ionicons name={statusInfo.icon} size={16} color={statusInfo.color} />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            Your response: {statusInfo.label}
          </Text>
        </View>
      )}

      {/* Attendees */}
      {event.attendees.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Attendees ({event.attendees.length})
          </Text>
          {event.attendees.map((a) => {
            const att = RESPONSE_LABELS[a.responseStatus as keyof typeof RESPONSE_LABELS] ?? RESPONSE_LABELS.needsAction;
            return (
              <View key={a.email} style={styles.attendeeRow}>
                <View style={styles.attendeeAvatar}>
                  <Text style={styles.attendeeAvatarText}>
                    {a.email[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.attendeeEmail} numberOfLines={1}>
                  {a.email}
                  {a.self ? " (you)" : ""}
                </Text>
                <View style={[styles.attRsvp, { backgroundColor: att.bg }]}>
                  <Ionicons name={att.icon} size={11} color={att.color} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Organizer email */}
      {event.organizerEmail && !event.isOrganizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organized by</Text>
          <Text style={styles.organizerEmail}>{event.organizerEmail}</Text>
        </View>
      )}

      {/* RSVP actions (attendee only) */}
      {event.canRespond && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Response</Text>
          <View style={styles.rsvpRow}>
            {(
              [
                { value: "accepted", label: "Accept", color: Colors.green, bg: Colors.greenLight },
                { value: "tentative", label: "Maybe", color: Colors.amber, bg: Colors.amberLight },
                { value: "declined", label: "Decline", color: Colors.red, bg: Colors.redLight },
              ] as const
            ).map((opt) => {
              const isActive = event.myResponseStatus === opt.value;
              const isLoading = responding === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.rsvpBtn,
                    { backgroundColor: isActive ? opt.color : opt.bg },
                  ]}
                  onPress={() => handleRespond(opt.value)}
                  disabled={!!responding}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={isActive ? "#fff" : opt.color} />
                  ) : (
                    <Text
                      style={[
                        styles.rsvpBtnText,
                        { color: isActive ? "#fff" : opt.color },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Organizer actions */}
      {event.canCancel && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manage Event</Text>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color={Colors.red} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color={Colors.red} />
                <Text style={styles.cancelBtnText}>Cancel Meeting</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.slate50 },
  content: { padding: 20, gap: 16 },

  title: { fontSize: 22, fontWeight: "800", color: Colors.slate900, lineHeight: 30 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sourceBadgeText: { fontSize: 12, fontWeight: "600" },
  organizerBadge: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  organizerBadgeText: { fontSize: 12, fontWeight: "600", color: Colors.primary },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.slate200,
    overflow: "hidden",
  },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  cardRowLabel: { fontSize: 11, color: Colors.slate400, marginBottom: 2 },
  cardRowValue: { fontSize: 15, color: Colors.slate900, fontWeight: "600" },
  duration: { fontSize: 13, color: Colors.slate400, fontWeight: "400" },
  divider: { height: 1, backgroundColor: Colors.slate100, marginHorizontal: 14 },

  meetBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  meetBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    padding: 12,
  },
  statusText: { fontSize: 13, fontWeight: "600" },

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  attendeeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  attendeeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  attendeeAvatarText: { fontSize: 13, fontWeight: "700", color: Colors.primary },
  attendeeEmail: { flex: 1, fontSize: 13, color: Colors.slate700 },
  attRsvp: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  organizerEmail: { fontSize: 14, color: Colors.slate700 },

  rsvpRow: { flexDirection: "row", gap: 10 },
  rsvpBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rsvpBtnText: { fontSize: 13, fontWeight: "700" },

  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.redLight,
    borderRadius: 14,
    paddingVertical: 14,
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: Colors.red },
});
