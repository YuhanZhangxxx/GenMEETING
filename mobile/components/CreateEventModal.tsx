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
import { useState, useEffect } from "react";
import { format, addMinutes } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { api } from "@/lib/api";
import { Colors } from "@/constants/colors";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

type EventType = "meeting" | "activity";
type Provider = "google" | "microsoft";
const DURATIONS = [30, 45, 60, 90, 120];

function roundUp30(d: Date) {
  const ms = 30 * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateEventModal({ onClose, onSuccess }: Props) {
  const defaultStart = roundUp30(new Date());
  const [eventType, setEventType] = useState<EventType>("meeting");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState<Date>(defaultStart);
  const [duration, setDuration] = useState(60);
  const [description, setDescription] = useState("");
  const [addMeetLink, setAddMeetLink] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Which calendar to create on.
  const [provider, setProvider] = useState<Provider>("google");
  const [connectedProviders, setConnectedProviders] = useState<Provider[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getConnectedAccounts();
        const p = (res.accounts as Provider[]).filter(
          (x) => x === "google" || x === "microsoft"
        );
        setConnectedProviders(p);
        if (p.length > 0 && !p.includes(provider)) {
          setProvider(p[0]);
        }
      } catch {
        // Ignore — fall back to google.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picker visibility (iOS inline, Android modal)
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Attendees
  const [attendees, setAttendees] = useState<string[]>([]);
  const [attendeeInput, setAttendeeInput] = useState("");

  const isMeeting = eventType === "meeting";
  const endDate = addMinutes(startDate, duration);

  function addAttendee() {
    const email = attendeeInput.trim().toLowerCase();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      Alert.alert("Invalid email", `"${email}" doesn't look like an email.`);
      return;
    }
    if (attendees.includes(email)) {
      setAttendeeInput("");
      return;
    }
    setAttendees([...attendees, email]);
    setAttendeeInput("");
  }

  function removeAttendee(email: string) {
    setAttendees(attendees.filter((a) => a !== email));
  }

  function onDateChange(_: DateTimePickerEvent, selected?: Date) {
    setShowDatePicker(Platform.OS === "ios");
    if (selected) {
      // Preserve current time, only change date portion.
      const next = new Date(startDate);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setStartDate(next);
    }
  }

  function onTimeChange(_: DateTimePickerEvent, selected?: Date) {
    setShowTimePicker(Platform.OS === "ios");
    if (selected) {
      // Preserve current date, only change time portion.
      const next = new Date(startDate);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setStartDate(next);
    }
  }

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
        attendees: isMeeting ? attendees : [],
        addMeetLink: isMeeting ? addMeetLink : false,
        provider,
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

            {/* Calendar source picker (only show if user has both linked) */}
            {connectedProviders.length > 1 && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Calendar</Text>
                <View style={styles.providerRow}>
                  {connectedProviders.map((p) => {
                    const active = provider === p;
                    const color =
                      p === "microsoft" ? Colors.microsoft : Colors.primary;
                    const label =
                      p === "microsoft" ? "Outlook" : "Google Calendar";
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setProvider(p)}
                        style={[
                          styles.providerBtn,
                          active && { borderColor: color, backgroundColor: color + "10" },
                        ]}
                      >
                        <View
                          style={[styles.providerDot, { backgroundColor: color }]}
                        />
                        <Text
                          style={[
                            styles.providerBtnText,
                            active && { color, fontWeight: "700" },
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

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

            {/* Start: tappable date + time pickers */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Start</Text>
              <View style={styles.pickerRow}>
                <TouchableOpacity
                  style={[styles.timeDisplay, { flex: 1 }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                  <Text style={styles.timeDisplayText}>
                    {format(startDate, "EEE MMM d")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timeDisplay, { flex: 1 }]}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Ionicons name="time-outline" size={16} color={Colors.primary} />
                  <Text style={styles.timeDisplayText}>
                    {format(startDate, "h:mm a")}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.hintText}>
                Ends at {format(endDate, "h:mm a")}
              </Text>

              {showDatePicker && (
                <DateTimePicker
                  value={startDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  minimumDate={new Date()}
                  onChange={onDateChange}
                />
              )}
              {showTimePicker && (
                <DateTimePicker
                  value={startDate}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  minuteInterval={5}
                  onChange={onTimeChange}
                />
              )}
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

            {/* Attendees (meetings only) */}
            {isMeeting && (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Attendees{" "}
                  <Text style={{ color: Colors.slate400 }}>(optional)</Text>
                </Text>
                <View style={styles.attendeeInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={attendeeInput}
                    onChangeText={setAttendeeInput}
                    onSubmitEditing={addAttendee}
                    placeholder="email@example.com"
                    placeholderTextColor={Colors.slate400}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={styles.attendeeAddBtn}
                    onPress={addAttendee}
                    disabled={!attendeeInput.trim()}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
                {attendees.length > 0 && (
                  <View style={styles.attendeeChips}>
                    {attendees.map((email) => (
                      <View key={email} style={styles.attendeeChip}>
                        <Text style={styles.attendeeChipText} numberOfLines={1}>
                          {email}
                        </Text>
                        <TouchableOpacity onPress={() => removeAttendee(email)}>
                          <Ionicons name="close-circle" size={16} color={Colors.slate400} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

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
                <Text style={styles.checkLabel}>
                  Add {provider === "microsoft" ? "Teams" : "Google Meet"} link
                </Text>
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
  timeDisplayText: { fontSize: 14, color: Colors.slate700, fontWeight: "600" },
  hintText: { fontSize: 12, color: Colors.slate400 },

  pickerRow: { flexDirection: "row", gap: 8 },

  providerRow: { flexDirection: "row", gap: 8 },
  providerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    backgroundColor: "#fff",
  },
  providerDot: { width: 10, height: 10, borderRadius: 5 },
  providerBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.slate600,
  },

  attendeeInputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  attendeeAddBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  attendeeChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  attendeeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primaryLight,
    borderRadius: 20,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  attendeeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.primary,
    maxWidth: 180,
  },

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
