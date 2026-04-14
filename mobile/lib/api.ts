import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "meetai_jwt";
const USER_KEY = "meetai_user";

// ─── Token storage ──────────────────────────────────────────────────────────

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function storeToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearStoredAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function storeUser(user: StoredUser): Promise<void> {
  return SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

export interface MeetingEvent {
  id: string;
  googleEventId: string;
  source: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  isEditable: boolean;
  isOrganizer: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canRespond: boolean;
  canRequestChange: boolean;
  organizerEmail: string | null;
  attendees: Array<{ email: string; responseStatus: string; self: boolean }>;
  myResponseStatus: string | null;
  meetingLink: string | null;
  userEmail: string;
}

export interface ScoredSlot {
  start: string;
  end: string;
  score: number;
  reasons: string[];
}

export interface UserPreferences {
  workDays: number[];
  workStart: string;
  workEnd: string;
  bufferMinutes: number;
  blackoutTimes: unknown[];
  preferredSlotMinutes: number;
  timezone: string;
  autoReschedule: boolean;
}

export interface FavoriteContact {
  id: string;
  email: string;
  name: string | null;
}

export interface AISuggestion {
  type: "reschedule" | "rsvp" | "cancel" | "conflict" | "info";
  eventId?: string;
  eventTitle?: string;
  eventStartTime?: string;
  message: string;
  action?: {
    label: string;
    newStartTime?: string;
    newEndTime?: string;
    response?: "accepted" | "declined" | "tentative";
  };
}

// ─── HTTP client ─────────────────────────────────────────────────────────────

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok && data?.error) {
    throw new Error(data.error);
  }
  return data as T;
}

// ─── API methods ─────────────────────────────────────────────────────────────

export const api = {
  /** Exchange OAuth access token for a MeetAI JWT */
  async mobileSignIn(
    provider: "google" | "microsoft",
    accessToken: string,
    refreshToken?: string
  ): Promise<{ token: string; user: StoredUser }> {
    return request("/api/auth/mobile-token", {
      method: "POST",
      body: JSON.stringify({ provider, accessToken, refreshToken }),
    });
  },

  async getConnectedAccounts(): Promise<{ accounts: string[] }> {
    return request("/api/auth/connected-accounts");
  },

  async getEvents(): Promise<{ events: MeetingEvent[]; fromCache?: boolean }> {
    return request("/api/calendar/events");
  },

  async createEvent(payload: {
    title: string;
    startTime: string;
    endTime: string;
    description?: string;
    attendees?: string[];
    addMeetLink?: boolean;
    provider?: "google" | "microsoft";
  }): Promise<{ eventId: string; htmlLink?: string; meetLink?: string }> {
    return request("/api/calendar/create-event", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getRecommendations(
    duration: number
  ): Promise<{ slots: ScoredSlot[] }> {
    return request(`/api/recommendations?duration=${duration}`);
  },

  async respondToEvent(
    eventId: string,
    response: "accepted" | "declined" | "tentative"
  ): Promise<{ success: boolean }> {
    return request(`/api/meetings/${eventId}/respond`, {
      method: "POST",
      body: JSON.stringify({ response }),
    });
  },

  async cancelEvent(
    eventId: string,
    notifyAttendees = true
  ): Promise<{ success: boolean }> {
    return request(`/api/meetings/${eventId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ notifyAttendees }),
    });
  },

  async rescheduleEvent(
    eventId: string,
    startTime: string,
    endTime: string
  ): Promise<{ success: boolean }> {
    return request(`/api/meetings/${eventId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ startTime, endTime }),
    });
  },

  async getPreferences(): Promise<{ preferences: UserPreferences }> {
    return request("/api/preferences");
  },

  async savePreferences(prefs: UserPreferences): Promise<{ success: boolean }> {
    return request("/api/preferences", {
      method: "POST",
      body: JSON.stringify(prefs),
    });
  },

  async getContacts(): Promise<{ contacts: FavoriteContact[] }> {
    return request("/api/contacts");
  },

  async getNotifications(): Promise<{
    notifications: Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      read: boolean;
      createdAt: string;
    }>;
  }> {
    return request("/api/notifications");
  },

  async markNotificationsRead(ids: string[]): Promise<void> {
    await request("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ ids }),
    });
  },

  async getAIAdvisor(): Promise<{ suggestions: AISuggestion[]; error?: string }> {
    return request("/api/ai-advisor");
  },
};
