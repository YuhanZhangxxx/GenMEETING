import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import {
  format,
  isToday,
  isTomorrow,
  isThisWeek,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  differenceInMinutes,
} from "date-fns";
import { useState, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useEventsStore } from "@/store/events";
import { Colors } from "@/constants/colors";
import { type MeetingEvent } from "@/lib/api";

const { width: SCREEN_W } = Dimensions.get("window");

type ViewMode = "list" | "week" | "month";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rsvpStyle(status: string | null) {
  switch (status) {
    case "accepted":
      return { label: "Accepted", color: Colors.green, bg: Colors.greenLight };
    case "declined":
      return { label: "Declined", color: Colors.red, bg: Colors.redLight };
    case "tentative":
      return { label: "Maybe", color: Colors.amber, bg: Colors.amberLight };
    case "needsAction":
      return { label: "Pending", color: Colors.amber, bg: Colors.amberLight };
    default:
      return null;
  }
}

function sourceColor(source: string) {
  return source === "outlook" ? Colors.microsoft : Colors.primary;
}

function dayLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "EEEE, MMM d");
}

// ─── Pretty Event Card ───────────────────────────────────────────────────────

function EventCard({ event, compact = false }: { event: MeetingEvent; compact?: boolean }) {
  const router = useRouter();
  const start = parseISO(event.startTime);
  const end = parseISO(event.endTime);
  const rsvp = rsvpStyle(event.myResponseStatus);
  const accent = sourceColor(event.source);
  const durationMin = differenceInMinutes(end, start);
  const durationLabel =
    durationMin >= 60
      ? `${Math.round(durationMin / 60 * 10) / 10}h`
      : `${durationMin}m`;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() =>
        router.push({
          pathname: "/event/[id]",
          params: { id: event.googleEventId, data: JSON.stringify(event) },
        })
      }
    >
      {/* Time column */}
      <View style={styles.cardTimeCol}>
        <Text style={styles.cardTimeBig}>{format(start, "h:mm")}</Text>
        <Text style={styles.cardTimeAmpm}>{format(start, "a")}</Text>
        <View style={styles.cardDuration}>
          <Text style={styles.cardDurationText}>{durationLabel}</Text>
        </View>
      </View>

      {/* Vertical accent line */}
      <View style={[styles.cardAccent, { backgroundColor: accent }]} />

      {/* Body */}
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {event.title}
          </Text>
        </View>

        <View style={styles.cardMetaRow}>
          <View style={[styles.sourcePill, { backgroundColor: accent + "15" }]}>
            <Ionicons
              name={event.source === "outlook" ? "mail" : "logo-google"}
              size={9}
              color={accent}
            />
            <Text style={[styles.sourcePillText, { color: accent }]}>
              {event.source === "outlook" ? "Outlook" : "Google"}
            </Text>
          </View>
          {event.isOrganizer && (
            <View style={styles.organizerPill}>
              <Ionicons name="star" size={9} color={Colors.primary} />
              <Text style={styles.organizerPillText}>Organizer</Text>
            </View>
          )}
          {!event.isOrganizer && rsvp && (
            <View style={[styles.rsvpPill, { backgroundColor: rsvp.bg }]}>
              <Text style={[styles.rsvpPillText, { color: rsvp.color }]}>
                {rsvp.label}
              </Text>
            </View>
          )}
          {event.attendees.length > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={11} color={Colors.slate400} />
              <Text style={styles.metaText}>{event.attendees.length}</Text>
            </View>
          )}
          {event.meetingLink && (
            <View style={styles.metaItem}>
              <Ionicons name="videocam" size={11} color={Colors.green} />
              <Text style={[styles.metaText, { color: Colors.green }]}>Video</Text>
            </View>
          )}
        </View>

        <View style={styles.cardEndTime}>
          <Ionicons name="arrow-forward" size={10} color={Colors.slate300} />
          <Text style={styles.cardEndTimeText}>
            ends {format(end, "h:mm a")}
          </Text>
        </View>
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={16} color={Colors.slate300} />
    </TouchableOpacity>
  );
}

