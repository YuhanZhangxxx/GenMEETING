import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/store/auth";
import { api, type UserPreferences } from "@/lib/api";
import { Colors } from "@/constants/colors";

const WORK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NUM = [1, 2, 3, 4, 5, 6, 0]; // JS getDay() mapping

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [prefData, accData] = await Promise.all([
          api.getPreferences(),
          api.getConnectedAccounts(),
        ]);
        setPrefs(prefData.preferences);
        setAccounts(accData.accounts ?? []);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      await api.savePreferences(prefs);
      Alert.alert("Saved", "Preferences updated successfully.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: signOut,
      },
    ]);
  }

  function toggleWorkDay(dayNum: number) {
    if (!prefs) return;
    const current = prefs.workDays;
    const next = current.includes(dayNum)
      ? current.filter((d) => d !== dayNum)
      : [...current, dayNum].sort((a, b) => a - b);
    setPrefs({ ...prefs, workDays: next });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={styles.pageTitle}>Settings</Text>

        {/* Profile card */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.name ?? user?.email ?? "?")[0].toUpperCase()}
            </Text>
          </View>
          <View>
            {user?.name && <Text style={styles.userName}>{user.name}</Text>}
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
        </View>

        {/* Connected accounts */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Connected Calendars</Text>
          <View style={styles.accountList}>
            {accounts.length === 0 && (
              <Text style={styles.noAccounts}>No calendars connected</Text>
            )}
            {accounts.includes("google") && (
              <View style={styles.accountRow}>
                <View style={[styles.accountDot, { backgroundColor: Colors.google }]} />
                <Text style={styles.accountName}>Google Calendar</Text>
                <View style={styles.connectedBadge}>
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>
            )}
            {accounts.includes("microsoft") && (
              <View style={styles.accountRow}>
                <View style={[styles.accountDot, { backgroundColor: Colors.microsoft }]} />
                <Text style={styles.accountName}>Microsoft Outlook</Text>
                <View style={styles.connectedBadge}>
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Scheduling preferences */}
        {prefs && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Work Days</Text>
              <View style={styles.daysRow}>
                {WORK_DAYS.map((label, i) => {
                  const num = DAY_NUM[i];
                  const active = prefs.workDays.includes(num);
                  return (
                    <TouchableOpacity
                      key={label}
                      style={[styles.dayBtn, active && styles.dayBtnActive]}
                      onPress={() => toggleWorkDay(num)}
                    >
                      <Text
                        style={[styles.dayBtnText, active && styles.dayBtnTextActive]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Work Hours</Text>
              <View style={styles.timeRow}>
                <View style={styles.timeCard}>
                  <Text style={styles.timeLabel}>Start</Text>
                  <Text style={styles.timeValue}>{prefs.workStart}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={Colors.slate400} />
                <View style={styles.timeCard}>
                  <Text style={styles.timeLabel}>End</Text>
                  <Text style={styles.timeValue}>{prefs.workEnd}</Text>
                </View>
              </View>
              <Text style={styles.hintText}>Edit work hours on the web app</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Meeting Buffer</Text>
              <View style={styles.bufferRow}>
                {[0, 10, 15, 30].map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.bufferChip,
                      prefs.bufferMinutes === m && styles.bufferChipActive,
                    ]}
                    onPress={() => setPrefs({ ...prefs, bufferMinutes: m })}
                  >
                    <Text
                      style={[
                        styles.bufferChipText,
                        prefs.bufferMinutes === m && styles.bufferChipTextActive,
                      ]}
                    >
                      {m === 0 ? "None" : `${m} min`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View>
                  <Text style={styles.toggleLabel}>Auto-reschedule</Text>
                  <Text style={styles.toggleSub}>
                    AI can suggest optimal times proactively
                  </Text>
                </View>
                <Switch
                  value={prefs.autoReschedule}
                  onValueChange={(v) => setPrefs({ ...prefs, autoReschedule: v })}
                  trackColor={{ true: Colors.primary, false: Colors.slate200 }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnLoading]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save Preferences</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color={Colors.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.slate50 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 60, gap: 20 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },

  pageTitle: { fontSize: 26, fontWeight: "800", color: Colors.slate900 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.slate200,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "700", color: Colors.primary },
  userName: { fontSize: 16, fontWeight: "700", color: Colors.slate900 },
  userEmail: { fontSize: 13, color: Colors.slate500 },

  section: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.slate200,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  accountList: { gap: 8 },
  noAccounts: { fontSize: 13, color: Colors.slate400 },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  accountDot: { width: 10, height: 10, borderRadius: 5 },
  accountName: { flex: 1, fontSize: 14, color: Colors.slate700 },
  connectedBadge: {
    backgroundColor: Colors.greenLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  connectedText: { fontSize: 11, fontWeight: "600", color: Colors.green },

  daysRow: { flexDirection: "row", gap: 6 },
  dayBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    alignItems: "center",
  },
  dayBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  dayBtnText: { fontSize: 11, fontWeight: "600", color: Colors.slate500 },
  dayBtnTextActive: { color: Colors.primary },

  timeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  timeCard: {
    flex: 1,
    backgroundColor: Colors.slate50,
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  timeLabel: { fontSize: 11, color: Colors.slate400 },
  timeValue: { fontSize: 20, fontWeight: "700", color: Colors.slate900 },
  hintText: { fontSize: 11, color: Colors.slate400, textAlign: "center" },

  bufferRow: { flexDirection: "row", gap: 8 },
  bufferChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.slate200,
    alignItems: "center",
  },
  bufferChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  bufferChipText: { fontSize: 12, fontWeight: "600", color: Colors.slate500 },
  bufferChipTextActive: { color: Colors.primary },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: { fontSize: 14, fontWeight: "600", color: Colors.slate900 },
  toggleSub: { fontSize: 12, color: Colors.slate400, marginTop: 2 },

  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnLoading: { opacity: 0.7 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.redLight,
    borderRadius: 14,
    paddingVertical: 14,
  },
  signOutText: { fontSize: 15, fontWeight: "700", color: Colors.red },
});
