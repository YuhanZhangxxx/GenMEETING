import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useState } from "react";
import { format, addMinutes, parseISO } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Colors } from "@/constants/colors";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type EventType = "meeting" | "activity";
const DURATIONS = [30, 45, 60, 90, 120];

function roundUp30(d: Date) {
  const ms = 30 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

function toLocalISO(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateEventModal({ onClose, onSuccess }: Props) {
  const defaultStart = roundUp30(new Date());
  const [eventType, setEventType] = useState<EventType>("meeting");
  const [title, setTitle] = useState("");
  const [startISO, setStartISO] = useState(toLocalISO(defaultStart));
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState("");
  const [addMeetLink, setAddMeetLink] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isMeeting = eventType === "meeting";
  const startDate = parseISO(startISO);
  const endDate = addMinutes(startDate, duration);

  async function handleSubmit() {
    if (!title.trim()) {
      Alert.alert("Required", "Please enter a title.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createEvent({
        title: title.trim(),
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        description: description.trim() || undefined,
        attendees: [],
        addMeetLink: isMeeting ? addMeetLink : false,
      });
      onSuccess();
      onClose();
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {isMeeting ? "New Meeting" : "New Activity"}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.slate500} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Event type toggle */}
            <View style={styles.typeToggle}>
              <TouchableOpacity
                style={[styles.typeBtn, isMeeting && styles.typeBtnActive]}
                onPress={() => setEventType("meeting")}
              >
                <Text style={[styles.typeBtnText, isMeeting && styles.typeBtnTextActive]}>
                  👥 Meeting
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, !isMeeting && styles.typeBtnActive]}
                onPress={() => setEventType("activity")}
              >
                <Text style={[styles.typeBtnText, !isMeeting && styles.typeBtnTextActive]}>
                  📌 Activity
                </Text>
              </TouchableOpacity>
            </View>

            {/* Title */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={
                  isMeeting ? "e.g. Weekly Sync" : "e.g. Gym, Focus time"
                }
                placeholderTextColor={Colors.slate400}
                autoFocus
              />
            </View>

            {/* Start time (display only - simplified for mobile MVP) */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Start</Text>
              <View style={styles.timeDisplay}>
                <Ionicons name="calendar-outline" size={16} color={Colors.slate400} />
                <Text style={styles.timeDisplayText}>
                  {format(startDate, "EEE MMM d 'at' h:mm a")}
                </Text>
              </View>
              <Text style={styles.hintText}>
                Ends at {format(endDate, "h:mm a")}
              </Text>
            </View>

            {/* Duration */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Duration</Text>
              <View style={styles.durationRow}>
                {DURATIONS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.durationChip,
                      duration === d && styles.durationChipActive,
                    ]}
                    onPress={() => setDuration(d)}
                  >
                    <Text
                      style={[
                        styles.durationChipText,
                        duration === d && styles.durationChipTextActive,
                      ]}
                    >
                      {d < 60 ? `${d}m` : `${d / 60}h`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Description{" "}
                <Text style={{ color: Colors.slate400 }}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Agenda, notes…"
                placeholderTextColor={Colors.slate400}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* Meet link toggle (meetings only) */}
            {isMeeting && (
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setAddMeetLink(!addMeetLink)}
              >
                <View style={[styles.checkbox, addMeetLink && styles.checkboxActive]}>
                  {addMeetLink && (
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  )}
                </View>
                <Text style={styles.checkLabel}>Add Google Meet link</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (!title.trim() || submitting) && styles.submitBtnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!title.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isMeeting ? "Create Meeting" : "Create Activity"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.slate200,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.slate900 },
  closeBtn: { padding: 4 },

  scroll: { maxHeight: 480 },
  content: { padding: 20, gap: 18 },

  typeToggle: {
    flexDirection: "row",
    backgroundColor: Colors.slate100,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  typeBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  typeBtnText: { fontSize: 13, fontWeight: "600", color: Colors.slate500 },
  typeBtnTextActive: { color: Colors.slate900 },

  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: Colors.slate700 },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.slate900,
    backgroundColor: "#fff",
  },
  textarea: { minHeight: 72, paddingTop: 11 },

  timeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  timeDisplayText: { fontSize: 15, color: Colors.slate700 },
  hintText: { fontSize: 12, color: Colors.slate400 },

  durationRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
  },
  durationChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  durationChipText: { fontSize: 13, fontWeight: "600", color: Colors.slate500 },
  durationChipTextActive: { color: Colors.primary },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.slate300,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkLabel: { fontSize: 14, color: Colors.slate700 },

  actions: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.slate100,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    alignItems: "center",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: Colors.slate600 },
  submitBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