// ─── List View ───────────────────────────────────────────────────────────────

function ListView({ events }: { events: MeetingEvent[] }) {
  const groups = useMemo(() => {
    const map: Record<string, MeetingEvent[]> = {};
    for (const e of events) {
      const key = format(parseISO(e.startTime), "yyyy-MM-dd");
      (map[key] ??= []).push(e);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  if (events.length === 0) {
    return <EmptyState emoji="📭" title="No upcoming events" />;
  }

  return (
    <View style={{ gap: 18 }}>
      {groups.map(([dateKey, dayEvents]) => {
        const date = parseISO(dateKey + "T00:00:00");
        return (
          <View key={dateKey} style={{ gap: 8 }}>
            <View style={styles.dayHeaderRow}>
              <View style={styles.dayHeaderLeft}>
                <Text style={styles.dayHeaderNum}>{format(date, "d")}</Text>
                <View>
                  <Text style={styles.dayHeaderLabel}>{dayLabel(date)}</Text>
                  <Text style={styles.dayHeaderMonth}>
                    {format(date, "MMM yyyy")}
                  </Text>
                </View>
              </View>
              <View style={styles.dayHeaderCount}>
                <Text style={styles.dayHeaderCountText}>
                  {dayEvents.length}
                </Text>
              </View>
            </View>
            {dayEvents.map((e) => (
              <EventCard key={e.googleEventId} event={e} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ─── Week View ───────────────────────────────────────────────────────────────

function WeekView({
  events,
  weekStart,
}: {
  events: MeetingEvent[];
  weekStart: Date;
}) {
  const days = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 7; i++) out.push(addDays(weekStart, i));
    return out;
  }, [weekStart]);

  const weekEvents = useMemo(() => {
    const end = endOfWeek(weekStart, { weekStartsOn: 0 });
    return events.filter((e) => {
      const d = parseISO(e.startTime);
      return d >= weekStart && d <= end;
    });
  }, [events, weekStart]);

  function dayEvents(d: Date) {
    return weekEvents.filter((e) => isSameDay(parseISO(e.startTime), d));
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Week strip */}
      <View style={styles.weekStrip}>
        {days.map((d) => {
          const today = isToday(d);
          const count = dayEvents(d).length;
          return (
            <View
              key={d.toISOString()}
              style={[styles.weekStripDay, today && styles.weekStripToday]}
            >
              <Text
                style={[
                  styles.weekStripDayName,
                  today && { color: Colors.primary },
                ]}
              >
                {format(d, "EEE").toUpperCase()}
              </Text>
              <Text
                style={[
                  styles.weekStripDayNum,
                  today && { color: Colors.primary, fontWeight: "800" },
                ]}
              >
                {format(d, "d")}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    styles.weekStripDot,
                    { backgroundColor: today ? Colors.primary : Colors.slate400 },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>

      {/* Day-by-day events */}
      {days.map((d) => {
        const evs = dayEvents(d);
        if (evs.length === 0) return null;
        return (
          <View key={d.toISOString()} style={{ gap: 8 }}>
            <View style={styles.dayHeaderRow}>
              <View style={styles.dayHeaderLeft}>
                <Text style={styles.dayHeaderNum}>{format(d, "d")}</Text>
                <View>
                  <Text style={styles.dayHeaderLabel}>{dayLabel(d)}</Text>
                  <Text style={styles.dayHeaderMonth}>{format(d, "MMM")}</Text>
                </View>
              </View>
              <View style={styles.dayHeaderCount}>
                <Text style={styles.dayHeaderCountText}>{evs.length}</Text>
              </View>
            </View>
            {evs.map((e) => (
              <EventCard key={e.googleEventId} event={e} />
            ))}
          </View>
        );
      })}

      {weekEvents.length === 0 && (
        <EmptyState emoji="🗓️" title="No events this week" />
      )}
    </View>
  );
}

// ─── Month View ──────────────────────────────────────────────────────────────

function MonthView({
  events,
  currentMonth,
}: {
  events: MeetingEvent[];
  currentMonth: Date;
}) {
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const out: Date[] = [];
    let cursor = calStart;
    while (cursor <= calEnd) {
      out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }, [currentMonth]);

  function eventsOnDay(d: Date) {
    return events.filter((e) => isSameDay(parseISO(e.startTime), d));
  }

  const selectedEvents = eventsOnDay(selectedDay);
  const cellSize = (SCREEN_W - 32) / 7;

  return (
    <View style={{ gap: 12 }}>
      {/* Day-of-week header */}
      <View style={styles.dowRow}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <Text key={i} style={styles.dowText}>
            {d}
          </Text>
        ))}
      </View>

      {/* Month grid */}
      <View style={styles.monthGrid}>
        {days.map((day) => {
          const dayEvts = eventsOnDay(day);
          const inMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDay);
          const today = isToday(day);

          return (
            <TouchableOpacity
              key={day.toISOString()}
              activeOpacity={0.6}
              onPress={() => setSelectedDay(day)}
              style={[
                styles.monthCell,
                { width: cellSize, height: cellSize },
                isSelected && styles.monthCellSelected,
              ]}
            >
              <View
                style={[
                  styles.monthDayNumWrap,
                  today && styles.monthDayNumToday,
                ]}
              >
                <Text
                  style={[
                    styles.monthDayNum,
                    today && { color: "#fff", fontWeight: "800" },
                    !inMonth && { color: Colors.slate300 },
                    isSelected && !today && { color: Colors.primary, fontWeight: "800" },
                  ]}
                >
                  {format(day, "d")}
                </Text>
              </View>
              {dayEvts.length > 0 && (
                <View style={styles.monthDots}>
                  {dayEvts.slice(0, 3).map((e) => (
                    <View
                      key={e.googleEventId}
                      style={[
                        styles.monthDot,
                        { backgroundColor: sourceColor(e.source) },
                      ]}
                    />
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected day events */}
      <View style={{ gap: 8, marginTop: 4 }}>
        <View style={styles.dayHeaderRow}>
          <View style={styles.dayHeaderLeft}>
            <Text style={styles.dayHeaderNum}>{format(selectedDay, "d")}</Text>
            <View>
              <Text style={styles.dayHeaderLabel}>{dayLabel(selectedDay)}</Text>
              <Text style={styles.dayHeaderMonth}>
                {format(selectedDay, "MMMM yyyy")}
              </Text>
            </View>
          </View>
          <View style={styles.dayHeaderCount}>
            <Text style={styles.dayHeaderCountText}>
              {selectedEvents.length}
            </Text>
          </View>
        </View>

        {selectedEvents.length === 0 ? (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayText}>No meetings scheduled</Text>
          </View>
        ) : (
          selectedEvents.map((e) => (
            <EventCard key={e.googleEventId} event={e} />
          ))
        )}
      </View>
    </View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ emoji, title }: { emoji: string; title: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>Pull down to refresh</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { events, loading, refresh } = useEventsStore();
  const [view, setView] = useState<ViewMode>("list");
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  function goPrev() {
    if (view === "week") setWeekStart((w) => subWeeks(w, 1));
    if (view === "month") setCurrentMonth((m) => subMonths(m, 1));
  }
  function goNext() {
    if (view === "week") setWeekStart((w) => addWeeks(w, 1));
    if (view === "month") setCurrentMonth((m) => addMonths(m, 1));
  }
  function goToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
    const d = new Date();
    d.setDate(1);
    setCurrentMonth(d);
  }

  const navTitle =
    view === "month"
      ? format(currentMonth, "MMMM yyyy")
      : view === "week"
      ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`
      : "Upcoming";

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
        <TouchableOpacity onPress={refresh} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* View toggle */}
      <View style={styles.viewToggle}>
        {(["list", "week", "month"] as ViewMode[]).map((v) => {
          const active = view === v;
          return (
            <TouchableOpacity
              key={v}
              onPress={() => setView(v)}
              style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            >
              <Ionicons
                name={
                  v === "list"
                    ? "list-outline"
                    : v === "week"
                    ? "calendar-clear-outline"
                    : "grid-outline"
                }
                size={14}
                color={active ? Colors.primary : Colors.slate500}
              />
              <Text
                style={[
                  styles.toggleBtnText,
                  active && { color: Colors.primary },
                ]}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date navigator (only for week/month) */}
      {view !== "list" && (
        <View style={styles.dateNav}>
          <TouchableOpacity onPress={goPrev} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.slate700} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToday} style={styles.todayBtn}>
            <Text style={styles.dateNavTitle}>{navTitle}</Text>
            <Text style={styles.todayHint}>Tap for today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goNext} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={Colors.slate700} />
          </TouchableOpacity>
        </View>
      )}

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
        {view === "list" && <ListView events={events} />}
        {view === "week" && <WeekView events={events} weekStart={weekStart} />}
        {view === "month" && (
          <MonthView events={events} currentMonth={currentMonth} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: Colors.slate900 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // View toggle
  viewToggle: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.slate100,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.slate500,
  },

  // Date nav
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.slate100,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.slate100,
    alignItems: "center",
    justifyContent: "center",
  },
  todayBtn: { flex: 1, alignItems: "center" },
  dateNavTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Colors.slate900,
  },
  todayHint: {
    fontSize: 10,
    color: Colors.slate400,
    marginTop: 1,
  },

  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  // Day header
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  dayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dayHeaderNum: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.primary,
    minWidth: 36,
  },
  dayHeaderLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.slate900,
  },
  dayHeaderMonth: {
    fontSize: 11,
    color: Colors.slate400,
    marginTop: 1,
  },
  dayHeaderCount: {
    backgroundColor: Colors.primaryLight,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dayHeaderCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },

  // Pretty event card
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.slate100,
    padding: 12,
    gap: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTimeCol: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
  },
  cardTimeBig: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.slate900,
    lineHeight: 22,
  },
  cardTimeAmpm: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.slate400,
    letterSpacing: 0.5,
    marginTop: -2,
  },
  cardDuration: {
    marginTop: 4,
    backgroundColor: Colors.slate100,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  cardDurationText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.slate500,
  },
  cardAccent: {
    width: 3,
    borderRadius: 2,
  },
  cardBody: { flex: 1, justifyContent: "center", gap: 4 },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: Colors.slate900,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  organizerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  organizerPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.primary,
  },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourcePillText: { fontSize: 9, fontWeight: "700" },
  rsvpPill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rsvpPillText: { fontSize: 9, fontWeight: "700" },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: { fontSize: 10, color: Colors.slate500, fontWeight: "600" },
  cardEndTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 1,
  },
  cardEndTimeText: { fontSize: 10, color: Colors.slate400 },

  // Week strip
  weekStrip: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: Colors.slate100,
    gap: 4,
  },
  weekStripDay: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 2,
  },
  weekStripToday: {
    backgroundColor: Colors.primaryLight,
  },
  weekStripDayName: {
    fontSize: 9,
    fontWeight: "700",
    color: Colors.slate400,
    letterSpacing: 0.5,
  },
  weekStripDayNum: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.slate700,
  },
  weekStripDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },

  // Month grid
  dowRow: {
    flexDirection: "row",
  },
  dowText: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: Colors.slate400,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.slate100,
  },
  monthCell: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
    borderBottomWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: Colors.slate100,
  },
  monthCellSelected: {
    backgroundColor: Colors.primaryLight,
  },
  monthDayNumWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  monthDayNumToday: {
    backgroundColor: Colors.primary,
  },
  monthDayNum: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.slate700,
  },
  monthDots: {
    flexDirection: "row",
    gap: 2,
    marginTop: 2,
  },
  monthDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },

  // Empty
  empty: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 8,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: Colors.slate700 },
  emptySubtitle: { fontSize: 12, color: Colors.slate400 },
  emptyDay: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.slate100,
    padding: 24,
    alignItems: "center",
  },
  emptyDayText: { fontSize: 13, color: Colors.slate400, fontStyle: "italic" },
});
